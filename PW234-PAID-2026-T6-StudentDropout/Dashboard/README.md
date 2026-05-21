# Dashboard IDSS Dropout

Aquest dashboard interactiu mostra una vista visual i operativa del risc d'abandonament acadèmic dels estudiants.

## Com obrir el dashboard

No obris `Dashboard/index.html` fent doble clic, perquè el navegador pot bloquejar la lectura dels fitxers CSV i JSON. Cal aixecar un servidor local des de la carpeta principal del projecte.

Primer ves a la carpeta on tinguis clonat el repositori i entra a `PW234-PAID-2026-T6-StudentDropout`:

```powershell
cd "RUTA\ON\HAS\CLONAT\EL\REPOSITORI\PW234-PAID-2026-T6-StudentDropout"
python -m http.server 8767 --bind 127.0.0.1
```

Després obre aquest enllaç al navegador:

```text
http://127.0.0.1:8767/Dashboard/index.html?fresh=20260518-8
```

Si `python` no funciona, prova:

```powershell
py -m http.server 8767 --bind 127.0.0.1
```

## Si el port està ocupat

Si el port `8767` ja està ocupat, utilitza un altre port, per exemple `8768`:

```powershell
python -m http.server 8768 --bind 127.0.0.1
```

I obre:

```text
http://127.0.0.1:8768/Dashboard/index.html?fresh=20260518-8
```

## Com comprovar que carrega la versió correcta

Evita obrir el dashboard amb `localhost` si tens servidors antics oberts, perquè pot acabar mostrant una versió anterior. Fes servir sempre `127.0.0.1`.

Per comprovar que el navegador carrega el JavaScript actual, obre:

```text
http://127.0.0.1:8767/Dashboard/app.js?v=20260518-8
```

Si encara veus una versió antiga, tanca servidors duplicats o canvia de port. Per veure processos escoltant als ports habituals:

```powershell
netstat -ano | findstr ":8767"
netstat -ano | findstr ":8768"
```

## Fitxers del dashboard

- `index.html`: estructura principal del dashboard.
- `styles.css`: estils visuals i disseny responsive.
- `app.js`: carrega les dades, calcula el risc explicable i gestiona la interacció.
- `data/`: prediccions, perfils i mètriques exportades.

## Dades utilitzades

El dashboard llegeix fitxers des de:

```text
../Data/student_preprocessed.csv
Dashboard/data/student_predictions_xgboost_shap.csv
Dashboard/data/validation_predictions_xgboost_shap.csv
Dashboard/data/student_profiles.csv
Dashboard/data/validation_profiles.csv
Dashboard/data/student_profile_model.json
```

Per això el servidor s'ha d'executar des de `PW234-PAID-2026-T6-StudentDropout`, no des de dins de `Dashboard`.

## Prediccions XGBoost + SHAP

El dashboard prioritza les prediccions reals del model XGBoost i els factors explicatius SHAP exportats a:

```text
Dashboard/data/student_predictions_xgboost_shap.csv
Dashboard/data/xgboost_metrics.json
```

Si aquests fitxers no estan disponibles, el dashboard continua funcionant amb un score explicable de fallback.

Per regenerar les prediccions:

```powershell
pip install -r Dashboard/requirements.txt
python Dashboard/scripts/export_xgboost_shap.py
```

## Perfils d'estudiant

Els perfils d'alumne es poden regenerar amb:

```powershell
python Dashboard/scripts/export_student_profiles.py
```

Aquest script llegeix `Data/student_preprocessed.csv` i exporta `Dashboard/data/student_profiles.csv`.
