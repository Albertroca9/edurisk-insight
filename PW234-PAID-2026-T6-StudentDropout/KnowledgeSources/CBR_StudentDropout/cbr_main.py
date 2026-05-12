"""
cbr_main.py
===========
Pipeline principal del sistema CBR — orquestrador del cicle complet de les 4R:

    RETRIEVE → REUSE → REVISE → RETAIN

Executa el sistema complet i mostra els resultats de forma llegible.
Punt d'entrada principal per a demos i integració amb el dashboard IDSS.

Ús des de la carpeta Source/CBR_StudentDropout/:
    python cbr_main.py

Per especificar un CSV diferent:
    python cbr_main.py --data ../../Data/student_preprocessed.csv
"""

from __future__ import annotations
import argparse
from pathlib import Path

from cbr_retrieve import load_case_base, retrieve
from cbr_reuse    import reuse
from cbr_revise   import revise


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE COMPLET (4R)
# ─────────────────────────────────────────────────────────────────────────────

def run_cbr(
    query: dict,
    case_base: list[dict],
    top_k: int = 5,
) -> dict:
    """
    Executa el cicle Retrieve → Reuse → Revise per a un nou estudiant.
    La fase Retain s'executa per separat (requereix etiqueta confirmada).

    Retorna un dict estructurat amb tots els resultats.
    """
    retrieved    = retrieve(query, case_base, top_k=top_k)
    reuse_result = reuse(retrieved, query)
    revise_result = revise(query, reuse_result)

    return {
        "query":            query,
        "retrieved_cases":  retrieved,
        "prediction": {
            "dropout_probability": reuse_result["dropout_probability"],
            "risk_score":          reuse_result["risk_score"],
            "risk_level":          reuse_result["risk_level"],
            "top_similarity":      reuse_result["top_similarity"],
        },
        "relevant_factors": reuse_result["relevant_factors"],
        "interventions":    revise_result["interventions"],
        "urgency_message":  revise_result["urgency_message"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# FORMAT DE SORTIDA
# ─────────────────────────────────────────────────────────────────────────────

_RISK_LABELS = {"high": "ALT", "medium": "MITJÀ", "low": "BAIX"}

# Labels llegibles per mostrar les dades del nou cas
_FEATURE_LABELS: dict[str, str] = {
    "Hours_Studied":         "Hores d'estudi setmanals",
    "Attendance":            "Assistència (%)",
    "Previous_Scores":       "Notes anteriors",
    "Exam_Score":            "Nota examen",
    "Sleep_Hours":           "Hores de son",
    "Tutoring_Sessions":     "Sessions de tutoria",
    "Physical_Activity":     "Activitat física (dies/setmana)",
    "Motivation_Level":      "Nivell de motivació",
    "Access_to_Resources":   "Accés a recursos",
    "Parental_Involvement":  "Implicació familiar",
    "Family_Income":         "Ingressos familiars",
    "Teacher_Quality":       "Qualitat docent",
    "Peer_Influence":        "Influència de companys",
    "Learning_Disabilities": "Dificultats d'aprenentatge",
}


def _format_query_block(query: dict) -> list[str]:
    """Genera el bloc de dades del nou cas consultat."""
    lines = [
        "─" * 65,
        "  DADES DEL NOU CAS A AVALUAR",
        "─" * 65,
    ]
    for feat, label in _FEATURE_LABELS.items():
        val = query.get(feat, "—")
        lines.append(f"  {label:<38} {val}")
    lines.append("")
    return lines


def _format_narrative(result: dict) -> list[str]:
    """Genera el resum narratiu final amb la interpretació del resultat."""
    pred       = result["prediction"]
    risk_level = pred["risk_level"]
    risk_label = _RISK_LABELS.get(risk_level, risk_level)
    prob       = pred["dropout_probability"]
    top_case   = result["retrieved_cases"][0]["case"] if result["retrieved_cases"] else {}
    top_sim    = pred["top_similarity"] * 100
    top_id     = top_case.get("_id", "N/A")
    top_drop   = "amb abandonament" if top_case.get("dropout") == "1" else "sense abandonament"
    intervs    = result["interventions"]

    # Frase de risc
    if risk_level == "high":
        risc_frase = (
            f"El perfil d'aquest estudiant presenta un risc ALT d'abandonament, "
            f"amb una probabilitat estimada del {prob:.1f}%."
        )
    elif risk_level == "medium":
        risc_frase = (
            f"El perfil d'aquest estudiant presenta un risc MITJÀ d'abandonament, "
            f"amb una probabilitat estimada del {prob:.1f}%."
        )
    else:
        risc_frase = (
            f"El perfil d'aquest estudiant presenta un risc BAIX d'abandonament, "
            f"amb una probabilitat estimada del {prob:.1f}%."
        )

    # Frase del cas més similar
    similar_frase = (
        f"El cas més similar de la base és {top_id} ({top_sim:.1f}% de similitud), "
        f"{top_drop}."
    )

    # Factors principals (top 2 amb més risc_contrib)
    top_factors = result["relevant_factors"][:2]
    if top_factors:
        factor_noms = " i ".join(
            f"{_FEATURE_LABELS.get(f['feature'], f['feature'])} "
            f"(val={f['query_value']})"
            for f in top_factors
        )
        factors_frase = f"Els factors que més contribueixen al risc són: {factor_noms}."
    else:
        factors_frase = ""

    # Intervencions
    if intervs:
        interv_llista = ", ".join(f"{i['title']} [{i['id']}]" for i in intervs)
        interv_frase  = f"Les intervencions recomanades són: {interv_llista}."
    else:
        interv_frase = "No s'han activat intervencions específiques."

    lines = [
        "─" * 65,
        "  RESUM I INTERPRETACIÓ",
        "─" * 65,
        "",
        f"  {risc_frase}",
        f"  {similar_frase}",
    ]
    if factors_frase:
        lines.append(f"  {factors_frase}")
    lines += [
        f"  {interv_frase}",
        "",
        f"  {result['urgency_message']}",
        "",
    ]
    return lines


def format_results(result: dict) -> str:
    pred  = result["prediction"]

    # ── 1. Dades del nou cas ──────────────────────────────────────────────────
    lines = [""] + _format_query_block(result["query"])

    # ── 2. Capçalera i resum de predicció ────────────────────────────────────
    lines += [
        "═" * 65,
        "  SISTEMA CBR — PREDICCIÓ DE RISC D'ABANDONAMENT ESCOLAR",
        "═" * 65,
        "",
        f"  {'Similitud màxima amb la base de casos':<42} {pred['top_similarity'] * 100:.1f}%",
        f"  {'Probabilitat estimada abandonament':<42} {pred['dropout_probability']:.1f}%",
        f"  {'Puntuació de risc (0–100)':<42} {pred['risk_score']}",
        f"  {'Nivell de risc':<42} {_RISK_LABELS.get(pred['risk_level'], pred['risk_level'])}",
        "",
        f"  {result['urgency_message']}",
        "",
    ]

    # ── 3. TOP-5 casos més similars ───────────────────────────────────────────
    lines += [
        "─" * 65,
        "  TOP-5 CASOS MÉS SIMILARS",
        "─" * 65,
    ]
    for entry in result["retrieved_cases"]:
        c   = entry["case"]
        sid = c.get("_id", "N/A")
        sim = f"{entry['similarity'] * 100:.1f}%"
        do  = "Abandonament" if c.get("dropout") == "1" else "No abandonament"
        mot = c.get("Motivation_Level", "?")
        att = c.get("Attendance", "?")
        hrs = c.get("Hours_Studied", "?")
        lines.append(
            f"  #{entry['rank']}  {sid}  sim={sim:>6}  {do:<16}  "
            f"Mot={mot:<6}  Ass={att}%  Hrs={hrs}h"
        )

    # ── 4. Factors de risc ────────────────────────────────────────────────────
    lines += [
        "",
        "─" * 65,
        "  FACTORS DE RISC MÉS RELLEVANTS",
        "─" * 65,
    ]
    for f in result["relevant_factors"][:6]:
        bar   = "█" * max(1, int(f["risk_contrib"] * 300))
        lines.append(
            f"  {f['feature']:<28}  val={str(f['query_value']):<8}"
            f"  sim={f['similarity']:.2f}  {bar}"
        )

    # ── 5. Intervencions ──────────────────────────────────────────────────────
    lines += [
        "",
        "─" * 65,
        "  INTERVENCIONS RECOMANADES",
        "─" * 65,
    ]
    for interv in result["interventions"]:
        lines.append(f"  [{interv['id']}] {interv['title']}")
        lines.append(f"        {interv['description']}")
        lines.append("")

    # ── 6. Resum narratiu ─────────────────────────────────────────────────────
    lines += _format_narrative(result)

    lines.append("═" * 65)
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# DEMO
# ─────────────────────────────────────────────────────────────────────────────

QUERY_HIGH_RISK = {
    "Hours_Studied":        8,
    "Attendance":           55,
    "Previous_Scores":      48,
    "Exam_Score":           45,
    "Sleep_Hours":          6,
    "Tutoring_Sessions":    0,
    "Physical_Activity":    1,
    "Motivation_Level":     "Low",
    "Access_to_Resources":  "Low",
    "Parental_Involvement": "Low",
    "Family_Income":        "Low",
    "Teacher_Quality":      "Medium",
    "Peer_Influence":       "Negative",
    "Learning_Disabilities": "0",
}

QUERY_MEDIUM_RISK = {
    "Hours_Studied":        18,
    "Attendance":           72,
    "Previous_Scores":      62,
    "Exam_Score":           60,
    "Sleep_Hours":          7,
    "Tutoring_Sessions":    1,
    "Physical_Activity":    2,
    "Motivation_Level":     "Medium",
    "Access_to_Resources":  "Medium",
    "Parental_Involvement": "Low",
    "Family_Income":        "Low",
    "Teacher_Quality":      "Medium",
    "Peer_Influence":       "Neutral",
    "Learning_Disabilities": "0",
}

QUERY_LOW_RISK = {
    "Hours_Studied":        32,
    "Attendance":           95,
    "Previous_Scores":      88,
    "Exam_Score":           90,
    "Sleep_Hours":          8,
    "Tutoring_Sessions":    3,
    "Physical_Activity":    4,
    "Motivation_Level":     "High",
    "Access_to_Resources":  "High",
    "Parental_Involvement": "High",
    "Family_Income":        "Medium",
    "Teacher_Quality":      "High",
    "Peer_Influence":       "Positive",
    "Learning_Disabilities": "0",
}


def main():
    parser = argparse.ArgumentParser(description="CBR StudentDropout — Demo")
    parser.add_argument(
        "--data",
        default=str(Path(__file__).parent.parent.parent / "Data" / "student_preprocessed.csv"),
        help="Ruta al fitxer student_preprocessed.csv",
    )
    args = parser.parse_args()

    print(f"\nCarregant base de casos: {args.data}")
    case_base = load_case_base(args.data)
    print(f"Base de casos carregada: {len(case_base)} estudiants\n")

    demos = [
        ("ALT RISC",   QUERY_HIGH_RISK),
        ("RISC MITJÀ", QUERY_MEDIUM_RISK),
        ("BAIX RISC",  QUERY_LOW_RISK),
    ]

    for label, query in demos:
        print(f"\n{'▶' * 3}  CONSULTA: Estudiant amb perfil de {label}")
        result = run_cbr(query, case_base, top_k=5)
        print(format_results(result))


if __name__ == "__main__":
    main()