from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def manifest_path() -> Path:
    return Path(__file__).with_name("manifest.json")


def load_manifest(path: str | Path | None = None) -> dict[str, Any]:
    target = Path(path) if path is not None else manifest_path()
    payload = json.loads(target.read_text(encoding="utf-8"))
    ids = [gate["id"] for gate in payload["gates"]]
    if ids != [f"G{i}" for i in range(20)]:
        raise ValueError("INVALID_GATE_REGISTRY")
    return payload
