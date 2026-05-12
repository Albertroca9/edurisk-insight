const DATA_URL = "../Data/student_preprocessed.csv";
const PREDICTIONS_URL = "data/student_predictions_xgboost_shap.csv";
const STUDENT_PROFILES_URL = "data/student_profiles.csv";

const state = {
  rows: [],
  filtered: [],
  selected: null,
  simulationSource: null,
  currentSimulation: null,
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
  simControls: document.querySelector(".sim-controls"),
  simResultPanel: document.querySelector(".sim-result-panel"),
  simMotivation: document.querySelector("#sim-motivation"),
  simAttendance: document.querySelector("#sim-attendance"),
  simHours: document.querySelector("#sim-hours"),
  simPrevious: document.querySelector("#sim-previous"),
  simExam: document.querySelector("#sim-exam"),
  simTutoring: document.querySelector("#sim-tutoring"),
  simResources: document.querySelector("#sim-resources"),
  simValues: document.querySelector("#sim-values"),
  simSource: document.querySelector("#sim-source"),
  simComparison: document.querySelector("#sim-comparison"),
  exportSimReport: document.querySelector("#export-sim-report"),
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

function defaultStudentProfile() {
  return {
    id: "",
    profileId: "",
    name: "Perfil d'alumne no classificat",
    summary: "No hi ha perfil precalculat disponible per aquest alumne.",
    characteristics: ["Sense perfil de cluster disponible"],
    recommendation: "Revisar els factors individuals i les accions recomanades.",
  };
}

function parseStudentProfiles(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines.shift());
  const profiles = new Map();

  lines.forEach((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = cleanCatalanText(values[i] ?? "");
    });
    profiles.set(row.id, {
      id: row.id,
      profileId: row.profile_id,
      name: row.profile_name || `Perfil d'alumne ${row.profile_id}`,
      summary: row.profile_summary,
      characteristics: (row.profile_characteristics || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
      recommendation: row.profile_recommendation,
    });
  });

  return profiles;
}

function applyStudentProfiles(rows, profiles) {
  rows.forEach((row) => {
    row.studentProfile = profiles.get(row.id) || defaultStudentProfile();
  });
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanCatalanText(value) {
  return String(value)
    .replaceAll("compromÃ­s", "compromís")
    .replaceAll("competÃ¨ncies", "competències")
    .replaceAll("Revisio", "Revisió")
    .replaceAll("revisio", "revisió")
    .replace(/\bMotivacio\b/g, "Motivació")
    .replace(/\bmotivacio\b/g, "motivació")
    .replaceAll("Assistencia", "Assistència")
    .replaceAll("assistencia", "assistència")
    .replaceAll("presencia", "presència")
    .replace(/\bprogres\b/g, "progrés")
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

function buildInterventionTimeline(row) {
  const previousScores = Number.isFinite(Number(row.Previous_Scores)) ? Number(row.Previous_Scores) : Number(row.Exam_Score || 0);
  const steps = [
    { label: "Setmana 0", progress: 0 },
    { label: "Setmana 4", progress: 0.45 },
    { label: "Setmana 8", progress: 1 },
  ];

  return steps.map((step) => {
    const simulated = {
      ...row,
      Attendance: Math.min(100, Math.round(row.Attendance + 12 * step.progress)),
      Hours_Studied: Math.round(row.Hours_Studied + 7 * step.progress),
      Previous_Scores: Math.min(100, Math.round(previousScores + 4 * step.progress)),
      Exam_Score: Math.min(100, Math.round(row.Exam_Score + 7 * step.progress)),
      Tutoring_Sessions: Math.min(10, Math.round((row.Tutoring_Sessions || 0) + 2 * step.progress)),
      Access_to_Resources: step.progress >= 1 && row.Access_to_Resources === "Low" ? "Medium" : row.Access_to_Resources,
      Motivation_Level: step.progress >= 1 && row.Motivation_Level === "Low" ? "Medium" : row.Motivation_Level,
    };
    const risk = calculateRisk(simulated);
    const projectedScore = Math.max(0, Math.round(row.riskScore - 26 * step.progress));
    const riskScore = step.progress === 0 ? row.riskScore : Math.min(risk.score, projectedScore);
    const riskLevel = riskScore >= 65 ? "high" : riskScore >= 38 ? "medium" : "low";
    return {
      label: step.label,
      action: row.recommendedActions?.[0]?.[0] || "Intervenció recomanada",
      riskScore,
      riskLevel,
      Attendance: simulated.Attendance,
      Hours_Studied: simulated.Hours_Studied,
      Exam_Score: simulated.Exam_Score,
      Motivation_Level: simulated.Motivation_Level,
    };
  });
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

    ctx.fillStyle = "#25343c";
    ctx.font = "700 20px Segoe UI";
    ctx.fillText(segment.label, 24, y + 21);
    ctx.fillStyle = "#61757c";
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

    ctx.fillStyle = "#25343c";
    ctx.font = "800 18px Segoe UI";
    ctx.fillText(`${formatInt(segment.total)}`, width - pad.right + 24, y + 22);
    ctx.fillStyle = "#61757c";
    ctx.font = "15px Segoe UI";
    ctx.fillText("estudiants", width - pad.right + 24, y + 43);
  });

  ctx.fillStyle = "#61757c";
  ctx.font = "16px Segoe UI";
  ctx.fillText("Nombre d'estudiants per segment i nivell de risc", pad.left, height - 14);
}

function drawPriorityGrid(ctx, width, height, pad, maxTotal) {
  ctx.strokeStyle = "#d9e8e5";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = pad.left + ((width - pad.left - pad.right) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, pad.top - 8);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = "#90a7ac";
    ctx.font = "12px Segoe UI";
    ctx.fillText(formatInt(Math.round((maxTotal * i) / 4)), x - 8, height - 30);
  }
  ctx.fillStyle = "#61757c";
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
    rows = rows.filter((row) => `${row.id} ${row.studentProfile?.name || ""} ${row.Motivation_Level} ${row.Gender} ${row.Distance_from_Home}`.toLowerCase().includes(query));
  }
  rows = sortRows(rows, state.sort.key, state.sort.direction);
  els.tableCount.textContent = `${formatInt(rows.length)} resultats`;
  updateSortHeaders();
  els.table.innerHTML = rows.slice(0, 250).map((row) => `
    <tr data-id="${row.id}">
      <td>${row.id}</td>
      <td><span class="pill ${row.riskLevel}">${row.riskScore}%</span></td>
      <td>${escapeHtml(row.studentProfile?.name || defaultStudentProfile().name)}</td>
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
  if (key === "profile") return row.studentProfile?.name || "";
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
  const decisionTools = options.hideDecisionTools ? "" : `
    <div class="decision-tools">
      <button class="text-button" type="button" data-simulate-id="${escapeHtml(row.id)}">Simular aquest alumne</button>
      <button class="text-button secondary" type="button" data-export-id="${escapeHtml(row.id)}">Exportar informe</button>
    </div>
  `;
  return `
    <div class="detail-score">
      <div class="score-badge" style="background:${riskColor(row.riskLevel, 1)}">${row.riskScore}%</div>
      <div>
        <p class="panel-label">${riskLabel(row.riskLevel)}</p>
        <h3>${title}</h3>
        <span>Motivació ${motivationLabel(row.Motivation_Level)}, assistència ${row.Attendance}%, ${row.Hours_Studied} hores d'estudi.</span>
      </div>
    </div>
    ${decisionTools}
    ${note ? `<p class="explain-text compact">${note}</p>` : ""}
    <p class="panel-label">Factors principals</p>
    ${renderImpactChart(row.riskFactors)}
    ${renderStudentProfile(row)}
    ${renderInterventionTimeline(row)}
    <p class="panel-label" style="margin-top:18px">Accions suggerides</p>
    <div class="action-list">
      ${row.recommendedActions.map(([title, text]) => `<div class="action-chip"><strong>${title}</strong><span>${text}</span></div>`).join("")}
    </div>
  `;
}

function renderStudentProfile(row) {
  const profile = row.studentProfile || defaultStudentProfile();
  return `
    <section class="profile-card">
      <p class="panel-label">Perfil del clustering</p>
      <h3>${escapeHtml(profile.name)}</h3>
      <p>${escapeHtml(profile.summary)}</p>
      <div class="profile-tags">
        ${profile.characteristics.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <strong>${escapeHtml(profile.recommendation)}</strong>
    </section>
  `;
}

function renderInterventionTimeline(row) {
  const timeline = buildInterventionTimeline(row);
  const maxRisk = Math.max(1, ...timeline.map((item) => item.riskScore));
  return `
    <section class="timeline-card">
      <p class="panel-label">Evoluci&oacute; de la intervenci&oacute;</p>
      <h3>Impacte progressiu estimat</h3>
      <p class="explain-text compact">Escenari simulat: l'impacte de la intervenci&oacute; es reparteix progressivament en el temps i no modifica el dataset original.</p>
      <div class="timeline-list">
        ${timeline.map((item) => `
          <div class="timeline-step">
            <div>
              <strong>${item.label}</strong>
              <span>${escapeHtml(item.action)}</span>
            </div>
            <div class="timeline-meter">
              <span class="timeline-fill ${item.riskLevel}" style="width:${Math.round((item.riskScore / maxRisk) * 100)}%"></span>
            </div>
            <b>${item.riskScore}%</b>
            <small>Assist. ${item.Attendance}% &middot; ${item.Hours_Studied}h &middot; Exam ${item.Exam_Score} &middot; motivaci&oacute; ${motivationLabel(item.Motivation_Level)}</small>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function ensureSimulationUi() {
  if (!document.querySelector("#sim-tutoring") && els.simControls) {
    els.simControls.insertAdjacentHTML("beforeend", `
      <label><span>Tutories</span><input id="sim-tutoring" type="range" min="0" max="10" value="0" /></label>
      <label><span>Recursos</span><select id="sim-resources"><option>Low</option><option selected>Medium</option><option>High</option></select></label>
    `);
  }
  if (!document.querySelector("#sim-values") && els.simControls) {
    els.simControls.insertAdjacentHTML("afterend", `<div id="sim-values" class="sim-value-grid"></div>`);
  }
  if (!document.querySelector("#sim-source") && els.simResultPanel) {
    els.simResultPanel.insertAdjacentHTML("afterbegin", `
      <div class="panel-head sim-result-head">
        <div>
          <p class="panel-label">Resultat estimat</p>
          <h3 id="sim-source">Cas manual</h3>
        </div>
        <button id="export-sim-report" class="text-button" type="button">Exportar informe</button>
      </div>
    `);
    if (els.simResultPanel.children) {
      [...els.simResultPanel.children]
        .filter((child) => child.matches?.(".panel-label"))
        .forEach((child) => child.remove());
    }
  }
  if (!document.querySelector("#sim-comparison") && els.simActions) {
    els.simActions.insertAdjacentHTML("beforebegin", `<div id="sim-comparison" class="simulation-summary"></div>`);
  }
  els.simTutoring = document.querySelector("#sim-tutoring");
  els.simResources = document.querySelector("#sim-resources");
  els.simValues = document.querySelector("#sim-values");
  els.simSource = document.querySelector("#sim-source");
  els.simComparison = document.querySelector("#sim-comparison");
  els.exportSimReport = document.querySelector("#export-sim-report");
}

function simulationValuesFromControls() {
  return {
    Motivation_Level: els.simMotivation.value,
    Attendance: Number(els.simAttendance.value),
    Hours_Studied: Number(els.simHours.value),
    Previous_Scores: Number(els.simPrevious.value),
    Exam_Score: Number(els.simExam.value),
    Tutoring_Sessions: Number(els.simTutoring?.value || 0),
    Access_to_Resources: els.simResources?.value || "Medium",
  };
}

function valuesFromStudent(row) {
  return {
    Motivation_Level: row.Motivation_Level,
    Attendance: Number(row.Attendance),
    Hours_Studied: Number(row.Hours_Studied),
    Previous_Scores: Number(row.Previous_Scores),
    Exam_Score: Number(row.Exam_Score),
    Tutoring_Sessions: Number(row.Tutoring_Sessions || 0),
    Access_to_Resources: row.Access_to_Resources || "Medium",
  };
}

function setSimulationControlsFromRow(row) {
  ensureSimulationUi();
  const values = valuesFromStudent(row);
  els.simMotivation.value = values.Motivation_Level;
  els.simAttendance.value = values.Attendance;
  els.simHours.value = values.Hours_Studied;
  els.simPrevious.value = values.Previous_Scores;
  els.simExam.value = values.Exam_Score;
  if (els.simTutoring) els.simTutoring.value = values.Tutoring_Sessions;
  if (els.simResources) els.simResources.value = values.Access_to_Resources;
}

function buildSimulationCase(values, source = null) {
  const simulated = {
    id: source?.id || "SIM-MANUAL",
    ...values,
  };
  const simulatedRisk = calculateRisk(simulated);
  simulated.riskScore = simulatedRisk.score;
  simulated.riskLevel = simulatedRisk.level;
  simulated.riskFactors = simulatedRisk.factors;
  simulated.recommendedActions = recommendActions(simulated);

  let original = null;
  if (source) {
    const originalRisk = source.riskScore === undefined ? calculateRisk(source) : null;
    original = {
      id: source.id,
      ...valuesFromStudent(source),
      riskScore: source.riskScore ?? originalRisk.score,
      riskLevel: source.riskLevel ?? originalRisk.level,
    };
  }

  return {
    id: simulated.id,
    original,
    simulated,
    delta: original ? simulated.riskScore - original.riskScore : null,
  };
}

function reportValueRows(values) {
  return [
    ["Motivaci&oacute;", values.Motivation_Level],
    ["Assist&egrave;ncia", `${values.Attendance}%`],
    ["Hores d'estudi", `${values.Hours_Studied} h`],
    ["Nota pr&egrave;via", values.Previous_Scores],
    ["Nota examen", values.Exam_Score],
    ["Tutories", values.Tutoring_Sessions],
    ["Recursos", values.Access_to_Resources],
  ];
}

function buildCaseReport(simulationCase) {
  const originalRows = simulationCase.original ? reportValueRows(simulationCase.original) : [];
  const simulatedRows = reportValueRows(simulationCase.simulated);
  const delta = simulationCase.delta;
  const deltaText = delta === null ? "Cas manual sense alumne d'origen" : delta === 0 ? "0 punts" : `${delta > 0 ? "+" : ""}${delta} punts`;
  const actionItems = simulationCase.simulated.recommendedActions
    .map(([title, text]) => `<li><strong>${escapeHtml(title)}</strong><br>${escapeHtml(text)}</li>`)
    .join("");
  const rowHtml = (rows) => rows.map(([label, value]) => `
    <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>
  `).join("");

  return `<!doctype html>
<html lang="ca">
  <head>
    <meta charset="utf-8">
    <title>Informe IDSS ${escapeHtml(simulationCase.id)}</title>
    <style>
      body { margin: 32px; color: #25343c; font-family: Segoe UI, Arial, sans-serif; line-height: 1.45; }
      h1, h2 { margin-bottom: 8px; }
      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
      .box { border: 1px solid #d9e8e5; border-radius: 8px; padding: 14px; background: #f7faf9; }
      .box span { display: block; color: #61757c; font-size: 0.88rem; font-weight: 700; text-transform: uppercase; }
      .box strong { display: block; margin-top: 6px; font-size: 1.7rem; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0 22px; }
      th, td { border-bottom: 1px solid #d9e8e5; padding: 9px; text-align: left; }
      th { width: 38%; color: #61757c; }
      li { margin-bottom: 12px; }
      .note { color: #61757c; }
    </style>
  </head>
  <body>
    <h1>Informe IDSS d'intervenci&oacute;</h1>
    <p class="note">Alumne: <strong>${escapeHtml(simulationCase.id)}</strong>. Informe generat des del simulador what-if del dashboard.</p>
    <section class="summary">
      <div class="box"><span>Risc original</span><strong>${simulationCase.original ? `${simulationCase.original.riskScore}%` : "-"}</strong></div>
      <div class="box"><span>Risc simulat</span><strong>${simulationCase.simulated.riskScore}%</strong></div>
      <div class="box"><span>Difer&egrave;ncia</span><strong>${escapeHtml(deltaText)}</strong></div>
    </section>
    ${simulationCase.original ? `<h2>Valors originals</h2><table>${rowHtml(originalRows)}</table>` : ""}
    <h2>Valors simulats</h2>
    <table>${rowHtml(simulatedRows)}</table>
    <h2>Accions recomanades</h2>
    <ol>${actionItems}</ol>
  </body>
</html>`;
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "cas";
}

function downloadCaseReport(simulationCase) {
  const html = buildCaseReport(simulationCase);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `informe-idss-${safeFileName(simulationCase.id)}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadStudentIntoSimulator(row) {
  state.simulationSource = row;
  setSimulationControlsFromRow(row);
  setView("simulator");
  renderSimulator();
}

function updateSimulationValueReadout(values) {
  if (!els.simValues) return;
  els.simValues.innerHTML = `
    <span><strong>Assist&egrave;ncia</strong>${values.Attendance}%</span>
    <span><strong>Hores</strong>${values.Hours_Studied} h</span>
    <span><strong>Nota pr&egrave;via</strong>${values.Previous_Scores}</span>
    <span><strong>Examen</strong>${values.Exam_Score}</span>
    <span><strong>Tutories</strong>${values.Tutoring_Sessions}</span>
    <span><strong>Recursos</strong>${values.Access_to_Resources}</span>
  `;
}

function renderSimulationComparison(simulationCase) {
  if (!els.simComparison) return;
  if (!simulationCase.original) {
    els.simComparison.innerHTML = `
      <div class="decision-note">
        Ajusta els valors per estimar el risc i obtenir accions recomanades. Carrega un alumne des de la llista per comparar risc original i risc simulat.
      </div>
    `;
    return;
  }
  const delta = simulationCase.delta;
  const deltaLabel = delta === 0 ? "sense canvi" : `${delta > 0 ? "+" : ""}${delta} punts`;
  els.simComparison.innerHTML = `
    <div class="comparison-grid">
      <div><span>Risc original</span><strong>${simulationCase.original.riskScore}%</strong><small>${riskLabel(simulationCase.original.riskLevel)}</small></div>
      <div><span>Risc simulat</span><strong>${simulationCase.simulated.riskScore}%</strong><small>${riskLabel(simulationCase.simulated.riskLevel)}</small></div>
      <div><span>Difer&egrave;ncia</span><strong>${deltaLabel}</strong><small>${delta < 0 ? "reducci&oacute; estimada" : delta > 0 ? "increment estimat" : "mateix nivell"}</small></div>
    </div>
  `;
}

function renderSimulator() {
  ensureSimulationUi();
  const values = simulationValuesFromControls();
  const simulationCase = buildSimulationCase(values, state.simulationSource);
  state.currentSimulation = simulationCase;

  updateSimulationValueReadout(values);
  els.simSource.textContent = simulationCase.original ? `Alumne ${simulationCase.id}` : "Cas manual";
  els.simScore.textContent = `${simulationCase.simulated.riskScore}%`;
  els.simLevel.textContent = riskLabel(simulationCase.simulated.riskLevel);
  renderSimulationComparison(simulationCase);
  els.simActions.innerHTML = simulationCase.simulated.recommendedActions.map(([title, text]) => `<div class="action-chip"><strong>${title}</strong><span>${text}</span></div>`).join("");
  drawGauge(simulationCase.simulated.riskScore, simulationCase.simulated.riskLevel);
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
    hideDecisionTools: true,
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
  ctx.strokeStyle = "#e9f2f0";
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

    try {
      const profileResponse = await fetch(`${STUDENT_PROFILES_URL}?v=${Date.now()}`);
      if (profileResponse.ok) {
        applyStudentProfiles(state.rows, parseStudentProfiles(await profileResponse.text()));
      } else {
        applyStudentProfiles(state.rows, new Map());
      }
    } catch {
      applyStudentProfiles(state.rows, new Map());
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
    high: `rgba(231, 134, 128, ${alpha})`,
    medium: `rgba(233, 185, 87, ${alpha})`,
    low: `rgba(124, 200, 145, ${alpha})`,
  };
  return colors[level];
}

function setView(view) {
  state.view = view;
  els.nav.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  els.views.forEach((item) => item.classList.toggle("active", item.id === `${view}-view`));
  els.title.textContent = viewTitles[view];
  if (view === "simulator") renderSimulator();
  if (view === "new-student") renderNewStudent();
}

ensureSimulationUi();

els.nav.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
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

els.detail.addEventListener("click", (event) => {
  const simulateButton = event.target.closest("[data-simulate-id]");
  const exportButton = event.target.closest("[data-export-id]");
  const id = simulateButton?.dataset.simulateId || exportButton?.dataset.exportId;
  if (!id) return;
  const row = state.rows.find((item) => item.id === id);
  if (!row) return;
  if (simulateButton) loadStudentIntoSimulator(row);
  if (exportButton) downloadCaseReport(buildSimulationCase(valuesFromStudent(row), row));
});

[els.simMotivation, els.simAttendance, els.simHours, els.simPrevious, els.simExam, els.simTutoring, els.simResources].filter(Boolean).forEach((input) => {
  input.addEventListener("input", renderSimulator);
});

if (els.exportSimReport) {
  els.exportSimReport.addEventListener("click", () => {
    renderSimulator();
    downloadCaseReport(state.currentSimulation);
  });
}

[els.newId, els.newMotivation, els.newAttendance, els.newHours, els.newPrevious, els.newExam, els.newTutoring, els.newResources].forEach((input) => {
  input.addEventListener("input", renderNewStudent);
});

window.dashboardTestApi = {
  buildCaseReport,
  buildInterventionSegments,
  buildInterventionTimeline,
  buildSimulationCase,
  cleanCatalanText,
  evaluateNewStudent,
  explainabilitySummary,
  applyStudentProfiles,
  normalizeImpactFactor,
  parseStudentProfiles,
  sortRows,
};

loadData();
