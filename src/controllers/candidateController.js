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
const { isCloudinaryReady, uploadBase64Image } = require("../services/cloudinaryService");
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
const {
  emitAdmin,
  emitAdminDataChanged,
  emitCandidateEvaluationUpdated,
} = require("../realtime/socketServer");

const UI_PREVIEW_KEY = "ui_preview";
const MANUAL_REVIEW_KEYS = new Set([
  "short_answer",
  "long_answer",
  "scenario",
  "portfolio_link",
  "bug_report",
  "test_case",
]);

function extractBase64Bytes(dataUrl) {
  const base64Payload = String(dataUrl || "").split(",")[1] || "";
  const uploadBytes = Buffer.byteLength(base64Payload, "base64");
  return Number.isFinite(uploadBytes) ? uploadBytes : 0;
}

function sanitizePublicIdPart(fileName, fallback) {
  const value = String(fileName || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32);
  return value || fallback;
}

function parseUiPreviewPayload(rawAnswer) {
  try {
    const parsed = JSON.parse(String(rawAnswer || ""));
    return {
      framework: String(parsed?.framework || ""),
      html: String(parsed?.html || ""),
      css: String(parsed?.css || ""),
      js: String(parsed?.js || ""),
      reactCode: String(parsed?.reactCode || ""),
    };
  } catch {
    return {
      framework: "",
      html: "",
      css: "",
      js: "",
      reactCode: String(rawAnswer || ""),
    };
  }
}

function evaluateUiPreviewAnswer(answer, maxMarks) {
  const parsed = parseUiPreviewPayload(answer);
  const hasReactCode = parsed.framework === "react_tailwind" && parsed.reactCode.trim().length > 0;
  const hasHtmlCode =
    parsed.framework === "html_css_js" &&
    (parsed.html.trim().length > 0 || parsed.css.trim().length > 0 || parsed.js.trim().length > 0);
  const hasCode = hasReactCode || hasHtmlCode || parsed.reactCode.trim().length > 0 || parsed.html.trim().length > 0;
  if (!hasCode) {
    return {
      marksAwarded: 0,
      status: "failed",
      feedback: "No UI code submitted",
    };
  }

  let scoreRatio = 0.35;
  if (hasReactCode || hasHtmlCode) scoreRatio += 0.3;
  if ((parsed.reactCode || parsed.html).length >= 120) scoreRatio += 0.2;
  if ((parsed.css || "").length >= 40 || (parsed.reactCode || "").includes("className=")) scoreRatio += 0.15;
  scoreRatio = Math.max(0, Math.min(1, scoreRatio));
  return {
    marksAwarded: Number((maxMarks * scoreRatio).toFixed(2)),
    status: "completed",
    feedback: "UI preview auto-evaluated",
  };
}

function buildSectionEvaluation(test, sectionAnswers) {
  const configs = Array.isArray(test?.sectionConfigs) ? test.sectionConfigs : [];
  if (!configs.length) {
    return { status: "not_required", totalMarks: 0, maxMarks: 0, items: [] };
  }
  const answerByKey = new Map(
    (Array.isArray(sectionAnswers) ? sectionAnswers : []).map((item) => [
      `${item.sectionKey}::${item.itemIndex}`,
      String(item.answer || ""),
    ])
  );

  const items = configs.map((section, itemIndex) => {
    const key = String(section?.key || "");
    const title = section?.title || key;
    const answer = answerByKey.get(`${key}::${itemIndex}`) || "";
    if (key === UI_PREVIEW_KEY) {
      const maxMarks = Number.isFinite(Number(section?.marks)) ? Math.max(1, Number(section.marks)) : 10;
      const result = evaluateUiPreviewAnswer(answer, maxMarks);
      return {
        sectionKey: key,
        itemIndex,
        title,
        marksAwarded: result.marksAwarded,
        maxMarks,
        status: result.status,
        feedback: result.feedback,
      };
    }
    if (MANUAL_REVIEW_KEYS.has(key)) {
      return {
        sectionKey: key,
        itemIndex,
        title,
        marksAwarded: 0,
        maxMarks: 0,
        status: "under_review",
        feedback: "Manual review required",
      };
    }
    return {
      sectionKey: key,
      itemIndex,
      title,
      marksAwarded: 0,
      maxMarks: 0,
      status: "under_review",
      feedback: "",
    };
  });

  const totalMarks = Number(items.reduce((sum, item) => sum + Number(item.marksAwarded || 0), 0).toFixed(2));
  const maxMarks = Number(items.reduce((sum, item) => sum + Number(item.maxMarks || 0), 0).toFixed(2));
  const hasAutoItems = items.some((item) => item.sectionKey === UI_PREVIEW_KEY);
  return {
    status: hasAutoItems ? "completed" : "pending_review",
    totalMarks,
    maxMarks,
    items,
  };
}

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
    emitCandidateEvaluationUpdated(String(submission._id), {
      action: "draft_saved",
      submissionId: String(submission._id),
    });
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
    const mcqTotal = (submission.test?.mcqQuestions || []).reduce(
      (sum, item) => sum + Number(item?.marks || 1),
      0
    );
    submission.sectionEvaluation = buildSectionEvaluation(submission.test, sectionAnswers);
    submission.codingEvaluation = buildQueuedCodingEvaluation(submission.test, codingAnswers);
    submission.totalScore = Number((mcqScore + Number(submission.sectionEvaluation?.totalMarks || 0)).toFixed(2));
    submission.status = auto ? "auto_submitted" : "submitted";
    submission.endedReason = endedReason || (auto ? "auto_end_triggered" : "submitted_by_candidate");
    submission.submittedAt = new Date();
    await submission.save();
    emitCandidateEvaluationUpdated(String(submission._id), {
      action: "submitted",
      submissionId: String(submission._id),
    });
    emitAdmin("admin:reviews.updated", {
      action: "submission_created",
      submissionId: String(submission._id),
    });
    emitAdmin("admin:candidates.updated", {
      action: "submission_created",
      submissionId: String(submission._id),
    });
    emitAdminDataChanged({
      source: "submission_created",
      submissionId: String(submission._id),
    });

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
        mcqScore: Number(mcqScore || 0),
        mcqTotal: Number(mcqTotal || 0),
        submittedAt: freshSubmission.submittedAt,
        codingEvaluation: freshSubmission.codingEvaluation,
        sectionEvaluation: freshSubmission.sectionEvaluation,
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
    const sectionEval = submission.sectionEvaluation || {
      status: "not_required",
      totalMarks: 0,
      maxMarks: 0,
      items: [],
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
        sectionEvaluation: sectionEval,
        mcqScore: Number(calculateMcqScore(submission.test, submission.mcqAnswers || []) || 0),
        mcqTotal: Number(
          (submission.test?.mcqQuestions || []).reduce(
            (sum, item) => sum + Number(item?.marks || 1),
            0
          )
        ),
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
    emitAdmin("admin:violations.updated", {
      action: "violation_logged",
      submissionId: String(submission._id),
      severity: String(severity || "medium").toLowerCase(),
    });
    emitAdminDataChanged({
      source: "violation_logged",
      submissionId: String(submission._id),
    });

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

async function uploadCkeditorImage(req, res) {
  try {
    const { submissionId } = req.params;
    const { dataUrl, fileName } = req.body || {};
    if (typeof dataUrl !== "string" || !dataUrl.trim()) {
      return res.status(400).json({ message: "dataUrl is required" });
    }
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
      return res.status(400).json({ message: "Only base64 image data URLs are allowed" });
    }

    const maxBytes = parsePositiveInt(process.env.CKEDITOR_IMAGE_UPLOAD_MAX_BYTES, 2_000_000);
    const uploadBytes = extractBase64Bytes(dataUrl);
    if (!uploadBytes) {
      return res.status(400).json({ message: "Invalid image payload" });
    }
    if (uploadBytes > maxBytes) {
      return res.status(400).json({ message: `Image is too large. Max allowed is ${maxBytes} bytes` });
    }

    if (!isCloudinaryReady()) {
      return res.status(500).json({
        message:
          "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
      });
    }

    const upload = await uploadBase64Image(dataUrl, {
      folder:
        process.env.CLOUDINARY_CANDIDATE_CKEDITOR_IMAGE_FOLDER ||
        process.env.CLOUDINARY_CKEDITOR_IMAGE_FOLDER ||
        "test-portal/candidate-ckeditor-image",
      publicIdPrefix: `candidate-${submissionId}-${sanitizePublicIdPart(fileName, "image")}`,
    });

    return res.json({
      message: "Image uploaded successfully",
      url: upload.url,
      publicId: upload.publicId,
    });
  } catch {
    return res.status(500).json({ message: "Failed to upload image" });
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
  uploadCkeditorImage,
  // used by queue inline worker bootstrap
  processSubmissionCodingEvaluation,
};
