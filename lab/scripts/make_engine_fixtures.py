"""Write reference results from the Python lab for the TypeScript engine's tests.

Run from lab/: `uv run python scripts/make_engine_fixtures.py`. Uses fixed random data only.
"""

import base64
import json
from pathlib import Path

import numpy as np
import parity_world
from sklearn.linear_model import Ridge

OUT = Path(__file__).parents[2] / "engine" / "test" / "fixtures"


def ridge_case(name: str, n: int, d: int, alpha: float, seed: int) -> dict:
    """A sparse-ish random problem solved exactly (dense X, Cholesky) by scikit-learn."""
    rng = np.random.default_rng(seed)
    x = np.where(rng.random((n, d)) < 0.15, rng.random((n, d)), 0.0)
    y = rng.normal(size=n)
    w = rng.uniform(0.3, 1.0, size=n)
    model = Ridge(alpha=alpha, solver="cholesky").fit(x, y, sample_weight=w)
    rows = [{"indices": np.flatnonzero(r).tolist(), "values": r[r != 0].tolist()} for r in x]
    return {
        "name": name,
        "alpha": alpha,
        "features": d,
        "rows": rows,
        "y": y.tolist(),
        "w": w.tolist(),
        "coef": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "predictions": model.predict(x).tolist(),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cases = [
        ridge_case("more features than rows (dual)", n=30, d=80, alpha=10.0, seed=1),
        ridge_case("more rows than features (primal)", n=60, d=20, alpha=3.0, seed=2),
    ]
    (OUT / "ridge.json").write_text(json.dumps(cases) + "\n")
    print(f"wrote {OUT / 'ridge.json'}")
    w = parity_world.world()
    (OUT / "parity.json").write_text(json.dumps({"world": w, **parity_world.expected(w)}) + "\n")
    print(f"wrote {OUT / 'parity.json'}")
    table = base64.b64encode(parity_world.crowd_table(w)).decode()
    (OUT / "crowd.json").write_text(json.dumps({"table": table}) + "\n")
    print(f"wrote {OUT / 'crowd.json'}")


if __name__ == "__main__":
    main()
