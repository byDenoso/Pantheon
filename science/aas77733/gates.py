from __future__ import annotations

from typing import Any


def gate_result(gate_id: str, status: str, *, metrics: dict[str, Any] | None = None, evidence: dict[str, Any] | None = None, note: str | None = None) -> dict[str, Any]:
    if status not in {"PASS", "FAIL", "OPEN", "INCONCLUSIVE", "BLOCKED"}:
        raise ValueError(f"INVALID_GATE_STATUS:{status}")
    result: dict[str, Any] = {"gate_id": gate_id, "status": status, "metrics": metrics or {}}
    if evidence:
        result["evidence"] = evidence
    if note:
        result["note"] = note
    return result


def close_claim(results: dict[str, dict[str, Any]], manifest: dict[str, Any]) -> dict[str, Any]:
    """Absorbing terminal policy. It reads gate outputs; it never repairs them."""

    integrity = ["G1", "G2", "G3"]
    integrity_fail = [gate for gate in integrity if results.get(gate, {}).get("status") != "PASS"]
    if integrity_fail:
        return {
            "classification": "BLOCKED_INTEGRITY",
            "defeating_gates": integrity_fail,
            "open_gates": [],
            "physical_interpretation": False,
        }

    open_gates = [
        gate
        for gate in ["G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15", "G16", "G17", "G18"]
        if results.get(gate, {}).get("status") in {None, "OPEN", "INCONCLUSIVE", "BLOCKED"}
    ]
    defeating = [
        gate
        for gate in ["G5", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15", "G16", "G17"]
        if results.get(gate, {}).get("status") == "FAIL"
    ]

    feature = results.get("G6", {})
    feature_delta = float(feature.get("metrics", {}).get("delta_chi2", 0.0) or 0.0)
    if feature.get("status") == "FAIL" or feature_delta <= 0.0:
        return {
            "classification": "NO_ROBUST_FEATURE",
            "defeating_gates": sorted(set(defeating + ["G6"])),
            "open_gates": open_gates,
            "physical_interpretation": False,
        }

    if defeating:
        return {
            "classification": "RESIDUAL_DIAGNOSTIC_ONLY",
            "defeating_gates": defeating,
            "open_gates": open_gates,
            "physical_interpretation": False,
        }

    required_physical = ["G6", "G8", "G11", "G12", "G14", "G15", "G17"]
    if manifest.get("closure", {}).get("physical_support_requires_external_context", True):
        required_physical.append("G18")
    missing_physical = [gate for gate in required_physical if results.get(gate, {}).get("status") != "PASS"]
    if missing_physical or open_gates:
        return {
            "classification": "INCONCLUSIVE_OPEN_GATES",
            "defeating_gates": [],
            "open_gates": sorted(set(open_gates + missing_physical)),
            "physical_interpretation": False,
        }

    return {
        "classification": "PHYSICAL_TRANSITION_SUPPORTED",
        "defeating_gates": [],
        "open_gates": [],
        "physical_interpretation": True,
    }
