const DATA_URL = "../Data/student_preprocessed.csv";
const PREDICTIONS_URL = "data/student_predictions_xgboost_shap.csv";

const state = {
  rows: [],
  filtered: [],
  selected: null,
  view: "overview",
  modelMode: "rule",
  sort: { key: "riskScore", direction: "desc" },
};

const els = {
  loading: document.querySelector("#loading-state"),
  error: document.querySelector("#error-state"),
  title: document.querySelector("#view-title"),
  cohort: document.querySelector("#cohort-filter"),
  refresh: document.querySelector("#refresh-btn"),
  nav: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  total: document.querySelector("#metric-total"),
  dropout: document.querySelector("#metric-dropout"),
  dropoutSub: document.querySelector("#metric-dropout-sub"),
  highRisk: document.querySelector("#metric-high-risk"),
  attendance: document.querySelector("#metric-attendance"),
  scatter: document.querySelector("#scatter-chart"),
  drivers: document.querySelector("#driver-bars"),
  interventions: document.querySelector("#intervention-grid"),
  search: document.querySelector("#student-search"),
  riskFilter: document.querySelector("#risk-filter"),
  motivationFilter: document.querySelector("#motivation-filter"),
  table: document.querySelector("#student-table"),
  sortHeaders: document.querySelectorAll(".sort-header"),
  tableCount: document.querySelector("#table-count"),
  detailTitle: document.querySelector("#detail-title"),
  detail: document.querySelector("#student-detail"),
  simMotivation: document.querySelector("#sim-motivation"),
  simAttendance: document.querySelector("#sim-attendance"),
  simHours: document.querySelector("#sim-hours"),
  simPrevious: document.querySelector("#sim-previous"),
  simExam: document.querySelector("#sim-exam"),
  gauge: document.querySelector("#gauge-chart"),
  simScore: document.querySelector("#sim-score"),
  simLevel: document.querySelector("#sim-level"),
  simActions: document.querySelector("#sim-actions"),
  newId: document.querySelector("#new-id"),
  newMotivation: document.querySelector("#new-motivation"),
  newAttendance: document.querySelector("#new-attendance"),
  newHours: document.querySelector("#new-hours"),
  newPrevious: document.querySelector("#new-previous"),
  newExam: document.querySelector("#new-exam"),
  newTutoring: document.querySelector("#new-tutoring"),
  newResources: document.querySelector("#new-resources"),
  newResultTitle: document.querySelector("#new-result-title"),
  newResult: document.querySelector("#new-student-result"),
};

const viewTitles = {
  overview: "Visió global del risc acadèmic",
  students: "Llista prioritzada d'estudiants",
  simulator: "Simulador d'intervenció individual",
  "new-student": "Avaluació d'un alumne nou",
};

const numberColumns = new Set([
  "Hours_Studied",
  "Attendance",
  "Extracurricular_Activities",
  "Sleep_Hours",
  "Previous_Scores",
  "Internet_Access",
  "Tutoring_Sessions",
  "Physical_Activity",
  "Learning_Disabilities",
  "Exam_Score",
  "dropout",
]);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines.shift());
  return lines.map((line, index) => {
    const values = splitCsvLine(line);
    const row = { id: `STU-${String(index + 1).padStart(4, "0")}` };
    headers.forEach((header, i) => {
      const raw = values[i] ?? "";
      row[header] = numberColumns.has(header) ? Number(raw) : raw;
    });
    const risk = calculateRisk(row);
    row.riskScore = risk.score;
    row.riskLevel = risk.level;
    row.riskFactors = risk.factors;
    row.recommendedActions = recommendActions(row);
    return row;
  });
}

function parsePredictions(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines.shift());
  const predictions = new Map();

  lines.forEach((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });

    predictions.set(row.id, {
      probability: Number(row.xgb_probability),
      riskScore: Number(row.risk_score),
      riskLevel: row.risk_level,
      riskFactors: safeJson(row.top_factors_json, []),
      recommendedActions: safeJson(row.recommended_actions_json, []).map((action) => [
        cleanCatalanText(action.title),
        cleanCatalanText(action.description),
      ]),
    });
  });

  return predictions;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanCatalanText(value) {
  return String(value)
    .replaceAll("compromÃ­s", "compromís")
    .replaceAll("competÃ¨ncies", "competències")
    .replaceAll("Revisio", "Revisió")
    .replaceAll("revisio", "revisió")
    .replaceAll("assistencia", "assistència")
    .replaceAll("presencia", "presència")
    .replaceAll("progres", "progrés")
    .replaceAll("Reforc", "Reforç")
    .replaceAll("reforc", "reforç")
    .replaceAll("academic", "acadèmic")
    .replaceAll("Intervencio", "Intervenció")
    .replaceAll("intervencio", "intervenció")
    .replaceAll("prioritaria", "prioritària")
    .replaceAll("Monitoritzacio", "Monitorització")
    .replaceAll("ordinaria", "ordinària")
    .replaceAll("observacio", "observació")
    .replaceAll("evolucio", "evolució")
    .replaceAll("proxim", "pròxim")
    .replaceAll("tendencia", "tendència");
}

function applyModelPredictions(rows, predictions) {
  rows.forEach((row) => {
    const prediction = predictions.get(row.id);
    if (!prediction) return;
    row.xgbProbability = prediction.probability;
    row.riskScore = prediction.riskScore;
    row.riskLevel = prediction.riskLevel;
    row.riskFactors = prediction.riskFactors;
    row.recommendedActions = prediction.recommendedActions.length ? prediction.recommendedActions : row.recommendedActions;
  });
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else current += char;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function calculateRisk(row) {
  const factors = [];
  let score = 8;
  addFactor(factors, "Motivació baixa", row.Motivation_Level === "Low" ? 30 : row.Motivation_Level === "Medium" ? 12 : -10);
  addFactor(factors, "Poques hores d'estudi", scaleDown(row.Hours_Studied, 8, 26, 24));
  addFactor(factors, "Assistència baixa", scaleDown(row.Attendance, 65, 90, 23));
  addFactor(factors, "Nota d'examen baixa", scaleDown(row.Exam_Score, 58, 76, 20));
  addFactor(factors, "Notes prèvies baixes", scaleDown(row.Previous_Scores, 55, 86, 14));
  addFactor(factors, "Sense tutories", row.Tutoring_Sessions === 0 ? 5 : -3);
  addFactor(factors, "Recursos baixos", row.Access_to_Resources === "Low" ? 5 : 0);

  score += factors.reduce((sum, factor) => sum + factor.impact, 0);
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    level: score >= 65 ? "high" : score >= 38 ? "medium" : "low",
    factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 6),
  };
}

function addFactor(factors, label, impact) {
  factors.push({ label, impact: Math.round(impact) });
}

function scaleDown(value, low, high, weight) {
  const normalized = 1 - (value - low) / (high - low);
  return Math.max(-weight * 0.35, Math.min(weight, normalized * weight));
}

function recommendActions(row) {
  const actions = [];
  if (row.Motivation_Level === "Low") actions.push(["Tutoria motivacional", "Revisió individual d'objectius i barreres de compromís."]);
  if (row.Attendance < 75) actions.push(["Seguiment d'assistència", "Contacte preventiu i pauta setmanal de presència a classe."]);
  if (row.Hours_Studied < 15) actions.push(["Pla d'estudi guiat", "Franges concretes d'estudi i revisió de progrés cada dues setmanes."]);
  if (row.Exam_Score < 64 || row.Previous_Scores < 68) actions.push(["Reforç acadèmic", "Sessions focalitzades en les competències amb pitjor rendiment."]);
  if (row.Access_to_Resources === "Low") actions.push(["Recursos educatius", "Prioritzar materials, espais d'estudi o suport digital."]);
  if (!actions.length) actions.push(["Seguiment ordinari", "Mantenir observació i revisar evolució en el pròxim cicle."]);
  return actions.slice(0, 4);
}

function filteredRows() {
  let rows = [...state.rows];
  if (els.cohort.value === "risk") rows = rows.filter((row) => row.dropout === 1);
  if (els.cohort.value === "no-risk") rows = rows.filter((row) => row.dropout === 0);
  return rows;
}

function renderAll() {
  state.filtered = filteredRows();
  renderMetrics();
  renderPriorityChart();
  renderDrivers();
  renderInterventions();
  renderTable();
  renderSimulator();
  renderNewStudent();
}

function evaluateNewStudent(values) {
  const row = {
    id: values.id || "NOU-001",
    Motivation_Level: values.Motivation_Level,
    Attendance: Number(values.Attendance),
    Hours_Studied: Number(values.Hours_Studied),
    Previous_Scores: Number(values.Previous_Scores),
    Exam_Score: Number(values.Exam_Score),
    Tutoring_Sessions: Number(values.Tutoring_Sessions),
    Access_to_Resources: values.Access_to_Resources,
    dropout: 0,
  };
  const risk = calculateRisk(row);
  row.riskScore = risk.score;
  row.riskLevel = risk.level;
  row.riskFactors = risk.factors;
  row.recommendedActions = recommendActions(row);
  return row;
}

function renderMetrics() {
  const rows = state.filtered;
  const observedRisk = rows.filter((row) => row.dropout === 1).length;
  const highRisk = rows.filter((row) => row.riskLevel === "high").length;

  els.total.textContent = formatInt(rows.length);
  els.dropout.textContent = `${percent(observedRisk, rows.length)}%`;
  els.dropoutSub.textContent = `${formatInt(observedRisk)} casos observats`;
  els.highRisk.textContent = formatInt(highRisk);
  els.attendance.textContent = state.modelMode === "xgboost" ? "SHAP" : "Regles";
  document.querySelector(".metric.explain small").textContent = explainabilitySummary(state.modelMode);
  document.querySelector("#metric-high-risk + small").textContent = state.modelMode === "xgboost"
    ? "segons XGBoost + SHAP"
    : "segons score explicable";
}

function explainabilitySummary(modelMode) {
  return modelMode === "xgboost"
    ? "XGBoost + SHAP: cada predicció inclou factors locals que indiquen què incrementa o redueix el risc."
    : "Score explicable: el risc es calcula amb regles transparents sobre assistència, estudi, notes i motivació.";
}

function buildInterventionSegments(rows) {
  const segments = [
    {
      key: "low-attendance-and-study",
      label: "Assistència baixa + poques hores",
      action: "Contacte prioritari i pla d'estudi",
      test: (row) => row.Attendance < 75 && row.Hours_Studied < 15,
    },
    {
      key: "low-attendance",
      label: "Assistència baixa",
      action: "Seguiment d'assistència",
      test: (row) => row.Attendance < 75,
    },
    {
      key: "low-study",
      label: "Poques hores d'estudi",
      action: "Pla d'estudi guiat",
      test: (row) => row.Hours_Studied < 15,
    },
    {
      key: "low-performance",
      label: "Baix rendiment acadèmic",
      action: "Reforç acadèmic",
      test: (row) => row.Exam_Score < 64 || row.Previous_Scores < 68,
    },
    {
      key: "low-motivation",
      label: "Motivació baixa",
      action: "Tutoria motivacional",
      test: (row) => row.Motivation_Level === "Low",
    },
  ];

  return segments.map((segment) => {
    const matches = rows.filter(segment.test);
    return {
      key: segment.key,
      label: segment.label,
      action: segment.action,
      high: matches.filter((row) => row.riskLevel === "high").length,
      medium: matches.filter((row) => row.riskLevel === "medium").length,
      low: matches.filter((row) => row.riskLevel === "low").length,
      total: matches.length,
    };
  });
}

function renderPriorityChart() {
  const canvas = els.scatter;
  const ctx = canvas.getContext("2d");
  const segments = buildInterventionSegments(state.filtered);
  const pad = { top: 34, right: 170, bottom: 54, left: 390 };
  const width = canvas.width;
  const height = canvas.height;
  const plotWidth = width - pad.left - pad.right;
  const rowGap = 22;
  const rowHeight = 52;
  const maxTotal = Math.max(1, ...segments.map((segment) => segment.total));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawPriorityGrid(ctx, width, height, pad, maxTotal);

  segments.forEach((segment, index) => {
    const y = pad.top + index * (rowHeight + rowGap);
    const totalWidth = (segment.total / maxTotal) * plotWidth;
    let x = pad.left;

    ctx.fillStyle = "#17212b";
    ctx.font = "700 20px Segoe UI";
    ctx.fillText(segment.label, 24, y + 21);
    ctx.fillStyle = "#617080";
    ctx.font = "16px Segoe UI";
    ctx.fillText(segment.action, 24, y + 43);

    [
      ["high", segment.high],
      ["medium", segment.medium],
      ["low", segment.low],
    ].forEach(([level, count]) => {
      const sectionWidth = segment.total ? totalWidth * (count / segment.total) : 0;
      if (sectionWidth <= 0) return;
      ctx.fillStyle = riskColor(level, 0.88);
      roundRect(ctx, x, y + 4, sectionWidth, 34, 6);
      ctx.fill();
      x += sectionWidth;
    });

    ctx.fillStyle = "#17212b";
    ctx.font = "800 18px Segoe UI";
    ctx.fillText(`${formatInt(segment.total)}`, width - pad.right + 24, y + 22);
    ctx.fillStyle = "#617080";
    ctx.font = "15px Segoe UI";
    ctx.fillText("estudiants", width - pad.right + 24, y + 43);
  });

  ctx.fillStyle = "#617080";
  ctx.font = "16px Segoe UI";
  ctx.fillText("Nombre d'estudiants per segment i nivell de risc", pad.left, height - 14);
}

function drawPriorityGrid(ctx, width, height, pad, maxTotal) {
  ctx.strokeStyle = "#e7edf0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = pad.left + ((width - pad.left - pad.right) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, pad.top - 8);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = "#8a97a3";
    ctx.font = "12px Segoe UI";
    ctx.fillText(formatInt(Math.round((maxTotal * i) / 4)), x - 8, height - 30);
  }
  ctx.fillStyle = "#617080";
  ctx.font = "700 13px Segoe UI";
  ctx.fillText("Total", width - pad.right + 24, pad.top - 13);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + width, y + height - r);
  ctx.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + height);
  ctx.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}

function normalizeImpactFactor(factor) {
  const rawImpact = Number.isFinite(Number(factor.impact)) ? Number(factor.impact) : Number(factor.shap || 0);
  const riskImpact = Number.isFinite(rawImpact) ? rawImpact : 0;
  return {
    label: translateFactorLabel(factor.label || factor.feature || "Factor"),
    impact: -riskImpact,
    displayValue: factor.value === undefined ? "" : String(factor.value),
  };
}

function translateFactorLabel(label) {
  const labels = {
    Attendance: "Assistència",
    "Hours Studied": "Hores d'estudi",
    Hours_Studied: "Hores d'estudi",
    "Motivation Level Low": "Motivació baixa",
    Motivation_Level_Low: "Motivació baixa",
    "Motivation Level Medium": "Motivació mitjana",
    Motivation_Level_Medium: "Motivació mitjana",
    "Exam Score": "Nota d'examen",
    Exam_Score: "Nota d'examen",
    "Previous Scores": "Notes prèvies",
    Previous_Scores: "Notes prèvies",
    "Tutoring Sessions": "Tutories",
    Tutoring_Sessions: "Tutories",
    "Parental Involvement Low": "Implicació familiar baixa",
    Parental_Involvement_Low: "Implicació familiar baixa",
  };
  return labels[label] || label.replaceAll("_", " ");
}

function renderImpactChart(factors) {
  const normalized = factors.map(normalizeImpactFactor);
  const maxImpact = Math.max(1, ...normalized.map((factor) => Math.abs(factor.impact)));
  return `
    <p class="explain-text compact">Aquest gràfic explica la predicció individual. Les barres vermelles a l'esquerra augmenten el risc; les verdes a la dreta el redueixen.</p>
    <div class="impact-legend">
      <span class="negative-key">Incrementa el risc</span>
      <span class="positive-key">Redueix el risc</span>
    </div>
    <div class="impact-chart">
      ${normalized.map((factor) => {
        const width = Math.max(3, Math.round((Math.abs(factor.impact) / maxImpact) * 50));
        const sign = factor.impact >= 0 ? "+" : "";
        return `
          <div class="impact-row">
            <span class="impact-name">${factor.label}${factor.displayValue ? ` (${factor.displayValue})` : ""}</span>
            <div class="impact-track">
              <span class="impact-axis"></span>
              <span class="impact-bar ${factor.impact >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
            </div>
            <strong>${sign}${Math.round(factor.impact)}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDrivers() {
  const rows = state.filtered;
  const drivers = [
    ["Motivació baixa", ratio(rows, (r) => r.Motivation_Level === "Low")],
    ["Assistència < 75%", ratio(rows, (r) => r.Attendance < 75)],
    ["Hores estudi < 15", ratio(rows, (r) => r.Hours_Studied < 15)],
    ["Exam score < 64", ratio(rows, (r) => r.Exam_Score < 64)],
    ["Notes prèvies < 68", ratio(rows, (r) => r.Previous_Scores < 68)],
    ["Recursos baixos", ratio(rows, (r) => r.Access_to_Resources === "Low")],
  ].sort((a, b) => b[1] - a[1]);

  els.drivers.innerHTML = drivers.map(([label, value]) => `
    <div class="driver-row">
      <div class="driver-meta"><strong>${label}</strong><span>${Math.round(value * 100)}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(value * 100)}%"></div></div>
    </div>
  `).join("");
}

function renderInterventions() {
  const rows = state.filtered;
  const groups = [
    ["high", "Intervenció prioritària", rows.filter((r) => r.riskLevel === "high"), "Tutoria, reforç acadèmic i seguiment d'assistència."],
    ["medium", "Seguiment preventiu", rows.filter((r) => r.riskLevel === "medium"), "Revisió quinzenal, recursos i pauta d'estudi."],
    ["low", "Monitorització ordinària", rows.filter((r) => r.riskLevel === "low"), "Mantenir observació i detectar canvis de tendència."],
  ];

  els.interventions.innerHTML = groups.map(([level, title, group, text]) => `
    <article class="intervention-card ${level}">
      <p class="panel-label">${riskLabel(level)}</p>
      <h3>${title}</h3>
      <p>${formatInt(group.length)} estudiants</p>
      <span>${text}</span>
    </article>
  `).join("");
}

function renderTable() {
  const query = els.search.value.trim().toLowerCase();
  let rows = [...state.filtered];
  if (els.riskFilter.value !== "all") rows = rows.filter((row) => row.riskLevel === els.riskFilter.value);
  if (els.motivationFilter.value !== "all") rows = rows.filter((row) => row.Motivation_Level === els.motivationFilter.value);
  if (query) {
    rows = rows.filter((row) => `${row.id} ${row.Motivation_Level} ${row.Gender} ${row.Distance_from_Home}`.toLowerCase().includes(query));
  }
  rows = sortRows(rows, state.sort.key, state.sort.direction);
  els.tableCount.textContent = `${formatInt(rows.length)} resultats`;
  updateSortHeaders();
  els.table.innerHTML = rows.slice(0, 250).map((row) => `
    <tr data-id="${row.id}">
      <td>${row.id}</td>
      <td><span class="pill ${row.riskLevel}">${row.riskScore}%</span></td>
      <td>${row.Motivation_Level}</td>
      <td>${row.Attendance}%</td>
      <td>${row.Hours_Studied}</td>
      <td>${row.Exam_Score}</td>
      <td>${row.recommendedActions[0][0]}</td>
    </tr>
  `).join("");
}

function sortRows(rows, key, direction) {
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    if (typeof left === "number" && typeof right === "number") return (left - right) * dir;
    return String(left).localeCompare(String(right), "ca", { sensitivity: "base", numeric: true }) * dir;
  });
}

function sortValue(row, key) {
  if (key === "action") return row.recommendedActions[0]?.[0] || "";
  return row[key];
}

function updateSortHeaders() {
  els.sortHeaders.forEach((button) => {
    const active = button.dataset.sort === state.sort.key;
    button.classList.toggle("active", active);
    button.dataset.direction = active ? state.sort.direction : "";
  });
}

function renderDetail(row) {
  state.selected = row;
  els.detailTitle.textContent = row.id;
  els.detail.classList.remove("empty");
  els.detail.innerHTML = renderStudentExplanation(row);
}

function renderStudentExplanation(row, options = {}) {
  const title = options.title || (state.modelMode === "xgboost" && row.xgbProbability !== undefined
    ? `Probabilitat XGBoost ${(row.xgbProbability * 100).toFixed(1)}%`
    : row.dropout ? "Dropout observat al dataset" : "Sense dropout observat al dataset");
  const note = options.note || "";
  return `
    <div class="detail-score">
      <div class="score-badge" style="background:${riskColor(row.riskLevel, 1)}">${row.riskScore}%</div>
      <div>
        <p class="panel-label">${riskLabel(row.riskLevel)}</p>
        <h3>${title}</h3>
        <span>Motivació ${motivationLabel(row.Motivation_Level)}, assistència ${row.Attendance}%, ${row.Hours_Studied} hores d'estudi.</span>
      </div>
    </div>
    ${note ? `<p class="explain-text compact">${note}</p>` : ""}
    <p class="panel-label">Factors principals</p>
    ${renderImpactChart(row.riskFactors)}
    <p class="panel-label" style="margin-top:18px">Accions suggerides</p>
    <div class="action-list">
      ${row.recommendedActions.map(([title, text]) => `<div class="action-chip"><strong>${title}</strong><span>${text}</span></div>`).join("")}
    </div>
  `;
}

function renderSimulator() {
  const row = {
    Motivation_Level: els.simMotivation.value,
    Attendance: Number(els.simAttendance.value),
    Hours_Studied: Number(els.simHours.value),
    Previous_Scores: Number(els.simPrevious.value),
    Exam_Score: Number(els.simExam.value),
    Tutoring_Sessions: 0,
    Access_to_Resources: "Medium",
  };
  const risk = calculateRisk(row);
  row.riskLevel = risk.level;
  row.recommendedActions = recommendActions(row);

  els.simScore.textContent = `${risk.score}%`;
  els.simLevel.textContent = riskLabel(risk.level);
  els.simActions.innerHTML = row.recommendedActions.map(([title, text]) => `<div class="action-chip"><strong>${title}</strong><span>${text}</span></div>`).join("");
  drawGauge(risk.score, risk.level);
}

function renderNewStudent() {
  const row = evaluateNewStudent({
    id: els.newId.value.trim() || "NOU-001",
    Motivation_Level: els.newMotivation.value,
    Attendance: els.newAttendance.value,
    Hours_Studied: els.newHours.value,
    Previous_Scores: els.newPrevious.value,
    Exam_Score: els.newExam.value,
    Tutoring_Sessions: els.newTutoring.value,
    Access_to_Resources: els.newResources.value,
  });
  els.newResultTitle.textContent = row.id;
  els.newResult.innerHTML = renderStudentExplanation(row, {
    title: "Risc calculat amb score explicable",
    note: "Estimació orientativa: aquest alumne no s'afegeix al CSV ni reentrena el model, només aplica les regles transparents del dashboard.",
  });
}

function drawGauge(score, level) {
  const ctx = els.gauge.getContext("2d");
  const w = els.gauge.width;
  const h = els.gauge.height;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(w / 2, h - 34, 130, Math.PI, 0);
  ctx.strokeStyle = "#e8eef2";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h - 34, 130, Math.PI, Math.PI + Math.PI * (score / 100));
  ctx.strokeStyle = riskColor(level, 1);
  ctx.stroke();
}

async function loadData() {
  try {
    els.loading.classList.remove("hidden");
    els.error.classList.add("hidden");
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`No s'ha pogut llegir ${DATA_URL}`);
    const text = await response.text();
    state.rows = parseCsv(text);

    try {
      const predResponse = await fetch(`${PREDICTIONS_URL}?v=${Date.now()}`);
      if (predResponse.ok) {
        const predictions = parsePredictions(await predResponse.text());
        applyModelPredictions(state.rows, predictions);
        state.modelMode = "xgboost";
      } else {
        state.modelMode = "rule";
      }
    } catch {
      state.modelMode = "rule";
    }

    els.loading.classList.add("hidden");
    renderAll();
  } catch (error) {
    els.loading.classList.add("hidden");
    els.error.classList.remove("hidden");
    els.error.textContent = `${error.message}. Obre el dashboard des d'un servidor local, no directament com a fitxer.`;
  }
}

function average(rows, column) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + row[column], 0) / rows.length;
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function ratio(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("ca-ES").format(value);
}

function motivationLabel(value) {
  const labels = { Low: "baixa", Medium: "mitjana", High: "alta" };
  return labels[value] || value;
}

function sample(rows, max) {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(rows[Math.floor(i * step)]);
  return out;
}

function map(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

function riskLabel(level) {
  return level === "high" ? "Risc alt" : level === "medium" ? "Risc mitjà" : "Risc baix";
}

function riskColor(level, alpha) {
  const colors = {
    high: `rgba(201, 59, 59, ${alpha})`,
    medium: `rgba(216, 138, 19, ${alpha})`,
    low: `rgba(31, 157, 99, ${alpha})`,
  };
  return colors[level];
}

els.nav.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    els.nav.forEach((item) => item.classList.toggle("active", item === button));
    els.views.forEach((view) => view.classList.toggle("active", view.id === `${state.view}-view`));
    els.title.textContent = viewTitles[state.view];
    if (state.view === "simulator") renderSimulator();
    if (state.view === "new-student") renderNewStudent();
  });
});

els.cohort.addEventListener("change", renderAll);
els.refresh.addEventListener("click", loadData);
els.search.addEventListener("input", renderTable);
els.riskFilter.addEventListener("change", renderTable);
els.motivationFilter.addEventListener("change", renderTable);
els.sortHeaders.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    const sameColumn = state.sort.key === key;
    state.sort = {
      key,
      direction: sameColumn && state.sort.direction === "desc" ? "asc" : "desc",
    };
    renderTable();
  });
});
els.table.addEventListener("click", (event) => {
  const rowEl = event.target.closest("tr");
  if (!rowEl) return;
  const row = state.rows.find((item) => item.id === rowEl.dataset.id);
  if (row) renderDetail(row);
});

[els.simMotivation, els.simAttendance, els.simHours, els.simPrevious, els.simExam].forEach((input) => {
  input.addEventListener("input", renderSimulator);
});

[els.newId, els.newMotivation, els.newAttendance, els.newHours, els.newPrevious, els.newExam, els.newTutoring, els.newResources].forEach((input) => {
  input.addEventListener("input", renderNewStudent);
});

window.dashboardTestApi = {
  buildInterventionSegments,
  cleanCatalanText,
  evaluateNewStudent,
  explainabilitySummary,
  normalizeImpactFactor,
  sortRows,
};

loadData();
