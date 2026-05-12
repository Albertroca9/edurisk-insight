"""
cbr_reuse.py
============
Fase 2 del cicle CBR: REUSE

A partir dels casos recuperats per la fase Retrieve, deriva:
  - dropout_probability : probabilitat estimada d'abandonament (%)
  - risk_score          : puntuació de risc 0–100 (coherent amb app.js)
  - risk_level          : "high" | "medium" | "low"
  - relevant_factors    : variables que més contribueixen al risc

La lògica de risk_score reimplementa exactament calculateRisk() de app.js
per garantir coherència amb el dashboard.
"""

from __future__ import annotations
from cbr_case import FEATURE_WEIGHTS, feature_similarity


# ─────────────────────────────────────────────────────────────────────────────
# CÀLCUL DEL RISK SCORE (mirall de calculateRisk() a app.js)
# ─────────────────────────────────────────────────────────────────────────────

def _scale_down(value, lo: float, hi: float, weight: float) -> float:
    """Equivalent a scaleDown() de app.js."""
    try:
        v = float(value)
    except (ValueError, TypeError):
        return 0.0
    normalized = 1 - (v - lo) / (hi - lo)
    return max(-weight * 0.35, min(weight, normalized * weight))


def compute_risk_score(case: dict) -> tuple[float, str]:
    """
    Recalcula el risk_score i risk_level d'un cas seguint la mateixa
    lògica que calculateRisk() de app.js.

    Retorna (risk_score [0–100], risk_level ["high"|"medium"|"low"]).
    """
    score = 8.0

    mot = case.get("Motivation_Level", "Medium")
    score += 30 if mot == "Low" else (12 if mot == "Medium" else -10)

    score += _scale_down(case.get("Hours_Studied",     20), 8,  26, 24)
    score += _scale_down(case.get("Attendance",        80), 65, 90, 23)
    score += _scale_down(case.get("Exam_Score",        70), 58, 76, 20)
    score += _scale_down(case.get("Previous_Scores",   70), 55, 86, 14)

    tut = float(case.get("Tutoring_Sessions", 0) or 0)
    score += 5 if tut == 0 else -3

    score += 5 if case.get("Access_to_Resources") == "Low" else 0

    score = max(0.0, min(100.0, round(score, 1)))
    level = "high" if score >= 65 else ("medium" if score >= 38 else "low")
    return score, level


# ─────────────────────────────────────────────────────────────────────────────
# FACTORS RELLEVANTS
# ─────────────────────────────────────────────────────────────────────────────

def _identify_relevant_factors(query: dict, top_case: dict) -> list[dict]:
    """
    Identifica les variables amb més contribució al risc.
    Una feature contribueix molt quan té pes alt i similitud baixa
    (el valor de l'estudiant es desvia del cas similar en la direcció de risc).

    risk_contrib = weight × (1 − similarity)
    """
    factors = []
    for feature, weight in FEATURE_WEIGHTS.items():
        q_val = query.get(feature)
        c_val = top_case.get(feature)
        if q_val is None:
            continue
        sim = feature_similarity(q_val, c_val, feature) if c_val is not None else 0.5
        factors.append({
            "feature":      feature,
            "query_value":  q_val,
            "case_value":   c_val,
            "similarity":   round(sim, 3),
            "weight":       weight,
            "risk_contrib": round(weight * (1 - sim), 4),
        })
    factors.sort(key=lambda x: x["risk_contrib"], reverse=True)
    return factors[:7]


# ─────────────────────────────────────────────────────────────────────────────
# REUSE
# ─────────────────────────────────────────────────────────────────────────────

def reuse(retrieved: list[dict], query: dict) -> dict:
    """
    Deriva la solució a partir dels casos recuperats:

    dropout_probability:
      Combinació de dues fonts d'evidència:
        - Veïns (60%): proporció ponderada de dropout entre els top-k casos similars.
          Reflecteix quants casos similars van abandonar i amb quina similitud.
        - Risk score (40%): puntuació calculada amb les regles de calculateRisk().
          Evita que la probabilitat sigui 100% només perquè tots els veïns
          van abandonar (o 0% perquè cap va abandonar), si el perfil
          del query diu el contrari.

    risk_score / risk_level:
      Calculats directament sobre el query (no sobre el cas similar),
      seguint calculateRisk() de app.js.

    relevant_factors:
      Variables on el query s'allunya més del cas similar i que tenen
      més pes en el model → les prioritàries per a intervenció.
    """
    if not retrieved:
        return {
            "dropout_probability": 0.0,
            "risk_score":          0.0,
            "risk_level":          "low",
            "dominant_profile":    None,
            "relevant_factors":    [],
            "top_similarity":      0.0,
        }

    # --- Evidència dels veïns (proporció ponderada de dropout) ---
    total_weight     = sum(e["similarity"] for e in retrieved)
    weighted_dropout = sum(
        e["similarity"] * float(e["case"].get("dropout", 0) or 0)
        for e in retrieved
    )
    neighbor_prob = (weighted_dropout / total_weight) if total_weight > 0 else 0.0

    # --- Risk score calculat sobre el QUERY (no sobre el cas similar) ---
    risk_score, risk_level = compute_risk_score(query)
    risk_prob = risk_score / 100.0

    # --- Probabilitat final: combinació ponderada (60% veïns, 40% risk score) ---
    dropout_prob = (0.60 * neighbor_prob + 0.40 * risk_prob) * 100.0

    top_case = retrieved[0]["case"]

    return {
        "dropout_probability": round(dropout_prob, 1),
        "risk_score":          risk_score,
        "risk_level":          risk_level,
        "dominant_profile":    top_case,
        "relevant_factors":    _identify_relevant_factors(query, top_case),
        "top_similarity":      retrieved[0]["similarity"],
    }
