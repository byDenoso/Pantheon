from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from .protocol import run_battery


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    return value


def _hash(payload: dict[str, Any]) -> str:
    data = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mocks", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=77733)
    parser.add_argument("--cache-dir", default=".cache/aas77733")
    parser.add_argument("--output", default="artifacts/aas77733-r1-publication.json")
    args = parser.parse_args()
    if not 1 <= args.mocks <= 100000:
        raise SystemExit("mocks must be in [1,100000]")
    raw = _jsonable(run_battery(cache_dir=args.cache_dir, mocks=args.mocks, seed=args.seed))
    runtime_blocked = [g for g,r in raw["gates"].items() if r.get("status") == "BLOCKED" and g != "G19" and "evidence" in r and "error" in r["evidence"]]
    raw["validation_status"] = "FAIL" if runtime_blocked else "PASS"
    raw["runtime_blocked_gates"] = runtime_blocked
    raw["numerical_dependencies"] = ["numpy==2.2.6", "scipy==1.15.3"]
    raw["result_hash"] = _hash(raw)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(raw, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"validation_status":raw["validation_status"],"classification":raw["gates"]["G19"]["metrics"]["classification"],"result_hash":raw["result_hash"],"output":str(output)}, sort_keys=True))
    return 0 if raw["validation_status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
