rm(list = ls())

library(readr)
library(dplyr)
library(cluster)
library(ggplot2)
library(ggpubr)
library(tidyr)
library(dendextend)
library(factoextra)
library(purrr)

# LLEGIR BASE DE DADES
data <- read_csv("C:/Users/jarog/Desktop/IA/3r/Q2/PAID/Treball/student_final.csv")

#########  FUNCIONS AUXILIARS
ClassPanelGraph <- function(var, data, cluster_hier) {
  if (is.numeric(data[[var]])) {
    plot <- ggplot(data = data, aes(x = .data[[var]])) +
      geom_histogram(fill = "gray", color = "black", bins = 20) +
      facet_grid(reformulate(cluster_hier, ".")) +
      ylab("") + xlab(var)
  } else {
    plot <- ggplot(data = data, aes(x = .data[[var]])) +
      geom_bar(fill = "gray", color = "black") +
      facet_grid(reformulate(cluster_hier, ".")) +
      ylab("") + xlab(var) +
      theme(axis.text.x = element_text(angle = 45, hjust = 1))
  }
  return(plot)
}

get_mode <- function(v) {
  v <- na.omit(v)
  uniqv <- unique(v)
  uniqv[which.max(tabulate(match(v, uniqv)))]
}

cv <- function(x, na.rm = TRUE) {
  sd(x, na.rm = na.rm) / mean(x, na.rm = na.rm)
}

#########  REPÀS PREPROCESSAMENT
# Convertir caràcters a factor
data <- data %>%
  mutate(across(where(is.character), as.factor))

# Eliminar NA si n'hi ha
data <- na.omit(data)

# Variables numèriques i categòriques
varNum <- data %>% select(where(is.numeric)) %>% colnames()
varCat <- data %>% select(where(is.factor)) %>% colnames()


######### CLUSTERING JERÀRQUIC AMB EUCLIDIANA

# Només variables numèriques per fer el clustering
data_numeric <- data %>% select(where(is.numeric))

# Escalar dades
data_scaled <- scale(data_numeric)

# Matriu de distàncies euclidiana
distances <- dist(data_scaled, method = "euclidean")

# Clustering jeràrquic amb Ward
hclust_model <- hclust(distances, method = "ward.D2")

# Dendrograma
plot(hclust_model, main = "Dendrograma del clustering jeràrquic", cex = 0.6)
rect.hclust(hclust_model, k = 4, border = "red")

# Qualitat del dendrograma
cop_dist <- cophenetic(hclust_model)
cor(distances, cop_dist)

# Selecció de K
fviz_nbclust(data_scaled, hcut, method = "wss")

# Assignar clusters
data$cluster <- cutree(hclust_model, k = 4)

# Comptar individus per clúster
cluster_counts <- data %>%
  count(cluster) %>%
  arrange(cluster) %>%
  mutate(cluster_label = paste0("Cluster ", cluster, " (n=", n, ")"))


######### CPG

plots <- lapply(c(varNum, varCat), ClassPanelGraph, data = data, cluster_hier = "cluster")
CPG <- ggarrange(plotlist = plots, ncol = 4, nrow = ceiling(length(c(varNum, varCat))/4))
plot(CPG)

######### Definir direcció del termòmetre per variables numèriques
vars_vermell_tall1_verd_tall2 <- c(
  "Hours_Studied",
  "Attendance",
  "Sleep_Hours",
  "Previous_Scores",
  "Tutoring_Sessions",
  "Physical_Activity",
  "Exam_Score"
)

vermell2verd <- vars_vermell_tall1_verd_tall2
verd2vermell <- setdiff(varNum, vars_vermell_tall1_verd_tall2)

######### TLP amb mitjana per numèriques i moda per categòriques

df_clustered <- data %>%
  group_by(cluster) %>%
  summarise(across(all_of(varNum), mean, na.rm = TRUE)) %>%
  data.frame()

datos_modelo <- df_clustered %>%
  pivot_longer(!cluster, names_to = "variable", values_to = "sum") %>%
  data.frame()

quien <- which(datos_modelo$variable %in% verd2vermell)
datos_modelo[quien, "direccion"] <- 1
datos_modelo[which(is.na(datos_modelo$direccion)), "direccion"] <- -1

listaDatos <- list()

for (var in varNum) {
  min_val <- min(data[[var]], na.rm = TRUE)
  max_val <- max(data[[var]], na.rm = TRUE)
  tall1_val <- quantile(data[[var]], 0.33, na.rm = TRUE)
  tall2_val <- quantile(data[[var]], 0.66, na.rm = TRUE)
  
  breaks_vals <- c(min_val, tall1_val, tall2_val, max_val)
  
  # evitar problemes si hi ha valors repetits
  for (i in 2:length(breaks_vals)) {
    if (breaks_vals[i] <= breaks_vals[i - 1]) {
      breaks_vals[i] <- breaks_vals[i - 1] + 1e-10
    }
  }
  
  subtabla <- datos_modelo[which(datos_modelo$variable == var), ]
  
  subtabla$grupo <- cut(
    subtabla$sum,
    breaks = breaks_vals,
    labels = c(1, 2, 3),
    include.lowest = TRUE
  )
  
  subtabla$color <- ifelse(
    subtabla$direccion == -1,
    ifelse(subtabla$grupo == "1", "red",
           ifelse(subtabla$grupo == "2", "yellow", "green")),
    ifelse(subtabla$grupo == "1", "green",
           ifelse(subtabla$grupo == "2", "yellow", "red"))
  )
  
  subtabla$color <- as.character(subtabla$color)
  subtabla[, c("sum", "direccion", "grupo")] <- NULL
  listaDatos[[var]] <- subtabla
}

varNumColor <- dplyr::bind_rows(listaDatos)


color_mapping_cat <- c(
  # Parental_Involvement
  "Low" = "red",
  "Medium" = "yellow",
  "High" = "green",
  
  # Access_to_Resources
  "Low" = "red",
  "Medium" = "yellow",
  "High" = "green",
  
  # Extracurricular_Activities
  "No" = "red",
  "Yes" = "green",
  
  # Motivation_Level
  "Low" = "red",
  "Medium" = "yellow",
  "High" = "green",
  
  # Internet_Access
  "No" = "red",
  "Yes" = "green",
  
  # Family_Income
  "Low" = "red",
  "Medium" = "yellow",
  "High" = "green",
  
  # Teacher_Quality
  "Low" = "red",
  "Medium" = "yellow",
  "High" = "green",
  
  # School_Type
  "Public" = "yellow",
  "Private" = "green",
  
  # Peer_Influence
  "Negative" = "red",
  "Neutral" = "yellow",
  "Positive" = "green",
  
  # Learning_Disabilities
  "Yes" = "red",
  "No" = "green",
  
  # Parental_Education_Level
  "High School" = "red",
  "College" = "yellow",
  "Postgraduate" = "green",
  
  # Distance_from_Home
  "Far" = "red",
  "Moderate" = "yellow",
  "Near" = "green",
  
  # Gender
  "Male" = "yellow",
  "Female" = "yellow"
)

df_moda <- data %>%
  select(cluster, all_of(varCat)) %>%
  pivot_longer(cols = -cluster, names_to = "variable", values_to = "valor") %>%
  group_by(cluster, variable) %>%
  summarise(moda = get_mode(valor), .groups = "drop") %>%
  data.frame()

m <- match(df_moda$moda, names(color_mapping_cat))
df_moda$color <- unname(color_mapping_cat[m])

# Si alguna modalitat no està al mapping
df_moda$color[is.na(df_moda$color)] <- "yellow"

varCatColor <- df_moda %>%
  select(cluster, variable, color) %>%
  data.frame()

dfColor <- rbind(varNumColor, varCatColor)
dfColor$cluster <- factor(dfColor$cluster, levels = cluster_counts$cluster)

ggplot(dfColor, aes(x = variable,
                    y = factor(cluster, labels = cluster_counts$cluster_label),
                    fill = color)) +
  geom_tile(color = "black", linewidth = 0.5) +
  scale_fill_manual(values = c("red" = "red", "yellow" = "yellow", "green" = "green")) +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
  labs(title = "Traffic Light Panel (TLP)",
       x = "Variables",
       y = "Clusters")

ggsave("TLP_student.png", width = 14, height = 7)

dfColorRed <- dfColor

for (var in unique(dfColorRed$variable)) {
  subset_var <- dfColorRed[dfColorRed$variable == var, ]
  if (length(unique(subset_var$color)) == 1) {
    dfColorRed <- dfColorRed %>% filter(variable != var)
  }
}

dfColorRed$cluster <- factor(dfColorRed$cluster, levels = cluster_counts$cluster)

ggplot(dfColorRed, aes(x = variable,
                       y = factor(cluster, labels = cluster_counts$cluster_label),
                       fill = color)) +
  geom_tile(color = "black", linewidth = 0.5) +
  scale_fill_manual(values = c("red" = "red", "yellow" = "yellow", "green" = "green")) +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
  labs(title = "Traffic Light Panel (TLP reduït)",
       x = "Variables",
       y = "Clusters")

ggsave("TLP_student_reduit.png", width = 12, height = 6)


###### aTLP

# CV només per variables numèriques
dfCV <- data %>%
  group_by(cluster) %>%
  summarise(across(all_of(varNum), cv, na.rm = TRUE)) %>%
  pivot_longer(!cluster, names_to = "variable", values_to = "cv") %>%
  data.frame()

# Afegir CV a dfColor
m <- match(
  paste0(dfColor$cluster, "_", dfColor$variable),
  paste0(dfCV$cluster, "_", dfCV$variable)
)

dfColor$cv <- dfCV$cv[m]

# Per les variables categòriques, posem un valor neutre
# així també tindran color però sense variar massa
dfColor$cv[is.na(dfColor$cv)] <- median(dfCV$cv, na.rm = TRUE)

# Normalitzar cv a [0,1]
cv_min <- min(dfColor$cv, na.rm = TRUE)
cv_max <- max(dfColor$cv, na.rm = TRUE)

if (cv_max > cv_min) {
  dfColor$cv_norm <- (dfColor$cv - cv_min) / (cv_max - cv_min)
} else {
  dfColor$cv_norm <- 0.5
}

# Invertim perquè:
# menys CV = més homogeni = color més intens
# més CV = menys homogeni = color més suau
dfColor$intensity <- 1 - dfColor$cv_norm

# Convertir color base a RGB
dfColor$R <- ifelse(dfColor$color == "red", 255,
                    ifelse(dfColor$color == "yellow", 255,
                           ifelse(dfColor$color == "green", 0, 200)))

dfColor$G <- ifelse(dfColor$color == "red", 0,
                    ifelse(dfColor$color == "yellow", 255,
                           ifelse(dfColor$color == "green", 255, 200)))

dfColor$B <- ifelse(dfColor$color %in% c("red", "yellow", "green"), 0, 200)

# Ajustar intensitat
# fem que el color vagi de més pastel a més intens
# intensity alt -> color més viu
# intensity baix -> color més clar

dfColor$R <- ifelse(dfColor$color == "red",
                    120 + 135 * dfColor$intensity,
                    ifelse(dfColor$color == "yellow",
                           220 + 35 * dfColor$intensity,
                           255 - 255 * dfColor$intensity))

dfColor$G <- ifelse(dfColor$color == "green",
                    120 + 135 * dfColor$intensity,
                    ifelse(dfColor$color == "yellow",
                           220 + 35 * dfColor$intensity,
                           255 - 255 * dfColor$intensity))

dfColor$B <- ifelse(dfColor$color == "yellow",
                    80 * (1 - dfColor$intensity),
                    0)

# Assegurar que tot queda entre 0 i 255
dfColor$R <- pmin(pmax(dfColor$R, 0), 255)
dfColor$G <- pmin(pmax(dfColor$G, 0), 255)
dfColor$B <- pmin(pmax(dfColor$B, 0), 255)

# Convertir a color final
dfColor$color_atlp <- rgb(dfColor$R, dfColor$G, dfColor$B, maxColorValue = 255)

# Factor de cluster
dfColor$cluster <- factor(dfColor$cluster, levels = cluster_counts$cluster)

# aTLP complet
ggplot(dfColor, aes(x = variable,
                    y = factor(cluster, labels = cluster_counts$cluster_label),
                    fill = color_atlp)) +
  geom_tile(color = "black", linewidth = 0.5) +
  scale_fill_identity() +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
  labs(title = "Annotated Traffic Light Panel (aTLP)",
       x = "Variables",
       y = "Clusters")

ggsave("ATLP_student.png", width = 14, height = 7)

# aTLP reduït
dfColorRed <- dfColor

for (var in unique(dfColorRed$variable)) {
  subset_var <- dfColorRed[dfColorRed$variable == var, ]
  if (length(unique(subset_var$color)) == 1) {
    dfColorRed <- dfColorRed %>% filter(variable != var)
  }
}

ggplot(dfColorRed, aes(x = variable,
                       y = factor(cluster, labels = cluster_counts$cluster_label),
                       fill = color_atlp)) +
  geom_tile(color = "black", linewidth = 0.5) +
  scale_fill_identity() +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
  labs(title = "Annotated Traffic Light Panel (aTLP reduït)",
       x = "Variables",
       y = "Clusters")

ggsave("ATLP_student_reduit.png", width = 12, height = 6)
