from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from science.aas77733.config import load_manifest
else:
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


def _ensure_dependencies() -> None:
    missing = [name for name in ("numpy", "scipy") if importlib.util.find_spec(name) is None]
    if not missing:
        return
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "numpy==2.2.6", "scipy==1.15.3"],
        check=True,
    )


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    return value


def _hash_payload(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


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


def _contract_from_args(args: argparse.Namespace, manifest: dict[str, Any]) -> dict[str, Any]:
    if args.contract_b64:
        payload = decode_contract(args.contract_b64)
        return {
            **payload,
            "mocks": int(payload.get("mocks", manifest["default_mocks"])),
            "seed": int(payload.get("seed", manifest["seed"])),
            "output": str(payload.get("output", "aas77733-r1-result.json")),
            "cache_dir": str(payload.get("cache_dir", ".cache/aas77733")),
        }
    gates = [f"G{i}" for i in range(20)] if args.all else (args.gates or [])
    if not gates or any(gate not in VALID_GATES for gate in gates):
        raise ValueError("USE_ALL_OR_VALID_GATES")
    mocks = args.mocks if args.mocks is not None else int(manifest["default_mocks"])
    if not 1 <= int(mocks) <= 100000:
        raise ValueError("INVALID_MOCKS")
    return {
        "battery_id": manifest["battery_id"],
        "gates": gates,
        "mocks": int(mocks),
        "seed": int(args.seed if args.seed is not None else manifest["seed"]),
        "output": args.output,
        "cache_dir": args.cache_dir,
    }


def main() -> int:
    args = build_parser().parse_args()
    manifest = load_manifest()
    try:
        contract = _contract_from_args(args, manifest)
        _ensure_dependencies()
        if __package__ in {None, ""}:
            from science.aas77733.canonical_gates import run_battery
        else:
            from .canonical_gates import run_battery
        raw = run_battery(
            manifest,
            cache_dir=contract["cache_dir"],
            mocks=int(contract["mocks"]),
            seed=int(contract["seed"]),
            gates=list(contract["gates"]),
        )
        payload = _jsonable(raw)
        blocked = [gate for gate, result in payload.get("gates", {}).items() if result.get("status") == "BLOCKED"]
        payload["execution"] = {
            "validation_status": "FAIL" if blocked else "PASS",
            "blocked_gates": blocked,
            "contract": {key: value for key, value in contract.items() if key != "cache_dir"},
            "numpy_scipy_pinned": ["numpy==2.2.6", "scipy==1.15.3"],
            "gate_binding": "canonical_gates",
        }
        payload["result_hash"] = _hash_payload(payload)
        output = Path(str(contract["output"]))
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        closure = payload.get("gates", {}).get("G19", {}).get("metrics", {}).get("classification")
        receipt = {
            "battery_id": manifest["battery_id"],
            "validation_status": payload["execution"]["validation_status"],
            "result_hash": payload["result_hash"],
            "classification": closure,
            "output": str(output),
        }
        print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
        return 0 if payload["execution"]["validation_status"] == "PASS" else 2
    except Exception as exc:  # noqa: BLE001 - emit one bounded machine-readable runtime failure
        receipt = {
            "battery_id": manifest.get("battery_id", "AAS77733-R1"),
            "validation_status": "FAIL",
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
