"""
cbr_case.py
===========
Definició d'un cas CBR per al sistema de predicció d'abandonament escolar.

Conté:
  - L'esquema de variables (features) amb pesos i tipus
  - Les funcions de similitud per cada tipus de variable
  - La funció de similitud global ponderada entre dos casos
"""

from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# ESQUEMA DE VARIABLES (FEATURE SCHEMA)
# Pesos derivats de la importància SHAP del model XGBoost i de calculateRisk()
# del dashboard (app.js). Suma total de pesos = 1.0
# ─────────────────────────────────────────────────────────────────────────────

FEATURE_WEIGHTS: dict[str, float] = {
    # Variables numèriques
    "Hours_Studied":        0.12,
    "Attendance":           0.15,
    "Previous_Scores":      0.10,
    "Exam_Score":           0.13,
    "Sleep_Hours":          0.04,
    "Tutoring_Sessions":    0.06,
    "Physical_Activity":    0.03,
    # Variables ordinals (Low/Medium/High o similars)
    "Motivation_Level":     0.12,
    "Access_to_Resources":  0.07,
    "Parental_Involvement": 0.05,
    "Family_Income":        0.04,
    "Teacher_Quality":      0.03,
    "Peer_Influence":       0.03,
    # Variable binària
    "Learning_Disabilities": 0.03,
}

# Rangs per normalització Min-Max de les variables numèriques
NUMERIC_RANGES: dict[str, tuple[float, float]] = {
    "Hours_Studied":     (0, 44),
    "Attendance":        (0, 100),
    "Previous_Scores":   (0, 100),
    "Exam_Score":        (0, 100),
    "Sleep_Hours":       (4, 10),
    "Tutoring_Sessions": (0, 8),
    "Physical_Activity": (0, 6),
}

# Mapping ordinal → valor en [0, 1] (0 = pitjor, 1 = millor per al risc)
ORDINAL_MAP: dict[str, dict[str, float]] = {
    "Motivation_Level":     {"Low": 0.0, "Medium": 0.5, "High": 1.0},
    "Access_to_Resources":  {"Low": 0.0, "Medium": 0.5, "High": 1.0},
    "Parental_Involvement": {"Low": 0.0, "Medium": 0.5, "High": 1.0},
    "Family_Income":        {"Low": 0.0, "Medium": 0.5, "High": 1.0},
    "Teacher_Quality":      {"Low": 0.0, "Medium": 0.5, "High": 1.0},
    "Peer_Influence":       {"Negative": 0.0, "Neutral": 0.5, "Positive": 1.0},
    "Learning_Disabilities": {"0": 1.0, "1": 0.0},
}


# ─────────────────────────────────────────────────────────────────────────────
# FUNCIONS DE SIMILITUD PER TIPUS DE VARIABLE
# ─────────────────────────────────────────────────────────────────────────────

def sim_numeric(v1: float, v2: float, feature: str) -> float:
    """
    Similitud entre dos valors numèrics:
    sim = 1 - |norm(v1) - norm(v2)|
    on norm() és la normalització Min-Max al rang de la variable.
    """
    lo, hi = NUMERIC_RANGES[feature]
    span = hi - lo
    if span == 0:
        return 1.0
    n1 = max(0.0, min(1.0, (float(v1) - lo) / span))
    n2 = max(0.0, min(1.0, (float(v2) - lo) / span))
    return 1.0 - abs(n1 - n2)


def sim_ordinal(v1: str, v2: str, feature: str) -> float:
    """
    Similitud entre dos valors ordinals:
    sim = 1 - |rank(v1) - rank(v2)|
    on rank() és el valor en [0, 1] definit a ORDINAL_MAP.
    """
    m = ORDINAL_MAP[feature]
    r1 = m.get(str(v1), 0.5)
    r2 = m.get(str(v2), 0.5)
    return 1.0 - abs(r1 - r2)


def sim_binary(v1, v2) -> float:
    """Similitud binària: 1 si iguals, 0 si diferents."""
    return 1.0 if str(v1) == str(v2) else 0.0


def feature_similarity(val_query, val_case, feature: str) -> float:
    """Dispatcher: tria la funció de similitud correcta segons el tipus de variable."""
    if feature in NUMERIC_RANGES:
        try:
            return sim_numeric(float(val_query), float(val_case), feature)
        except (ValueError, TypeError):
            return 0.0
    elif feature in ORDINAL_MAP:
        return sim_ordinal(str(val_query), str(val_case), feature)
    else:
        return sim_binary(val_query, val_case)


def global_similarity(query: dict, case: dict) -> float:
    """
    Similitud global ponderada entre una consulta i un cas:
    Sim(q, c) = Σ [w_i · sim_i(q_i, c_i)] / Σ w_i

    Ignora les features que falten en el query o en el cas.
    Retorna un valor en [0, 1].
    """
    total_sim = 0.0
    total_weight = 0.0
    for feature, weight in FEATURE_WEIGHTS.items():
        q_val = query.get(feature)
        c_val = case.get(feature)
        if q_val is None or c_val is None:
            continue
        sim = feature_similarity(q_val, c_val, feature)
        total_sim   += weight * sim
        total_weight += weight
    return (total_sim / total_weight) if total_weight > 0 else 0.0
