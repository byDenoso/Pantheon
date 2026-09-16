from __future__ import annotations

import argparse
import json
from pathlib import Path

from .hardening import MEDIUM_MOCKS, run_hardening


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AAS77733-R1 light/medium post-freeze hardening battery")
    parser.add_argument("--mocks", type=int, default=MEDIUM_MOCKS)
    parser.add_argument("--seed", type=int, default=77733)
    parser.add_argument("--cache-dir", default=".cache/aas77733")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = run_hardening(cache_dir=args.cache_dir, mocks=args.mocks, seed=args.seed)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"battery_id": payload["battery_id"], "synthesis": payload["synthesis"], "result_hash": payload["result_hash"]}, sort_keys=True))


if __name__ == "__main__":
    main()
