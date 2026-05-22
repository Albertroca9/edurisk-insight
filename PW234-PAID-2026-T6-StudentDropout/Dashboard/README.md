# Dashboard IDSS Risc Academic

Aquest dashboard interactiu mostra una vista visual i operativa del risc academic dels estudiants. Esta pensat com una eina de suport a la decisio docent: ajuda a identificar alumnes prioritaris, entendre els factors de risc, consultar perfils d'alumne, simular escenaris d'intervencio i registrar accions de seguiment.

La interfície evita llenguatge massa tecnic sempre que sigui possible. Per exemple, els grups de clustering es mostren com a `Perfil d'alumne 1`, `Perfil d'alumne 2`, `Perfil d'alumne 3` i `Perfil d'alumne 4`.

## Com obrir el dashboard

No obris `Dashboard/index.html` fent doble clic, perque el navegador pot bloquejar la lectura dels fitxers CSV i JSON. Cal aixecar un servidor local des de la carpeta principal del projecte.

Primer ves a la carpeta on tinguis clonat el repositori i entra a `PW234-PAID-2026-T6-StudentDropout`:

```powershell
cd "RUTA\ON\HAS\CLONAT\EL\REPOSITORI\PW234-PAID-2026-T6-StudentDropout"
python -m http.server 8767 --bind 127.0.0.1
```

Despres obre aquest enllac al navegador:

```text
http://127.0.0.1:8767/Dashboard/index.html?fresh=dashboard
```

Si `python` no funciona, prova:

```powershell
py -m http.server 8767 --bind 127.0.0.1
```

## Si el port esta ocupat

Si el port `8767` ja esta ocupat, utilitza un altre port, per exemple `8768`:

```powershell
python -m http.server 8768 --bind 127.0.0.1
```

I obre:

```text
http://127.0.0.1:8768/Dashboard/index.html?fresh=dashboard
```

Evita barrejar `localhost` i `127.0.0.1` si tens servidors antics oberts, perque el navegador pot acabar mostrant una versio cachejada. Si cal, canvia el valor de `fresh` a la URL.

Per veure processos escoltant als ports habituals:

```powershell
netstat -ano | findstr ":8767"
netstat -ano | findstr ":8768"
```

## Fitxers principals

- `index.html`: estructura de les pestanyes, panells, taules i formularis.
- `styles.css`: disseny visual, layout responsive, badges i targetes.
- `app.js`: carrega dades, renderitza vistes, calcula riscos de fallback, gestiona filtres, simulacions i interaccions.
- `actions_store.js`: persistencia local de les intervencions docents amb `localStorage`.
- `data/`: prediccions, perfils d'alumne i metadades exportades.
- `scripts/export_xgboost_shap.py`: exporta prediccions XGBoost i explicacions SHAP.
- `scripts/export_student_profiles.py`: exporta perfils d'alumne a partir del clustering.

## Dades utilitzades

El dashboard llegeix fitxers des de:

```text
../Data/student_preprocessed.csv
../Data/validation_final.csv
Dashboard/data/student_predictions_xgboost_shap.csv
Dashboard/data/validation_predictions_xgboost_shap.csv
Dashboard/data/student_profiles.csv
Dashboard/data/validation_profiles.csv
Dashboard/data/student_profile_model.json
```

Per aixo el servidor s'ha d'executar des de `PW234-PAID-2026-T6-StudentDropout`, no des de dins de `Dashboard`.

## Pestanyes del dashboard

### Global

La pestanya `Global` dona una lectura general de la cohort.

Inclou:

- indicadors principals: total d'estudiants, abandonament observat, risc alt estimat i font d'explicabilitat;
- una matriu de `Perfils d'estudiant per nivell de risc`;
- una `Agenda de seguiment`;
- un bloc de perfils d'intervencio.

El grafic principal creua perfils d'alumne amb nivells de risc. Les files son els perfils d'alumne i les columnes representen risc alt, mitja i baix. Cada cel.la mostra quants alumnes d'aquell perfil cauen en cada nivell de risc.

### Estudiants

La pestanya `Estudiants` mostra la llista prioritzada d'alumnes.

La taula inclou:

- ID de l'alumne;
- percentatge de risc;
- perfil d'alumne;
- motivacio;
- assistencia;
- hores d'estudi;
- nota d'examen;
- accio recomanada o estat de seguiment.

Es pot filtrar per risc, motivacio i cerca textual. En seleccionar un alumne, s'obre la fitxa individual amb explicacio local.

La fitxa individual mostra:

- resum del risc;
- factors de risc principals;
- perfil de seguiment;
- pla d'intervencio proposat;
- accions suggerides;
- registre d'intervencio docent.

El perfil de seguiment evita frases massa tecniques, com referencies a aTLP, i les substitueix per lectures mes comprensibles per professorat.

### Validacio

La pestanya `Validacio` mostra els alumnes del conjunt de validacio. Te una estructura similar a `Estudiants`, pero treballa amb les dades de validacio i les seves prediccions exportades.

Aquesta vista serveix per revisar si el sistema manté una explicacio coherent en dades separades del conjunt principal.

### Simulador

La pestanya `Simulador` permet modificar variables d'un alumne o d'un cas manual i veure com canvia el risc estimat.

Variables disponibles:

- motivacio;
- assistencia;
- hores d'estudi;
- notes previes;
- nota d'examen;
- tutories;
- recursos.

El simulador no modifica els CSV ni les prediccions originals. Serveix per explorar escenaris hipotetics, com millorar assistencia, augmentar hores d'estudi o afegir suport tutorial.

### Nou alumne

La pestanya `Nou alumne` permet introduir manualment un alumne que no existeix al dataset.

El formulari demana:

- ID de l'alumne;
- motivacio;
- assistencia;
- hores d'estudi;
- nota previa;
- nota d'examen;
- tutories;
- recursos.

El dashboard calcula un risc estimat, mostra factors explicatius, assigna un perfil aproximat i proposa accions de seguiment. Aquest alumne no s'afegeix al CSV ni queda guardat al dataset; el calcul nomes existeix dins la sessio del navegador.

## Agenda de seguiment i registre d'intervencions

El dashboard permet registrar una intervencio docent des de la fitxa individual d'un alumne.

Sota `Accions suggerides` apareix el bloc `Registrar intervencio`, amb:

- selector d'accio, preomplert amb les accions suggerides pel sistema;
- selector rapid de revisio: 2 setmanes, 4 setmanes, 8 setmanes o data personalitzada;
- camp de notes del professor, limitat a 300 caracters;
- boto `Aplicar i programar revisio`.

Quan ja hi ha una intervencio registrada per aquell alumne, el bloc mostra l'estat actual i ofereix:

- `Editar`;
- `Marcar com revisat`.

Els estats possibles son:

- `pendent`;
- `en_seguiment`;
- `a_revisar`;
- `tancat`.

La taula d'estudiants mostra un badge a la columna `Accio` quan hi ha una intervencio registrada. Si la data de revisio ja ha arribat, l'estat passa a `a_revisar` i tambe apareix al badge vermell del menu lateral `Estudiants`.

## On es guarden les intervencions

Les intervencions no es guarden al CSV ni modifiquen les dades originals del model.

Es guarden al `localStorage` del navegador amb la clau:

```text
paid_dashboard_student_actions
```

L'estructura d'un registre es:

```json
{
  "studentId": "STU-0030",
  "action": "Tutoria motivacional",
  "appliedDate": "2026-05-20",
  "reviewDate": "2026-06-17",
  "status": "en_seguiment",
  "notes": ""
}
```

Aixo permet demostrar el flux complet sense afegir backend:

1. el professor revisa un alumne;
2. aplica una accio;
3. programa una data de revisio;
4. l'alumne apareix a l'agenda de seguiment;
5. el professor marca la intervencio com a revisada.

En una versio de produccio, aquesta informacio aniria a una base de dades. En aquest prototip academic s'utilitza `localStorage` per no contaminar les dades del model ni afegir complexitat innecessaria.

## Prediccions XGBoost i SHAP

El dashboard prioritza les prediccions exportades del model XGBoost i els factors explicatius SHAP:

```text
Dashboard/data/student_predictions_xgboost_shap.csv
Dashboard/data/validation_predictions_xgboost_shap.csv
Dashboard/data/xgboost_metrics.json
```

Si aquests fitxers no estan disponibles, el dashboard continua funcionant amb un score explicable de fallback basat en regles transparents.

Per regenerar les prediccions:

```powershell
pip install -r Dashboard/requirements.txt
python Dashboard/scripts/export_xgboost_shap.py
```

## Perfils d'alumne

Els perfils d'alumne provenen del clustering exportat pel script:

```powershell
python Dashboard/scripts/export_student_profiles.py
```

Aquest script llegeix:

```text
Data/student_preprocessed.csv
Data/validation_final.csv
```

I exporta:

```text
Dashboard/data/student_profiles.csv
Dashboard/data/validation_profiles.csv
Dashboard/data/student_profile_model.json
```

Els perfils utilitzats a la interfície son:

- `Perfil d'alumne 1`
- `Perfil d'alumne 2`
- `Perfil d'alumne 3`
- `Perfil d'alumne 4`

La numeracio i el volum dels perfils s'han alineat amb l'informe del projecte. A la interfície s'utilitza llenguatge orientat al professorat i no terminologia tecnica com `cluster`.

## Tests

Per verificar el dashboard:

```powershell
node --test Dashboard\tests\dashboard.test.js
python -m unittest Dashboard\tests\test_export_student_profiles.py
```

Els tests cobreixen:

- parsing de CSV;
- aplicacio de perfils;
- matriu de perfils per risc;
- agenda de seguiment;
- persistencia amb `localStorage`;
- registre d'intervencions;
- renderitzat de la taula d'estudiants;
- simulador;
- avaluacio de nou alumne;
- exportacio de perfils.

## Notes importants

- El dashboard es una app estatica: no necessita backend.
- Les dades originals del model no es modifiquen des de la interfície.
- Les intervencions docents es guarden nomes al navegador de l'usuari.
- Si canvies de navegador, ordinador o neteges dades del lloc, es perden les intervencions guardades.
- Per evitar cache, utilitza `127.0.0.1` i canvia el parametre `fresh` de la URL si cal.
