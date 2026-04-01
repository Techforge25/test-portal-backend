const Test = require("../models/Test");
const Submission = require("../models/Submission");
const Violation = require("../models/Violation");
const { notifyAdmins } = require("../utils/adminNotifier");
const { signCandidateSessionToken } = require("../utils/candidateSessionToken");
const { logger } = require("../utils/logger");
const {
  sanitizeEmail,
  sanitizeCandidateProfile,
  validateRequiredCandidateProfile,
  validateCandidateProfileFormats,
  isValidMcqAnswers,
  isValidCodingAnswers,
} = require("../validators/candidateValidators");

const judge0BaseUrl = String(process.env.JUDGE0_BASE_URL || "https://ce.judge0.com").replace(/\/$/, "");

const judge0LanguageMap = {
  javascript: 63,
  typescript: 74,
  python: 71,
  java: 62,
  cpp: 54,
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function publicTestShape(test) {
  return {
    id: test._id,
    title: test.title,
    position: test.position,
    durationMinutes: test.durationMinutes,
    passPercentage: test.passPercentage,
    security: test.security,
    mcqQuestions: (test.mcqQuestions || []).map((q, idx) => ({
      index: idx,
      question: q.question,
      options: q.options.map((opt) => opt.text),
      marks: q.marks,
    })),
    codingTasks: (test.codingTasks || []).map((task, idx) => ({
      index: idx,
      title: task.title,
      description: task.description,
      language: task.language,
      marks: task.marks,
      sampleInput: task.sampleInput,
      sampleOutput: task.sampleOutput,
    })),
  };
}

async function findActiveTestByPasscode(passcode) {
  return Test.findOne({
    passcode: String(passcode || "").toUpperCase().trim(),
    status: "active",
    passcodeExpiresAt: { $gt: new Date() },
  });
}

async function findLatestSubmission(testId, candidateEmail) {
  return Submission.findOne({
    test: testId,
    candidateEmail: sanitizeEmail(candidateEmail),
  }).sort({ createdAt: -1 });
}

function defaultNameFromEmail(email) {
  const local = sanitizeEmail(email).split("@")[0] || "Candidate";
  return local
    .split(/[._-]/g)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

async function createOrResumeSubmission({ test, candidateEmail, candidateName, candidateProfile }) {
  const normalizedEmail = sanitizeEmail(candidateEmail);
  const profile = sanitizeCandidateProfile(candidateProfile);
  const latest = await findLatestSubmission(test._id, normalizedEmail);

  if (latest && latest.status === "in_progress") {
    if (candidateName?.trim()) {
      latest.candidateName = candidateName.trim();
    }
    latest.candidateProfile = {
      ...(latest.candidateProfile || {}),
      ...profile,
    };
    await latest.save();
    return {
      resumed: true,
      submission: latest,
    };
  }

  const created = await Submission.create({
    test: test._id,
    candidateName: candidateName?.trim() || defaultNameFromEmail(normalizedEmail),
    candidateEmail: normalizedEmail,
    candidateProfile: profile,
    status: "in_progress",
  });

  return {
    resumed: false,
    submission: created,
  };
}

async function getTestByPasscode(req, res) {
  try {
    const test = await findActiveTestByPasscode(req.params.passcode);
    if (!test) {
      return res.status(404).json({ message: "Active test not found for this passcode" });
    }
    return res.json({ test: publicTestShape(test) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch test" });
  }
}

async function loginWithPasscode(req, res) {
  try {
    const { candidateEmail, testPasscode, candidateName = "", candidateProfile = {} } = req.body;
    if (!candidateEmail || !testPasscode) {
      return res.status(400).json({ message: "candidateEmail and testPasscode are required" });
    }
    const missingProfileFields = validateRequiredCandidateProfile(candidateName, candidateProfile);
    if (missingProfileFields.length > 0) {
      return res.status(400).json({
        message: `All candidate registration fields are required. Missing: ${missingProfileFields.join(", ")}`,
      });
    }
    const profileErrors = validateCandidateProfileFormats(candidateEmail, candidateName, candidateProfile);
    if (profileErrors.length > 0) {
      return res.status(400).json({ message: profileErrors[0] });
    }

    const test = await findActiveTestByPasscode(testPasscode);
    if (!test) {
      return res.status(404).json({ message: "Invalid passcode or test is not active" });
    }

    const result = await createOrResumeSubmission({
      test,
      candidateEmail,
      candidateName,
      candidateProfile,
    });

    if (!result.resumed) {
      notifyAdmins("new_candidate", {
        candidateName: result.submission.candidateName,
        candidateEmail: result.submission.candidateEmail,
        testTitle: test.title,
      }).catch((error) => {
        logger.warn("new_candidate notification failed", { message: error.message });
      });
    }

    return res.json({
      message: result.resumed ? "Session resumed" : "Login successful",
      resumed: result.resumed,
      candidateSessionToken: signCandidateSessionToken({
        submissionId: result.submission._id,
        candidateEmail: result.submission.candidateEmail,
        testId: test._id,
      }),
      test: publicTestShape(test),
      submission: {
        id: result.submission._id,
        candidateName: result.submission.candidateName,
        candidateEmail: result.submission.candidateEmail,
        status: result.submission.status,
        startedAt: result.submission.startedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to login candidate" });
  }
}

async function saveDraftAnswers(req, res) {
  try {
    const { submissionId } = req.params;
    const { mcqAnswers = [], codingAnswers = [] } = req.body;
    if (!isValidMcqAnswers(mcqAnswers)) {
      return res.status(400).json({ message: "Invalid MCQ answers payload" });
    }
    if (!isValidCodingAnswers(codingAnswers)) {
      return res.status(400).json({ message: "Invalid coding answers payload" });
    }

    const submission = req.candidateSubmission || (await Submission.findById(submissionId));
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }
    if (submission.status !== "in_progress") {
      return res.status(400).json({ message: "Submission already finalized" });
    }

    submission.mcqAnswers = mcqAnswers;
    submission.codingAnswers = codingAnswers;
    await submission.save();

    return res.json({ message: "Draft saved" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save draft" });
  }
}

function calculateMcqScore(test, mcqAnswers) {
  let score = 0;
  const answersByIndex = new Map();
  (mcqAnswers || []).forEach((a) => answersByIndex.set(a.questionIndex, a.selectedOptionIndex));

  test.mcqQuestions.forEach((q, index) => {
    if (answersByIndex.get(index) === q.correctOptionIndex) {
      score += q.marks || 1;
    }
  });
  return score;
}

async function submitTest(req, res) {
  try {
    const { submissionId } = req.params;
    const { mcqAnswers = [], codingAnswers = [], auto = false, endedReason = "" } = req.body;
    if (!isValidMcqAnswers(mcqAnswers)) {
      return res.status(400).json({ message: "Invalid MCQ answers payload" });
    }
    if (!isValidCodingAnswers(codingAnswers)) {
      return res.status(400).json({ message: "Invalid coding answers payload" });
    }

    const submission = (await Submission.findById(submissionId).populate("test")) || null;
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }
    if (submission.status !== "in_progress") {
      return res.status(400).json({ message: "Submission already finalized" });
    }

    submission.mcqAnswers = mcqAnswers;
    submission.codingAnswers = codingAnswers;
    submission.totalScore = calculateMcqScore(submission.test, mcqAnswers);
    submission.status = auto ? "auto_submitted" : "submitted";
    submission.endedReason = endedReason || (auto ? "auto_end_triggered" : "submitted_by_candidate");
    submission.submittedAt = new Date();
    await submission.save();

    notifyAdmins("test_completed", {
      candidateName: submission.candidateName,
      candidateEmail: submission.candidateEmail,
      testTitle: submission.test?.title || "Assessment",
      score: String(submission.totalScore || 0),
    }).catch((error) => {
      logger.warn("test_completed notification failed", { message: error.message });
    });

    return res.json({
      message: "Submission completed",
      submission: {
        id: submission._id,
        status: submission.status,
        totalScore: submission.totalScore,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to submit test" });
  }
}

async function logViolation(req, res) {
  try {
    const { submissionId } = req.params;
    const { type, severity = "medium", actionTaken = "logged", meta = {} } = req.body;
    if (!type) {
      return res.status(400).json({ message: "type is required" });
    }

    const submission = (await Submission.findById(submissionId).populate("test")) || null;
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const dedupMs = parsePositiveInt(process.env.VIOLATION_DEDUP_MS, 2500);
    const dedupSince = new Date(Date.now() - dedupMs);
    const recentSameViolation = await Violation.findOne({
      submission: submission._id,
      type,
      occurredAt: { $gte: dedupSince },
    }).select("_id");
    if (recentSameViolation) {
      const warningLimit = submission.test?.security?.warningLimit || 2;
      return res.status(200).json({
        message: "Violation ignored (duplicate within cooldown)",
        warningCount: submission.warningCount,
        warningLimit,
        shouldAutoEnd: submission.warningCount >= warningLimit,
        deduped: true,
      });
    }

    const violation = await Violation.create({
      test: submission.test._id,
      submission: submission._id,
      type,
      severity,
      actionTaken,
      meta,
    });

    submission.warningCount += 1;
    await submission.save();

    const warningLimit = submission.test?.security?.warningLimit || 2;
    const shouldAutoEnd = submission.warningCount >= warningLimit && actionTaken !== "logged";

    if (String(severity).toLowerCase() === "high") {
      notifyAdmins("high_violation", {
        candidateName: submission.candidateName,
        candidateEmail: submission.candidateEmail,
        testTitle: submission.test?.title || "Assessment",
        violationType: type,
      }).catch((error) => {
        logger.warn("high_violation notification failed", { message: error.message });
      });
    }

    return res.status(201).json({
      message: "Violation logged",
      violation,
      warningCount: submission.warningCount,
      warningLimit,
      shouldAutoEnd,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to log violation" });
  }
}

function buildJudge0Headers() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (process.env.JUDGE0_RAPIDAPI_KEY) {
    headers["x-rapidapi-key"] = process.env.JUDGE0_RAPIDAPI_KEY;
  }
  if (process.env.JUDGE0_RAPIDAPI_HOST) {
    headers["x-rapidapi-host"] = process.env.JUDGE0_RAPIDAPI_HOST;
  }
  if (process.env.JUDGE0_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.JUDGE0_AUTH_TOKEN}`;
  }

  return headers;
}

async function runCode(req, res) {
  try {
    const { submissionId } = req.params;
    const { language, sourceCode, stdin = "" } = req.body || {};

    if (!sourceCode || !String(sourceCode).trim()) {
      return res.status(400).json({ message: "sourceCode is required" });
    }

    const languageId = judge0LanguageMap[String(language || "").toLowerCase().trim()];
    if (!languageId) {
      return res.status(400).json({ message: "Unsupported language" });
    }

    const submission = req.candidateSubmission || (await Submission.findById(submissionId));
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }
    if (submission.status !== "in_progress") {
      return res.status(400).json({ message: "Submission already finalized" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`${judge0BaseUrl}/submissions?base64_encoded=false&wait=true`, {
        method: "POST",
        headers: buildJudge0Headers(),
        body: JSON.stringify({
          language_id: languageId,
          source_code: String(sourceCode),
          stdin: String(stdin || ""),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(502).json({
        message: payload.message || payload.error || "Execution service request failed",
      });
    }

    return res.json({
      message: "Code executed",
      result: {
        status: payload.status?.description || "Unknown",
        stdout: payload.stdout || "",
        stderr: payload.stderr || "",
        compileOutput: payload.compile_output || "",
        message: payload.message || "",
        time: payload.time || "",
        memory: payload.memory || "",
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({ message: "Code execution timed out" });
    }
    return res.status(500).json({ message: "Failed to run code" });
  }
}

module.exports = {
  getTestByPasscode,
  loginWithPasscode,
  saveDraftAnswers,
  submitTest,
  logViolation,
  runCode,
};
