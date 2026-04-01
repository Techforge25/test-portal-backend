const jwt = require("jsonwebtoken");

function getSecret() {
  return process.env.CANDIDATE_SESSION_SECRET || process.env.JWT_SECRET;
}

function signCandidateSessionToken({ submissionId, candidateEmail, testId }) {
  return jwt.sign(
    {
      type: "candidate_session",
      sid: String(submissionId),
      email: String(candidateEmail || "").toLowerCase().trim(),
      testId: String(testId),
    },
    getSecret(),
    { expiresIn: "12h" }
  );
}

function verifyCandidateSessionToken(token) {
  const payload = jwt.verify(token, getSecret());
  if (!payload || payload.type !== "candidate_session") {
    throw new Error("Invalid candidate session token");
  }
  return payload;
}

module.exports = {
  signCandidateSessionToken,
  verifyCandidateSessionToken,
};
