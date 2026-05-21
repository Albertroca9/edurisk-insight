(function () {
  const STORAGE_KEY = "paid_dashboard_student_actions";

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function readAll() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeAll(actions) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(actions));
    } catch {
      // localStorage can be unavailable in private or test contexts.
    }
  }

  function normalizeAction(record) {
    if (!record || !record.studentId) return null;
    const reviewDate = record.reviewDate || "";
    const baseStatus = record.status || "en_seguiment";
    const status = baseStatus !== "tancat" && reviewDate && reviewDate <= todayIso()
      ? "a_revisar"
      : baseStatus;
    return {
      studentId: record.studentId,
      action: record.action || "",
      appliedDate: record.appliedDate || todayIso(),
      reviewDate,
      status,
      notes: record.notes || "",
    };
  }

  function getStudentAction(studentId) {
    return normalizeAction(readAll()[studentId]) || null;
  }

  function saveStudentAction(studentId, actionData) {
    const actions = readAll();
    const record = normalizeAction({
      studentId,
      action: actionData.action,
      appliedDate: actionData.appliedDate || todayIso(),
      reviewDate: actionData.reviewDate,
      status: actionData.status || "en_seguiment",
      notes: actionData.notes || "",
    });
    actions[studentId] = record;
    writeAll(actions);
    return record;
  }

  function getAllPendingReviews() {
    return Object.values(readAll())
      .map(normalizeAction)
      .filter((record) => record && record.reviewDate && record.status !== "tancat");
  }

  function markAsReviewed(studentId) {
    const actions = readAll();
    const current = normalizeAction(actions[studentId]);
    if (!current) return null;
    actions[studentId] = { ...current, status: "tancat" };
    writeAll(actions);
    return actions[studentId];
  }

  window.ActionStore = {
    getStudentAction,
    saveStudentAction,
    getAllPendingReviews,
    markAsReviewed,
  };
})();
