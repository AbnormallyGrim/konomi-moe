import { describe, expect, it } from "vitest";
import { fitRidge, predictRow, type SparseRow, solveSpd } from "../src/ridge.ts";
import fixtures from "./fixtures/ridge.json";

interface Case {
  name: string;
  alpha: number;
  features: number;
  rows: SparseRow[];
  y: number[];
  w: number[];
  coef: number[];
  intercept: number;
  predictions: number[];
}

// Reference fits from scikit-learn (lab/scripts/make_engine_fixtures.py).
const cases = fixtures as Case[];

describe("fitRidge matches scikit-learn", () => {
  for (const c of cases) {
    it(c.name, () => {
      const fit = fitRidge(c.rows, c.y, c.w, c.alpha, c.features);
      for (const [j, v] of c.coef.entries()) expect(fit.coef[j]).toBeCloseTo(v, 8);
      expect(fit.intercept).toBeCloseTo(c.intercept, 8);
      for (const [i, r] of c.rows.entries()) {
        expect(predictRow(fit, r)).toBeCloseTo(c.predictions[i] ?? Number.NaN, 8);
      }
    });
  }
});

describe("solveSpd", () => {
  it("solves a small system", () => {
    const x = solveSpd(new Float64Array([4, 2, 2, 3]), new Float64Array([2, 1]), 2);
    expect([...x]).toEqual([0.5, 0]);
  });

  it("rejects a matrix that isn't positive definite", () => {
    expect(() => solveSpd(new Float64Array([0, 1, 1, 0]), new Float64Array([1, 1]), 2)).toThrow();
  });
});
