const express = require("express");
const {
  getDashboardData,
  listReviewSubmissions,
  getReviewSubmissionDetail,
  saveReviewDecision,
  listCandidates,
  listViolations,
} = require("../controllers/adminInsightsController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/dashboard", getDashboardData);
router.get("/reviews", listReviewSubmissions);
router.get("/reviews/:submissionId", getReviewSubmissionDetail);
router.patch("/reviews/:submissionId/decision", saveReviewDecision);
router.get("/candidates", listCandidates);
router.get("/violations", listViolations);

module.exports = router;
