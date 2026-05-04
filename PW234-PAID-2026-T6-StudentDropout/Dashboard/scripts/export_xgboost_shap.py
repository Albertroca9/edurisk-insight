from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = PROJECT_ROOT / "Data" / "student_preprocessed.csv"
OUTPUT_DIR = PROJECT_ROOT / "Dashboard" / "data"
PREDICTIONS_PATH = OUTPUT_DIR / "student_predictions_xgboost_shap.csv"
METRICS_PATH = OUTPUT_DIR / "xgboost_metrics.json"

TARGET_COL = "dropout"
RANDOM_STATE = 42
TEST_SIZE = 0.2
TOP_N_FACTORS = 6


def prettify_feature_name(feature_name: str) -> str:
    return feature_name.replace("_", " ")


def risk_level(probability: float) -> str:
    if probability >= 0.65:
        return "high"
    if probability >= 0.35:
        return "medium"
    return "low"


def action_from_feature(feature_name: str) -> tuple[str, str] | None:
    clean = prettify_feature_name(feature_name)
    rules = [
        ("Motivation Level", "Tutoria motivacional", "Revisio individual d'objectius, barreres i compromís amb el curs."),
        ("Attendance", "Seguiment d'assistencia", "Contacte preventiu i pauta setmanal de presencia a classe."),
        ("Hours Studied", "Pla d'estudi guiat", "Franges concretes d'estudi i revisio de progres cada dues setmanes."),
        ("Exam Score", "Reforc academic", "Sessions focalitzades en les competències amb pitjor rendiment."),
        ("Previous Scores", "Reforc academic", "Treballar prerequisits i continguts base abans de noves avaluacions."),
        ("Access to Resources", "Recursos educatius", "Prioritzar materials, espais d'estudi o suport digital."),
        ("Tutoring Sessions", "Tutories academiques", "Programar seguiment docent estructurat."),
        ("Distance from Home", "Flexibilitat de seguiment", "Valorar barreres logististiques i alternatives de suport."),
        ("Learning Disabilities", "Suport especialitzat", "Coordinar adaptacions i recursos d'acompanyament."),
    ]
    for token, title, description in rules:
        if token in clean:
            return title, description
    return None


def recommended_actions(top_factors: list[dict], level: str) -> list[dict[str, str]]:
    actions: list[tuple[str, str]] = []
    if level != "low":
        risk_increasing_factors = [factor for factor in top_factors if factor["shap"] > 0]
    else:
        risk_increasing_factors = []

    used_titles = set()
    for factor in risk_increasing_factors:
        action = action_from_feature(factor["feature"])
        if action and action not in actions:
            if action[0] in used_titles:
                continue
            used_titles.add(action[0])
            actions.append(action)

    if level == "high":
        fallback = ("Intervencio prioritaria", "Revisio tutorial, reforc academic i seguiment proper del cas.")
    elif level == "medium":
        fallback = ("Seguiment preventiu", "Revisio quinzenal dels indicadors i evolucio del risc.")
    else:
        fallback = ("Monitoritzacio ordinaria", "Mantenir observacio i revisar canvis en el proxim cicle.")

    if fallback not in actions:
        actions.append(fallback)

    return [{"title": title, "description": description} for title, description in actions[:4]]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(DATA_PATH)
    if TARGET_COL not in df.columns:
        raise ValueError(f"No s'ha trobat la variable objectiu '{TARGET_COL}' a {DATA_PATH}")

    x_raw = df.drop(columns=[TARGET_COL]).copy()
    y = df[TARGET_COL].astype(int)
    x_encoded = pd.get_dummies(x_raw, drop_first=True)

    x_train, x_test, y_train, y_test = train_test_split(
        x_encoded,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    model = XGBClassifier(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(x_train, y_train)

    y_pred = model.predict(x_test)
    y_prob_test = model.predict_proba(x_test)[:, 1]
    metrics = {
        "model": "XGBoost",
        "rows": int(len(df)),
        "features_after_encoding": int(x_encoded.shape[1]),
        "test_size": TEST_SIZE,
        "random_state": RANDOM_STATE,
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_test, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_prob_test)),
    }

    all_probabilities = model.predict_proba(x_encoded)[:, 1]

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(x_encoded)
    if isinstance(shap_values, list):
        shap_values = shap_values[1]

    prediction_rows = []
    feature_names = np.array(x_encoded.columns)

    for idx, (probability, shap_row) in enumerate(zip(all_probabilities, shap_values)):
        order = np.argsort(np.abs(shap_row))[::-1][:TOP_N_FACTORS]
        top_factors = []

        for feature_idx in order:
            feature_name = str(feature_names[feature_idx])
            feature_value = x_encoded.iloc[idx, feature_idx]
            shap_value = float(shap_row[feature_idx])
            top_factors.append(
                {
                    "feature": feature_name,
                    "label": prettify_feature_name(feature_name),
                    "value": bool(feature_value) if isinstance(feature_value, (np.bool_, bool)) else float(feature_value),
                    "shap": shap_value,
                    "impact": int(round(shap_value * 10)),
                }
            )

        level = risk_level(float(probability))
        prediction_rows.append(
            {
                "id": f"STU-{idx + 1:04d}",
                "xgb_probability": round(float(probability), 6),
                "risk_score": int(round(float(probability) * 100)),
                "risk_level": level,
                "top_factors_json": json.dumps(top_factors, ensure_ascii=False),
                "recommended_actions_json": json.dumps(recommended_actions(top_factors, level), ensure_ascii=False),
            }
        )

    pd.DataFrame(prediction_rows).to_csv(PREDICTIONS_PATH, index=False)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Prediccions exportades: {PREDICTIONS_PATH}")
    print(f"Metriques exportades: {METRICS_PATH}")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
