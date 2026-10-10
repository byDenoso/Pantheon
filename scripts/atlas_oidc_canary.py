"""Count-only Atlas transport canary; never consume or authorize a decision.

Run as ``python -m scripts.atlas_oidc_canary`` from the repository root.
Only the fixed result and count may reach logs; response data stays in memory.
"""
import json
import sys
import urllib.request

URL = "https://nexoresearch.org/api/autonomy-writer/decisions"
AUDIENCE = "nexo-atlas-autonomy-writer"
CONTRACT = "NEXO_ATLAS_AUTONOMY_OUTBOX_V1"
MAX_BYTES = 1048576


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("invalid constant")


def run_canary():
    # Reuse the existing OIDC and redirect guards without changing their code.
    from scripts.nexo_autonomy_runtime import NoApiRedirect, oidc

    token = oidc(AUDIENCE)
    request = urllib.request.Request(
        URL, headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.build_opener(NoApiRedirect()).open(request, timeout=5) as response:
        if response.status != 200:
            raise ValueError("http")
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("size")
    payload = json.loads(body.decode("utf-8"), object_pairs_hook=reject_duplicate_keys,
                         parse_constant=reject_constant)
    if type(payload) is not dict or set(payload) != {"contract", "decisions"}:
        raise ValueError("schema")
    if payload["contract"] != CONTRACT or type(payload["decisions"]) is not list:
        raise ValueError("contract")
    if len(payload["decisions"]) > 20:
        raise ValueError("count")
    return len(payload["decisions"])


def main():
    try:
        count = run_canary()
        print(f"ATLAS_OIDC_CANARY PASS count={count}")
        return 0
    except Exception:
        # Never log exception details: they may contain credentials or payloads.
        print("ATLAS_OIDC_CANARY FAIL count=0")
        return 1


if __name__ == "__main__":
    sys.exit(main())
