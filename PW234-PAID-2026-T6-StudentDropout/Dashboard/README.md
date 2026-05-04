# Dashboard IDSS Dropout

Aquest dashboard interactiu mostra una vista visual i operativa del risc d'abandonament academic dels estudiants.

## Com executar-lo

No obris `index.html` directament fent doble clic, perque el navegador pot bloquejar la lectura del CSV. Cal aixecar un servidor local des de la carpeta principal del projecte.

Des de la carpeta principal del repositori, entra a la carpeta del projecte:

```bash
cd PW234-PAID-2026-T6-StudentDropout
```

Despres aixeca un servidor local:

```bash
python -m http.server 8000
```

Si el sistema utilitza `python3` en comptes de `python`, executa:

```bash
python3 -m http.server 8000
```

Despres obre aquest enllac al navegador:

```text
http://localhost:8000/Dashboard/index.html
```

Si el port `8000` ja esta ocupat, pots utilitzar-ne un altre:

```bash
python -m http.server 8010
```

I obrir:

```text
http://localhost:8010/Dashboard/index.html
```

## Fitxers del dashboard

- `index.html`: estructura principal del dashboard.
- `styles.css`: estils visuals i disseny responsive.
- `app.js`: carrega les dades, calcula el risc explicable i gestiona la interaccio.

## Dades utilitzades

El dashboard llegeix el fitxer:

```text
../Data/student_preprocessed.csv
```

Per tant, s'ha d'executar el servidor local des de la carpeta `PW234-PAID-2026-T6-StudentDropout`, no des de dins de `Dashboard`.

## Prediccions XGBoost + SHAP

El dashboard pot utilitzar prediccions reals del model XGBoost i factors explicatius SHAP. Aquests resultats estan exportats a:

```text
Dashboard/data/student_predictions_xgboost_shap.csv
Dashboard/data/xgboost_metrics.json
```

Si aquests fitxers existeixen, el dashboard els carrega automaticament i mostra el risc segons XGBoost + SHAP. Si no existeixen, el dashboard continua funcionant amb un score explicable de fallback.

Per regenerar les prediccions, instala les dependencies i executa l'script d'exportacio:

```bash
pip install -r Dashboard/requirements.txt
python Dashboard/scripts/export_xgboost_shap.py
```

Si el sistema utilitza `python3`:

```bash
python3 -m pip install -r Dashboard/requirements.txt
python3 Dashboard/scripts/export_xgboost_shap.py
```

L'script entrena el model amb `Data/student_preprocessed.csv`, calcula probabilitats de dropout, extreu els factors SHAP principals per estudiant i genera les accions recomanades a partir dels factors que incrementen el risc.

## Funcionalitats

- Vista global amb metriques principals.
- Mapa de risc per assistencia i hores d'estudi.
- Factors principals associats al risc.
- Perfils d'intervencio per coordinadors.
- Llista prioritzada d'estudiants.
- Explicacio local per estudiant.
- Simulador what-if per veure com canvia el risc segons motivacio, assistencia, hores d'estudi i notes.

## Nota tecnica

El dashboard prioritza les prediccions exportades de XGBoost + SHAP. El score explicable manual nomes s'utilitza com a fallback si no es troba el fitxer `Dashboard/data/student_predictions_xgboost_shap.csv`.
