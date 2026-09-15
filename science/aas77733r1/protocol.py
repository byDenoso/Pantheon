from __future__ import annotations

from pathlib import Path
from typing import Any

from .context import Context
from .gates_a import GATES as GATES_A
from .gates_b import GATES as GATES_B
from .gates_c import GATES as GATES_C
from .gates_d import GATES as GATES_D
from .utils import gate_result

GATE_FUNCTIONS = {**GATES_A, **GATES_B, **GATES_C, **GATES_D}


def close_claim(results: dict[str, dict[str, Any]]) -> dict[str, Any]:
    integrity = [g for g in ("G1", "G2", "G3") if results.get(g, {}).get("status") != "PASS"]
    if integrity:
        return {"classification":"BLOCKED_INTEGRITY","claim_code":None,"defeating_gates":integrity,"physical_cause_supported":False}

    feature = results.get("G6", {})
    delta = float(feature.get("metrics", {}).get("delta_chi2", 0.0) or 0.0)
    c1_defeaters = [g for g in ("G6", "G8", "G11") if results.get(g, {}).get("status") == "FAIL"]
    if delta <= 0.0 and "G6" not in c1_defeaters:
        c1_defeaters.append("G6")
    if c1_defeaters:
        return {
            "classification":"C1_NO_ROBUST_RESIDUAL_FEATURE","claim_code":"C1",
            "defeating_gates":c1_defeaters,"physical_cause_supported":False,
            "claim":"no robust residual feature under the frozen global and structure-preserving null hierarchy",
        }

    control_gates = ("G5", "G9", "G10", "G12", "G13", "G14", "G15", "G16", "G17")
    control_failures = [g for g in control_gates if results.get(g, {}).get("status") != "PASS"]
    if control_failures:
        return {
            "classification":"C2_REPRODUCIBLE_OBSERVATIONALLY_STRUCTURED","claim_code":"C2",
            "defeating_gates":control_failures,"physical_cause_supported":False,
            "claim":"a reproducible residual feature is present but at least one observational robustness or external-replication gate fails",
        }

    g18 = results.get("G18", {})
    physical = g18.get("status") == "PASS" and bool(g18.get("metrics", {}).get("physical_context_complete", False))
    return {
        "classification":"C3_SURVIVES_CONTROLS_AND_REPLICATES","claim_code":"C3",
        "defeating_gates":[],"physical_cause_supported":physical,
        "open_physical_context":g18.get("status") != "PASS",
        "claim":"feature survives observational controls and independently replicates; physical cause requires separate external-context closure",
    }


def run_battery(*, cache_dir: str | Path, mocks: int, seed: int) -> dict[str, Any]:
    ctx = Context(cache_dir=Path(cache_dir), mocks=int(mocks), seed=int(seed))
    results: dict[str, Any] = {}
    for i in range(19):
        gate_id = f"G{i}"
        function = GATE_FUNCTIONS.get(gate_id)
        if function is None:
            results[gate_id] = gate_result(gate_id, "BLOCKED", evidence={"error":"gate function missing"})
            continue
        try:
            results[gate_id] = function(ctx, results)
        except Exception as exc:
            results[gate_id] = gate_result(gate_id, "BLOCKED", evidence={"error_type":type(exc).__name__,"error":str(exc)})
    closure = close_claim(results)
    results["G19"] = gate_result("G19", "BLOCKED" if closure["classification"] == "BLOCKED_INTEGRITY" else "PASS", metrics=closure)
    provenance: dict[str, Any] = {"seed":int(seed),"mocks_requested":int(mocks),"executor":"github_actions_primary"}
    if ctx._pantheon is not None:
        provenance["pantheon_plus"] = ctx._pantheon.receipts
    if ctx._des is not None:
        provenance["des_sn5yr"] = ctx._des.receipts
    return {"battery_id":"AAS77733-R1-PUB","gates":results,"provenance":provenance}
