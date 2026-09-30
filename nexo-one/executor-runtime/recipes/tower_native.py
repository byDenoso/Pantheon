"""Receita congelada: testes META sobre o histórico do NEXO, lidos da projeção pública (só agregados, sem acesso à Tower).

Parâmetros (params.json):
  mode: prediction_calibration | readiness_yield | event_clock
  projection_url: padrão https://bydenoso.github.io/Pantheon/tower-projection/projection.json
  min_per_stratum: mínimo de casos por grupo (padrão 10)
  min_cases: mínimo de casos (readiness_yield; padrão 20)
  min_hypotheses: mínimo de hipóteses (event_clock; padrão 10)
"""
import gzip
import hashlib
import json
import math
import re
from datetime import datetime
import os
import statistics
import urllib.request

with open(os.environ["PARAMS_PATH"], encoding="utf-8") as handle:
    params = json.load(handle)
mode = params["mode"]
url = params.get("projection_url", "https://bydenoso.github.io/Pantheon/tower-projection/projection.json")
# Frozen inputs travel separately from scientific params: binding recovery must
# not rewrite a test's preregistered execution parameters.
def load_projection():
    input_path = os.environ.get("INPUTS_PATH")
    required = os.environ.get("NEXO_REQUIRE_FROZEN_INPUTS") == "1"
    if input_path:
        with open(input_path, encoding="utf-8") as handle:
            inputs = json.load(handle)
        if not isinstance(inputs, list) or len(inputs) != 1:
            raise ValueError("tower_native requires exactly one frozen public projection")
        binding = inputs[0]
        if not isinstance(binding, dict):
            raise ValueError("invalid frozen input")
        source = str(binding.get("url") or "")
        version = str(binding.get("version") or "").strip()
        expected = str(binding.get("sha256") or "").removeprefix("sha256:")
        if not source.startswith("https://") or not version or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError("frozen projection requires HTTPS, version and SHA256")
        with urllib.request.urlopen(source, timeout=60) as response:
            raw = response.read()
        actual = hashlib.sha256(raw).hexdigest()
        if actual != expected:
            raise ValueError("frozen projection SHA256 mismatch")
        decoded = gzip.decompress(raw) if binding.get("format") == "json.gz" else raw
        projection = json.loads(decoded)
        provenance = {"url": source, "version": version, "sha256": actual,
                      "scope": "FROZEN_INPUT_BYTES_VERIFIED"}
    elif required:
        raise ValueError("production tower_native requires INPUTS_PATH; live fallback forbidden")
    else:
        # The existing daily recipe smoke probes the live public endpoint. Its
        # result is operational only and is never a production battery result.
        with urllib.request.urlopen(url, timeout=60) as response:
            raw = response.read()
        projection = json.loads(raw)
        provenance = {"url": url, "sha256": hashlib.sha256(raw).hexdigest(),
                      "scope": "LIVE_SMOKE_ONLY"}
    if not isinstance(projection, dict) or not isinstance(projection.get("tests"), list) or not isinstance(projection.get("activity"), list):
        raise ValueError("invalid public projection structure")
    return projection, provenance

proj, input_provenance = load_projection()
tests, acts = proj["tests"], proj["activity"]

GOOD = {"PROMOTED", "PROMOVIDO", "CONFIRMED", "SUPPORTED", "SURVIVED"}
BAD = {"REJECTED", "REJEITADO", "REFUTED"}
INCONC = {"INCONCLUSIVE", "INCONCLUSIVO"}


def when(t):
    e = t.get("executed_at")
    return (e.get("at") if isinstance(e, dict) else e) or ""


def outcome(t):
    v = str(t.get("verdict") or "").upper()
    return 1 if v in GOOD else 0 if v in BAD else None


def pre(t):
    return t.get("prereg") or {}


def observability(t):
    """Itens que existem antes do resultado: nulo, rival, sucesso, kill, previsão, método."""
    p = pre(t)
    c = p.get("criterion") or {}
    return sum(bool(x) for x in (p.get("null"), p.get("rival"), c.get("success"), c.get("kill"),
                                  (p.get("prediction") or {}).get("p_promoted") is not None, t.get("method")))


def brier(rows):
    return statistics.fmean((r["p"] - r["y"]) ** 2 for r in rows) if rows else None


def out(verdict, decision, summary, stats, meaning):
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as handle:
        json.dump({"verdict": verdict, "decision": decision, "summary": summary,
                   "statistics": {**stats, "input_provenance": input_provenance},
                   "semantic": {"result_meaning": meaning}}, handle, ensure_ascii=False)
    raise SystemExit(0)


if mode == "prediction_calibration":
    need = int(params.get("min_per_stratum", 10))
    rows, unverified = [], 0
    for t in tests:
        prediction = pre(t).get("prediction") or {}
        y, p = outcome(t), prediction.get("p_promoted")
        if y is None or p is None or not when(t):
            continue
        # prereg.at / created_at timestamp the design, not the prediction.
        # The design hash also excludes prediction; neither proves prospective p.
        at = prediction.get("recorded_at")
        try:
            recorded = datetime.fromisoformat(str(at).replace("Z", "+00:00"))
            executed = datetime.fromisoformat(when(t).replace("Z", "+00:00"))
            valid = (recorded.tzinfo is not None and executed.tzinfo is not None
                     and recorded < executed and not isinstance(p, bool)
                     and math.isfinite(float(p)) and 0 <= float(p) <= 1)
        except (ValueError, TypeError):
            valid = False
        if not valid:
            unverified += 1
            continue
        rows.append({"y": y, "p": float(p), "obs": observability(t), "at": when(t)})
    rows.sort(key=lambda r: r["at"])
    cut = statistics.median(r["obs"] for r in rows) if rows else 0
    windows = [rows[: len(rows) // 2], rows[len(rows) // 2:]]
    stats, worse, ok = {"cases": len(rows), "excluded_unverified_predictions": unverified, "obs_cut": cut, "windows": []}, [], True
    for w in windows:
        hi, lo = [r for r in w if r["obs"] > cut], [r for r in w if r["obs"] <= cut]
        bh, bl = brier(hi), brier(lo)
        stats["windows"].append({"high_n": len(hi), "low_n": len(lo), "brier_high": bh, "brier_low": bl})
        if len(hi) < need or len(lo) < need:
            ok = False
        elif bl >= 1.25 * bh:
            worse.append(True)
        else:
            worse.append(False)
    if not ok:
        out("INCONCLUSIVE", "SAMPLE_TOO_SMALL", f"{len(rows)} testes decididos com previsão; faltam casos por grupo (mínimo {need}).", stats,
            "Ainda não há testes decididos suficientes para comparar a calibração entre observabilidade alta e baixa.")
    if all(worse):
        out("PROMOTED", "LOW_OBS_WORSE", "Nas duas janelas a calibração com baixa observabilidade ficou pelo menos 25% pior.", stats,
            "Previsões feitas com menos informação prévia erram mais.")
    out("REJECTED", "NO_GAP", "A calibração não piora sistematicamente com baixa observabilidade.", stats,
        "A observabilidade prévia não mudou a qualidade das previsões nas duas janelas.")

if mode == "readiness_yield":
    need = int(params.get("min_cases", 20))
    rows = []
    for t in tests:
        v = str(t.get("verdict") or "").upper()
        if t.get("status") in ("DRAFT", "BLOCKED_INPUT") or v in GOOD | BAD | INCONC:
            bad = t.get("status") in ("DRAFT", "BLOCKED_INPUT") or v in INCONC
            rows.append({"score": observability(t), "bad": int(bad), "at": when(t) or t.get("first_observed_at") or ""})
    rows.sort(key=lambda r: r["at"])
    half = len(rows) // 2
    train, test = rows[:half], rows[half:]
    stats = {"cases": len(rows)}
    if len(rows) < need:
        out("INCONCLUSIVE", "SAMPLE_TOO_SMALL", f"{len(rows)} casos históricos (mínimo {need}).", stats,
            "Faltam casos históricos para avaliar o escore de prontidão.")
    cuts = sorted({r["score"] for r in train})
    best = max(cuts, key=lambda c: statistics.fmean((r["score"] <= c) == bool(r["bad"]) for r in train))
    acc = statistics.fmean((r["score"] <= best) == bool(r["bad"]) for r in test)
    base = max(statistics.fmean(r["bad"] for r in test), 1 - statistics.fmean(r["bad"] for r in test))
    stats.update({"cut": best, "accuracy_holdout": acc, "baseline": base})
    if acc >= base + 0.10:
        out("PROMOTED", "SCORE_PREDICTS", f"Acerto de {acc:.0%} na metade nova contra {base:.0%} do chute básico.", stats,
            "O escore de prontidão calculado antes da execução prevê quais testes terminam sem resultado.")
    out("REJECTED", "SCORE_NO_GAIN", f"Acerto de {acc:.0%} contra {base:.0%} do chute básico.", stats,
        "O escore de prontidão não melhorou sobre o chute básico.")

if mode == "event_clock":
    need = int(params.get("min_hypotheses", 10))
    ev = {}
    for a in acts:
        if a["event_type"] == "HYPOTHESIS_UPSERTED":
            ev.setdefault(a["entity_id"], a["at"])
    hyp = {h["id"]: h for h in proj["hypotheses"]}
    pairs = [(hyp[i].get("updated_at"), at) for i, at in ev.items() if i in hyp]
    n = len(ev)
    stats = {"hypotheses_with_event": n, "with_entity_timestamp": sum(bool(p[0]) for p in pairs)}
    if n < need:
        out("INCONCLUSIVE", "SAMPLE_TOO_SMALL", f"{n} hipóteses com evento de criação (mínimo {need}).", stats,
            "Faltam hipóteses com evento de criação para comparar os dois relógios.")
    from datetime import datetime
    ts = lambda x: datetime.fromisoformat(x.replace("Z", "+00:00")).timestamp()
    comparable = [(u, at) for u, at in pairs if u]
    inversions = sum(1 for u, at in comparable if ts(at) > ts(u) + 86400)
    stats.update({"comparable_pairs": len(comparable), "order_inversions": inversions})
    if len(comparable) < need:
        out("INCONCLUSIVE", "NO_ENTITY_CLOCK", f"Só {len(comparable)} hipóteses têm o relógio da entidade para comparar (mínimo {need}).", stats,
            "O relógio por evento existe, mas falta o relógio antigo nas mesmas hipóteses para comparar a ordem.")
    if inversions == 0:
        out("PROMOTED", "EVENT_CLOCK_COMPLETE", f"O evento é numérico em {n} de {n} hipóteses e nenhuma ordem se inverte.", stats,
            "Usar o evento de criação como relógio dá número em todas as hipóteses e mantém a ordem no tempo.")
    out("REJECTED", "EVENT_CLOCK_INVERSIONS", f"{inversions} inversões de ordem entre evento e entidade.", stats,
        "O evento de criação inverte a ordem no tempo em parte das hipóteses.")

raise SystemExit(f"modo desconhecido: {mode}")
