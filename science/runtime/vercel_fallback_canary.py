from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded NEXO Vercel fallback canary")
    parser.add_argument("--contract-b64", required=True)
    args = parser.parse_args()

    try:
        raw = base64.b64decode(args.contract_b64, validate=True)
        contract = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        print(json.dumps({"validation_status": "FAIL", "error": f"INVALID_CONTRACT:{type(exc).__name__}"}))
        return 2

    if not isinstance(contract, dict):
        print(json.dumps({"validation_status": "FAIL", "error": "CONTRACT_MUST_BE_OBJECT"}))
        return 2

    required = ("canary_id", "work_id", "gate_id", "shard_id", "expected_backend")
    missing = [key for key in required if not str(contract.get(key, "")).strip()]
    if missing:
        print(json.dumps({"validation_status": "FAIL", "error": "MISSING_FIELDS", "fields": missing}))
        return 2

    if contract["expected_backend"] != "vercel_sandbox":
        print(json.dumps({"validation_status": "FAIL", "error": "BACKEND_CONTRACT_MISMATCH"}))
        return 2

    digest = hashlib.sha256(canonical_json(contract).encode("utf-8")).hexdigest()
    receipt = {
        "validation_status": "PASS",
        "result_hash": f"sha256:{digest}",
        "canary_id": contract["canary_id"],
        "work_id": contract["work_id"],
        "gate_id": contract["gate_id"],
        "shard_id": contract["shard_id"],
        "backend": "vercel_sandbox",
    }
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
