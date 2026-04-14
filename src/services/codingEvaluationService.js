const Submission = require("../models/Submission");
const { emitAdminDataChanged, emitCandidateEvaluationUpdated } = require("../realtime/socketServer");

const judge0BaseUrl = String(process.env.JUDGE0_BASE_URL || "https://ce.judge0.com").replace(/\/$/, "");

const judge0LanguageMap = {
  javascript: 63,
  typescript: 74,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
  csharp: 51,
  php: 68,
  ruby: 72,
  go: 60,
  dart: 90,
};

function buildJudge0Headers() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.JUDGE0_RAPIDAPI_KEY) headers["x-rapidapi-key"] = process.env.JUDGE0_RAPIDAPI_KEY;
  if (process.env.JUDGE0_RAPIDAPI_HOST) headers["x-rapidapi-host"] = process.env.JUDGE0_RAPIDAPI_HOST;
  if (process.env.JUDGE0_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.JUDGE0_AUTH_TOKEN}`;
  return headers;
}

function toJudge0LanguageId(language) {
  const normalized = String(language || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("#", "sharp")
    .replace("c++", "cpp");
  return judge0LanguageMap[normalized] || null;
}

function normalizeOutput(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function buildExecutableSource({ language, sourceCode }) {
  const raw = String(sourceCode || "");
  const normalizedLang = String(language || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  // Candidate often writes only `function solution(input) { ... return ... }`
  // and does not print. Judge compares stdout, so we auto-print return value.
  if (normalizedLang === "javascript" || normalizedLang === "typescript") {
    return `
${raw}
const __stdin = require("fs").readFileSync(0, "utf8");
if (typeof solution === "function") {
  const __result = solution(__stdin.trimEnd());
  if (__result !== undefined) {
    if (typeof __result === "object") {
      process.stdout.write(JSON.stringify(__result));
    } else {
      process.stdout.write(String(__result));
    }
  }
}
`;
  }

  return raw;
}

async function executeJudge0({ sourceCode, languageId, stdin, timeLimitMs, memoryLimitKb }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(8000, Number(timeLimitMs || 4000) + 8000));
  let response;
  try {
    response = await fetch(`${judge0BaseUrl}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: buildJudge0Headers(),
      body: JSON.stringify({
        language_id: languageId,
        source_code: String(sourceCode || ""),
        stdin: String(stdin || ""),
        cpu_time_limit: Math.max(0.5, Number(timeLimitMs || 4000) / 1000),
        wall_time_limit: Math.max(1, Number(timeLimitMs || 4000) / 1000 + 1),
        memory_limit: Math.max(16384, Number(memoryLimitKb || 131072)),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Execution service request failed");
  }
  return payload;
}

function taskCases(task) {
  if (Array.isArray(task?.testCases) && task.testCases.length > 0) {
    return task.testCases.map((item, index) => ({
      caseIndex: index,
      input: item?.input || "",
      expectedOutput: item?.expectedOutput || "",
      weight: Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0 ? Number(item.weight) : 1,
    }));
  }
  return [
    {
      caseIndex: 0,
      input: task?.sampleInput || "",
      expectedOutput: task?.sampleOutput || "",
      weight: 1,
    },
  ];
}

function calculateMcqScore(test, mcqAnswers) {
  let score = 0;
  const answersByIndex = new Map();
  (mcqAnswers || []).forEach((a) => answersByIndex.set(a.questionIndex, a.selectedOptionIndex));
  (test?.mcqQuestions || []).forEach((q, index) => {
    if (answersByIndex.get(index) === q.correctOptionIndex) score += q.marks || 1;
  });
  return score;
}

function buildQueuedCodingEvaluation(test, codingAnswers) {
  const tasks = Array.isArray(test?.codingTasks) ? test.codingTasks : [];
  if (tasks.length === 0) {
    return {
      status: "not_required",
      startedAt: null,
      completedAt: new Date(),
      totalMarks: 0,
      maxMarks: 0,
      version: 1,
      tasks: [],
      error: "",
    };
  }

  const answersByTaskIndex = new Map(
    (Array.isArray(codingAnswers) ? codingAnswers : []).map((item) => [Number(item?.taskIndex), item])
  );
  const hasAnyCode = tasks.some((_, taskIndex) => String(answersByTaskIndex.get(taskIndex)?.code || "").trim().length > 0);
  const maxMarks = tasks.reduce((sum, task) => sum + Number(task?.marks || 0), 0);

  return {
    status: hasAnyCode ? "queued" : "completed",
    startedAt: hasAnyCode ? null : new Date(),
    completedAt: hasAnyCode ? null : new Date(),
    totalMarks: 0,
    maxMarks,
    version: 1,
    tasks: tasks.map((task, taskIndex) => ({
      taskIndex,
      title: task?.title || `Task ${taskIndex + 1}`,
      marksAwarded: 0,
      maxMarks: Number(task?.marks || 0),
      status: hasAnyCode ? "pending" : "completed",
      cases: [],
    })),
    error: "",
  };
}

async function evaluateCodingSubmission(test, codingAnswers) {
  const tasks = Array.isArray(test?.codingTasks) ? test.codingTasks : [];
  if (tasks.length === 0) {
    return {
      totalMarks: 0,
      state: {
        status: "not_required",
        startedAt: null,
        completedAt: new Date(),
        totalMarks: 0,
        maxMarks: 0,
        version: 1,
        tasks: [],
        error: "",
      },
    };
  }

  const answersByTaskIndex = new Map(
    (Array.isArray(codingAnswers) ? codingAnswers : []).map((item) => [Number(item?.taskIndex), item])
  );
  const startedAt = new Date();
  const taskResults = [];
  let totalMarks = 0;
  let maxMarks = 0;

  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    const task = tasks[taskIndex];
    const maxTaskMarks = Number(task?.marks || 0);
    maxMarks += maxTaskMarks;
    const answer = answersByTaskIndex.get(taskIndex);
    const sourceCode = String(answer?.code || "").trim();
    const languageId = toJudge0LanguageId(answer?.language || task?.language || "javascript");
    const cases = taskCases(task);

    if (!sourceCode || !languageId) {
      taskResults.push({
        taskIndex,
        title: task?.title || `Task ${taskIndex + 1}`,
        marksAwarded: 0,
        maxMarks: maxTaskMarks,
        status: "failed",
        cases: cases.map((item) => ({
          caseIndex: item.caseIndex,
          passed: false,
          runtimeMs: 0,
          memoryKb: 0,
          error: !sourceCode ? "No code submitted" : "Unsupported language",
        })),
      });
      continue;
    }

    try {
      const caseResults = await Promise.all(
        cases.map(async (testCase) => {
          const payload = await executeJudge0({
            sourceCode: buildExecutableSource({
              language: answer?.language || task?.language || "javascript",
              sourceCode,
            }),
            languageId,
            stdin: testCase.input,
            timeLimitMs: task?.timeLimitMs || 4000,
            memoryLimitKb: task?.memoryLimitKb || 131072,
          });
          const actual = normalizeOutput(payload.stdout);
          const expected = normalizeOutput(testCase.expectedOutput);
          const accepted = String(payload?.status?.description || "").toLowerCase() === "accepted";
          const passed = accepted && actual === expected;
          const runtimeMs = Number.isFinite(Number(payload.time)) ? Math.round(Number(payload.time) * 1000) : 0;
          const memoryKb = Number.isFinite(Number(payload.memory)) ? Number(payload.memory) : 0;
          const rawError = payload.stderr || payload.compile_output || payload.message || "";
          return {
            caseIndex: testCase.caseIndex,
            passed,
            runtimeMs,
            memoryKb,
            error: passed ? "" : String(rawError || "Output mismatch"),
            weight: testCase.weight,
          };
        })
      );

      const totalWeight = caseResults.reduce((sum, item) => sum + (item.weight || 1), 0) || 1;
      const passedWeight = caseResults.reduce((sum, item) => sum + (item.passed ? item.weight || 1 : 0), 0);
      const taskMarks = Number(((maxTaskMarks * passedWeight) / totalWeight).toFixed(2));
      totalMarks += taskMarks;

      taskResults.push({
        taskIndex,
        title: task?.title || `Task ${taskIndex + 1}`,
        marksAwarded: taskMarks,
        maxMarks: maxTaskMarks,
        status: "completed",
        cases: caseResults.map((item) => ({
          caseIndex: item.caseIndex,
          passed: item.passed,
          runtimeMs: item.runtimeMs,
          memoryKb: item.memoryKb,
          error: item.error,
        })),
      });
    } catch (error) {
      taskResults.push({
        taskIndex,
        title: task?.title || `Task ${taskIndex + 1}`,
        marksAwarded: 0,
        maxMarks: maxTaskMarks,
        status: "failed",
        cases: cases.map((item) => ({
          caseIndex: item.caseIndex,
          passed: false,
          runtimeMs: 0,
          memoryKb: 0,
          error: String(error?.message || "Evaluation failed"),
        })),
      });
    }
  }

  const hasFailedInfra = taskResults.some(
    (item) => item.status === "failed" && item.cases.some((c) => c.error && !c.passed)
  );
  return {
    totalMarks: Number(totalMarks.toFixed(2)),
    state: {
      status: hasFailedInfra ? "failed" : "completed",
      startedAt,
      completedAt: new Date(),
      totalMarks: Number(totalMarks.toFixed(2)),
      maxMarks,
      version: 1,
      tasks: taskResults,
      error: "",
    },
  };
}

async function processSubmissionCodingEvaluation(submissionId) {
  const submission = await Submission.findById(submissionId).populate("test");
  if (!submission || !submission.test) return;
  if (!["submitted", "auto_submitted"].includes(String(submission.status))) return;

  const evalState = submission.codingEvaluation || {};
  if (!["queued", "running"].includes(String(evalState.status))) return;

  submission.codingEvaluation = {
    ...evalState,
    status: "running",
    startedAt: evalState.startedAt || new Date(),
    error: "",
  };
  await submission.save();
  emitCandidateEvaluationUpdated(String(submission._id), {
    action: "coding_evaluation_running",
    submissionId: String(submission._id),
  });

  try {
    const mcqScore = calculateMcqScore(submission.test, submission.mcqAnswers || []);
    const sectionScore = Number(submission.sectionEvaluation?.totalMarks || 0);
    const codingEval = await evaluateCodingSubmission(submission.test, submission.codingAnswers || []);
    submission.codingEvaluation = codingEval.state;
    submission.totalScore = Number((mcqScore + sectionScore + codingEval.totalMarks).toFixed(2));
    await submission.save();
    emitCandidateEvaluationUpdated(String(submission._id), {
      action: "coding_evaluation_completed",
      submissionId: String(submission._id),
    });
    emitAdminDataChanged({
      source: "coding_evaluation_completed",
      submissionId: String(submission._id),
    });
  } catch (error) {
    submission.codingEvaluation = {
      ...(submission.codingEvaluation || {}),
      status: "failed",
      completedAt: new Date(),
      error: String(error?.message || "Evaluation failed"),
    };
    await submission.save();
    emitCandidateEvaluationUpdated(String(submission._id), {
      action: "coding_evaluation_failed",
      submissionId: String(submission._id),
    });
    emitAdminDataChanged({
      source: "coding_evaluation_failed",
      submissionId: String(submission._id),
    });
  }
}

async function executeCode({ language, sourceCode, stdin = "", timeLimitMs = 4000, memoryLimitKb = 131072 }) {
  const languageId = toJudge0LanguageId(language);
  if (!languageId) {
    const error = new Error("Unsupported language");
    error.code = "UNSUPPORTED_LANGUAGE";
    throw error;
  }
  return executeJudge0({
    sourceCode: buildExecutableSource({ language, sourceCode }),
    languageId,
    stdin: String(stdin || ""),
    timeLimitMs,
    memoryLimitKb,
  });
}

module.exports = {
  toJudge0LanguageId,
  calculateMcqScore,
  buildQueuedCodingEvaluation,
  processSubmissionCodingEvaluation,
  executeCode,
};
