const Submission = require("../models/Submission");
const { verifyCandidateSessionToken } = require("../utils/candidateSessionToken");

async function requireCandidateSubmissionAuth(req, res, next) {
  try {
    const token = String(req.headers["x-candidate-session"] || "").trim();
    if (!token) {
      return res.status(401).json({ message: "Unauthorized candidate session" });
    }

    const payload = verifyCandidateSessionToken(token);
    const submissionId = String(req.params.submissionId || "");
    if (!submissionId || payload.sid !== submissionId) {
      return res.status(403).json({ message: "Submission access denied" });
    }

    const submission = await Submission.findById(submissionId).select("_id candidateEmail test status");
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (String(submission.candidateEmail || "").toLowerCase() !== String(payload.email || "").toLowerCase()) {
      return res.status(403).json({ message: "Submission access denied" });
    }

    if (String(submission.test) !== String(payload.testId)) {
      return res.status(403).json({ message: "Submission access denied" });
    }

    req.candidateSubmission = submission;
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized candidate session" });
  }
}

module.exports = { requireCandidateSubmissionAuth };

