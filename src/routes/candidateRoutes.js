const express = require("express");
const {
  getTestByPasscode,
  getCandidateProfilePrefill,
  loginWithPasscode,
  saveDraftAnswers,
  submitTest,
  getEvaluationStatus,
  logViolation,
  runCode,
  uploadCkeditorImage,
} = require("../controllers/candidateController");
const { requireCandidateSubmissionAuth } = require("../middleware/candidateSessionAuth");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();
const candidateLoginRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: "Too many login attempts. Please try again later.",
});
const runCodeRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many code runs. Please wait and try again.",
});

router.get("/test/:passcode", getTestByPasscode);
router.get("/profile-prefill", getCandidateProfilePrefill);
router.post("/login-with-passcode", candidateLoginRateLimit, loginWithPasscode);
router.post("/submission/:submissionId/draft", requireCandidateSubmissionAuth, saveDraftAnswers);
router.post("/submission/:submissionId/submit", requireCandidateSubmissionAuth, submitTest);
router.get("/submission/:submissionId/evaluation-status", requireCandidateSubmissionAuth, getEvaluationStatus);
router.post("/submission/:submissionId/violation", requireCandidateSubmissionAuth, logViolation);
router.post("/submission/:submissionId/run-code", runCodeRateLimit, requireCandidateSubmissionAuth, runCode);
router.post("/submission/:submissionId/uploads/ckeditor-image", requireCandidateSubmissionAuth, uploadCkeditorImage);

module.exports = router;
