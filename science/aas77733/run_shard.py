from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
from typing import Any

from .config import load_manifest


VALID_GATES = {f"G{i}" for i in range(20)}


def decode_contract(encoded: str) -> dict[str, Any]:
    try:
        payload = json.loads(base64.b64decode(encoded, validate=True).decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - normalize malformed external contracts
        raise ValueError("INVALID_CONTRACT_BASE64") from exc
    if not isinstance(payload, dict):
        raise ValueError("INVALID_CONTRACT_ROOT")
    if payload.get("battery_id") != "AAS77733-R1":
        raise ValueError("INVALID_CONTRACT_BATTERY")
    gates = payload.get("gates")
    if not isinstance(gates, list) or not gates or any(gate not in VALID_GATES for gate in gates):
        raise ValueError("INVALID_CONTRACT_GATES")
    if "mocks" in payload and (not isinstance(payload["mocks"], int) or not 1 <= payload["mocks"] <= 100000):
        raise ValueError("INVALID_CONTRACT_MOCKS")
    if "seed" in payload and not isinstance(payload["seed"], int):
        raise ValueError("INVALID_CONTRACT_SEED")
    if "output" in payload:
        output = Path(str(payload["output"]))
        if output.is_absolute() or ".." in output.parts:
            raise ValueError("INVALID_CONTRACT_OUTPUT")
    return payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the AAS77733-R1 scientific battery")
    parser.add_argument("--contract-b64")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--gates", nargs="*")
    parser.add_argument("--mocks", type=int)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--output", default="aas77733-r1-result.json")
    parser.add_argument("--cache-dir", default=".cache/aas77733")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    manifest = load_manifest()
    if args.contract_b64:
        contract = decode_contract(args.contract_b64)
    else:
        gates = [f"G{i}" for i in range(20)] if args.all else (args.gates or [])
        if not gates or any(gate not in VALID_GATES for gate in gates):
            parser.error("use --all or provide valid --gates")
        contract = {
            "battery_id": manifest["battery_id"],
            "gates": gates,
            "mocks": args.mocks or int(manifest["default_mocks"]),
            "seed": args.seed if args.seed is not None else int(manifest["seed"]),
            "output": args.output,
            "cache_dir": args.cache_dir,
        }
    raise RuntimeError(f"BATTERY_ORCHESTRATOR_NOT_YET_BOUND:{contract['gates']}")


if __name__ == "__main__":
    raise SystemExit(main())
