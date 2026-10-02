"""Frozen META recipe: stable_id retry idempotency from an immutable public retry-pair manifest."""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.request

HTTPS = re.compile(r"https://")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("manifest redirects are forbidden")


def fetch_bytes(url):
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(url, timeout=60) as response:
        return response.read()


def load_manifest():
    input_path = os.environ.get("INPUTS_PATH")
    required = os.environ.get("NEXO_REQUIRE_FROZEN_INPUTS") == "1"
    if not input_path:
        if required:
            raise ValueError("production stable_id_idempotency requires INPUTS_PATH")
        return None, {"scope": "LIVE_SMOKE_ONLY"}
    inputs = json.load(open(input_path, encoding="utf-8"))
    if not isinstance(inputs, list) or len(inputs) != 1 or not isinstance(inputs[0], dict):
        raise ValueError("stable_id_idempotency requires exactly one retry-pair manifest")
    b = inputs[0]
    url = str(b.get("url") or "")
    version = str(b.get("version") or "").strip()
    expected = str(b.get("sha256") or "").removeprefix("sha256:")
    if not HTTPS.match(url) or not version or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("retry-pair manifest requires HTTPS, version and SHA256")
    raw = fetch_bytes(url)
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected:
        raise ValueError("retry-pair manifest SHA256 mismatch")
    manifest = json.loads(raw)
    if manifest.get("contract") != "NEXO_STABLE_ID_RETRY_PAIRS_V1" or not isinstance(manifest.get("pairs"), list):
        raise ValueError("invalid retry-pair manifest contract")
    return manifest, {"url": url, "version": version, "sha256": actual, "scope": "FROZEN_INPUT_BYTES_VERIFIED"}


def analyze_pairs(pairs):
    if not isinstance(pairs, list):
        raise ValueError("pairs must be a list")
    identical = 0
    reused = 0
    collisions = 0
    rows = []
    for i, pair in enumerate(pairs):
        if not isinstance(pair, dict) or not isinstance(pair.get("a"), dict) or not isinstance(pair.get("b"), dict):
            raise ValueError(f"invalid pair {i}")
        a, b = pair["a"], pair["b"]
        sa, sb = str(a.get("stable_id") or ""), str(b.get("stable_id") or "")
        ea, eb = a.get("envelope_text"), b.get("envelope_text")
        if not sa or not sb or not isinstance(ea, str) or not isinstance(eb, str):
            raise ValueError(f"pair {i} lacks stable_id or exact envelope_text")
        same_payload = ea.encode("utf-8") == eb.encode("utf-8")
        same_id = sa == sb
        if same_payload:
            identical += 1
            reused += int(same_id)
        if same_id and not same_payload:
            collisions += 1
        rows.append({"pair": i, "same_payload_bytes": same_payload, "same_stable_id": same_id,
                     "a_envelope_sha256": hashlib.sha256(ea.encode()).hexdigest(),
                     "b_envelope_sha256": hashlib.sha256(eb.encode()).hexdigest()})
    reuse = None if identical == 0 else reused / identical
    return {"n_pairs": len(pairs), "identical_retry_pairs": identical, "reused_identical": reused,
            "reuse_fraction": reuse, "material_collisions": collisions, "pairs": rows}


def run(params, manifest):
    if manifest is None:
        urls = params.get("smoke_request_urls") or []
        if len(urls) < 2:
            raise ValueError("smoke requires two public request URLs")
        loaded = []
        for url in urls:
            if not str(url).startswith("https://raw.githubusercontent.com/byDenoso/TCC/"):
                raise ValueError("smoke request source must be commit-pinned public TCC raw content")
            raw = fetch_bytes(str(url))
            doc = json.loads(raw)
            if not doc.get("stable_id") or not isinstance(doc.get("envelope"), dict):
                raise ValueError("invalid public request wrapper")
            loaded.append({"url": url, "stable_id": doc["stable_id"], "sha256": hashlib.sha256(raw).hexdigest()})
        return {"verdict":"INCONCLUSIVE","decision":"SMOKE_PUBLIC_REQUESTS_LOADED",
                "summary":f"{len(loaded)} requests públicos reais carregados; o smoke não os trata como retries científicos.",
                "statistics":{"mode":"smoke","requests":loaded},
                "semantic":{"result_meaning":"Valida transporte, parsing e proveniência pública da receita sem fabricar pares de retry."}}
    stats = analyze_pairs(manifest["pairs"])
    n, reuse, collisions = stats["n_pairs"], stats["reuse_fraction"], stats["material_collisions"]
    if n < 20:
        verdict, decision = "INCONCLUSIVE", "SAMPLE_TOO_SMALL"
    elif collisions > 0:
        verdict, decision = "REJECTED", "MATERIAL_COLLISION"
    elif stats["identical_retry_pairs"] < 20:
        verdict, decision = "INCONCLUSIVE", "INSUFFICIENT_IDENTICAL_RETRIES"
    elif reuse is not None and reuse < 0.95:
        verdict, decision = "REJECTED", "REUSE_BELOW_95_PERCENT"
    elif reuse == 1.0 and collisions == 0:
        verdict, decision = "PROMOTED", "IDEMPOTENT_NO_COLLISIONS"
    else:
        verdict, decision = "INCONCLUSIVE", "IDEMPOTENCY_MIXED"
    return {"verdict":verdict,"decision":decision,
            "summary":f"{n} pares; retries idênticos={stats['identical_retry_pairs']}; reuse={reuse}; colisões materiais={collisions}.",
            "statistics":stats,
            "semantic":{"result_meaning":"Compara bytes exatos do envelope em pares de request/retry e verifica reutilização do stable_id sem colisão de payload."}}


if __name__ == "__main__":
    try:
        params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
        manifest, provenance = load_manifest()
        result = run(params, manifest)
        result["statistics"] = {**result["statistics"], "input_provenance": provenance}
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        meaning = "O manifesto público de retries não pôde ser validado: " + str(error)
        result = {"verdict":"INCONCLUSIVE","decision":"RETRY_MANIFEST_UNAVAILABLE","summary":meaning,
                  "statistics":{},"semantic":{"result_meaning":meaning}}
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, allow_nan=False)
    print(result["summary"])
