rm(list=ls())

# Llibreries
library(readr)
library(dplyr)
library(factoextra)

# Llegir dades
df <- read_csv("C:/Users/jarog/Desktop/IA/3r/Q2/PAID/Treball/student_final.csv")

# Seleccionar variables numèriques
df_numeric <- df %>% select(where(is.numeric))

# Escalar dades
df_scaled <- scale(df_numeric)

# Anàlisi descriptiu
summary(df_numeric)
pairs(df_numeric)

# Matriu de distàncies (euclidiana)
d <- dist(df_scaled, method = "euclidean")

# Clustering jeràrquic (Ward)
hc <- hclust(d, method = "ward.D2")


# Dendrograma
plot(hc, main="Dendrograma - Clustering Jeràrquic", cex=0.6)

# Tall en 3 clusters
rect.hclust(hc, k=4, border="red")

# Qualitat del dendrograma
cop_dist <- cophenetic(hc)
cor(d, cop_dist)

# Selecció de K (Elbow)
fviz_nbclust(df_scaled, hcut, method="wss")

# Assignació de clusters
k <- 4
clusters <- cutree(hc, k=k)
df$cluster <- clusters

# Visualització amb PCA
pr <- princomp(df_scaled)
x <- pr$scores[,1]
y <- pr$scores[,2]

plot(x, y, col=clusters, pch=19,
     main="Clusters (PCA)",
     xlab="PC1", ylab="PC2")

# Perfil dels clusters
aggregate(df_numeric, by=list(cluster=clusters), mean)

# Distribució
table(clusters)

cluster_profile <- aggregate(df_numeric, 
                             by = list(cluster = clusters), 
                             mean)

print(cluster_profile)

# Guardar resultat
write_csv(df, "/Users/juliapedrolbarbera/Desktop/CLUSTERING PAID/student_clustered.csv")
