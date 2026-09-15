from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PACKAGE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = PACKAGE_DIR / "manifest.json"


def load_manifest(path: str | Path | None = None) -> dict[str, Any]:
    target = Path(path) if path is not None else MANIFEST_PATH
    payload = json.loads(target.read_text(encoding="utf-8"))
    if payload.get("battery_id") != "AAS77733-R1":
        raise ValueError("INVALID_BATTERY_MANIFEST")
    gates = payload.get("gates") or []
    ids = [item.get("id") for item in gates]
    if ids != [f"G{i}" for i in range(20)]:
        raise ValueError("INVALID_GATE_REGISTRY")
    return payload
