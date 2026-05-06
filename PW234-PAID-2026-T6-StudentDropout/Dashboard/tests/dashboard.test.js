const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDashboardApi() {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const noop = () => {};
  const canvas = {
    width: 900,
    height: 420,
    getContext: () => ({
      beginPath: noop,
      clearRect: noop,
      fill: noop,
      fillRect: noop,
      fillText: noop,
      lineTo: noop,
      moveTo: noop,
      restore: noop,
      rotate: noop,
      save: noop,
      stroke: noop,
      rect: noop,
      arc: noop,
      measureText: (text) => ({ width: String(text).length * 7 }),
    }),
  };
  const element = {
    addEventListener: noop,
    classList: { add: noop, remove: noop, toggle: noop },
    querySelectorAll: () => [],
    querySelector: () => element,
    dataset: {},
    style: {},
    value: "all",
    innerHTML: "",
    textContent: "",
  };
  const document = {
    querySelector: (selector) => (selector.includes("chart") ? canvas : element),
    querySelectorAll: () => [],
  };
  const context = {
    console,
    document,
    fetch: () => Promise.reject(new Error("test fetch disabled")),
    Intl,
    Math,
    window: {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.dashboardTestApi;
}

test("buildInterventionSegments groups students into teacher action segments", () => {
  const { buildInterventionSegments } = loadDashboardApi();
  const rows = [
    { riskLevel: "high", Attendance: 70, Hours_Studied: 10, Exam_Score: 80, Previous_Scores: 82, Motivation_Level: "High" },
    { riskLevel: "medium", Attendance: 92, Hours_Studied: 9, Exam_Score: 66, Previous_Scores: 71, Motivation_Level: "Low" },
    { riskLevel: "low", Attendance: 88, Hours_Studied: 28, Exam_Score: 91, Previous_Scores: 89, Motivation_Level: "High" },
  ];

  const segments = buildInterventionSegments(rows);

  assert.equal(JSON.stringify(segments[0]), JSON.stringify({
    key: "low-attendance-and-study",
    label: "Assistència baixa + poques hores",
    action: "Contacte prioritari i pla d'estudi",
    high: 1,
    medium: 0,
    low: 0,
    total: 1,
  }));
  assert.equal(segments.find((segment) => segment.key === "low-study").total, 2);
  assert.equal(segments.find((segment) => segment.key === "low-motivation").medium, 1);
});

test("normalizeImpactFactor supports SHAP and fallback impact values", () => {
  const { normalizeImpactFactor } = loadDashboardApi();

  assert.equal(JSON.stringify(normalizeImpactFactor({ feature: "Attendance", value: "72", shap: 0.37 })), JSON.stringify({
    label: "Assistència",
    impact: -0.37,
    displayValue: "72",
  }));
  assert.equal(JSON.stringify(normalizeImpactFactor({ label: "Assistència baixa", impact: 18 })), JSON.stringify({
    label: "Assistència baixa",
    impact: -18,
    displayValue: "",
  }));
  assert.equal(normalizeImpactFactor({ label: "Tutoring Sessions", value: 0, impact: 2 }).label, "Tutories");
});

test("cleanCatalanText fixes common missing accents and mojibake", () => {
  const { cleanCatalanText } = loadDashboardApi();

  assert.equal(
    cleanCatalanText("Revisio individual d'objectius, barreres i compromÃ­s amb el curs."),
    "Revisió individual d'objectius, barreres i compromís amb el curs.",
  );
  assert.equal(cleanCatalanText("Seguiment d'assistencia i presencia a classe."), "Seguiment d'assistència i presència a classe.");
  assert.equal(cleanCatalanText("Intervencio prioritaria"), "Intervenció prioritària");
  assert.equal(cleanCatalanText("Tutoria motivacional i motivacio baixa"), "Tutoria motivacional i motivació baixa");
});

test("sortRows orders table data by selected column and direction", () => {
  const { sortRows } = loadDashboardApi();
  const rows = [
    { id: "STU-0002", riskScore: 92, Motivation_Level: "Low", Attendance: 64, Hours_Studied: 19, Exam_Score: 61, recommendedActions: [["Tutoria", ""]] },
    { id: "STU-0001", riskScore: 40, Motivation_Level: "High", Attendance: 90, Hours_Studied: 8, Exam_Score: 88, recommendedActions: [["Seguiment", ""]] },
    { id: "STU-0003", riskScore: 75, Motivation_Level: "Medium", Attendance: 72, Hours_Studied: 25, Exam_Score: 70, recommendedActions: [["Reforç", ""]] },
  ];

  assert.equal(sortRows(rows, "riskScore", "desc").map((row) => row.id).join(","), "STU-0002,STU-0003,STU-0001");
  assert.equal(sortRows(rows, "Hours_Studied", "asc").map((row) => row.id).join(","), "STU-0001,STU-0002,STU-0003");
  assert.equal(sortRows(rows, "Motivation_Level", "asc").map((row) => row.id).join(","), "STU-0001,STU-0002,STU-0003");
});

test("parseStudentProfiles and applyStudentProfiles attach readable profile data", () => {
  const { applyStudentProfiles, parseStudentProfiles } = loadDashboardApi();
  const profiles = parseStudentProfiles([
    "id,profile_id,profile_name,profile_summary,profile_characteristics,profile_recommendation",
    "STU-0002,2,Perfil d'alumne 2,\"Risc academic alt\",\"Assistencia baixa|Motivacio baixa|Poques hores d'estudi\",\"Reforc progressiu\"",
  ].join("\n"));
  const rows = [{ id: "STU-0002" }, { id: "STU-9999" }];

  applyStudentProfiles(rows, profiles);

  assert.equal(rows[0].studentProfile.name, "Perfil d'alumne 2");
  assert.equal(rows[0].studentProfile.characteristics.length, 3);
  assert.equal(rows[0].studentProfile.characteristics[0], "Assistència baixa");
  assert.equal(rows[1].studentProfile.name, "Perfil d'alumne no classificat");
});

test("buildInterventionTimeline spreads intervention impact over time", () => {
  const { buildInterventionTimeline } = loadDashboardApi();
  const row = {
    riskScore: 92,
    riskLevel: "high",
    Attendance: 62,
    Hours_Studied: 8,
    Exam_Score: 59,
    Motivation_Level: "Low",
    recommendedActions: [["Reforc academic", ""]],
  };

  const timeline = buildInterventionTimeline(row);

  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].label, "Setmana 0");
  assert.equal(timeline[0].riskScore, 92);
  assert.equal(timeline[1].riskScore < timeline[0].riskScore, true);
  assert.equal(timeline[2].riskScore < timeline[1].riskScore, true);
  assert.equal(timeline[2].Attendance > timeline[0].Attendance, true);
  assert.equal(timeline[2].Motivation_Level, "Medium");
});

test("explainabilitySummary describes the active model source", () => {
  const { explainabilitySummary } = loadDashboardApi();

  assert.equal(
    explainabilitySummary("xgboost"),
    "XGBoost + SHAP: cada predicció inclou factors locals que indiquen què incrementa o redueix el risc.",
  );
  assert.equal(
    explainabilitySummary("rule"),
    "Score explicable: el risc es calcula amb regles transparents sobre assistència, estudi, notes i motivació.",
  );
});

test("evaluateNewStudent calculates risk factors and recommended actions from form values", () => {
  const { evaluateNewStudent } = loadDashboardApi();

  const result = evaluateNewStudent({
    id: "NOU-001",
    Motivation_Level: "Low",
    Attendance: 62,
    Hours_Studied: 8,
    Previous_Scores: 58,
    Exam_Score: 59,
    Tutoring_Sessions: 0,
    Access_to_Resources: "Low",
  });

  assert.equal(result.id, "NOU-001");
  assert.equal(result.riskLevel, "high");
  assert.equal(result.riskScore > 80, true);
  assert.equal(result.riskFactors.some((factor) => factor.label === "Motivació baixa"), true);
  assert.equal(result.recommendedActions.some(([title]) => title === "Tutoria motivacional"), true);
  assert.equal(result.recommendedActions.some(([title]) => title === "Seguiment d'assistència"), true);
});
test("buildSimulationCase compares a concrete student with simulated values", () => {
  const { buildSimulationCase } = loadDashboardApi();
  const source = {
    id: "STU-0042",
    Motivation_Level: "Low",
    Attendance: 62,
    Hours_Studied: 8,
    Previous_Scores: 58,
    Exam_Score: 59,
    Tutoring_Sessions: 0,
    Access_to_Resources: "Low",
    riskScore: 94,
    riskLevel: "high",
  };

  const result = buildSimulationCase({
    Motivation_Level: "Medium",
    Attendance: 84,
    Hours_Studied: 22,
    Previous_Scores: 72,
    Exam_Score: 74,
    Tutoring_Sessions: 2,
    Access_to_Resources: "High",
  }, source);

  assert.equal(result.id, "STU-0042");
  assert.equal(result.original.riskScore, 94);
  assert.equal(result.simulated.Attendance, 84);
  assert.equal(result.delta < 0, true);
  assert.equal(result.simulated.recommendedActions.length > 0, true);
});

test("buildCaseReport returns escaped printable HTML with original and simulated risk", () => {
  const { buildCaseReport, buildSimulationCase } = loadDashboardApi();
  const simulationCase = buildSimulationCase({
    Motivation_Level: "Medium",
    Attendance: 82,
    Hours_Studied: 20,
    Previous_Scores: 72,
    Exam_Score: 74,
    Tutoring_Sessions: 1,
    Access_to_Resources: "Medium",
  }, {
    id: "STU-<script>",
    Motivation_Level: "Low",
    Attendance: 62,
    Hours_Studied: 8,
    Previous_Scores: 58,
    Exam_Score: 59,
    Tutoring_Sessions: 0,
    Access_to_Resources: "Low",
    riskScore: 92,
    riskLevel: "high",
  });

  const report = buildCaseReport(simulationCase);

  assert.equal(report.includes("<!doctype html>"), true);
  assert.equal(report.includes("STU-&lt;script&gt;"), true);
  assert.equal(report.includes("Risc original"), true);
  assert.equal(report.includes("Risc simulat"), true);
  assert.equal(report.includes("Accions recomanades"), true);
});
