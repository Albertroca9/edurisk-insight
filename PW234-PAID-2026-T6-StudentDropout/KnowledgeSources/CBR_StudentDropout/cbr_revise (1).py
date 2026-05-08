"""
cbr_revise.py
=============
Fase 3 del cicle CBR: REVISE

Adapta la solució proposada per la fase Reuse al perfil concret del
nou estudiant. Aplica el catàleg d'intervencions definit com a base de
regles de producció (production rules), coherent amb recommendActions()
i buildInterventionSegments() de app.js.

Cada regla té la forma:  condició(query) → intervenció recomanada
"""

from __future__ import annotations


# ─────────────────────────────────────────────────────────────────────────────
# CATÀLEG D'INTERVENCIONS (base de regles de producció)
# Ordenades per prioritat (1 = màxima urgència)
# Condicions i textos coherents amb app.js (recommendActions i
# buildInterventionSegments) i amb els llindars de calculateRisk()
# ─────────────────────────────────────────────────────────────────────────────

INTERVENTIONS_CATALOG: list[dict] = [
    {
        "id":          "INT-01",
        "title":       "Tutoria motivacional",
        "description": (
            "Revisió individual d'objectius i barreres de compromís. "
            "Sessions setmanals amb el tutor per detectar desmotivació precoç."
        ),
        "condition":   lambda q: q.get("Motivation_Level") == "Low",
        "priority":    1,
        "targets":     ["Motivation_Level"],
    },
    {
        "id":          "INT-02",
        "title":       "Seguiment d'assistència",
        "description": (
            "Contacte preventiu i pauta setmanal de presència a classe. "
            "Notificació als tutors o família si l'assistència cau per sota del 75%."
        ),
        "condition":   lambda q: _num(q, "Attendance") < 75,
        "priority":    1,
        "targets":     ["Attendance"],
    },
    {
        "id":          "INT-03",
        "title":       "Suport per necessitats educatives especials",
        "description": (
            "Adaptació curricular i coordinació amb especialistes per a estudiants "
            "amb dificultats d'aprenentatge diagnosticades."
        ),
        "condition":   lambda q: str(q.get("Learning_Disabilities", "0")) == "1",
        "priority":    1,
        "targets":     ["Learning_Disabilities"],
    },
    {
        "id":          "INT-04",
        "title":       "Pla d'estudi guiat",
        "description": (
            "Franges concretes d'estudi i revisió de progrés cada dues setmanes. "
            "Objectiu mínim de 15 hores setmanals d'estudi autònom."
        ),
        "condition":   lambda q: _num(q, "Hours_Studied") < 15,
        "priority":    2,
        "targets":     ["Hours_Studied"],
    },
    {
        "id":          "INT-05",
        "title":       "Reforç acadèmic",
        "description": (
            "Sessions focalitzades en les competències amb pitjor rendiment. "
            "Revisió conjunta d'exàmens anteriors i treball sobre errors recurrents."
        ),
        "condition":   lambda q: _num(q, "Exam_Score") < 64 or _num(q, "Previous_Scores") < 68,
        "priority":    2,
        "targets":     ["Exam_Score", "Previous_Scores"],
    },
    {
        "id":          "INT-06",
        "title":       "Suport en recursos educatius",
        "description": (
            "Prioritzar l'accés a materials, espais d'estudi o suport digital. "
            "Derivació als serveis de préstec i recursos de la institució."
        ),
        "condition":   lambda q: q.get("Access_to_Resources") == "Low",
        "priority":    2,
        "targets":     ["Access_to_Resources"],
    },
    {
        "id":          "INT-07",
        "title":       "Sessions de tutoria acadèmica",
        "description": (
            "Incorporació a sessions regulars de tutoria (mínim 2 sessions/mes) "
            "per reforçar continguts i fer seguiment del progrés."
        ),
        "condition":   lambda q: _num(q, "Tutoring_Sessions") == 0,
        "priority":    2,
        "targets":     ["Tutoring_Sessions"],
    },
    {
        "id":          "INT-08",
        "title":       "Implicació familiar",
        "description": (
            "Entrevista amb la família per reforçar el suport domèstic. "
            "Informar del risc detectat i proporcionar guia d'acompanyament."
        ),
        "condition":   lambda q: q.get("Parental_Involvement") == "Low",
        "priority":    3,
        "targets":     ["Parental_Involvement"],
    },
    {
        "id":          "INT-09",
        "title":       "Gestió de la influència entre iguals",
        "description": (
            "Reassignació de grup o activitats col·lectives per reduir la influència "
            "negativa de l'entorn. Programa de mentoria entre iguals."
        ),
        "condition":   lambda q: q.get("Peer_Influence") == "Negative",
        "priority":    3,
        "targets":     ["Peer_Influence"],
    },
    {
        "id":          "INT-10",
        "title":       "Seguiment ordinari",
        "description": (
            "Mantenir observació i revisar evolució en el pròxim cicle d'avaluació. "
            "Cap acció urgent requerida en aquest moment."
        ),
        "condition":   lambda q: True,   # fallback: sempre actiu
        "priority":    4,
        "targets":     [],
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _num(query: dict, feature: str, default: float = 100.0) -> float:
    """Extreu un valor numèric del query de forma segura."""
    try:
        return float(query.get(feature, default) or default)
    except (ValueError, TypeError):
        return default


# ─────────────────────────────────────────────────────────────────────────────
# REVISE
# ─────────────────────────────────────────────────────────────────────────────

_URGENCY = {
    "high":   "🔴  INTERVENCIÓ PRIORITÀRIA — Actuar en les pròximes 48 hores.",
    "medium": "🟡 SEGUIMENT PREVENTIU — Programar revisió en les pròximes 2 setmanes.",
    "low":    "🟢 MONITORITZACIÓ ORDINÀRIA — Revisar al proper cicle d'avaluació.",
}


def revise(query: dict, reuse_result: dict) -> dict:
    """
    Adapta les intervencions al perfil concret del nou estudiant:

    1. Avalua cada regla del catàleg sobre el query.
    2. Descarta el fallback (INT-10) si alguna altra regla s'activa.
    3. Ordena per prioritat.
    4. Limita a 4 intervencions màxim (coherent amb el dashboard).
    5. Afegeix el missatge d'urgència segons el risk_level.

    Retorna un dict amb 'interventions' i 'urgency_message'.
    """
    risk_level = reuse_result.get("risk_level", "low")

    applicable = []
    for interv in INTERVENTIONS_CATALOG:
        try:
            if interv["condition"](query):
                applicable.append({
                    "id":          interv["id"],
                    "title":       interv["title"],
                    "description": interv["description"],
                    "priority":    interv["priority"],
                    "targets":     interv["targets"],
                })
        except Exception:
            pass

    # Si hi ha intervencions concretes, elimina el fallback
    specific = [i for i in applicable if i["id"] != "INT-10"]
    if specific:
        applicable = specific

    applicable.sort(key=lambda x: x["priority"])

    return {
        "interventions":   applicable[:4],
        "urgency_message": _URGENCY.get(risk_level, ""),
        "risk_level":      risk_level,
    }
