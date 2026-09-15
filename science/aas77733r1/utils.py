from __future__ import annotations

from typing import Any


def gate_result(gate_id: str, status: str, *, metrics: dict[str, Any] | None = None, evidence: dict[str, Any] | None = None, note: str | None = None) -> dict[str, Any]:
    if status not in {"PASS", "FAIL", "OPEN", "INCONCLUSIVE", "BLOCKED"}:
        raise ValueError(f"INVALID_GATE_STATUS:{status}")
    row: dict[str, Any] = {"gate_id": gate_id, "status": status, "metrics": metrics or {}}
    if evidence is not None:
        row["evidence"] = evidence
    if note is not None:
        row["note"] = note
    return row
