"""
cbr_retrieve.py
===============
Fase 1 del cicle CBR: RETRIEVE

Recupera els k casos més similars de la base de casos per a un nou
estudiant (query), usant la funció de similitud global ponderada
definida a cbr_case.py.

Inclou també la funció de càrrega del CSV com a base de casos inicial.
"""

from __future__ import annotations
import csv
from cbr_case import global_similarity


# ─────────────────────────────────────────────────────────────────────────────
# CÀRREGA DE LA BASE DE CASOS
# ─────────────────────────────────────────────────────────────────────────────

def load_case_base(csv_path: str) -> list[dict]:
    """
    Carrega el fitxer student_preprocessed.csv com a base de casos inicial.
    Cada fila és un dict amb totes les columnes del dataset.
    S'afegeix un identificador intern '_id' per a traçabilitat.
    """
    cases = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            case = dict(row)
            case['_id'] = f"STU-{i + 1:04d}"
            cases.append(case)
    return cases


# ─────────────────────────────────────────────────────────────────────────────
# RETRIEVE
# ─────────────────────────────────────────────────────────────────────────────

def retrieve(query: dict, case_base: list[dict], top_k: int = 5) -> list[dict]:
    """
    Per a cada cas de la base, calcula la similitud global amb el query.
    Retorna els top_k casos amb similitud més alta, en ordre descendent.

    Cada entrada retornada és un dict amb:
      - rank:       posició (1 = el més similar)
      - similarity: valor en [0, 1]
      - case:       el cas complet de la base de casos
    """
    scored = [
        {"case": case, "similarity": global_similarity(query, case)}
        for case in case_base
    ]
    scored.sort(key=lambda x: x["similarity"], reverse=True)

    return [
        {
            "rank":       rank,
            "similarity": round(entry["similarity"], 4),
            "case":       entry["case"],
        }
        for rank, entry in enumerate(scored[:top_k], start=1)
    ]
