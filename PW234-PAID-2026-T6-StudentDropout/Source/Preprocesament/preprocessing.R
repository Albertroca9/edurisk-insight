# ============================================================
# PREPROCESAMENT FINAL

# 1. Librerías
# ------------------------------------------------------------
packages <- c("dplyr", "ggplot2", "factoextra", "ggrepel")

new_packages <- packages[!(packages %in% installed.packages()[, "Package"])]
if (length(new_packages) > 0) install.packages(new_packages)

invisible(lapply(packages, library, character.only = TRUE))

# 2. Cargar dataset
# ------------------------------------------------------------
file_path <- "/Users/adriahernandez/Desktop/PAID/projecte/StudentPerformanceFactors - StudentPerformanceFactors.csv"

df <- read.csv(
  file_path,
  stringsAsFactors = FALSE,
  check.names = FALSE,
  na.strings = c("", " ", "NA", "N/A", "n/a", "NULL", "null", "None", "none", "Unknown", "unknown", "?")
)

df <- df %>%
  mutate(across(where(is.character), ~trimws(.))) %>%
  mutate(across(where(is.character), ~ifelse(. %in% c("", "NA", "N/A", "NULL", "null", "None", "none", "Unknown", "unknown", "?"), NA, .)))

cat("=====================================\n")
cat("DATASET CARGADO\n")
cat("=====================================\n")
cat("Filas:", nrow(df), "\n")
cat("Columnas:", ncol(df), "\n\n")

# 3. Detección de missings
# ------------------------------------------------------------
missing_count <- colSums(is.na(df))
missing_pct <- round(100 * colMeans(is.na(df)), 3)

missing_summary <- data.frame(
  Variable = names(df),
  Missing_Count = as.numeric(missing_count),
  Missing_Percent = as.numeric(missing_pct)
) %>%
  arrange(desc(Missing_Count), desc(Missing_Percent))

cat("=====================================\n")
cat("MISSINGS POR VARIABLE\n")
cat("=====================================\n")
print(missing_summary)
cat("\n")

# 4. Imputación de missings (moda global)
# ------------------------------------------------------------
get_mode <- function(x) {
  ux <- na.omit(unique(x))
  ux[which.max(tabulate(match(x, ux)))]
}

df_clean <- df

vars_to_impute <- c("Teacher_Quality", "Parental_Education_Level", "Distance_from_Home")

cat("=====================================\n")
cat("IMPUTACIÓN REALIZADA\n")
cat("=====================================\n")

for (var in vars_to_impute) {
  mode_value <- get_mode(df_clean[[var]])
  df_clean[[var]][is.na(df_clean[[var]])] <- mode_value
  cat(var, "-> imputado con moda:", mode_value, "\n")
}
cat("\n")

cat("=====================================\n")
cat("MISSINGS DESPUÉS DE IMPUTAR\n")
cat("=====================================\n")
print(colSums(is.na(df_clean)))
cat("\n")

# 5. Binarización de variables Yes/No
# ------------------------------------------------------------
binary_vars <- c(
  "Extracurricular_Activities",
  "Internet_Access",
  "Learning_Disabilities"
)

for (col in binary_vars) {
  df_clean[[col]] <- ifelse(
    df_clean[[col]] %in% c("Yes", "yes", "YES", 1, "1"),
    1,
    ifelse(
      df_clean[[col]] %in% c("No", "no", "NO", 0, "0"),
      0,
      df_clean[[col]]
    )
  )
}

cat("=====================================\n")
cat("VARIABLES BINARIZADAS\n")
cat("=====================================\n")
for (col in binary_vars) {
  cat("\n", col, "\n", sep = "")
  print(table(df_clean[[col]], useNA = "ifany"))
}
cat("\n")

# 6. PCA para detección exploratoria de outliers
# ------------------------------------------------------------
# Usamos solo variables numéricas continuas
numeric_df <- df_clean %>%
  dplyr::select(where(is.numeric))

numeric_df_pca <- numeric_df

if ("Exam_Score" %in% names(numeric_df_pca)) {
  numeric_df_pca <- numeric_df_pca %>% dplyr::select(-Exam_Score)
}

if ("Physical_Activity" %in% names(numeric_df_pca)) {
  numeric_df_pca <- numeric_df_pca %>% dplyr::select(-Physical_Activity)
}

cat("=====================================\n")
cat("VARIABLES USADAS EN EL PCA\n")
cat("=====================================\n")
print(names(numeric_df_pca))
cat("\n")

numeric_scaled <- scale(numeric_df_pca)

pca_res <- prcomp(numeric_scaled, center = TRUE, scale. = FALSE)

cat("=====================================\n")
cat("VARIANZA EXPLICADA DEL PCA\n")
cat("=====================================\n")
print(summary(pca_res))
cat("\n")

# Scores PCA
scores <- as.data.frame(pca_res$x[, 1:2])
colnames(scores) <- c("PC1", "PC2")

# posibles utliers con Mahalanobis en PC1-PC2
center_pca <- colMeans(scores)
cov_pca <- cov(scores)

scores$mahalanobis_dist <- mahalanobis(
  scores[, c("PC1", "PC2")],
  center = center_pca,
  cov = cov_pca
)

threshold <- qchisq(0.99, df = 2)
scores$outlier <- scores$mahalanobis_dist > threshold
scores$id <- seq_len(nrow(scores))

outliers_detected <- scores %>%
  dplyr::filter(outlier) %>%
  dplyr::arrange(desc(mahalanobis_dist))

cat("=====================================\n")
cat("OUTLIERS DETECTADOS (SOLO EXPLORATORIO)\n")
cat("=====================================\n")
cat("Umbral chi-cuadrado (99%):", threshold, "\n")
cat("Número de observaciones extremas detectadas:", sum(scores$outlier), "\n")
cat("Decisión: NO se eliminan; se consideran casos poco frecuentes pero plausibles.\n\n")

# 7. Gráficas PCA
# ------------------------------------------------------------
fviz_eig(pca_res, addlabels = TRUE, ylim = c(0, 100)) +
  ggtitle("PCA - Varianza explicada por componente")

fviz_pca_var(
  pca_res,
  col.var = "contrib"
) +
  ggtitle("PCA - Variables y contribución")

ggplot() +
  geom_point(
    data = scores %>% dplyr::filter(!outlier),
    aes(x = PC1, y = PC2),
    color = "steelblue",
    alpha = 0.20,
    size = 2
  ) +
  geom_point(
    data = scores %>% dplyr::filter(outlier),
    aes(x = PC1, y = PC2),
    color = "red",
    size = 3
  ) +
  ggtitle("PCA - Outliers detectados (exploratorio)") +
  theme_minimal()

# 8. Guardar base preprocesada
# ------------------------------------------------------------
write.csv(df_clean, "student_preprocessed.csv", row.names = FALSE)
write.csv(missing_summary, "missing_summary.csv", row.names = FALSE)
write.csv(outliers_detected, "outliers_pca_detected.csv", row.names = FALSE)

cat("=====================================\n")
cat("ARCHIVOS GENERADOS\n")
cat("=====================================\n")
cat("- student_preprocessed.csv\n")
cat("- missing_summary.csv\n")
cat("- outliers_pca_detected.csv\n")

