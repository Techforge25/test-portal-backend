const Submission = require("../models/Submission");
const Violation = require("../models/Violation");
const { notifyAdmins } = require("../utils/adminNotifier");
const { signCandidateSessionToken } = require("../utils/candidateSessionToken");
const { logger } = require("../utils/logger");
const {
  sanitizeEmail,
  validateRequiredCandidateProfile,
  validateCandidateProfileFormats,
  isValidMcqAnswers,
  isValidCodingAnswers,
  isValidSectionAnswers,
} = require("../validators/candidateValidators");
const {
  calculateMcqScore,
  buildQueuedCodingEvaluation,
  processSubmissionCodingEvaluation,
  executeCode,
} = require("../services/codingEvaluationService");
const { enqueueCodingEvaluation } = require("../jobs/codingEvaluationQueue");
const {
  parsePositiveInt,
  asBooleanEnv,
  waitWithTimeout,
  publicTestShape,
  findActiveTestByPasscode,
  createOrResumeSubmission,
  findProfilePrefill,
} = require("../services/candidateService");

async function getTestByPasscode(req, res) {
  try {
    const test = await findActiveTestByPasscode(req.params.passcode);
    if (!test) {
      return res.status(404).json({ message: "Active test not found for this passcode" });
    }
    return res.json({ test: publicTestShape(test) });
  } catch {
    return res.status(500).json({ message: "Failed to fetch test" });
  }
}

async function getCandidateProfilePrefill(req, res) {
  try {
    const candidateEmail = sanitizeEmail(req.query.candidateEmail);
    const testPasscode = String(req.query.testPasscode || "").trim();

    if (!candidateEmail) {
      return res.status(400).json({ message: "candidateEmail is required" });
    }

    const latest = await findProfilePrefill({ candidateEmail, testPasscode });
    if (!latest) return res.json({ found: false });

    return res.json({
      found: true,
      candidateName: latest.candidateName || "",
      candidateProfile: latest.candidateProfile || {},
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch candidate profile prefill" });
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
  } catch {
    return res.status(500).json({ message: "Failed to login candidate" });
  }
}

async function saveDraftAnswers(req, res) {
  try {
    const { submissionId } = req.params;
    const { mcqAnswers = [], codingAnswers = [], sectionAnswers = [] } = req.body;
    if (!isValidMcqAnswers(mcqAnswers)) return res.status(400).json({ message: "Invalid MCQ answers payload" });
    if (!isValidCodingAnswers(codingAnswers)) return res.status(400).json({ message: "Invalid coding answers payload" });
    if (!isValidSectionAnswers(sectionAnswers)) return res.status(400).json({ message: "Invalid section answers payload" });

    const submission = req.candidateSubmission || (await Submission.findById(submissionId));
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    if (submission.status !== "in_progress") return res.status(400).json({ message: "Submission already finalized" });

    submission.mcqAnswers = mcqAnswers;
    submission.codingAnswers = codingAnswers;
    submission.sectionAnswers = sectionAnswers;
    await submission.save();
    return res.json({ message: "Draft saved" });
  } catch {
    return res.status(500).json({ message: "Failed to save draft" });
  }
}

async function submitTest(req, res) {
  try {
    const { submissionId } = req.params;
    const {
      mcqAnswers = [],
      codingAnswers = [],
      sectionAnswers = [],
      auto = false,
      endedReason = "",
    } = req.body;
    if (!isValidMcqAnswers(mcqAnswers)) return res.status(400).json({ message: "Invalid MCQ answers payload" });
    if (!isValidCodingAnswers(codingAnswers)) return res.status(400).json({ message: "Invalid coding answers payload" });
    if (!isValidSectionAnswers(sectionAnswers)) return res.status(400).json({ message: "Invalid section answers payload" });

    const submission = (await Submission.findById(submissionId).populate("test")) || null;
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    if (submission.status !== "in_progress") return res.status(400).json({ message: "Submission already finalized" });

    submission.mcqAnswers = mcqAnswers;
    submission.codingAnswers = codingAnswers;
    submission.sectionAnswers = sectionAnswers;
    const mcqScore = calculateMcqScore(submission.test, mcqAnswers);
    submission.codingEvaluation = buildQueuedCodingEvaluation(submission.test, codingAnswers);
    submission.totalScore = Number(mcqScore.toFixed(2));
    submission.status = auto ? "auto_submitted" : "submitted";
    submission.endedReason = endedReason || (auto ? "auto_end_triggered" : "submitted_by_candidate");
    submission.submittedAt = new Date();
    await submission.save();

    const syncEvalEnabled = asBooleanEnv(process.env.CODING_EVAL_SYNC_ON_SUBMIT, true);
    const syncEvalTimeoutMs = parsePositiveInt(process.env.CODING_EVAL_SYNC_TIMEOUT_MS, 8000);
    const hasQueuedCoding = submission.codingEvaluation?.status === "queued";

    if (hasQueuedCoding && syncEvalEnabled) {
      try {
        await waitWithTimeout(processSubmissionCodingEvaluation(String(submission._id)), syncEvalTimeoutMs);
      } catch (error) {
        logger.warn("sync coding evaluation skipped/fallback to queue", {
          submissionId: String(submission._id),
          message: String(error?.message || "sync evaluation failed"),
        });
      }
    }

    let freshSubmission = submission;
    if (hasQueuedCoding) {
      freshSubmission = (await Submission.findById(submission._id)) || submission;
      if (freshSubmission.codingEvaluation?.status === "queued") {
        await enqueueCodingEvaluation(String(submission._id));
      }
    }

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
        id: freshSubmission._id,
        status: freshSubmission.status,
        totalScore: freshSubmission.totalScore,
        submittedAt: freshSubmission.submittedAt,
        codingEvaluation: freshSubmission.codingEvaluation,
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to submit test" });
  }
}

async function getEvaluationStatus(req, res) {
  try {
    const { submissionId } = req.params;
    const submission = await Submission.findById(submissionId).populate("test");
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    const evalState = submission.codingEvaluation || {
      status: "not_required",
      startedAt: null,
      completedAt: null,
      totalMarks: 0,
      maxMarks: 0,
      version: 1,
      tasks: [],
      error: "",
    };
    return res.json({
      evaluation: {
        status: evalState.status,
        startedAt: evalState.startedAt,
        completedAt: evalState.completedAt,
        totalMarks: evalState.totalMarks || 0,
        maxMarks: evalState.maxMarks || 0,
        version: evalState.version || 1,
        tasks: Array.isArray(evalState.tasks) ? evalState.tasks : [],
        error: evalState.error || "",
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch evaluation status" });
  }
}

async function logViolation(req, res) {
  try {
    const { submissionId } = req.params;
    const { type, severity = "medium", actionTaken = "logged", meta = {} } = req.body;
    if (!type) return res.status(400).json({ message: "type is required" });

    const submission = (await Submission.findById(submissionId).populate("test")) || null;
    if (!submission) return res.status(404).json({ message: "Submission not found" });

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
  } catch {
    return res.status(500).json({ message: "Failed to log violation" });
  }
}

async function runCode(req, res) {
  try {
    const { submissionId } = req.params;
    const { language, sourceCode, stdin = "" } = req.body || {};
    if (!sourceCode || !String(sourceCode).trim()) {
      return res.status(400).json({ message: "sourceCode is required" });
    }

    const submission = req.candidateSubmission || (await Submission.findById(submissionId));
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    if (submission.status !== "in_progress") return res.status(400).json({ message: "Submission already finalized" });

    const payload = await executeCode({
      language,
      sourceCode: String(sourceCode),
      stdin: String(stdin || ""),
      timeLimitMs: 4000,
      memoryLimitKb: 131072,
    });

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
    if (error?.name === "AbortError") return res.status(504).json({ message: "Code execution timed out" });
    if (error?.code === "UNSUPPORTED_LANGUAGE") return res.status(400).json({ message: "Unsupported language" });
    return res.status(500).json({ message: "Failed to run code" });
  }
}

module.exports = {
  getTestByPasscode,
  getCandidateProfilePrefill,
  loginWithPasscode,
  saveDraftAnswers,
  submitTest,
  getEvaluationStatus,
  logViolation,
  runCode,
  // used by queue inline worker bootstrap
  processSubmissionCodingEvaluation,
};
