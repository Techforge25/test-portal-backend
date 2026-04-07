const Test = require("../models/Test");
const Submission = require("../models/Submission");
const { sanitizeEmail, sanitizeCandidateProfile } = require("../validators/candidateValidators");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function asBooleanEnv(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

async function waitWithTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Evaluation timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function publicTestShape(test) {
  return {
    id: test._id,
    title: test.title,
    position: test.position,
    durationMinutes: test.durationMinutes,
    passPercentage: test.passPercentage,
    roleCategory: test.roleCategory || "developer",
    enabledSections: Array.isArray(test.enabledSections) ? test.enabledSections : ["mcq", "coding"],
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
      starterCode: task.starterCode || "",
      timeLimitMs: task.timeLimitMs || 4000,
      memoryLimitKb: task.memoryLimitKb || 131072,
      sampleCases:
        Array.isArray(task.testCases) && task.testCases.length > 0
          ? task.testCases
              .filter((item) => item && item.isHidden !== true)
              .map((item) => ({
                input: item.input || "",
                expectedOutput: item.expectedOutput || "",
              }))
          : [],
      sampleInput: task.sampleInput,
      sampleOutput: task.sampleOutput,
    })),
    sectionConfigs: (test.sectionConfigs || []).map((section, idx) => ({
      index: idx,
      key: section.key,
      title: section.title,
      prompt: section.prompt,
      instructions: section.instructions,
      required: section.required !== false,
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
    if (candidateName?.trim()) latest.candidateName = candidateName.trim();
    latest.candidateProfile = {
      ...(latest.candidateProfile || {}),
      ...profile,
    };
    await latest.save();
    return { resumed: true, submission: latest };
  }

  const created = await Submission.create({
    test: test._id,
    candidateName: candidateName?.trim() || defaultNameFromEmail(normalizedEmail),
    candidateEmail: normalizedEmail,
    candidateProfile: profile,
    status: "in_progress",
  });
  return { resumed: false, submission: created };
}

async function findProfilePrefill({ candidateEmail, testPasscode }) {
  const normalizedEmail = sanitizeEmail(candidateEmail);
  let latest = null;
  if (testPasscode) {
    const test = await findActiveTestByPasscode(testPasscode);
    if (test) {
      latest = await Submission.findOne({
        test: test._id,
        candidateEmail: normalizedEmail,
      })
        .sort({ createdAt: -1 })
        .select("candidateName candidateProfile")
        .lean();
    }
  }
  if (!latest) {
    latest = await Submission.findOne({ candidateEmail: normalizedEmail })
      .sort({ createdAt: -1 })
      .select("candidateName candidateProfile")
      .lean();
  }
  return latest;
}

module.exports = {
  parsePositiveInt,
  asBooleanEnv,
  waitWithTimeout,
  publicTestShape,
  findActiveTestByPasscode,
  createOrResumeSubmission,
  findProfilePrefill,
};

