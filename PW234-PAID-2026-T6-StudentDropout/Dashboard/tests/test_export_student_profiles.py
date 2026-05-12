import importlib.util
from pathlib import Path
import unittest

import pandas as pd


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "export_student_profiles.py"
SPEC = importlib.util.spec_from_file_location("export_student_profiles", SCRIPT_PATH)
profiles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(profiles)


class ExportStudentProfilesTests(unittest.TestCase):
    def test_numeric_columns_match_r_clustering_input(self):
        df = pd.DataFrame(
            {
                "Hours_Studied": [10, 20],
                "Attendance": [60, 90],
                "Motivation_Level": ["Low", "High"],
                "dropout": [1, 0],
            }
        )

        self.assertEqual(
            profiles.numeric_clustering_columns(df),
            ["Hours_Studied", "Attendance", "dropout"],
        )

    def test_profile_rows_preserve_student_ids_and_cluster_names(self):
        df = pd.DataFrame(
            {
                "Hours_Studied": [5, 10, 25, 30],
                "Attendance": [40, 55, 90, 95],
                "Previous_Scores": [50, 60, 85, 95],
                "Exam_Score": [45, 58, 88, 92],
                "dropout": [1, 1, 0, 0],
            }
        )
        clusters = pd.Series([2, 2, 1, 1])

        rows = profiles.build_profile_rows(df, clusters)

        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["id"], "STU-0001")
        self.assertEqual(rows[0]["profile_id"], 2)
        self.assertEqual(rows[0]["profile_name"], "Perfil d'alumne 2")
        self.assertIn("Assist", rows[0]["profile_characteristics"])

    def test_assign_profiles_to_new_rows_uses_nearest_centroid(self):
        train_df = pd.DataFrame(
            {
                "Hours_Studied": [0, 2, 28, 30],
                "Attendance": [20, 30, 90, 95],
                "dropout": [1, 1, 0, 0],
            }
        )
        clusters = pd.Series([1, 1, 2, 2])
        metadata = profiles.clustering_metadata(train_df, clusters)
        new_df = pd.DataFrame(
            {
                "Hours_Studied": [1, 29],
                "Attendance": [25, 92],
                "dropout": [1, 0],
            }
        )

        assigned = profiles.assign_nearest_profiles(new_df, metadata)

        self.assertEqual(assigned.tolist(), [1, 2])
        self.assertNotIn("dropout", metadata["columns"])

    def test_validation_profile_rows_use_validation_ids(self):
        df = pd.DataFrame(
            {
                "Hours_Studied": [1],
                "Attendance": [25],
                "dropout": [1],
            }
        )
        clusters = pd.Series([3])
        metadata = {
            "profiles": {
                "3": {
                    "summary": "Grup 3",
                    "characteristics": ["Assistencia baixa"],
                    "recommendation": "Seguiment",
                }
            }
        }

        rows = profiles.build_profile_rows(df, clusters, id_prefix="VAL", metadata=metadata)

        self.assertEqual(rows[0]["id"], "VAL-0001")
        self.assertEqual(rows[0]["profile_name"], "Perfil d'alumne 3")


if __name__ == "__main__":
    unittest.main()
