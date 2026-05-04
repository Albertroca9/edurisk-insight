const DATA_URL = "../Data/student_preprocessed.csv";
const PREDICTIONS_URL = "data/student_predictions_xgboost_shap.csv";

const state = {
  rows: [],
  filtered: [],
  selected: null,
  view: "overview",
  modelMode: "rule",
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
};

const viewTitles = {
  overview: "Visio global del risc academic",
  students: "Llista prioritzada d'estudiants",
  simulator: "Simulador d'intervencio individual",
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
      recommendedActions: safeJson(row.recommended_actions_json, []).map((action) => [action.title, action.description]),
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
  addFactor(factors, "Motivacio baixa", row.Motivation_Level === "Low" ? 30 : row.Motivation_Level === "Medium" ? 12 : -10);
  addFactor(factors, "Poques hores d'estudi", scaleDown(row.Hours_Studied, 8, 26, 24));
  addFactor(factors, "Assistencia baixa", scaleDown(row.Attendance, 65, 90, 23));
  addFactor(factors, "Nota d'examen baixa", scaleDown(row.Exam_Score, 58, 76, 20));
  addFactor(factors, "Notes previes baixes", scaleDown(row.Previous_Scores, 55, 86, 14));
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
  if (row.Motivation_Level === "Low") actions.push(["Tutoria motivacional", "Revisio individual d'objectius i barreres de compromís."]);
  if (row.Attendance < 75) actions.push(["Seguiment d'assistencia", "Contacte preventiu i pauta setmanal de presencia a classe."]);
  if (row.Hours_Studied < 15) actions.push(["Pla d'estudi guiat", "Franges concretes d'estudi i revisio de progres cada dues setmanes."]);
  if (row.Exam_Score < 64 || row.Previous_Scores < 68) actions.push(["Reforc academic", "Sessions focalitzades en les competències amb pitjor rendiment."]);
  if (row.Access_to_Resources === "Low") actions.push(["Recursos educatius", "Prioritzar materials, espais d'estudi o suport digital."]);
  if (!actions.length) actions.push(["Seguiment ordinari", "Mantenir observacio i revisar evolucio en el proxim cicle."]);
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
  renderScatter();
  renderDrivers();
  renderInterventions();
  renderTable();
  renderSimulator();
}

function renderMetrics() {
  const rows = state.filtered;
  const observedRisk = rows.filter((row) => row.dropout === 1).length;
  const highRisk = rows.filter((row) => row.riskLevel === "high").length;
  const avgAttendance = average(rows, "Attendance");

  els.total.textContent = formatInt(rows.length);
  els.dropout.textContent = `${percent(observedRisk, rows.length)}%`;
  els.dropoutSub.textContent = `${formatInt(observedRisk)} casos observats`;
  els.highRisk.textContent = formatInt(highRisk);
  els.attendance.textContent = `${avgAttendance.toFixed(1)}%`;
  document.querySelector("#metric-high-risk + small").textContent = state.modelMode === "xgboost"
    ? "segons XGBoost + SHAP"
    : "segons score explicable";
}

function renderScatter() {
  const canvas = els.scatter;
  const ctx = canvas.getContext("2d");
  const rows = sample(state.filtered, 850);
  const pad = 42;
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height, pad);

  rows.forEach((row) => {
    const x = map(row.Attendance, 60, 100, pad, width - pad);
    const y = map(row.Hours_Studied, 1, 44, height - pad, pad);
    ctx.beginPath();
    ctx.arc(x, y, row.dropout ? 4.6 : 3.2, 0, Math.PI * 2);
    ctx.fillStyle = riskColor(row.riskLevel, row.dropout ? 0.82 : 0.42);
    ctx.fill();
  });

  ctx.fillStyle = "#617080";
  ctx.font = "18px Segoe UI";
  ctx.fillText("Assistencia", width / 2 - 42, height - 8);
  ctx.save();
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Hores d'estudi", -height / 2 - 56, 18);
  ctx.restore();
}

function drawGrid(ctx, width, height, pad) {
  ctx.strokeStyle = "#e7edf0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = pad + ((width - pad * 2) * i) / 4;
    const y = pad + ((height - pad * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, height - pad);
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
}

function renderDrivers() {
  const rows = state.filtered;
  const drivers = [
    ["Motivacio baixa", ratio(rows, (r) => r.Motivation_Level === "Low")],
    ["Assistencia < 75%", ratio(rows, (r) => r.Attendance < 75)],
    ["Hores estudi < 15", ratio(rows, (r) => r.Hours_Studied < 15)],
    ["Exam score < 64", ratio(rows, (r) => r.Exam_Score < 64)],
    ["Notes previes < 68", ratio(rows, (r) => r.Previous_Scores < 68)],
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
    ["high", "Intervencio prioritaria", rows.filter((r) => r.riskLevel === "high"), "Tutoria, reforc academic i seguiment d'assistencia."],
    ["medium", "Seguiment preventiu", rows.filter((r) => r.riskLevel === "medium"), "Revisio quinzenal, recursos i pauta d'estudi."],
    ["low", "Monitoritzacio ordinaria", rows.filter((r) => r.riskLevel === "low"), "Mantenir observacio i detectar canvis de tendencia."],
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
  rows.sort((a, b) => b.riskScore - a.riskScore);
  els.tableCount.textContent = `${formatInt(rows.length)} resultats`;
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

function renderDetail(row) {
  state.selected = row;
  els.detailTitle.textContent = row.id;
  els.detail.classList.remove("empty");
  els.detail.innerHTML = `
    <div class="detail-score">
      <div class="score-badge" style="background:${riskColor(row.riskLevel, 1)}">${row.riskScore}%</div>
      <div>
        <p class="panel-label">${riskLabel(row.riskLevel)}</p>
        <h3>${state.modelMode === "xgboost" ? `Probabilitat XGBoost ${(row.xgbProbability * 100).toFixed(1)}%` : row.dropout ? "Dropout observat al dataset" : "Sense dropout observat al dataset"}</h3>
        <span>Motivacio ${row.Motivation_Level}, assistencia ${row.Attendance}%, ${row.Hours_Studied} hores d'estudi.</span>
      </div>
    </div>
    <p class="panel-label">Factors principals</p>
    <div class="factor-list">
      ${row.riskFactors.map((factor) => `<div class="factor-item"><span>${factor.label}</span><strong>${factor.impact > 0 ? "+" : ""}${factor.impact}</strong></div>`).join("")}
    </div>
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
  return level === "high" ? "Risc alt" : level === "medium" ? "Risc mitja" : "Risc baix";
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
  });
});

els.cohort.addEventListener("change", renderAll);
els.refresh.addEventListener("click", loadData);
els.search.addEventListener("input", renderTable);
els.riskFilter.addEventListener("change", renderTable);
els.motivationFilter.addEventListener("change", renderTable);
els.table.addEventListener("click", (event) => {
  const rowEl = event.target.closest("tr");
  if (!rowEl) return;
  const row = state.rows.find((item) => item.id === rowEl.dataset.id);
  if (row) renderDetail(row);
});

[els.simMotivation, els.simAttendance, els.simHours, els.simPrevious, els.simExam].forEach((input) => {
  input.addEventListener("input", renderSimulator);
});

loadData();
