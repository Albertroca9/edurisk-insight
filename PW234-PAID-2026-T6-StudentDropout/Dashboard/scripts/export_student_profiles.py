from __future__ import annotations

from pathlib import Path
import json

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = PROJECT_ROOT / "Data" / "student_preprocessed.csv"
VALIDATION_DATA_PATH = PROJECT_ROOT / "Data" / "validation_final.csv"
OUTPUT_PATH = PROJECT_ROOT / "Dashboard" / "data" / "student_profiles.csv"
VALIDATION_OUTPUT_PATH = PROJECT_ROOT / "Dashboard" / "data" / "validation_profiles.csv"
MODEL_OUTPUT_PATH = PROJECT_ROOT / "Dashboard" / "data" / "student_profile_model.json"
N_CLUSTERS = 4


def numeric_clustering_columns(df: pd.DataFrame) -> list[str]:
    return df.select_dtypes(include=[np.number]).columns.tolist()


def r_scale(values: pd.DataFrame) -> pd.DataFrame:
    means = values.mean(axis=0)
    stds = values.std(axis=0, ddof=1).replace(0, 1)
    return (values - means) / stds


def scale_with_metadata(df: pd.DataFrame, columns: list[str], means: dict[str, float], stds: dict[str, float]) -> pd.DataFrame:
    numeric = df.reindex(columns=columns, fill_value=0).apply(pd.to_numeric, errors="coerce").fillna(0)
    return (numeric - pd.Series(means)) / pd.Series(stds).replace(0, 1)


def ward_clusters(df: pd.DataFrame, n_clusters: int = N_CLUSTERS) -> pd.Series:
    numeric = df[numeric_clustering_columns(df)].copy()
    scaled = r_scale(numeric)
    tree = linkage(scaled.to_numpy(), method="ward", metric="euclidean")
    return pd.Series(fcluster(tree, n_clusters, criterion="maxclust"), index=df.index)


def mode(series: pd.Series) -> object:
    values = series.dropna()
    if values.empty:
        return ""
    return values.mode().iloc[0]


def cluster_characteristics(cluster_df: pd.DataFrame, all_df: pd.DataFrame) -> list[str]:
    characteristics: list[str] = []
    checks = [
        ("Attendance", "Assistencia baixa", "Assistencia alta"),
        ("Hours_Studied", "Poques hores d'estudi", "Hores d'estudi altes"),
        ("Exam_Score", "Nota d'examen baixa", "Nota d'examen alta"),
        ("Previous_Scores", "Notes previes baixes", "Notes previes altes"),
        ("Tutoring_Sessions", "Poques tutories", "Tutories frequents"),
    ]
    for column, low_label, high_label in checks:
        if column not in cluster_df.columns:
            continue
        value = cluster_df[column].mean()
        low = all_df[column].quantile(0.33)
        high = all_df[column].quantile(0.66)
        if value <= low:
            characteristics.append(low_label)
        elif value >= high:
            characteristics.append(high_label)

    if "Motivation_Level" in cluster_df.columns:
        motivation = mode(cluster_df["Motivation_Level"])
        motivation_labels = {"low": "baixa", "medium": "mitjana", "high": "alta"}
        characteristics.append(f"Motivacio {motivation_labels.get(str(motivation).lower(), str(motivation).lower())}")

    if "dropout" in cluster_df.columns:
        dropout_rate = cluster_df["dropout"].mean()
        if dropout_rate >= all_df["dropout"].mean():
            characteristics.append("Abandonament observat superior a la mitjana")
        else:
            characteristics.append("Abandonament observat inferior a la mitjana")

    return characteristics[:5] or ["Perfil calculat per clustering jerarquic"]


def cluster_summary(cluster_id: int, cluster_df: pd.DataFrame) -> str:
    size = len(cluster_df)
    dropout_text = ""
    if "dropout" in cluster_df.columns:
        dropout_text = f" Taxa d'abandonament observada: {round(cluster_df['dropout'].mean() * 100)}%."
    return f"Grup {cluster_id} del clustering jerarquic Ward amb {size} alumnes.{dropout_text}"


def cluster_recommendation(cluster_df: pd.DataFrame, all_df: pd.DataFrame) -> str:
    attendance_low = "Attendance" in cluster_df.columns and cluster_df["Attendance"].mean() <= all_df["Attendance"].quantile(0.33)
    performance_low = "Exam_Score" in cluster_df.columns and cluster_df["Exam_Score"].mean() <= all_df["Exam_Score"].quantile(0.33)
    dropout_high = "dropout" in cluster_df.columns and cluster_df["dropout"].mean() >= all_df["dropout"].mean()
    if dropout_high or attendance_low or performance_low:
        return "Prioritzar revisio docent, reforc academic i seguiment proper del grup."
    return "Mantenir monitoritzacio ordinaria i revisar canvis de tendencia."


def profile_metadata(df: pd.DataFrame, clusters: pd.Series) -> dict[int, dict[str, object]]:
    grouped = {cluster_id: df.loc[clusters == cluster_id] for cluster_id in sorted(clusters.unique())}
    return {
        int(cluster_id): {
            "summary": cluster_summary(int(cluster_id), cluster_df),
            "characteristics": cluster_characteristics(cluster_df, df),
            "recommendation": cluster_recommendation(cluster_df, df),
        }
        for cluster_id, cluster_df in grouped.items()
    }


def clustering_metadata(df: pd.DataFrame, clusters: pd.Series) -> dict[str, object]:
    columns = [column for column in numeric_clustering_columns(df) if column != "dropout"]
    numeric = df[columns].copy()
    means = numeric.mean(axis=0).to_dict()
    stds = numeric.std(axis=0, ddof=1).replace(0, 1).to_dict()
    scaled = scale_with_metadata(df, columns, means, stds)
    metadata = profile_metadata(df, clusters)
    centroids = {
        str(int(cluster_id)): scaled.loc[clusters == cluster_id].mean(axis=0).to_dict()
        for cluster_id in sorted(clusters.unique())
    }
    return {
        "method": "hierarchical_ward_k4_numeric_scaled",
        "columns": columns,
        "means": means,
        "stds": stds,
        "centroids": centroids,
        "profiles": {
            str(cluster_id): {
                "profile_id": int(cluster_id),
                "profile_name": f"Perfil d'alumne {int(cluster_id)}",
                "profile_summary": data["summary"],
                "profile_characteristics": data["characteristics"],
                "profile_recommendation": data["recommendation"],
            }
            for cluster_id, data in metadata.items()
        },
    }


def assign_nearest_profiles(df: pd.DataFrame, metadata: dict[str, object]) -> pd.Series:
    columns = list(metadata["columns"])
    scaled = scale_with_metadata(df, columns, metadata["means"], metadata["stds"])
    centroids = {
        int(cluster_id): pd.Series(values).reindex(columns).astype(float)
        for cluster_id, values in metadata["centroids"].items()
    }
    assigned = []
    for _, row in scaled.iterrows():
        distances = {cluster_id: float(np.linalg.norm(row - centroid)) for cluster_id, centroid in centroids.items()}
        assigned.append(min(distances, key=distances.get))
    return pd.Series(assigned, index=df.index)


def build_profile_rows(
    df: pd.DataFrame,
    clusters: pd.Series,
    id_prefix: str = "STU",
    metadata: dict[str, object] | None = None,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    if metadata is None:
        profile_data = {
            str(cluster_id): {
                "profile_summary": data["summary"],
                "profile_characteristics": data["characteristics"],
                "profile_recommendation": data["recommendation"],
            }
            for cluster_id, data in profile_metadata(df, clusters).items()
        }
    else:
        profile_data = metadata["profiles"]

    for idx, cluster_id in enumerate(clusters, start=1):
        cluster_id = int(cluster_id)
        profile = profile_data[str(cluster_id)]
        characteristics = profile.get("profile_characteristics", profile.get("characteristics", []))
        rows.append(
            {
                "id": f"{id_prefix}-{idx:04d}",
                "profile_id": cluster_id,
                "profile_name": f"Perfil d'alumne {cluster_id}",
                "profile_summary": profile.get("profile_summary", profile.get("summary", "")),
                "profile_characteristics": "|".join(characteristics) if isinstance(characteristics, list) else characteristics,
                "profile_recommendation": profile.get("profile_recommendation", profile.get("recommendation", "")),
            }
        )
    return rows


def main() -> None:
    df = pd.read_csv(DATA_PATH)
    clusters = ward_clusters(df)
    metadata = clustering_metadata(df, clusters)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(build_profile_rows(df, clusters, metadata=metadata)).to_csv(OUTPUT_PATH, index=False)
    MODEL_OUTPUT_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    if VALIDATION_DATA_PATH.exists():
        validation_df = pd.read_csv(VALIDATION_DATA_PATH)
        validation_clusters = assign_nearest_profiles(validation_df, metadata)
        pd.DataFrame(build_profile_rows(validation_df, validation_clusters, id_prefix="VAL", metadata=metadata)).to_csv(
            VALIDATION_OUTPUT_PATH,
            index=False,
        )
    print(f"Perfils exportats: {OUTPUT_PATH}")
    print(f"Model de perfils exportat: {MODEL_OUTPUT_PATH}")
    if VALIDATION_DATA_PATH.exists():
        print(f"Perfils de validacio exportats: {VALIDATION_OUTPUT_PATH}")
    print(clusters.value_counts().sort_index().to_string())


if __name__ == "__main__":
    main()
