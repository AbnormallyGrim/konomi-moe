/**
 * Weighted ridge regression with an unpenalised intercept, matching scikit-learn's `Ridge`:
 * minimise Σ wᵢ(yᵢ − xᵢ·β − b)² + α‖β‖².
 *
 * Rows are sparse. Centring is done implicitly, so rows stay sparse. Solves the n×n dual system
 * when there are more features than rows (the usual case here), else the d×d primal one.
 */

/** A sparse row: feature indices and their values. */
export interface SparseRow {
  indices: number[];
  values: number[];
}

/** A fitted model. */
export interface RidgeFit {
  coef: Float64Array;
  intercept: number;
}

/** Fit `rows` (with `features` columns) to targets `y` with sample weights `w`. */
export function fitRidge(
  rows: SparseRow[],
  y: number[],
  w: number[],
  alpha: number,
  features: number,
): RidgeFit {
  const n = rows.length;
  const total = w.reduce((a, b) => a + b, 0);
  const xMean = new Float64Array(features);
  rows.forEach((r, i) => {
    r.indices.forEach((j, k) => {
      xMean[j] = (xMean[j] ?? 0) + (w[i] ?? 0) * (r.values[k] ?? 0);
    });
  });
  for (let j = 0; j < features; j++) xMean[j] = (xMean[j] ?? 0) / total;
  const yMean = y.reduce((acc, yi, i) => acc + (w[i] ?? 0) * yi, 0) / total;

  const coef =
    n < features
      ? dual(rows, y, w, alpha, features, xMean, yMean)
      : primal(rows, y, w, alpha, features, xMean, yMean);
  let intercept = yMean;
  for (let j = 0; j < features; j++) intercept -= (xMean[j] ?? 0) * (coef[j] ?? 0);
  return { coef, intercept };
}

/** Predict for one sparse row. */
export function predictRow(fit: RidgeFit, row: SparseRow): number {
  let s = fit.intercept;
  row.indices.forEach((j, k) => {
    s += (fit.coef[j] ?? 0) * (row.values[k] ?? 0);
  });
  return s;
}

function dual(
  rows: SparseRow[],
  y: number[],
  w: number[],
  alpha: number,
  features: number,
  xMean: Float64Array,
  yMean: number,
): Float64Array {
  // K = Xs·Xsᵀ, with Xs rows √wᵢ(xᵢ − x̄), expanded so the rows stay sparse.
  const n = rows.length;
  const dense = rows.map((r) => toMap(r));
  const dotMean = rows.map((r) =>
    r.indices.reduce((s, j, k) => s + (r.values[k] ?? 0) * (xMean[j] ?? 0), 0),
  );
  const meanSq = xMean.reduce((s, v) => s + v * v, 0);
  const sq = w.map((wi) => Math.sqrt(wi));
  const k = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let l = 0; l <= i; l++) {
      const dot = sparseDot(rows[i] as SparseRow, dense[l] as Map<number, number>);
      const v =
        (sq[i] ?? 0) * (sq[l] ?? 0) * (dot - (dotMean[i] ?? 0) - (dotMean[l] ?? 0) + meanSq);
      k[i * n + l] = v;
      k[l * n + i] = v;
    }
    k[i * n + i] = (k[i * n + i] ?? 0) + alpha;
  }
  const rhs = new Float64Array(n);
  for (let i = 0; i < n; i++) rhs[i] = (sq[i] ?? 0) * ((y[i] ?? 0) - yMean);
  const a = solveSpd(k, rhs, n);

  // β = Xsᵀa = Σ cᵢxᵢ − (Σ cᵢ)x̄, with cᵢ = aᵢ√wᵢ.
  const coef = new Float64Array(features);
  let cSum = 0;
  rows.forEach((r, i) => {
    const c = (a[i] ?? 0) * (sq[i] ?? 0);
    cSum += c;
    r.indices.forEach((j, idx) => {
      coef[j] = (coef[j] ?? 0) + c * (r.values[idx] ?? 0);
    });
  });
  for (let j = 0; j < features; j++) coef[j] = (coef[j] ?? 0) - cSum * (xMean[j] ?? 0);
  return coef;
}

function primal(
  rows: SparseRow[],
  y: number[],
  w: number[],
  alpha: number,
  features: number,
  xMean: Float64Array,
  yMean: number,
): Float64Array {
  // A = Σ wᵢxᵢxᵢᵀ − W·x̄x̄ᵀ + αI, b = Σ wᵢxᵢ(yᵢ − ȳ).
  const d = features;
  const total = w.reduce((s, v) => s + v, 0);
  const a = new Float64Array(d * d);
  const b = new Float64Array(d);
  rows.forEach((r, i) => {
    const wi = w[i] ?? 0;
    const dy = (y[i] ?? 0) - yMean;
    r.indices.forEach((j, p) => {
      const vj = r.values[p] ?? 0;
      b[j] = (b[j] ?? 0) + wi * vj * dy;
      r.indices.forEach((l, q) => {
        a[j * d + l] = (a[j * d + l] ?? 0) + wi * vj * (r.values[q] ?? 0);
      });
    });
  });
  for (let j = 0; j < d; j++) {
    for (let l = 0; l < d; l++)
      a[j * d + l] = (a[j * d + l] ?? 0) - total * (xMean[j] ?? 0) * (xMean[l] ?? 0);
    a[j * d + j] = (a[j * d + j] ?? 0) + alpha;
  }
  return solveSpd(a, b, d);
}

/** Solve A·x = b for a symmetric positive-definite A (row-major, n×n) by Cholesky. */
export function solveSpd(a: Float64Array, b: Float64Array, n: number): Float64Array {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j] ?? 0;
      for (let k = 0; k < j; k++) s -= (l[i * n + k] ?? 0) * (l[j * n + k] ?? 0);
      if (i === j) {
        if (s <= 0) throw new Error("matrix is not positive definite");
        l[i * n + i] = Math.sqrt(s);
      } else {
        l[i * n + j] = s / (l[j * n + j] ?? 1);
      }
    }
  }
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i] ?? 0;
    for (let k = 0; k < i; k++) s -= (l[i * n + k] ?? 0) * (z[k] ?? 0);
    z[i] = s / (l[i * n + i] ?? 1);
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = z[i] ?? 0;
    for (let k = i + 1; k < n; k++) s -= (l[k * n + i] ?? 0) * (x[k] ?? 0);
    x[i] = s / (l[i * n + i] ?? 1);
  }
  return x;
}

function toMap(r: SparseRow): Map<number, number> {
  const m = new Map<number, number>();
  r.indices.forEach((j, k) => {
    m.set(j, r.values[k] ?? 0);
  });
  return m;
}

function sparseDot(r: SparseRow, other: Map<number, number>): number {
  let s = 0;
  r.indices.forEach((j, k) => {
    s += (r.values[k] ?? 0) * (other.get(j) ?? 0);
  });
  return s;
}
