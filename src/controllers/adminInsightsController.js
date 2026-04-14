const {
  parsePositiveInt,
  loadDashboardData,
  loadReviewSubmissions,
  loadReviewSubmissionDetail,
  persistReviewDecision,
  loadCandidates,
  loadViolations,
} = require("../services/adminInsightsService");
const { emitAdmin, emitAdminDataChanged } = require("../realtime/socketServer");

async function getDashboardData(req, res) {
  try {
    const data = await loadDashboardData(req.user._id);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load dashboard data" });
  }
}

async function listReviewSubmissions(req, res) {
  try {
    const data = await loadReviewSubmissions({
      userId: req.user._id,
      tab: req.query.tab || "pending",
      search: req.query.search || "",
      page: parsePositiveInt(req.query.page, 1),
      pageSize: Math.min(parsePositiveInt(req.query.pageSize, 20), 100),
    });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to list review submissions" });
  }
}

async function getReviewSubmissionDetail(req, res) {
  try {
    const data = await loadReviewSubmissionDetail({
      userId: req.user._id,
      submissionId: req.params.submissionId,
    });

    if (!data) {
      return res.status(404).json({ message: "Submission not found" });
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to get submission detail" });
  }
}

async function saveReviewDecision(req, res) {
  try {
    const data = await persistReviewDecision({
      userId: req.user._id,
      submissionId: req.params.submissionId,
      payload: req.body,
    });
    emitAdmin("admin:reviews.updated", {
      action: "decision_saved",
      submissionId: String(req.params.submissionId || ""),
    });
    emitAdmin("admin:candidates.updated", {
      action: "review_decision_saved",
      submissionId: String(req.params.submissionId || ""),
    });
    emitAdminDataChanged({
      source: "review_decision_saved",
      submissionId: String(req.params.submissionId || ""),
    });
    return res.json(data);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message || "Invalid decision" });
    }
    if (error.status === 404) {
      return res.status(404).json({ message: error.message || "Submission not found" });
    }
    return res.status(500).json({ message: "Failed to save review decision" });
  }
}

async function listCandidates(req, res) {
  try {
    const data = await loadCandidates({
      userId: req.user._id,
      search: req.query.search || "",
      severity: req.query.severity || "all",
      position: req.query.position || "all",
      page: parsePositiveInt(req.query.page, 1),
      pageSize: Math.min(parsePositiveInt(req.query.pageSize, 20), 100),
    });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to list candidates" });
  }
}

async function listViolations(req, res) {
  try {
    const data = await loadViolations({
      userId: req.user._id,
      search: req.query.search || "",
      severity: req.query.severity || "all",
      page: parsePositiveInt(req.query.page, 1),
      pageSize: Math.min(parsePositiveInt(req.query.pageSize, 20), 100),
    });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to list violations" });
  }
}

module.exports = {
  getDashboardData,
  listReviewSubmissions,
  getReviewSubmissionDetail,
  saveReviewDecision,
  listCandidates,
  listViolations,
};
