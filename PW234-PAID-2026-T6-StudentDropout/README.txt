README.txt
Intelligent Decision Support System (IDSS) per a l'analisi del risc academic dels estudiants

Aquest repositori conte els materials desenvolupats en el projecte relacionat amb el disseny i implementacio d'un Sistema Intel.ligent de Suport a la Decisio (IDSS) orientat a la identificacio d'estudiants amb risc de baix rendiment academic o abandonament.

El projecte combina preprocessament de dades, clustering i profiling d'alumnes, classificacio supervisada, explicabilitat amb XGBoost + SHAP, raonament basat en casos i un dashboard interactiu per facilitar la presa de decisions docents.


Estructura del repositori

1. Carpeta "Data"

Inclou les dades principals utilitzades pel projecte:

* Student_Perfomance_Factors_no_processada.csv: dataset original.
* student_preprocessed.csv: dataset preprocessat utilitzat per models i dashboard.
* validation_final.csv: conjunt de validacio.


2. Carpeta "Source"

Conte el codi de les fases analitiques del projecte:

* Preprocesament/preprocessing.R: preprocessament del dataset.
* Preprocesament/EDA/eda.ipynb: exploracio inicial de dades.
* Clustering + Profiling/clustering_jerarquic.R: clustering jerarquic.
* Clustering + Profiling/profiling.R: caracteritzacio dels perfils.
* Classificacio supervisada/supervised_learning.ipynb: models supervisats.
* Classificacio supervisada/resultats_models_classificacio.csv: resultats comparatius dels models.
* Model d_explicabilitat/motor_explicabilitat_xgboost_shap.ipynb: explicabilitat del model amb XGBoost i SHAP.


3. Carpeta "Dashboard"

Conte el dashboard interactiu del projecte.

Fitxers principals:

* index.html: estructura de la interfície.
* styles.css: estils visuals i disseny responsive.
* app.js: logica principal del dashboard.
* actions_store.js: persistencia local de les intervencions docents amb localStorage.
* README.md: instruccions detallades d'us del dashboard.
* requirements.txt: dependencies Python per regenerar exports.
* scripts/export_xgboost_shap.py: exportacio de prediccions XGBoost i factors SHAP.
* scripts/export_student_profiles.py: exportacio dels perfils d'alumne.
* tests/: tests del dashboard i dels scripts d'exportacio.
* data/: fitxers CSV i JSON exportats per alimentar la interfície.

Funcionalitats principals del dashboard:

* Vista Global amb indicadors, matriu de perfils d'alumne per nivell de risc i agenda de seguiment.
* Vista Estudiants amb llista prioritzada, filtres, explicacio local i registre d'intervencions.
* Vista Validacio per revisar el comportament del sistema sobre el conjunt de validacio.
* Simulador d'intervencio individual.
* Avaluacio d'un alumne nou sense modificar el CSV.
* Agenda docent basada en intervencions registrades al navegador.

Les intervencions docents aplicades des del dashboard no es guarden als CSV ni modifiquen les dades del model. Es desen al localStorage del navegador amb la clau:

paid_dashboard_student_actions

Aquesta decisio permet demostrar el flux complet del sistema sense afegir backend ni contaminar les dades originals. En una versio de produccio, aquesta informacio s'hauria de guardar en una base de dades.

Per executar el dashboard, consulta:

Dashboard/README.md


4. Carpeta "KnowledgeSources"

Conte la implementacio del raonament basat en casos (CBR):

* CBR_StudentDropout/cbr_case.py
* CBR_StudentDropout/cbr_main.py
* CBR_StudentDropout/cbr_retrieve.py
* CBR_StudentDropout/cbr_reuse.py
* CBR_StudentDropout/cbr_revise.py
* CBR_StudentDropout/cbr_retain.py

Aquest modul representa una font de coneixement complementaria per recuperar casos similars i donar suport al proces de decisio.


5. Carpeta "IDSS"

Conte documentacio relacionada amb l'arquitectura del sistema:

* Arquitectura IDSS.pdf


6. Carpeta "Documentation"

Conte documentacio de gestio i context del projecte:

* Canvas.pptx.pdf
* Assignacio de tasques + implicacio temporal.pdf
* Diagrama de Gantt.pdf
* Metadata - Metadata.pdf


7. Carpeta "Presentation"

Conte la presentacio final del projecte:

* Presentacio PAID.pdf


Com provar els components principals

Dashboard:

1. Obrir un terminal a l'arrel del repositori.
2. Executar:

python -m http.server 8767 --bind 127.0.0.1

3. Obrir:

http://127.0.0.1:8767/Dashboard/index.html?fresh=dashboard

Tests del dashboard:

node --test Dashboard\tests\dashboard.test.js
python -m unittest Dashboard\tests\test_export_student_profiles.py


Notes importants

* El dashboard es una aplicacio estatica i no necessita backend.
* Les dades originals es llegeixen des de CSV i JSON exportats.
* Les accions docents registrades al dashboard es guarden nomes al navegador de l'usuari.
* La terminologia de la interfície esta adaptada al professorat: s'utilitza "perfil d'alumne" en lloc de llenguatge tecnic com "cluster".
* La vista de "Nou alumne" i el "Simulador" no modifiquen els fitxers originals; serveixen per analisi exploratoria i demostracio del sistema.
