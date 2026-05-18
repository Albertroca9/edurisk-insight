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
    action: "Intervenció: contacte prioritari i pla d'estudi",
    help: "Grup d'alumnes amb assistència baixa i dedicació d'estudi insuficient.",
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

test("impact factors combine one-hot motivation into one readable factor", () => {
  const { readableImpactFactors } = loadDashboardApi();

  const factors = readableImpactFactors([
    { feature: "Motivation_Level_Low", label: "Motivation Level Low", value: true, shap: 3.2 },
    { feature: "Motivation_Level_Medium", label: "Motivation Level Medium", value: false, shap: -1.1 },
    { feature: "Attendance", label: "Attendance", value: 64, shap: 2.1 },
  ]);

  assert.equal(factors.filter((factor) => factor.label === "Motivació").length, 1);
  assert.equal(factors.find((factor) => factor.label === "Motivació").displayValue, "baixa");
  assert.equal(factors.some((factor) => /true|false/i.test(factor.displayValue)), false);
});

test("renderFactorExplanation uses client-friendly labels instead of internal impact numbers", () => {
  const { renderFactorExplanation } = loadDashboardApi();

  const html = renderFactorExplanation([
    { feature: "Attendance", label: "Attendance", value: 64, impact: -25 },
    { feature: "Exam_Score", label: "Exam Score", value: 61, impact: 12 },
    { feature: "Motivation_Level_Low", label: "Motivation Level Low", value: true, shap: 3.2 },
    { feature: "Hours_Studied", label: "Hours Studied", value: 25, shap: -1.2 },
  ]);

  assert.equal(html.includes("explica aquest risc"), true);
  assert.equal(html.includes("Factor de risc important"), true);
  assert.equal(html.includes("Factor protector"), false);
  assert.equal(html.includes("+"), false);
  assert.equal(html.includes("impact-track"), false);
});

test("student detail explains the case with a direct summary and concrete signals", () => {
  const { renderStudentExplanation } = loadDashboardApi();
  const html = renderStudentExplanation({
    id: "STU-0001",
    riskScore: 84,
    riskLevel: "high",
    Motivation_Level: "Low",
    Attendance: 64,
    Hours_Studied: 8,
    Exam_Score: 59,
    riskFactors: [
      { feature: "Motivation_Level_Low", label: "Motivation Level Low", value: true, impact: 32 },
      { feature: "Attendance", label: "Attendance", value: 64, impact: 21 },
      { feature: "Hours_Studied", label: "Hours Studied", value: 8, impact: 18 },
    ],
    recommendedActions: [["Seguiment d'assistència", "Contacte preventiu."]],
    studentProfile: {
      name: "Perfil de risc",
      summary: "Assistència baixa",
      characteristics: ["Assistència baixa"],
      recommendation: "Seguiment",
    },
  });

  assert.equal(html.includes("Lectura del cas"), true);
  assert.equal(html.includes("Aquest alumne té risc alt perquè presenta motivació baixa, assistència del 64%, 8 hores d&#039;estudi."), true);
  assert.equal(html.includes("&lt; 75%"), true);
  assert.equal(html.includes("Pròxim pas"), true);
  assert.equal(html.includes("Simular aquest alumne"), true);
  assert.equal(html.includes("Exportar informe"), false);
  assert.equal(html.includes("Factor de risc important"), false);
  assert.equal(html.includes("Redueix el risc estimat"), false);
});

test("student detail shows risk factors as a quick value and threshold table", () => {
  const { renderStudentExplanation } = loadDashboardApi();
  const html = renderStudentExplanation({
    id: "STU-0001",
    riskScore: 84,
    riskLevel: "high",
    Motivation_Level: "Low",
    Attendance: 64,
    Hours_Studied: 8,
    Exam_Score: 59,
    Previous_Scores: 62,
    riskFactors: [
      { feature: "Attendance", label: "Attendance", value: 64, impact: 21 },
      { feature: "Hours_Studied", label: "Hours Studied", value: 8, impact: 18 },
      { feature: "Motivation_Level_Low", label: "Motivation Level Low", value: true, impact: 32 },
    ],
    recommendedActions: [["Seguiment d'assistència", "Contacte preventiu."]],
    studentProfile: {
      name: "Perfil de risc",
      summary: "Assistència baixa",
      characteristics: ["Assistència baixa"],
      recommendation: "Seguiment",
    },
  });

  assert.equal(html.includes("Factors de risc de l&#039;alumne"), true);
  assert.equal(html.includes("Valor de l&#039;alumne"), true);
  assert.equal(html.includes("64%"), true);
  assert.equal(html.includes("&lt; 75%"), true);
  assert.equal(html.includes("Crític"), true);
  assert.equal(html.includes("8 h"), true);
  assert.equal(html.includes("&lt; 15 h"), true);
  assert.equal(html.includes("Baixa"), true);
  assert.equal(html.includes("Low"), false);
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

test("estimateStudentProfile assigns the nearest exported profile to a new student", () => {
  const { estimateStudentProfile } = loadDashboardApi();
  const profileModel = {
    columns: ["Attendance", "Hours_Studied"],
    means: { Attendance: 50, Hours_Studied: 10 },
    stds: { Attendance: 10, Hours_Studied: 5 },
    centroids: {
      1: { Attendance: -2, Hours_Studied: -1 },
      2: { Attendance: 3, Hours_Studied: 2 },
    },
    profiles: {
      1: {
        profile_id: 1,
        profile_name: "Perfil d'alumne 1",
        profile_summary: "Baixa assistencia",
        profile_characteristics: ["Assistencia baixa"],
        profile_recommendation: "Seguiment",
      },
      2: {
        profile_id: 2,
        profile_name: "Perfil d'alumne 2",
        profile_summary: "Bon seguiment",
        profile_characteristics: ["Assistencia alta"],
        profile_recommendation: "Monitoritzacio",
      },
    },
  };

  const profile = estimateStudentProfile({ Attendance: 30, Hours_Studied: 5 }, profileModel);

  assert.equal(profile.name, "Perfil d'alumne 1");
  assert.equal(profile.summary, "Baixa assistencia");
});

test("renderStudentRows returns every filtered student instead of truncating the table", () => {
  const { renderStudentRows } = loadDashboardApi();
  const rows = Array.from({ length: 260 }, (_, index) => ({
    id: `STU-${String(index + 1).padStart(4, "0")}`,
    riskScore: index % 100,
    riskLevel: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
    studentProfile: { name: `Perfil d'alumne ${(index % 4) + 1}` },
    Motivation_Level: "Medium",
    Attendance: 80,
    Hours_Studied: 12,
    Exam_Score: 70,
    recommendedActions: [["Seguiment", ""]],
  }));

  const html = renderStudentRows(rows);

  assert.equal((html.match(/<tr data-id=/g) || []).length, 260);
  assert.equal(html.includes("STU-0260"), true);
});

test("student detail title uses abandonment risk wording instead of system prediction wording", () => {
  const { studentRiskTitle } = loadDashboardApi();

  assert.equal(studentRiskTitle({ xgbProbability: 0.999, riskScore: 100 }), "Risc d'abandonament: 99.9%");
  assert.equal(studentRiskTitle({ dropout: 1, riskScore: 82 }), "Risc d'abandonament: 82%");
});

test("buildInterventionTimeline returns an explainable intervention plan", () => {
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

  assert.equal(timeline.length, 4);
  assert.equal(timeline[0].label, "Ara");
  assert.equal(timeline[0].riskScore, 92);
  assert.equal(timeline[0].riskLabel, "Risc actual");
  assert.equal(timeline[1].label, "Acció inicial");
  assert.equal(timeline[1].action, "Reforc academic");
  assert.equal(timeline[2].label, "Revisió en 4 setmanes");
  assert.equal(timeline[3].label, "Objectiu a 8 setmanes");
  assert.equal(timeline[3].riskScore < timeline[0].riskScore, true);
  assert.equal(timeline[3].riskLabel, "Risc estimat si milloren els indicadors");
  assert.equal(timeline[3].Attendance > timeline[0].Attendance, true);
  assert.equal(timeline[3].Motivation_Level, "Medium");
  assert.equal(timeline[3].assumption.includes("+12 punts d'assistència"), true);
});

test("student detail labels intervention timeline as a proposed plan with estimated risk", () => {
  const { renderStudentExplanation } = loadDashboardApi();
  const html = renderStudentExplanation({
    id: "STU-0001",
    riskScore: 92,
    riskLevel: "high",
    Motivation_Level: "Low",
    Attendance: 62,
    Hours_Studied: 8,
    Exam_Score: 59,
    Previous_Scores: 61,
    riskFactors: [{ feature: "Attendance", label: "Attendance", value: 62, impact: 22 }],
    recommendedActions: [["Reforç acadèmic", "Sessions focalitzades."]],
    studentProfile: {
      name: "Perfil de risc",
      summary: "Baix rendiment",
      characteristics: ["Assistència baixa"],
      recommendation: "Seguiment",
    },
  });

  assert.equal(html.includes("Pla d'intervenció proposat"), true);
  assert.equal(html.includes("Risc actual"), true);
  assert.equal(html.includes("Risc estimat si milloren els indicadors"), true);
  assert.equal(html.includes("No és una predicció garantida"), true);
  assert.equal(html.includes("Objectiu a 8 setmanes"), true);
});

test("explainabilitySummary describes the active model source", () => {
  const { explainabilitySummary } = loadDashboardApi();

  assert.equal(
    explainabilitySummary("model"),
    "Predicció del sistema: cada resultat inclou factors que indiquen què incrementa o redueix el risc.",
  );
  assert.equal(
    explainabilitySummary("rule"),
    "Criteri transparent: el risc es calcula amb regles sobre assistència, estudi, notes i motivació.",
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

test("clientFacingText removes technical model vocabulary", () => {
  const { clientFacingText } = loadDashboardApi();

  const text = [
    clientFacingText("Probabilitat XGBoost 82.4%"),
    clientFacingText("XGBoost + SHAP"),
    clientFacingText("Dropout observat al dataset"),
    clientFacingText("Score explicable"),
  ].join(" ");

  assert.equal(/xgboost|shap|dropout|score|dataset/i.test(text), false);
  assert.equal(text.includes("Predicci"), true);
  assert.equal(/abandonament observat/i.test(text), true);
});

test("simulator ranges use true 0 to 100 limits for percentages and grades", () => {
  const { simulatorRangeConfig } = loadDashboardApi();

  assert.equal(simulatorRangeConfig.Attendance.min, 0);
  assert.equal(simulatorRangeConfig.Attendance.max, 100);
  assert.equal(simulatorRangeConfig.Previous_Scores.min, 0);
  assert.equal(simulatorRangeConfig.Previous_Scores.max, 100);
  assert.equal(simulatorRangeConfig.Exam_Score.min, 0);
  assert.equal(simulatorRangeConfig.Exam_Score.max, 100);
});

test("parseCsv can prefix validation students separately from training students", () => {
  const { parseCsv } = loadDashboardApi();
  const csv = [
    "Hours_Studied,Attendance,Previous_Scores,Motivation_Level,Tutoring_Sessions,Access_to_Resources,Exam_Score,dropout",
    "0,20,60,Low,0,High,60,0",
    "14,90,85,Medium,0,High,85,0",
  ].join("\n");

  const rows = parseCsv(csv, { idPrefix: "VAL" });

  assert.equal(rows[0].id, "VAL-0001");
  assert.equal(rows[1].id, "VAL-0002");
});
