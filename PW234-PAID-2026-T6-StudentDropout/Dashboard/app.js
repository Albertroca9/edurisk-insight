const DATA_URL = "../Data/student_preprocessed.csv";
const PREDICTIONS_URL = "data/student_predictions_xgboost_shap.csv";
const VALIDATION_DATA_URL = "../Data/validation_final.csv";
const VALIDATION_PREDICTIONS_URL = "data/validation_predictions_xgboost_shap.csv";
const STUDENT_PROFILES_URL = "data/student_profiles.csv";
const VALIDATION_PROFILES_URL = "data/validation_profiles.csv";
const STUDENT_PROFILE_MODEL_URL = "data/student_profile_model.json";

const simulatorRangeConfig = {
  Attendance: { min: 0, max: 100 },
  Previous_Scores: { min: 0, max: 100 },
  Exam_Score: { min: 0, max: 100 },
};

const state = {
  rows: [],
  validationRows: [],
  filtered: [],
  validationFiltered: [],
  selected: null,
  selectedValidation: null,
  profileModel: null,
  simulationSource: null,
  currentSimulation: null,
  view: "overview",
  modelMode: "rule",
  sort: { key: "riskScore", direction: "desc" },
  editingActions: new Set(),
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
  reviewBadge: document.querySelector("#student-review-badge"),
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
  validationSearch: document.querySelector("#validation-search"),
  validationRiskFilter: document.querySelector("#validation-risk-filter"),
  validationMotivationFilter: document.querySelector("#validation-motivation-filter"),
  validationTable: document.querySelector("#validation-table"),
  validationSortHeaders: document.querySelectorAll(".validation-sort-header"),
  validationTableCount: document.querySelector("#validation-table-count"),
  validationDetailTitle: document.querySelector("#validation-detail-title"),
  validationDetail: document.querySelector("#validation-detail"),
};

const viewTitles = {
  overview: "Visió global del risc acadèmic",
  students: "Llista prioritzada d'estudiants",
  simulator: "Simulador d'intervenció individual",
  "new-student": "Avaluació d'un alumne nou",
  validation: "Validació del sistema",
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

const actionStore = window.ActionStore || {
  getStudentAction: () => null,
  saveStudentAction: () => null,
  getAllPendingReviews: () => [],
  markAsReviewed: () => null,
};

function parseCsv(text, options = {}) {
  const idPrefix = options.idPrefix || "STU";
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines.shift());
  return lines.map((line, index) => {
    const values = splitCsvLine(line);
    const row = { id: `${idPrefix}-${String(index + 1).padStart(4, "0")}` };
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
    characteristics: ["Sense perfil de seguiment disponible"],
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

function profileFromModelEntry(entry) {
  if (!entry) return defaultStudentProfile();
  return {
    id: "",
    profileId: String(entry.profile_id || ""),
    name: entry.profile_name || `Perfil d'alumne ${entry.profile_id}`,
    summary: entry.profile_summary || "",
    characteristics: entry.profile_characteristics || [],
    recommendation: entry.profile_recommendation || "",
  };
}

function estimateStudentProfile(row, profileModel = state.profileModel) {
  if (!profileModel) return defaultStudentProfile();
  let bestProfileId = "";
  let bestDistance = Infinity;
  profileModel.columns.forEach((column) => {
    if (profileModel.stds[column] === 0) profileModel.stds[column] = 1;
  });
  Object.entries(profileModel.centroids).forEach(([profileId, centroid]) => {
    const distance = profileModel.columns.reduce((sum, column) => {
      const value = Number(row[column] ?? 0);
      const scaled = (value - Number(profileModel.means[column] || 0)) / Number(profileModel.stds[column] || 1);
      const diff = scaled - Number(centroid[column] || 0);
      return sum + diff * diff;
    }, 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProfileId = profileId;
    }
  });
  return profileFromModelEntry(profileModel.profiles[bestProfileId]);
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenIso(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function studentProfileLabel(profile) {
  const raw = String(profile?.profileId || profile?.name || "");
  const match = raw.match(/[1-4]/);
  return match ? `Perfil d'alumne ${match[0]}` : "Perfil d'alumne no classificat";
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

function clientFacingText(value) {
  return cleanCatalanText(value)
    .replace(/XGBoost\s*\+\s*SHAP/gi, "Predicció del sistema")
    .replace(/Probabilitat\s+XGBoost/gi, "Predicció del sistema")
    .replace(/XGBoost/gi, "predicció del sistema")
    .replace(/SHAP/gi, "factors")
    .replace(/Score explicable/gi, "Criteri transparent")
    .replace(/score explicable/gi, "criteri transparent")
    .replace(/Dropout observat al dataset/gi, "Abandonament observat")
    .replace(/dropout observat al dataset/gi, "abandonament observat")
    .replace(/dropout/gi, "abandonament")
    .replace(/dataset/gi, "dades");
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
  addFactor(factors, "Nota d'examen baixa", scaleDown(row.Exam_Score, 47, 76, 20));
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
  if (row.Exam_Score < 60 || row.Previous_Scores < 68) actions.push(["Reforç acadèmic", "Sessions focalitzades en les competències amb pitjor rendiment."]);
  if (row.Access_to_Resources === "Low") actions.push(["Recursos educatius", "Prioritzar materials, espais d'estudi o suport digital."]);
  if (!actions.length) actions.push(["Seguiment ordinari", "Mantenir observació i revisar evolució en el pròxim cicle."]);
  return actions.slice(0, 4);
}

function buildInterventionTimeline(row) {
  const previousScores = Number.isFinite(Number(row.Previous_Scores)) ? Number(row.Previous_Scores) : Number(row.Exam_Score || 0);
  const primaryAction = row.recommendedActions?.[0]?.[0] || "Intervenció recomanada";
  const primaryActionText = row.recommendedActions?.[0]?.[1] || "Aplicar el seguiment proposat i revisar indicadors acadèmics.";
  const steps = [
    {
      label: "Ara",
      progress: 0,
      action: "Situació inicial",
      objective: "Punt de partida amb les dades actuals de l'alumne.",
      assumption: "Sense canvis aplicats.",
      riskLabel: "Risc actual",
    },
    {
      label: "Acció inicial",
      progress: 0.2,
      action: primaryAction,
      objective: primaryActionText,
      assumption: "Primer contacte i acord de seguiment.",
      riskLabel: "Risc estimat si s'inicia la intervenció",
    },
    {
      label: "Revisió en 4 setmanes",
      progress: 0.55,
      action: "Revisar assistència, estudi i bloquejos",
      objective: "Comprovar si hi ha millora sostinguda abans d'esperar al final del període.",
      assumption: "+7 punts d'assistència, +4 h d'estudi i primeres tutories registrades.",
      riskLabel: "Risc estimat si milloren els indicadors",
    },
    {
      label: "Objectiu a 8 setmanes",
      progress: 1,
      action: "Consolidar hàbits i ajustar suport",
      objective: "Arribar a una situació de seguiment preventiu o monitorització ordinària.",
      assumption: "+12 punts d'assistència, +7 h d'estudi, +7 punts d'examen i motivació revisada.",
      riskLabel: "Risc estimat si milloren els indicadors",
    },
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
      action: step.action,
      objective: step.objective,
      assumption: step.assumption,
      riskLabel: step.riskLabel,
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
  state.validationFiltered = [...state.validationRows];
  renderMetrics();
  renderPriorityChart();
  renderDrivers();
  updateReviewBadge();
  renderInterventions();
  renderTable();
  renderValidationTable();
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
  row.studentProfile = estimateStudentProfile(row);
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
  els.attendance.textContent = state.modelMode === "model" ? "Factors" : "Regles";
  document.querySelector(".metric.explain small").textContent = explainabilitySummary(state.modelMode);
  document.querySelector("#metric-high-risk + small").textContent = state.modelMode === "model"
    ? "segons predicció del sistema"
    : "segons criteri transparent";
}

function explainabilitySummary(modelMode) {
  return modelMode === "model" || modelMode === "xgboost"
    ? "Predicció del sistema: cada resultat inclou factors que indiquen què incrementa o redueix el risc."
    : "Criteri transparent: el risc es calcula amb regles sobre assistència, estudi, notes i motivació.";
}

function buildInterventionSegments(rows) {
  const segments = [
    {
      key: "low-attendance-and-study",
      label: "Assistència baixa + poques hores",
      action: "Intervenció: contacte prioritari i pla d'estudi",
      help: "Grup d'alumnes amb assistència baixa i dedicació d'estudi insuficient.",
      test: (row) => row.Attendance < 75 && row.Hours_Studied < 15,
    },
    {
      key: "low-attendance",
      label: "Assistència baixa",
      action: "Intervenció: seguiment d'assistència",
      help: "Grup d'alumnes que poden necessitar contacte preventiu per presència irregular.",
      test: (row) => row.Attendance < 75,
    },
    {
      key: "low-study",
      label: "Poques hores d'estudi",
      action: "Intervenció: pla d'estudi guiat",
      help: "Grup d'alumnes amb dedicació setmanal inferior al llindar recomanat.",
      test: (row) => row.Hours_Studied < 15,
    },
    {
      key: "low-performance",
      label: "Baix rendiment acadèmic",
      action: "Intervenció: reforç acadèmic",
      help: "Grup d'alumnes amb notes actuals o prèvies que apunten a dificultats acadèmiques.",
      test: (row) => row.Exam_Score < 60 || row.Previous_Scores < 68,
    },
    {
      key: "low-motivation",
      label: "Motivació baixa",
      action: "Intervenció: tutoria motivacional",
      help: "Grup d'alumnes on la motivació declarada pot afectar la continuïtat.",
      test: (row) => row.Motivation_Level === "Low",
    },
  ];

  return segments.map((segment) => {
    const matches = rows.filter(segment.test);
    return {
      key: segment.key,
      label: segment.label,
      action: segment.action,
      help: segment.help,
      high: matches.filter((row) => row.riskLevel === "high").length,
      medium: matches.filter((row) => row.riskLevel === "medium").length,
      low: matches.filter((row) => row.riskLevel === "low").length,
      total: matches.length,
    };
  });
}

const officialClusterProfiles = {
  1: "Perfil favorable i relativament homogeni",
  2: "Perfil de risc alt i homogeni",
  3: "Perfil intermig amb factors de risc",
  4: "Perfil intermig amb debilitats estructurals",
};

function clusterProfileId(row) {
  const profile = row.studentProfile || {};
  const rawId = profile.profileId || profile.profile_id || row.profileId || row.profile_id || "";
  return String(rawId).trim();
}

function buildClusterRiskMatrix(rows) {
  const matrix = Object.entries(officialClusterProfiles).map(([profileId, name]) => ({
    profileId,
    name,
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
  }));
  const byProfile = new Map(matrix.map((row) => [row.profileId, row]));

  rows.forEach((row) => {
    const profileId = clusterProfileId(row);
    const target = byProfile.get(profileId);
    if (!target || !["high", "medium", "low"].includes(row.riskLevel)) return;
    target[row.riskLevel] += 1;
    target.total += 1;
  });

  return matrix;
}

function buildProfileActionMatrix(rows) {
  const matrix = Object.entries(officialClusterProfiles).map(([profileId, name]) => ({
    profileId,
    name,
    priority: 0,
    preventive: 0,
    monitoring: 0,
    total: 0,
  }));
  const byProfile = new Map(matrix.map((row) => [row.profileId, row]));

  rows.forEach((row) => {
    const target = byProfile.get(clusterProfileId(row));
    if (!target) return;
    if (row.riskLevel === "high") target.priority += 1;
    else if (row.riskLevel === "medium") target.preventive += 1;
    else if (row.riskLevel === "low") target.monitoring += 1;
    else return;
    target.total += 1;
  });

  return matrix;
}

function buildRecommendedActionRows(rows) {
  const byAction = new Map();
  rows.forEach((row) => {
    const seen = new Set();
    (row.recommendedActions || []).forEach(([title]) => {
      const label = clientFacingText(title || "").trim();
      if (!label || seen.has(label)) return;
      seen.add(label);
      if (!byAction.has(label)) {
        byAction.set(label, { label, count: 0, high: 0, medium: 0, low: 0 });
      }
      const item = byAction.get(label);
      item.count += 1;
      if (["high", "medium", "low"].includes(row.riskLevel)) item[row.riskLevel] += 1;
    });
  });

  return [...byAction.values()]
    .map((item) => ({ ...item, percent: percent(item.count, rows.length) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function enrichAgendaAction(action, rowsById) {
  const row = rowsById.get(action.studentId);
  return {
    ...action,
    row,
    riskLevel: row?.riskLevel || "medium",
    riskScore: row?.riskScore ?? "",
  };
}

function buildAgendaSummary(actions, rows, today = todayIso()) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const pending = actions
    .filter((action) => action.reviewDate && action.status !== "tancat")
    .map((action) => enrichAgendaAction(action, rowsById))
    .sort((a, b) => String(a.reviewDate).localeCompare(String(b.reviewDate)) || String(a.studentId).localeCompare(String(b.studentId)));
  const urgent = pending.filter((action) => action.reviewDate <= today);
  const weekLimit = addDaysIso(7, new Date(`${today}T00:00:00`));
  const week = pending.filter((action) => action.reviewDate > today && action.reviewDate <= weekLimit);
  const active = pending.filter((action) => action.status === "en_seguiment").length;
  return {
    urgent,
    week,
    active,
    isEmpty: actions.length === 0,
  };
}

function actionStatusLabel(status) {
  if (status === "a_revisar") return "A revisar";
  if (status === "tancat") return "Tancat";
  if (status === "pendent") return "Pendent";
  return "En seguiment";
}

function renderActionStatusBadge(action) {
  if (!action) return "";
  return `<span class="action-status ${escapeHtml(action.status)}">${escapeHtml(actionStatusLabel(action.status))}</span>`;
}

function renderPriorityChart() {
  const canvas = els.scatter;
  const ctx = canvas.getContext("2d");
  const matrix = buildClusterRiskMatrix(state.filtered);
  const pad = { top: 68, right: 30, bottom: 34, left: 300 };
  const width = canvas.width;
  const height = canvas.height;
  const totalRows = Math.max(1, state.filtered.length);
  const levels = [
    { key: "high", label: riskLabel("high"), color: "#e78680" },
    { key: "medium", label: riskLabel("medium"), color: "#e9b957" },
    { key: "low", label: riskLabel("low"), color: "#7cc891" },
  ];
  const rowGap = 14;
  const rowHeight = 76;
  const matrixWidth = width - pad.left - pad.right;
  const colGap = 12;
  const colWidth = (matrixWidth - colGap * (levels.length - 1)) / levels.length;
  const maxCell = Math.max(1, ...matrix.flatMap((row) => levels.map((level) => row[level.key])));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#61757c";
  ctx.font = "800 13px Segoe UI";
  ctx.fillText("Perfil d'estudiant", 24, 38);
  levels.forEach((level, index) => {
    const x = pad.left + index * (colWidth + colGap);
    ctx.fillStyle = level.color;
    roundRect(ctx, x, 18, colWidth, 30, 6);
    ctx.fill();
    ctx.fillStyle = "#25343c";
    ctx.font = "800 14px Segoe UI";
    ctx.fillText(level.label, x + 14, 38);
  });

  matrix.forEach((cluster, rowIndex) => {
    const y = pad.top + rowIndex * (rowHeight + rowGap);
    const clusterShare = percent(cluster.total, totalRows);

    ctx.fillStyle = "#25343c";
    ctx.font = "800 19px Segoe UI";
    ctx.fillText(`Perfil ${cluster.profileId}`, 24, y + 24);
    ctx.font = "700 15px Segoe UI";
    ctx.fillText(`${formatInt(cluster.total)} estudiants - ${clusterShare}%`, 24, y + 48);
    ctx.fillStyle = "#61757c";
    ctx.font = "14px Segoe UI";
    ctx.fillText(truncateText(ctx, cluster.name, 250), 24, y + 69);

    levels.forEach((level, colIndex) => {
      const count = cluster[level.key];
      const x = pad.left + colIndex * (colWidth + colGap);
      const intensity = 0.16 + 0.74 * (count / maxCell);

      ctx.fillStyle = riskColor(level.key, intensity);
      roundRect(ctx, x, y, colWidth, rowHeight, 8);
      ctx.fill();
      ctx.strokeStyle = "#d9e8e5";
      ctx.stroke();

      ctx.fillStyle = "#25343c";
      ctx.font = "900 25px Segoe UI";
      ctx.fillText(formatInt(count), x + 16, y + 34);
      ctx.font = "700 14px Segoe UI";
      ctx.fillText(`${percent(count, cluster.total)}% del perfil`, x + 16, y + 57);
    });
  });

  ctx.fillStyle = "#61757c";
  ctx.font = "14px Segoe UI";
  ctx.fillText("Cada casella mostra quants alumnes de cada perfil cauen en cada nivell de risc estimat.", pad.left, height - 12);
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
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
  const normalized = {
    label: translateFactorLabel(factor.label || factor.feature || "Factor"),
    impact: -riskImpact,
    displayValue: factor.value === undefined || typeof factor.value === "boolean" ? "" : String(factor.value),
  };
  Object.defineProperties(normalized, {
    rawLabel: { value: factor.label || factor.feature || "Factor" },
    rawValue: { value: factor.value },
  });
  return normalized;
}

function motivationValueFromFactor(factor) {
  const name = String(factor.rawLabel || factor.label || "");
  const isTrue = factor.rawValue === true || String(factor.rawValue).toLowerCase() === "true";
  if (/Motivation[_ ]Level[_ ]Low/i.test(name) && isTrue) return "baixa";
  if (/Motivation[_ ]Level[_ ]Medium/i.test(name) && isTrue) return "mitjana";
  return "";
}

function readableImpactFactors(factors) {
  const normalized = factors.map(normalizeImpactFactor);
  const motivationFactors = normalized.filter((factor) => /Motivation[_ ]Level/i.test(factor.rawLabel));
  const nonMotivation = normalized.filter((factor) => !/Motivation[_ ]Level/i.test(factor.rawLabel));
  if (!motivationFactors.length) return nonMotivation;

  const explicitValue = motivationFactors.map(motivationValueFromFactor).find(Boolean);
  const displayValue = explicitValue || "alta";
  const impact = motivationFactors.reduce((sum, factor) => sum + factor.impact, 0);
  const motivationFactor = {
    label: "Motivació",
    impact,
    displayValue,
    rawLabel: "Motivation_Level",
    rawValue: displayValue,
  };
  return [motivationFactor, ...nonMotivation].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
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
    "Access to Resources Low": "Recursos baixos",
    Access_to_Resources_Low: "Recursos baixos",
    "Access to Resources Medium": "Recursos mitjans",
    Access_to_Resources_Medium: "Recursos mitjans",
    "Parental Involvement Low": "Implicació familiar baixa",
    Parental_Involvement_Low: "Implicació familiar baixa",
    "Peer Influence Neutral": "Influència de companys neutral",
    Peer_Influence_Neutral: "Influència de companys neutral",
    "Peer Influence Positive": "Influència de companys positiva",
    Peer_Influence_Positive: "Influència de companys positiva",
    "Teacher Quality Low": "Qualitat docent baixa",
    Teacher_Quality_Low: "Qualitat docent baixa",
    "Sleep Hours": "Hores de son",
    Sleep_Hours: "Hores de son",
    "Distance from Home Near": "Distància propera",
    Distance_from_Home_Near: "Distància propera",
    "Extracurricular Activities": "Activitats extracurriculars",
    Extracurricular_Activities: "Activitats extracurriculars",
    "Learning Disabilities": "Dificultats d'aprenentatge",
    Learning_Disabilities: "Dificultats d'aprenentatge",
    "Physical Activity": "Activitat física",
    Physical_Activity: "Activitat física",
    "Family Income Medium": "Ingressos familiars mitjans",
    Family_Income_Medium: "Ingressos familiars mitjans",
    "Parental Education Level Postgraduate": "Formació familiar de postgrau",
    Parental_Education_Level_Postgraduate: "Formació familiar de postgrau",
    "Gender Male": "Gènere masculí",
    Gender_Male: "Gènere masculí",
  };
  return labels[label] || label.replaceAll("_", " ");
}

function factorSeverity(factor) {
  const magnitude = Math.abs(factor.impact);
  if (factor.impact < 0) return { label: "", className: "protective" };
  if (magnitude >= 20) return { label: "Factor de risc important", className: "high" };
  if (magnitude >= 8) return { label: "Pes moderat en aquesta predicció", className: "medium" };
  return { label: "Pes baix en aquesta predicció", className: "low" };
}

function numericFactorValue(factor) {
  const value = Number(String(factor.displayValue || "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function factorIntensity(factor) {
  const magnitude = Math.abs(factor.impact);
  if (factor.impact < 0) return "protective";
  if (magnitude >= 20) return "high";
  if (magnitude >= 8) return "medium";
  return "low";
}

function riskLead(factor) {
  const intensity = factorIntensity(factor);
  if (intensity === "high") return "És un risc important";
  if (intensity === "medium") return "És un senyal de risc moderat";
  if (intensity === "protective") return "En aquesta predicció no és el senyal que més explica el risc";
  return "Té una influència baixa";
}

function factorExplanationText(factor) {
  const intensity = factorIntensity(factor);
  const increasesRisk = intensity !== "protective";
  const label = factor.label.toLowerCase();
  const value = numericFactorValue(factor);
  const lead = riskLead(factor).toLowerCase();
  if (label.includes("assist")) {
    const valueText = value === null ? "Assistència registrada" : `Assistència del ${value}%`;
    if (!increasesRisk) return `${valueText}: ${lead}.`;
    return `${valueText}: ${lead} perquè queda per sota del llindar preventiu del 75%; convé prioritzar seguiment de presència.`;
  }
  if (label.includes("hores d'estudi")) {
    const valueText = value === null ? "Dedicació d'estudi registrada" : `${value} hores d'estudi`;
    if (!increasesRisk) return `${valueText}: ${lead}.`;
    return `${valueText}: ${lead} perquè són menys de les 15 hores setmanals recomanades; cal concretar una pauta d'estudi.`;
  }
  if (label.includes("nota d'examen")) {
    const valueText = value === null ? "Nota d'examen registrada" : `Nota d'examen de ${value}`;
    if (!increasesRisk) return `${valueText}: ${lead}.`;
    return `${valueText}: ${lead} perquè queda per sota del llindar crític de 47 punts.`;
  }
  if (label.includes("notes pr")) {
    const valueText = value === null ? "Notes prèvies registrades" : `Notes prèvies de ${value}`;
    if (!increasesRisk) return `${valueText}: ${lead}.`;
    return `${valueText}: ${lead} perquè estan per sota dels 68 punts i poden anticipar dificultats en el curs actual.`;
  }
  if (label.includes("motiv")) {
    const valueText = factor.displayValue ? `Motivació ${factor.displayValue}` : "Motivació registrada";
    if (!increasesRisk) return `${valueText}: ${lead}.`;
    return `${valueText}: ${lead} perquè pot reduir la constància i fa recomanable una tutoria de seguiment.`;
  }
  if (label.includes("tutories")) {
    const valueText = value === null ? "Tutories registrades" : `${value} tutories`;
    if (!increasesRisk) return `${valueText}: ${lead} perquè ja hi ha suport tutorial que pot compensar altres riscos.`;
    return `${valueText}: ${lead} perquè no hi ha prou seguiment individual per detectar bloquejos a temps.`;
  }
  if (label.includes("recursos")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè l'accés a materials i espais de suport ajuda a sostenir el progrés.`;
    return `${factor.label}: ${lead} perquè indica accés limitat a materials o espais de suport; convé facilitar recursos addicionals.`;
  }
  if (label.includes("implicaci")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè l'acompanyament familiar pot compensar altres dificultats.`;
    return `${factor.label}: ${lead} perquè hi ha poc suport familiar registrat i cal reforçar el seguiment tutorial.`;
  }
  if (label.includes("influ")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè l'entorn de companys ajuda a mantenir hàbits acadèmics.`;
    return `${factor.label}: ${lead} perquè aporta menys suport positiu del grup i pot reduir la constància.`;
  }
  if (label.includes("son")) {
    const valueText = value === null ? "Hores de son registrades" : `${value} hores de son`;
    if (!increasesRisk) return `${valueText}: ${lead} perquè el descans és suficient per sostenir el rendiment.`;
    return `${valueText}: ${lead} perquè el descans pot ser insuficient i afectar concentració i assistència.`;
  }
  if (label.includes("qualitat docent")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè el context docent no afegeix una alerta rellevant.`;
    return `${factor.label}: ${lead} perquè pot dificultar el seguiment de l'assignatura i fa recomanable revisar suport acadèmic.`;
  }
  if (label.includes("dist")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè la proximitat redueix fricció d'assistència.`;
    return `${factor.label}: ${lead} perquè la distància pot complicar la presència regular a classe.`;
  }
  if (label.includes("activitats extracurriculars")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè la participació pot reforçar vinculació amb el curs.`;
    return `${factor.label}: ${lead} perquè pot indicar menys vinculació amb l'entorn acadèmic.`;
  }
  if (label.includes("dificultats d'aprenentatge")) {
    if (!increasesRisk) return `${factor.label}: ${lead} perquè no afegeix una barrera d'aprenentatge rellevant.`;
    return `${factor.label}: ${lead} perquè pot requerir adaptacions o suport específic.`;
  }
  if (label.includes("activitat f")) {
    const valueText = value === null ? "Activitat física registrada" : `${value} sessions d'activitat física`;
    if (!increasesRisk) return `${valueText}: ${lead} perquè pot ajudar a mantenir rutina i benestar.`;
    return `${valueText}: ${lead} perquè pot reflectir una rutina menys estable.`;
  }
  if (label.includes("ingressos") || label.includes("formaci") || label.includes("gènere")) {
    if (!increasesRisk) return `${factor.label}: ${lead} com a variable de context del perfil de l'alumne.`;
    return `${factor.label}: ${lead} dins del context del perfil; cal interpretar-lo juntament amb els factors acadèmics.`;
  }
  if (!increasesRisk) return `${factor.label}: ${lead} i compensa altres senyals d'alerta.`;
  return `${factor.label}: ${lead} i convé revisar aquest indicador dins del seguiment individual.`;
}

function renderFactorExplanation(factors) {
  const normalized = readableImpactFactors(factors);
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

function renderFactorExplanation(factors) {
  const normalized = readableImpactFactors(factors);
  return `
    <section class="factor-explanation">
      <h3>Què explica aquest risc?</h3>
      <p class="explain-text compact">Els factors estan ordenats per prioritat. Les etiquetes indiquen si convé actuar-hi o si ajuden a reduir el risc.</p>
      ${normalized.map((factor) => {
        const severity = factorSeverity(factor);
        return `
          <div class="factor-card ${severity.className}">
            <div>
              <strong>${factor.label}</strong>
              ${factor.displayValue ? `<span>${factor.displayValue}</span>` : ""}
            </div>
            <p>${factorExplanationText(factor)}</p>
            ${severity.label ? `<small>${severity.label}</small>` : ""}
          </div>
        `;
      }).join("")}
    </section>
  `;
}

function renderAgendaList(actions) {
  if (!actions.length) return `<p class="agenda-empty-small">Cap revisió programada en aquest tram.</p>`;
  return `
    <div class="agenda-list">
      ${actions.slice(0, 5).map((action) => `
        <button class="agenda-student" type="button" data-agenda-id="${escapeHtml(action.studentId)}">
          <span>
            <strong>${escapeHtml(action.studentId)}</strong>
            <small>${escapeHtml(action.action)}</small>
          </span>
          <b>${escapeHtml(action.reviewDate)}</b>
        </button>
      `).join("")}
    </div>
  `;
}

function renderAgendaSummary(summary) {
  if (summary.isEmpty) {
    return `
      <section class="agenda-empty">
        <strong>Encara no hi ha cap intervenció registrada.</strong>
        <span>Accedeix a un alumne per iniciar el seguiment.</span>
      </section>
    `;
  }
  return `
    <div class="agenda-panel">
      <section class="agenda-section urgent">
        <div class="agenda-section-head">
          <span>Avui i urgent</span>
          <strong>${formatInt(summary.urgent.length)}</strong>
        </div>
        ${renderAgendaList(summary.urgent)}
      </section>
      <section class="agenda-section week">
        <div class="agenda-section-head">
          <span>Aquesta setmana</span>
          <strong>${formatInt(summary.week.length)}</strong>
        </div>
        ${renderAgendaList(summary.week)}
      </section>
      <section class="agenda-section active">
        <span>En seguiment actiu</span>
        <strong>${formatInt(summary.active)} alumnes</strong>
      </section>
    </div>
  `;
}

function renderDrivers() {
  const actions = actionStore.getAllPendingReviews();
  els.drivers.innerHTML = renderAgendaSummary(buildAgendaSummary(actions, state.rows));
}

function renderDriversLegacyUnused() {
  const rows = state.filtered;
  const drivers = [
    ["Motivació baixa", ratio(rows, (r) => r.Motivation_Level === "Low")],
    ["Assistència < 75%", ratio(rows, (r) => r.Attendance < 75)],
    ["Hores estudi < 15", ratio(rows, (r) => r.Hours_Studied < 15)],
    ["Exam score < 47", ratio(rows, (r) => r.Exam_Score < 47)],
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

function buildDriverRowsLegacyUnused(rows) {
  const total = rows.length;
  const drivers = [
    ["Motivació baixa", "Llindar de risc: motivació marcada com a Low", (row) => row.Motivation_Level === "Low"],
    ["Assistència baixa", "Llindar de risc: menys del 75% d'assistència", (row) => row.Attendance < 75],
    ["Poques hores d'estudi", "Llindar de risc: menys de 15 hores setmanals", (row) => row.Hours_Studied < 15],
    ["Rendiment d'examen baix", "Llindar de risc: nota d'examen inferior a 47", (row) => row.Exam_Score < 47],
    ["Notes prèvies baixes", "Llindar de risc: notes prèvies inferiors a 68", (row) => row.Previous_Scores < 68],
    ["Recursos baixos", "Llindar de risc: accés a recursos marcat com a Low", (row) => row.Access_to_Resources === "Low"],
  ];

  return drivers.map(([label, threshold, predicate]) => {
    const count = rows.filter(predicate).length;
    return {
      label,
      threshold,
      count,
      percent: percent(count, total),
    };
  }).sort((a, b) => b.percent - a.percent);
}

function renderDriverRowsLegacyUnused(drivers) {
  return drivers.map((driver) => `
    <div class="driver-row">
      <div class="driver-meta">
        <strong>${driver.label}</strong>
        <span>${driver.percent}% de la cohort · ${formatInt(driver.count)} estudiants</span>
      </div>
      <small><strong>${driver.threshold}</strong></small>
      <div class="bar-track" aria-label="${driver.label}: ${driver.percent}% de la cohort">
        <div class="bar-fill" style="width:${driver.percent}%"></div>
      </div>
    </div>
  `).join("");
}

function percentileValue(rows, column, percentileRank) {
  const values = rows
    .map((row) => Number(row[column]))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * percentileRank)));
  return values[index];
}

function valuePosition(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.round(((value - min) / (max - min)) * 100);
}

function numericDriverThresholds(rows, column, suffix = "") {
  const values = rows.map((row) => Number(row[column])).filter((value) => Number.isFinite(value));
  if (!values.length) return [];
  const low = percentileValue(rows, column, 1 / 3);
  const high = percentileValue(rows, column, 2 / 3);
  return [
    { position: 33, label: `${Math.round(low)}${suffix}` },
    { position: 67, label: `${Math.round(high)}${suffix}` },
  ];
}

function numericRiskBandStyle(thresholds) {
  const low = thresholds[0]?.position ?? 33;
  const high = thresholds[1]?.position ?? 66;
  return `linear-gradient(90deg, var(--red) 0 ${low}%, var(--amber) ${low}% ${high}%, var(--green) ${high}% 100%)`;
}

function buildDriverRows(rows) {
  const total = rows.length;
  const attendanceThresholds = numericDriverThresholds(rows, "Attendance");
  const hoursThresholds = numericDriverThresholds(rows, "Hours_Studied", "h");
  const examThresholds = numericDriverThresholds(rows, "Exam_Score");
  const previousThresholds = numericDriverThresholds(rows, "Previous_Scores");
  const attendanceLow = percentileValue(rows, "Attendance", 1 / 3);
  const hoursLow = percentileValue(rows, "Hours_Studied", 1 / 3);
  const examLow = percentileValue(rows, "Exam_Score", 1 / 3);
  const previousLow = percentileValue(rows, "Previous_Scores", 1 / 3);
  const drivers = [
    {
      label: "Motivació",
      predicate: (row) => row.Motivation_Level === "Low",
      thresholds: [{ position: 33, label: "Low" }, { position: 66, label: "Medium" }],
      bandStyle: "linear-gradient(90deg, var(--red) 0 33%, var(--amber) 33% 66%, var(--green) 66% 100%)",
    },
    {
      label: "Assistència",
      predicate: (row) => row.Attendance <= attendanceLow,
      thresholds: attendanceThresholds,
      bandStyle: numericRiskBandStyle(attendanceThresholds),
    },
    {
      label: "Hores d'estudi",
      predicate: (row) => row.Hours_Studied <= hoursLow,
      thresholds: hoursThresholds,
      bandStyle: numericRiskBandStyle(hoursThresholds),
    },
    {
      label: "Rendiment d'examen",
      predicate: (row) => row.Exam_Score <= examLow,
      thresholds: examThresholds,
      bandStyle: numericRiskBandStyle(examThresholds),
    },
    {
      label: "Notes prèvies",
      predicate: (row) => row.Previous_Scores <= previousLow,
      thresholds: previousThresholds,
      bandStyle: numericRiskBandStyle(previousThresholds),
    },
    {
      label: "Recursos",
      predicate: (row) => row.Access_to_Resources === "Low",
      thresholds: [{ position: 33, label: "Low" }, { position: 66, label: "Medium" }],
      bandStyle: "linear-gradient(90deg, var(--red) 0 33%, var(--amber) 33% 66%, var(--green) 66% 100%)",
    },
  ];

  return drivers.map((driver) => {
    const count = rows.filter(driver.predicate).length;
    return {
      label: driver.label,
      count,
      percent: percent(count, total),
      thresholds: driver.thresholds,
      bandStyle: driver.bandStyle,
    };
  }).sort((a, b) => b.percent - a.percent);
}

function driverPrevalenceClass(percentValue) {
  if (percentValue >= 35) return "high";
  if (percentValue >= 18) return "medium";
  return "low";
}

function renderDriverRows(drivers) {
  return drivers.map((driver) => `
    <div class="driver-row">
      <div class="driver-meta">
        <strong>${driver.label}</strong>
        <span>${driver.percent}% dels estudiants</span>
      </div>
      <div class="bar-track risk-scale" style="background:${driver.bandStyle}" aria-label="${driver.label}: ${driver.percent}% dels estudiants">
        ${driver.thresholds.map((threshold) => `
          <span class="driver-threshold" style="left:${threshold.position}%"><i>${threshold.label}</i></span>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function actionCell(count, total, level) {
  const pct = percent(count, total);
  return `
    <div class="action-matrix-cell ${level}">
      <strong>${formatInt(count)}</strong>
      <span>${pct}%</span>
    </div>
  `;
}

function renderProfileActionMatrix(rows) {
  return `
    <div class="action-matrix">
      <div class="action-matrix-head">
        <span>Perfil</span>
        <span>Intervenció</span>
        <span>Seguiment</span>
        <span>Monitorització</span>
      </div>
      ${rows.map((row) => `
        <div class="action-matrix-row">
          <div class="action-profile">
            <strong>Perfil ${row.profileId}</strong>
            <span>${escapeHtml(row.name)}</span>
            <small>${formatInt(row.total)} alumnes</small>
          </div>
          ${actionCell(row.priority, row.total, "high")}
          ${actionCell(row.preventive, row.total, "medium")}
          ${actionCell(row.monitoring, row.total, "low")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderRecommendedActionRows(actions) {
  const maxCount = Math.max(1, ...actions.map((action) => action.count));
  return `
    <div class="recommended-actions">
      ${actions.map((action) => {
        const width = Math.max(3, Math.round((action.count / maxCount) * 100));
        const highWidth = action.count ? Math.round((action.high / action.count) * 100) : 0;
        const mediumWidth = action.count ? Math.round((action.medium / action.count) * 100) : 0;
        const lowWidth = Math.max(0, 100 - highWidth - mediumWidth);
        return `
          <article class="recommended-action-row">
            <div class="recommended-action-meta">
              <strong>${escapeHtml(action.label)}</strong>
              <span>${action.percent}% dels estudiants</span>
            </div>
            <div class="recommended-action-track" aria-label="${escapeHtml(action.label)}: ${action.percent}% dels estudiants">
              <div class="recommended-action-fill" style="width:${width}%">
                <span class="high" style="width:${highWidth}%"></span>
                <span class="medium" style="width:${mediumWidth}%"></span>
                <span class="low" style="width:${lowWidth}%"></span>
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
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
  els.table.innerHTML = renderStudentRows(rows);
}

function renderValidationTable() {
  if (!els.validationTable) return;
  const query = els.validationSearch.value.trim().toLowerCase();
  let rows = [...state.validationFiltered];
  if (els.validationRiskFilter.value !== "all") rows = rows.filter((row) => row.riskLevel === els.validationRiskFilter.value);
  if (els.validationMotivationFilter.value !== "all") rows = rows.filter((row) => row.Motivation_Level === els.validationMotivationFilter.value);
  if (query) {
    rows = rows.filter((row) => `${row.id} ${row.studentProfile?.name || ""} ${row.Motivation_Level} ${row.Gender} ${row.Distance_from_Home}`.toLowerCase().includes(query));
  }
  rows = sortRows(rows, state.sort.key, state.sort.direction);
  els.validationTableCount.textContent = `${formatInt(rows.length)} resultats`;
  updateValidationSortHeaders();
  els.validationTable.innerHTML = renderStudentRows(rows);
}

function renderStudentRows(rows) {
  return rows.map((row) => `
    <tr data-id="${row.id}">
      <td>${row.id}</td>
      <td><span class="pill risk-pill ${row.riskLevel}">${row.riskScore}%</span></td>
      <td><span class="profile-pill ${profileClass(row.studentProfile)}">${escapeHtml(studentProfileLabel(row.studentProfile))}</span></td>
      <td>${row.Motivation_Level}</td>
      <td>${row.Attendance}%</td>
      <td>${row.Hours_Studied}</td>
      <td>${row.Exam_Score}</td>
      <td>${renderTableAction(row)}</td>
    </tr>
  `).join("");
}

function renderTableAction(row) {
  const saved = actionStore.getStudentAction(row.id);
  if (saved) return renderActionStatusBadge(saved);
  return escapeHtml(row.recommendedActions[0]?.[0] || "Seguiment ordinari");
}

function profileClass(profile) {
  const raw = String(profile?.profileId || profile?.name || "");
  const match = raw.match(/[1-4]/);
  return match ? `profile-${match[0]}` : "profile-unknown";
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
  if (key === "action") return actionStore.getStudentAction(row.id)?.status || row.recommendedActions[0]?.[0] || "";
  if (key === "profile") return studentProfileLabel(row.studentProfile);
  return row[key];
}

function updateSortHeaders() {
  els.sortHeaders.forEach((button) => {
    const active = button.dataset.sort === state.sort.key;
    button.classList.toggle("active", active);
    button.dataset.direction = active ? state.sort.direction : "";
  });
}

function updateValidationSortHeaders() {
  els.validationSortHeaders.forEach((button) => {
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

function renderValidationDetail(row) {
  state.selectedValidation = row;
  els.validationDetailTitle.textContent = row.id;
  els.validationDetail.classList.remove("empty");
  els.validationDetail.innerHTML = renderStudentExplanation(row);
}

function studentRiskTitle(row) {
  if (Number.isFinite(Number(row.xgbProbability))) return `Risc d'abandonament: ${(Number(row.xgbProbability) * 100).toFixed(1)}%`;
  return `Risc d'abandonament: ${row.riskScore}%`;
}

function studentRiskSummary(row) {
  const level = riskLabel(row.riskLevel).toLowerCase();
  const signals = studentRiskSignals(row, 3);
  if (!signals.length) {
    return `Aquest alumne té ${level} i cal revisar el cas complet per entendre què està empenyent el risc.`;
  }
  return `Aquest alumne té ${level} perquè presenta ${signals.map((signal) => signal.summary).join(", ")}.`;
}

function studentRiskSignals(row, limit = 3) {
  return (row.riskFactors || [])
    .map((factor) => normalizeStudentRiskSignal(factor))
    .filter((factor) => factor.impact > 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, limit)
    .map((factor) => ({
      label: factor.label,
      displayValue: factor.displayValue,
      summary: studentRiskSignalSummary(factor),
      threshold: studentRiskSignalThreshold(factor),
      value: studentRiskSignalValue(factor),
      reading: studentRiskSignalReading(factor),
    }));
}

function studentRiskNextStep(row) {
  const [title, text] = Array.isArray(row.recommendedActions) ? row.recommendedActions[0] || [] : [];
  if (title && text) return `${title}: ${text}`;
  if (title) return title;
  if (text) return text;
  return "Cal revisar el cas amb tutoria i seguiment individual.";
}

function normalizeStudentRiskSignal(factor) {
  const impact = Number.isFinite(Number(factor.impact)) ? Number(factor.impact) : Number(factor.shap || 0);
  return {
    label: translateFactorLabel(factor.label || factor.feature || "Factor"),
    displayValue: factor.value === undefined || typeof factor.value === "boolean" ? "" : String(factor.value),
    impact,
  };
}

function studentRiskSignalSummary(factor) {
  const label = factor.label.toLowerCase();
  if (label.includes("assist")) return `assistència del ${factor.displayValue}%`;
  if (label.includes("motiv")) return "motivació baixa";
  if (label.includes("hores d'estudi")) return `${factor.displayValue} hores d'estudi`;
  if (label.includes("nota d'examen")) return `nota d'examen de ${factor.displayValue}`;
  if (label.includes("notes pr")) return `notes prèvies de ${factor.displayValue}`;
  if (label.includes("tutories")) return `${factor.displayValue} tutories`;
  if (label.includes("recursos")) return "recursos baixos";
  if (label.includes("influ")) return "influència de companys neutral";
  if (label.includes("son")) return `${factor.displayValue} hores de son`;
  if (label.includes("qualitat docent")) return "qualitat docent baixa";
  return factor.label.toLowerCase();
}

function studentRiskSignalValue(factor) {
  const label = factor.label.toLowerCase();
  const rawValue = factor.displayValue;
  if (label.includes("motiv")) return "Baixa";
  if (label.includes("assist")) return rawValue ? `${rawValue}%` : "-";
  if (label.includes("hores d'estudi")) return rawValue ? `${rawValue} h` : "-";
  if (label.includes("nota d'examen") || label.includes("notes pr")) return rawValue || "-";
  if (label.includes("tutories")) return rawValue || "0";
  if (label.includes("recursos")) return "Baixos";
  if (label.includes("son")) return rawValue ? `${rawValue} h` : "-";
  if (label.includes("qualitat docent")) return "Baixa";
  if (label.includes("influ")) return "Neutral";
  return rawValue || "-";
}

function studentRiskSignalThreshold(factor) {
  const label = factor.label.toLowerCase();
  if (label.includes("assist")) return "< 75%";
  if (label.includes("motiv")) return "Baixa";
  if (label.includes("hores d'estudi")) return "< 15 h";
  if (label.includes("nota d'examen")) return "< 47";
  if (label.includes("notes pr")) return "< 68";
  if (label.includes("tutories")) return "0 tutories";
  if (label.includes("recursos")) return "Baixos";
  if (label.includes("son")) return "< 6 h";
  if (label.includes("qualitat docent")) return "Baixa";
  return "Revisar valor";
}

function studentRiskSignalReading(factor) {
  const magnitude = Math.abs(factor.impact);
  const label = factor.label.toLowerCase();
  const numericValue = Number(factor.displayValue);
  if (label.includes("nota d'examen") && Number.isFinite(numericValue) && numericValue >= 47) {
    return magnitude >= 8 ? "Atenció" : "Baix";
  }
  if (magnitude >= 20) return "Crític";
  if (magnitude >= 8) return "Atenció";
  return "Baix";
}

function renderStudentRiskSignals(row) {
  const signals = studentRiskSignals(row, 3);
  if (!signals.length) {
    return `
      <section class="risk-story">
        <h3>Lectura del cas</h3>
        <p class="explain-text compact">El risc surt de la combinació de totes les dades del cas; no hi ha un únic factor dominant.</p>
        <div class="risk-signal-grid">
          <article class="risk-signal-card">
            <strong>Pròxim pas</strong>
            <span>${escapeHtml(studentRiskNextStep(row))}</span>
          </article>
        </div>
      </section>
    `;
  }
  return `
      <section class="risk-story">
        <h3>${escapeHtml("Factors de risc de l'alumne")}</h3>
        <p class="explain-text compact"><strong>Lectura del cas:</strong> ${escapeHtml(studentRiskSummary(row))}</p>
        <div class="risk-factor-table" role="table" aria-label="${escapeHtml("Factors de risc de l'alumne")}">
          <div class="risk-factor-row risk-factor-head" role="row">
            <span role="columnheader">Factor</span>
            <span role="columnheader">${escapeHtml("Valor de l'alumne")}</span>
            <span role="columnheader">Llindar</span>
            <span role="columnheader">Lectura</span>
          </div>
          ${signals.map((signal) => `
            <div class="risk-factor-row ${signal.reading === "Crític" ? "critical" : signal.reading === "Atenció" ? "warning" : "low"}" role="row">
              <strong role="cell">${escapeHtml(signal.label)}</strong>
              <span role="cell">${escapeHtml(signal.value)}</span>
              <span role="cell">${escapeHtml(signal.threshold)}</span>
              <b role="cell">${escapeHtml(signal.reading)}</b>
            </div>
          `).join("")}
        </div>
        <div class="risk-signal-grid">
          <article class="risk-signal-card">
            <strong>Pròxim pas</strong>
            <span>${escapeHtml(studentRiskNextStep(row))}</span>
          </article>
        </div>
      </section>
    `;
}

function reviewPresetFromDate(reviewDate) {
  const diff = reviewDate ? daysBetweenIso(todayIso(), reviewDate) : 28;
  if ([14, 28, 56].includes(diff)) return String(diff);
  return "custom";
}

function renderActionRegistration(row, forceEdit = false) {
  const saved = actionStore.getStudentAction(row.id);
  if (saved && !forceEdit) {
    return `
      <section class="action-register saved">
        <div class="panel-head compact-head">
          <div>
            <p class="panel-label">Intervenció registrada</p>
            <h3>${escapeHtml(saved.action)}</h3>
          </div>
          ${renderActionStatusBadge(saved)}
        </div>
        <div class="action-state-grid">
          <span><strong>Aplicada</strong>${escapeHtml(saved.appliedDate)}</span>
          <span><strong>Revisió</strong>${escapeHtml(saved.reviewDate || "Sense data")}</span>
        </div>
        ${saved.notes ? `<p class="teacher-notes">${escapeHtml(saved.notes)}</p>` : ""}
        <div class="decision-tools">
          <button class="text-button" type="button" data-action-edit="${escapeHtml(row.id)}">Editar</button>
          <button class="text-button secondary" type="button" data-action-reviewed="${escapeHtml(row.id)}">Marcar com revisat</button>
        </div>
      </section>
    `;
  }

  const initialAction = saved?.action || row.recommendedActions?.[0]?.[0] || "Seguiment ordinari";
  const reviewDate = saved?.reviewDate || addDaysIso(28);
  const preset = reviewPresetFromDate(reviewDate);
  return `
    <section class="action-register">
      <p class="panel-label">Registrar intervenció</p>
      <h3>Aplicar acció i programar revisió</h3>
      <div class="action-register-form" data-student-action-form="${escapeHtml(row.id)}">
        <label>
          <span>Acció</span>
          <select data-action-field="action">
            ${(row.recommendedActions || [["Seguiment ordinari", ""]]).map(([title]) => `
              <option value="${escapeHtml(title)}" ${title === initialAction ? "selected" : ""}>${escapeHtml(title)}</option>
            `).join("")}
          </select>
        </label>
        <label>
          <span>Revisió</span>
          <select data-action-field="preset">
            <option value="14" ${preset === "14" ? "selected" : ""}>2 setmanes</option>
            <option value="28" ${preset === "28" ? "selected" : ""}>4 setmanes</option>
            <option value="56" ${preset === "56" ? "selected" : ""}>8 setmanes</option>
            <option value="custom" ${preset === "custom" ? "selected" : ""}>Personalitzat</option>
          </select>
        </label>
        <label>
          <span>Data de revisió</span>
          <input type="date" data-action-field="reviewDate" value="${escapeHtml(reviewDate)}" />
        </label>
        <label class="notes-field">
          <span>Notes del professor</span>
          <textarea data-action-field="notes" maxlength="300" placeholder="Opcional, màxim 300 caràcters">${escapeHtml(saved?.notes || "")}</textarea>
        </label>
        <button class="text-button primary-action" type="button" data-action-save="${escapeHtml(row.id)}">Aplicar i programar revisió</button>
      </div>
    </section>
  `;
}

function renderStudentExplanation(row, options = {}) {
  const title = clientFacingText(options.title || studentRiskTitle(row));
  const note = options.note || "";
  const decisionTools = options.hideDecisionTools ? "" : `
    <div class="decision-tools">
      <button class="text-button" type="button" data-simulate-id="${escapeHtml(row.id)}">Simular aquest alumne</button>
    </div>
  `;
  const registration = options.hideDecisionTools || !String(row.id).startsWith("STU-")
    ? ""
    : renderActionRegistration(row, state.editingActions.has(row.id));
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
    ${renderStudentRiskSignals(row)}
    ${renderStudentProfile(row)}
    ${renderInterventionTimeline(row)}
    <p class="panel-label" style="margin-top:18px">Accions suggerides</p>
    <div class="action-list">
      ${row.recommendedActions.map(([title, text]) => `<div class="action-chip"><strong>${title}</strong><span>${text}</span></div>`).join("")}
    </div>
    ${registration}
  `;
}

function renderStudentProfile(row) {
  const profile = row.studentProfile || defaultStudentProfile();
  const characteristics = profile.characteristics.map(profileCharacteristicText);
  return `
    <section class="profile-card ${profileClass(profile)}">
      <p class="panel-label">Perfil de seguiment</p>
      <h3>${escapeHtml(studentProfileLabel(profile))}</h3>
      <p>${escapeHtml(profile.summary)}</p>
      <div class="profile-tags">
        ${characteristics.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <strong>${escapeHtml(profile.recommendation)}</strong>
    </section>
  `;
}

function profileCharacteristicText(text) {
  const value = cleanCatalanText(text);
  if (value.includes("aTLP") || value.toLowerCase().includes("coherència interna")) {
    return "Perfil força consistent dins del grup d'alumnes";
  }
  if (value.toLowerCase().includes("heterogeneïtat interna")) {
    return "Alguns alumnes del grup poden tenir necessitats diferents";
  }
  return value;
}

function renderInterventionTimeline(row) {
  const timeline = buildInterventionTimeline(row);
  const maxRisk = Math.max(1, ...timeline.map((item) => item.riskScore));
  return `
    <section class="timeline-card">
      <p class="panel-label">Pla d'intervenció proposat</p>
      <h3>Què fer i què revisar</h3>
      <p class="explain-text compact">El percentatge futur és orientatiu: mostra el risc estimat si l'alumne millora els indicadors indicats. No és una predicció garantida ni modifica les dades originals.</p>
      <div class="timeline-list">
        ${timeline.map((item) => `
          <div class="timeline-step">
            <div>
              <strong>${item.label}</strong>
              <span>${escapeHtml(item.action)}</span>
              <small>${escapeHtml(item.objective)}</small>
            </div>
            <div class="timeline-meter">
              <span class="timeline-fill ${item.riskLevel}" style="width:${Math.round((item.riskScore / maxRisk) * 100)}%"></span>
            </div>
            <b><span>${escapeHtml(item.riskLabel)}</span>${item.riskScore}%</b>
            <small>${escapeHtml(item.assumption)}</small>
            <small>Objectiu d'indicadors: assist. ${item.Attendance}% &middot; ${item.Hours_Studied}h estudi &middot; examen ${item.Exam_Score} &middot; motivació ${motivationLabel(item.Motivation_Level)}</small>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function ensureSimulationUi() {
  [
    [els.simAttendance, simulatorRangeConfig.Attendance],
    [els.simPrevious, simulatorRangeConfig.Previous_Scores],
    [els.simExam, simulatorRangeConfig.Exam_Score],
  ].forEach(([input, range]) => {
    if (!input) return;
    input.min = String(range.min);
    input.max = String(range.max);
  });
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
    title: "Risc calculat amb criteri transparent",
    hideDecisionTools: true,
    note: "Estimació orientativa: aquest alumne no s'afegeix al CSV ni recalcula la predicció global; només aplica les regles transparents del dashboard.",
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

    const validationResponse = await fetch(`${VALIDATION_DATA_URL}?v=${Date.now()}`);
    if (validationResponse.ok) {
      state.validationRows = parseCsv(await validationResponse.text(), { idPrefix: "VAL" });
    } else {
      state.validationRows = [];
    }

    try {
      const predResponse = await fetch(`${PREDICTIONS_URL}?v=${Date.now()}`);
      if (predResponse.ok) {
        const predictions = parsePredictions(await predResponse.text());
        applyModelPredictions(state.rows, predictions);
        state.modelMode = "model";
      } else {
        state.modelMode = "rule";
      }
    } catch {
      state.modelMode = "rule";
    }

    try {
      const validationPredResponse = await fetch(`${VALIDATION_PREDICTIONS_URL}?v=${Date.now()}`);
      if (validationPredResponse.ok) {
        applyModelPredictions(state.validationRows, parsePredictions(await validationPredResponse.text()));
      }
    } catch {
      // Validation still works with the transparent fallback risk when predictions are not exported yet.
    }

    try {
      const profileModelResponse = await fetch(`${STUDENT_PROFILE_MODEL_URL}?v=${Date.now()}`);
      state.profileModel = profileModelResponse.ok ? await profileModelResponse.json() : null;
    } catch {
      state.profileModel = null;
    }

    try {
      const profileResponse = await fetch(`${STUDENT_PROFILES_URL}?v=${Date.now()}`);
      if (profileResponse.ok) {
        const profiles = parseStudentProfiles(await profileResponse.text());
        applyStudentProfiles(state.rows, profiles);
      } else {
        applyStudentProfiles(state.rows, new Map());
      }
    } catch {
      applyStudentProfiles(state.rows, new Map());
    }

    try {
      const validationProfileResponse = await fetch(`${VALIDATION_PROFILES_URL}?v=${Date.now()}`);
      if (validationProfileResponse.ok) {
        applyStudentProfiles(state.validationRows, parseStudentProfiles(await validationProfileResponse.text()));
      } else {
        applyStudentProfiles(state.validationRows, new Map());
      }
    } catch {
      applyStudentProfiles(state.validationRows, new Map());
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
if (els.validationSearch) els.validationSearch.addEventListener("input", renderValidationTable);
if (els.validationRiskFilter) els.validationRiskFilter.addEventListener("change", renderValidationTable);
if (els.validationMotivationFilter) els.validationMotivationFilter.addEventListener("change", renderValidationTable);
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
els.validationSortHeaders.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    const sameColumn = state.sort.key === key;
    state.sort = {
      key,
      direction: sameColumn && state.sort.direction === "desc" ? "asc" : "desc",
    };
    renderValidationTable();
  });
});
els.table.addEventListener("click", (event) => {
  const rowEl = event.target.closest("tr");
  if (!rowEl) return;
  const row = state.rows.find((item) => item.id === rowEl.dataset.id);
  if (row) renderDetail(row);
});

els.drivers.addEventListener("click", (event) => {
  const agendaButton = event.target.closest("[data-agenda-id]");
  if (!agendaButton) return;
  openStudentFromAgenda(agendaButton.dataset.agendaId);
});
if (els.validationTable) {
  els.validationTable.addEventListener("click", (event) => {
    const rowEl = event.target.closest("tr");
    if (!rowEl) return;
    const row = state.validationRows.find((item) => item.id === rowEl.dataset.id);
    if (row) renderValidationDetail(row);
  });
}

function updateReviewBadge() {
  if (!els.reviewBadge) return;
  const due = actionStore.getAllPendingReviews().filter((action) => action.status === "a_revisar").length;
  els.reviewBadge.textContent = String(due);
  els.reviewBadge.classList.toggle("hidden", due === 0);
}

function rerenderActionSurfaces(row) {
  updateReviewBadge();
  renderDrivers();
  renderTable();
  if (row) renderDetail(row);
}

function saveActionFromForm(studentId, container) {
  const action = container.querySelector('[data-action-field="action"]')?.value || "Seguiment ordinari";
  const reviewDate = container.querySelector('[data-action-field="reviewDate"]')?.value || addDaysIso(28);
  const notes = (container.querySelector('[data-action-field="notes"]')?.value || "").slice(0, 300);
  actionStore.saveStudentAction(studentId, {
    action,
    appliedDate: todayIso(),
    reviewDate,
    status: "en_seguiment",
    notes,
  });
  state.editingActions.delete(studentId);
}

function openStudentFromAgenda(studentId) {
  const row = state.rows.find((item) => item.id === studentId);
  if (!row) return;
  setView("students");
  renderDetail(row);
}

els.detail.addEventListener("click", (event) => {
  const simulateButton = event.target.closest("[data-simulate-id]");
  if (simulateButton) {
    const id = simulateButton.dataset.simulateId;
    const row = state.rows.find((item) => item.id === id);
    if (row) loadStudentIntoSimulator(row);
    return;
  }
  const editButton = event.target.closest("[data-action-edit]");
  if (editButton) {
    const row = state.rows.find((item) => item.id === editButton.dataset.actionEdit);
    if (!row) return;
    state.editingActions.add(row.id);
    renderDetail(row);
    return;
  }
  const reviewButton = event.target.closest("[data-action-reviewed]");
  if (reviewButton) {
    const row = state.rows.find((item) => item.id === reviewButton.dataset.actionReviewed);
    if (!row) return;
    actionStore.markAsReviewed(row.id);
    state.editingActions.delete(row.id);
    rerenderActionSurfaces(row);
    return;
  }
  const saveButton = event.target.closest("[data-action-save]");
  if (saveButton) {
    const row = state.rows.find((item) => item.id === saveButton.dataset.actionSave);
    const form = event.target.closest("[data-student-action-form]");
    if (!row || !form) return;
    saveActionFromForm(row.id, form);
    rerenderActionSurfaces(row);
  }
});

els.detail.addEventListener("change", (event) => {
  const preset = event.target.closest('[data-action-field="preset"]');
  if (!preset || preset.value === "custom") return;
  const form = preset.closest("[data-student-action-form]");
  const dateInput = form?.querySelector('[data-action-field="reviewDate"]');
  if (dateInput) dateInput.value = addDaysIso(Number(preset.value));
});
if (els.validationDetail) {
  els.validationDetail.addEventListener("click", (event) => {
    const simulateButton = event.target.closest("[data-simulate-id]");
    const id = simulateButton?.dataset.simulateId;
    if (!id) return;
    const row = state.validationRows.find((item) => item.id === id);
    if (!row) return;
    if (simulateButton) loadStudentIntoSimulator(row);
  });
}

[els.simMotivation, els.simAttendance, els.simHours, els.simPrevious, els.simExam, els.simTutoring, els.simResources].filter(Boolean).forEach((input) => {
  input.addEventListener("input", renderSimulator);
});

[els.newId, els.newMotivation, els.newAttendance, els.newHours, els.newPrevious, els.newExam, els.newTutoring, els.newResources].forEach((input) => {
  input.addEventListener("input", renderNewStudent);
});

window.dashboardTestApi = {
  buildCaseReport,
  buildClusterRiskMatrix,
  buildAgendaSummary,
  buildProfileActionMatrix,
  buildRecommendedActionRows,
  buildDriverRows,
  buildInterventionSegments,
  buildInterventionTimeline,
  buildSimulationCase,
  clientFacingText,
  cleanCatalanText,
  evaluateNewStudent,
  estimateStudentProfile,
  explainabilitySummary,
  applyStudentProfiles,
  normalizeImpactFactor,
  parseCsv,
  parseStudentProfiles,
  readableImpactFactors,
  renderDriverRows,
  renderAgendaSummary,
  renderFactorExplanation,
  renderActionRegistration,
  renderStudentProfile,
  renderStudentExplanation,
  renderStudentRows,
  simulatorRangeConfig,
  studentRiskTitle,
  sortRows,
};

loadData();
