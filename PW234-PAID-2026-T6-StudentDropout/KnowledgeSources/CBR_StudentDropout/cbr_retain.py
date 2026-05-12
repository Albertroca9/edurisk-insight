"""
cbr_retain.py
=============
Fase 4 del cicle CBR: RETAIN

Decideix si el nou cas (estudiant) s'ha d'incorporar a la base de casos
un cop s'ha confirmat el resultat real (etiqueta 'dropout' validada per
l'orientador o el sistema de seguiment).

Criteris d'incorporació:
  1. Cal tenir l'etiqueta real confirmada (dropout = 0 o 1).
  2. La similitud màxima amb els casos existents ha de ser inferior a un
     llindar (per defecte 0.90): si el cas ja és molt similar a un existent,
     no aporta informació nova i no s'incorpora.
  3. Opcionalment es pot forçar la incorporació si l'orientador ho decideix.

Si el cas s'incorpora, s'afegeix al final de la llista case_base (en memòria).
Per persistir els canvis al CSV, s'ha de cridar save_case_base().
"""

from __future__ import annotations
import csv
from pathlib import Path
from cbr_case import FEATURE_WEIGHTS


# ─────────────────────────────────────────────────────────────────────────────
# RETAIN
# ─────────────────────────────────────────────────────────────────────────────

def retain(
    query: dict,
    reuse_result: dict,
    case_base: list[dict],
    confirmed_dropout: int | None = None,
    threshold: float = 0.90,
    force: bool = False,
) -> tuple[list[dict], bool, str]:
    """
    Avalua si el nou cas s'incorpora a la base de casos.

    Paràmetres:
      query              : el nou estudiant consultat
      reuse_result       : resultat de la fase Reuse (conté top_similarity)
      case_base          : base de casos actual (llista de dicts)
      confirmed_dropout  : etiqueta real confirmada (0 o 1); None = no disponible
      threshold          : similitud màxima per considerar el cas com a "nou"
      force              : si True, incorpora sempre (decisió manual de l'orientador)

    Retorna:
      (case_base actualitzada, fou_afegit: bool, motiu: str)
    """
    if confirmed_dropout is None:
        return case_base, False, "No s'incorpora: etiqueta real no disponible."

    top_sim = reuse_result.get("top_similarity", 0.0)

    if not force and top_sim >= threshold:
        return (
            case_base,
            False,
            f"No s'incorpora: similitud màxima {top_sim:.2%} ≥ llindar {threshold:.0%}. "
            f"El cas ja està cobert per casos existents.",
        )

    new_id   = f"NEW-{len(case_base) + 1:04d}"
    new_case = {
        **{k: v for k, v in query.items() if k in FEATURE_WEIGHTS or k == "dropout"},
        "dropout": str(confirmed_dropout),
        "_id":     new_id,
        "_source": "retained",
    }
    case_base.append(new_case)

    reason = (
        f"Cas incorporat com {new_id}. "
        f"Similitud màxima prèvia: {top_sim:.2%} (< llindar {threshold:.0%}). "
        f"Dropout confirmat: {confirmed_dropout}."
    )
    if force:
        reason = f"Cas incorporat per decisió manual de l'orientador com {new_id}. " \
                 f"Dropout confirmat: {confirmed_dropout}."

    return case_base, True, reason


# ─────────────────────────────────────────────────────────────────────────────
# PERSISTÈNCIA: guardar la base de casos actualitzada al CSV
# ─────────────────────────────────────────────────────────────────────────────

def save_case_base(case_base: list[dict], csv_path: str) -> None:
    """
    Guarda la base de casos (incloent els casos retinguts nous) al fitxer CSV.
    Només escriu les columnes originals del dataset; ignora '_id' i '_source'.
    """
    original_columns = [
        "Hours_Studied", "Attendance", "Parental_Involvement", "Access_to_Resources",
        "Extracurricular_Activities", "Sleep_Hours", "Previous_Scores", "Motivation_Level",
        "Internet_Access", "Tutoring_Sessions", "Family_Income", "Teacher_Quality",
        "School_Type", "Peer_Influence", "Physical_Activity", "Learning_Disabilities",
        "Parental_Education_Level", "Distance_from_Home", "Gender", "Exam_Score", "dropout",
    ]
    path = Path(csv_path)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=original_columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(case_base)
    print(f"Base de casos guardada: {len(case_base)} casos → {path}")
