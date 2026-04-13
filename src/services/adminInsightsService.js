const Test = require("../models/Test");
const Submission = require("../models/Submission");
const Violation = require("../models/Violation");
const { toObjectIdString, toIsoDateTime, parsePositiveInt, paginateRows } = require("../utils/common");

function getTotalMarks(test) {
  const mcqTotal = (test?.mcqQuestions || []).reduce((sum, item) => sum + (item.marks || 1), 0);
  const codingTotal = (test?.codingTasks || []).reduce((sum, item) => sum + (item.marks || 0), 0);
  const sectionTotal = (test?.sectionConfigs || []).reduce(
    (sum, item) => sum + (item?.key === "ui_preview" ? Number(item?.marks || 0) : 0),
    0
  );
  return mcqTotal + codingTotal + sectionTotal;
}

function getMcqScoreAndPercent(submission) {
  const test = submission.test;
  const total = getTotalMarks(test);
  if (!test || total <= 0) return { score: 0, total: 0, percent: 0 };
  const answersByIndex = new Map((submission.mcqAnswers || []).map((a) => [a.questionIndex, a.selectedOptionIndex]));
  let score = 0;
  (test.mcqQuestions || []).forEach((q, idx) => {
    if (answersByIndex.get(idx) === q.correctOptionIndex) {
      score += q.marks || 1;
    }
  });
  return {
    score,
    total,
    percent: Math.round((score / total) * 100),
  };
}

function formatTimeTaken(startedAt, submittedAt) {
  if (!startedAt || !submittedAt) return "-";
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(submittedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return "-";
  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getCodingScoreSummary(submission) {
  const tasks = submission.test?.codingTasks || [];
  const total = tasks.reduce((sum, task) => sum + (task.marks || 0), 0);
  const reviews = submission.review?.codingReviews || [];
  const reviewsByIndex = new Map(reviews.map((item) => [item.taskIndex, item]));
  const evalTasks = submission.codingEvaluation?.tasks || [];
  const evalByIndex = new Map(evalTasks.map((item) => [item.taskIndex, item]));
  const score = tasks.reduce((sum, task, index) => {
    const reviewed = reviewsByIndex.get(index);
    const autoEvaluated = evalByIndex.get(index);
    if (Number.isFinite(reviewed?.marksAwarded)) return sum + reviewed.marksAwarded;
    if (Number.isFinite(autoEvaluated?.marksAwarded)) return sum + autoEvaluated.marksAwarded;
    return sum;
  }, 0);
  const normalizedTotal = total > 0 ? total : Number(submission.codingEvaluation?.maxMarks || 0);
  const percent = normalizedTotal > 0 ? Math.round((score / normalizedTotal) * 100) : 0;
  return { score, total: normalizedTotal, percent };
}

function getSectionScoreSummary(submission) {
  const sections = submission.test?.sectionConfigs || [];
  if (!sections.length) return { score: 0, total: 0, percent: 0 };

  const reviews = submission.review?.sectionReviews || [];
  const reviewsByKey = new Map(
    reviews.map((item) => [`${item.sectionKey}::${item.itemIndex}`, item])
  );
  const autoItems = submission.sectionEvaluation?.items || [];
  const autoByKey = new Map(
    autoItems.map((item) => [`${item.sectionKey}::${item.itemIndex}`, item])
  );

  let score = 0;
  let total = 0;
  sections.forEach((section, index) => {
    const maxMarks = section?.key === "ui_preview" ? Number(section?.marks || 0) : 0;
    total += maxMarks;
    if (maxMarks <= 0) return;
    const key = `${section.key}::${index}`;
    const review = reviewsByKey.get(key);
    const auto = autoByKey.get(key);
    if (Number.isFinite(review?.marksAwarded)) {
      score += Number(review.marksAwarded);
      return;
    }
    if (Number.isFinite(auto?.marksAwarded)) {
      score += Number(auto.marksAwarded);
    }
  });

  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  return { score, total, percent };
}

function getOverallScoreAndPercent(submission) {
  const mcq = getMcqScoreAndPercent(submission);
  const coding = getCodingScoreSummary(submission);
  const section = getSectionScoreSummary(submission);
  const totalScore = mcq.score + coding.score + section.score;
  const totalMarks = mcq.total + coding.total + section.total;
  const percent = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;
  return {
    score: totalScore,
    total: totalMarks,
    percent,
    mcq,
    coding,
    section,
  };
}

function buildPerformanceSeries(submissions) {
  const now = new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekly = dayNames.map((name) => ({ day: name, value: 0, count: 0 }));
  submissions.forEach((submission) => {
    const percent = getMcqScoreAndPercent(submission).percent;
    const date = new Date(submission.submittedAt || submission.updatedAt || Date.now());
    const idx = date.getDay();
    weekly[idx].value += percent;
    weekly[idx].count += 1;
  });
  const weeklySeries = weekly.map((entry) => ({
    day: entry.day,
    value: entry.count ? Math.round(entry.value / entry.count) : 0,
  }));

  const dailySeries = [];
  for (let hour = 0; hour < 24; hour += 4) {
    const label = `${hour.toString().padStart(2, "0")}:00`;
    const bucketValues = submissions
      .filter((submission) => {
        const date = new Date(submission.submittedAt || submission.updatedAt || now);
        return date.getHours() >= hour && date.getHours() < hour + 4;
      })
      .map((submission) => getMcqScoreAndPercent(submission).percent);
    dailySeries.push({
      day: label,
      value: bucketValues.length
        ? Math.round(bucketValues.reduce((sum, value) => sum + value, 0) / bucketValues.length)
        : 0,
    });
  }

  const monthly = new Array(12).fill(0).map((_, idx) => ({ month: idx, sum: 0, count: 0 }));
  submissions.forEach((submission) => {
    const date = new Date(submission.submittedAt || submission.updatedAt || now);
    const idx = date.getMonth();
    monthly[idx].sum += getMcqScoreAndPercent(submission).percent;
    monthly[idx].count += 1;
  });
  const yearLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yearlySeries = monthly.map((entry, idx) => ({
    day: yearLabels[idx],
    value: entry.count ? Math.round(entry.sum / entry.count) : 0,
  }));

  return { daily: dailySeries, weekly: weeklySeries, yearly: yearlySeries };
}

async function getAdminTestIds(userId) {
  const tests = await Test.find({ createdBy: userId }).select("_id").lean();
  return tests.map((t) => t._id);
}

async function loadDashboardData(userId) {
  const testIds = await getAdminTestIds(userId);
  const totalTests = await Test.countDocuments({ _id: { $in: testIds } });
  const activeTests = await Test.countDocuments({ _id: { $in: testIds }, status: "active" });
  const completedSubmissions = await Submission.find({
    test: { $in: testIds },
    status: { $in: ["submitted", "auto_submitted"] },
  }).populate("test");
  const candidateEmails = await Submission.distinct("candidateEmail", { test: { $in: testIds } });
  const totalCandidates = candidateEmails.length;
  const completedTests = completedSubmissions.length;
  const violations = await Violation.countDocuments({ test: { $in: testIds } });

  const scorePercents = completedSubmissions
    .map((submission) => getOverallScoreAndPercent(submission).percent)
    .filter((value) => Number.isFinite(value));
  const averageScore = scorePercents.length
    ? Math.round(scorePercents.reduce((sum, value) => sum + value, 0) / scorePercents.length)
    : 0;

  const recentSubmissions = await Submission.find({
    test: { $in: testIds },
    status: { $in: ["submitted", "auto_submitted"] },
  })
    .populate("test")
    .sort({ submittedAt: -1, updatedAt: -1 })
    .limit(5);

  const recentResults = recentSubmissions.map((submission) => {
    const score = getOverallScoreAndPercent(submission);
    const passPercentage = submission.test?.passPercentage || 0;
    return {
      candidate: submission.candidateName,
      position: submission.test?.position || "-",
      test: submission.test?.title || "-",
      score: `${score.percent}%`,
      status: score.percent >= passPercentage ? "Passed" : "Failed",
      date: toIsoDateTime(submission.submittedAt || submission.updatedAt),
    };
  });

  const latestViolations = await Violation.find({ test: { $in: testIds } })
    .populate("submission")
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(5);
  const recentActivities = latestViolations.map((entry) => ({
    title: `${entry.type} detected`,
    sub: entry.submission?.candidateName ? `Candidate: ${entry.submission.candidateName}` : "",
    time: toIsoDateTime(entry.occurredAt || entry.createdAt),
  }));
  const performance = buildPerformanceSeries(completedSubmissions);

  return {
    stats: {
      totalTests,
      activeTests,
      totalCandidates,
      completedTests,
      averageScore,
      violations,
    },
    performance,
    recentActivities,
    recentResults,
  };
}

async function loadReviewSubmissions({ userId, tab = "pending", search = "", page = 1, pageSize = 20 }) {
  const testIds = await getAdminTestIds(userId);
  const submissions = await Submission.find({ test: { $in: testIds } })
    .populate("test")
    .sort({ updatedAt: -1 });

  const submissionIds = submissions.map((item) => item._id);
  const violations = await Violation.aggregate([
    { $match: { submission: { $in: submissionIds } } },
    { $group: { _id: "$submission", count: { $sum: 1 } } },
  ]);
  const violationBySubmissionId = new Map(violations.map((item) => [toObjectIdString(item._id), item.count]));

  const rows = submissions
    .map((submission) => {
      const overall = getOverallScoreAndPercent(submission);
      const hasDecision = Boolean(submission.review?.decision);
      const codingStatus = hasDecision ? "Reviewed" : "In Review";
      return {
        id: toObjectIdString(submission._id),
        candidate: submission.candidateName,
        testInfo: submission.test ? `${submission.test.position} | ${submission.test.title}` : "-",
        submitted: toIsoDateTime(submission.submittedAt || submission.updatedAt),
        score: `${overall.score}/${overall.total} (${overall.percent}%)`,
        codingStatus,
        reviewStatus: submission.review?.decision || "Pending",
        violations: violationBySubmissionId.get(toObjectIdString(submission._id)) || 0,
        action: hasDecision ? "View" : "Review",
        passPercent: overall.percent,
        passThreshold: submission.test?.passPercentage || 0,
      };
    })
    .filter((row) => {
      if (tab === "pending") return row.codingStatus === "In Review";
      if (tab === "completed") return row.codingStatus === "Reviewed";
      return true;
    })
    .filter((row) => {
      const q = String(search || "").trim().toLowerCase();
      if (!q) return true;
      return row.candidate.toLowerCase().includes(q) || row.testInfo.toLowerCase().includes(q);
    });

  const today = new Date().toISOString().slice(0, 10);
  const reviewedToday = rows.filter((row) => row.codingStatus === "Reviewed" && row.submitted.startsWith(today)).length;
  const passed = rows.filter((row) => row.passPercent >= row.passThreshold).length;
  const failed = rows.filter((row) => row.passPercent < row.passThreshold).length;
  const pending = rows.filter((row) => row.codingStatus === "In Review").length;

  const paged = paginateRows(rows, page, pageSize);
  return {
    summary: { pending, reviewedToday, passed, failed },
    rows: paged.rows,
    pagination: paged.pagination,
  };
}

async function loadReviewSubmissionDetail({ userId, submissionId }) {
  const testIds = await getAdminTestIds(userId);
  const submission = await Submission.findOne({
    _id: submissionId,
    test: { $in: testIds },
  }).populate("test");

  if (!submission) return null;

  const mcqAnswersByIndex = new Map((submission.mcqAnswers || []).map((a) => [a.questionIndex, a.selectedOptionIndex]));
  const mcqRows = (submission.test?.mcqQuestions || []).map((q, idx) => {
    const selectedIndex = mcqAnswersByIndex.get(idx);
    const selected = selectedIndex === undefined ? "-" : q.options?.[selectedIndex]?.text || "-";
    const correct = q.options?.[q.correctOptionIndex]?.text || "-";
    const isCorrect = selectedIndex === q.correctOptionIndex;
    return {
      q: idx + 1,
      question: q.question,
      selected,
      correct,
      marks: isCorrect ? String(q.marks || 1) : "0",
      wrong: !isCorrect,
    };
  });

  const reviewsByIndex = new Map((submission.review?.codingReviews || []).map((item) => [item.taskIndex, item]));
  const evalByIndex = new Map((submission.codingEvaluation?.tasks || []).map((item) => [item.taskIndex, item]));
  const codingRows = (submission.test?.codingTasks || []).map((task, index) => {
    const answer = (submission.codingAnswers || []).find((item) => item.taskIndex === index);
    const review = reviewsByIndex.get(index);
    const autoEval = evalByIndex.get(index);
    return {
      taskIndex: index,
      title: task.title,
      language: answer?.language || task.language || "JavaScript",
      maxMarks: task.marks || 10,
      marksAwarded: Number.isFinite(review?.marksAwarded)
        ? review.marksAwarded
        : Number.isFinite(autoEval?.marksAwarded)
          ? autoEval.marksAwarded
          : 0,
      status: review?.status || "Under Review",
      code: answer?.code || "",
      feedback: review?.feedback || (autoEval?.status === "completed" ? "Auto evaluated" : "Under Review"),
    };
  });

  const sectionAnswersKey = (sectionKey, itemIndex) => `${sectionKey}::${itemIndex}`;
  const sectionAnswersByKey = new Map(
    (submission.sectionAnswers || []).map((item) => [sectionAnswersKey(item.sectionKey, item.itemIndex), item.answer || ""])
  );
  const sectionReviewsByKey = new Map(
    (submission.review?.sectionReviews || []).map((item) => [sectionAnswersKey(item.sectionKey, item.itemIndex), item])
  );
  const sectionRows = (submission.test?.sectionConfigs || []).map((section, index) => {
    const key = sectionAnswersKey(section.key, index);
    const review = sectionReviewsByKey.get(key);
    const auto = (submission.sectionEvaluation?.items || []).find(
      (item) => item.sectionKey === section.key && item.itemIndex === index
    );
    const maxMarks = section.key === "ui_preview" ? Number(section.marks || 0) : 0;
    return {
      sectionKey: section.key,
      itemIndex: index,
      title: section.title || section.key,
      prompt: section.prompt || "",
      answer: sectionAnswersByKey.get(key) || "",
      maxMarks,
      marksAwarded: Number.isFinite(review?.marksAwarded)
        ? review.marksAwarded
        : Number.isFinite(auto?.marksAwarded)
          ? auto.marksAwarded
          : 0,
      status: review?.status || (auto?.status === "completed" ? "Passed" : "Under Review"),
      feedback: review?.feedback || auto?.feedback || "",
    };
  });

  const score = getMcqScoreAndPercent(submission);
  const codingScore = getCodingScoreSummary(submission);
  const totalPossible = score.total + codingScore.total;
  const totalAchieved = score.score + codingScore.score;
  const totalScorePercent = totalPossible > 0 ? Math.round((totalAchieved / totalPossible) * 100) : 0;
  const violationDocs = await Violation.find({ submission: submission._id }).sort({ occurredAt: -1, createdAt: -1 });
  const violationRows = violationDocs.map((entry) => ({
    id: toObjectIdString(entry._id),
    type: entry.type,
    severity: String(entry.severity || "medium"),
    actionTaken: String(entry.actionTaken || "logged"),
    occurredAt: toIsoDateTime(entry.occurredAt || entry.createdAt),
  }));

  return {
    submission: {
      id: toObjectIdString(submission._id),
      candidateName: submission.candidateName,
      candidateEmail: submission.candidateEmail,
      candidateProfile: submission.candidateProfile || {},
      status: submission.status,
      test: submission.test
        ? {
            id: toObjectIdString(submission.test._id),
            title: submission.test.title,
            position: submission.test.position,
            passPercentage: submission.test.passPercentage,
          }
        : null,
      submittedAt: toIsoDateTime(submission.submittedAt || submission.updatedAt),
      overview: {
        mcqScorePercent: score.percent,
        codingScorePercent: codingScore.percent,
        totalScorePercent,
        timeTaken: formatTimeTaken(submission.startedAt, submission.submittedAt || submission.updatedAt),
        violations: violationDocs.length,
      },
      review: {
        decision: submission.review?.decision || "",
        comment: submission.review?.comment || "",
        reviewedAt: toIsoDateTime(submission.review?.reviewedAt),
      },
      mcqRows,
      codingRows,
      sectionRows,
      violationRows,
    },
  };
}

async function persistReviewDecision({ userId, submissionId, payload }) {
  const { decision = "", comment = "", codingReviews = [], sectionReviews = [] } = payload || {};
  const allowed = ["Passed", "Failed", "Shortlisted", "On Hold"];
  if (!allowed.includes(decision)) {
    const error = new Error("Invalid decision");
    error.status = 400;
    throw error;
  }

  const testIds = await getAdminTestIds(userId);
  const submission = await Submission.findOne({ _id: submissionId, test: { $in: testIds } }).populate("test");
  if (!submission) {
    const error = new Error("Submission not found");
    error.status = 404;
    throw error;
  }

  const normalizedCodingReviews = (Array.isArray(codingReviews) ? codingReviews : [])
    .map((item) => {
      const taskIndex = Number(item?.taskIndex);
      if (!Number.isInteger(taskIndex) || taskIndex < 0) return null;
      const task = submission.test?.codingTasks?.[taskIndex];
      if (!task) return null;
      const maxMarks = Number(task.marks || 0);
      const rawMarks = Number(item?.marksAwarded || 0);
      const marksAwarded = Number.isFinite(rawMarks) ? Math.max(0, Math.min(maxMarks, rawMarks)) : 0;
      const allowedStatus = ["Under Review", "Passed", "Failed", "On Hold"];
      const status = allowedStatus.includes(String(item?.status || "")) ? String(item.status) : "Under Review";
      return {
        taskIndex,
        title: task.title || "",
        marksAwarded,
        status,
        feedback: String(item?.feedback || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.taskIndex - b.taskIndex);

  const normalizedSectionReviews = (Array.isArray(sectionReviews) ? sectionReviews : [])
    .map((item) => {
      const sectionKey = String(item?.sectionKey || "").trim().toLowerCase();
      const itemIndex = Number(item?.itemIndex);
      if (!sectionKey || !Number.isInteger(itemIndex) || itemIndex < 0) return null;
      const section = submission.test?.sectionConfigs?.[itemIndex];
      if (!section || section.key !== sectionKey) return null;
      const rawMarks = Number(item?.marksAwarded || 0);
      const maxMarks = Number(section?.marks || 0);
      const marksAwarded = Number.isFinite(rawMarks) ? Math.max(0, Math.min(maxMarks, rawMarks)) : 0;
      const allowedStatus = ["Under Review", "Passed", "Failed", "On Hold"];
      const status = allowedStatus.includes(String(item?.status || "")) ? String(item.status) : "Under Review";
      return {
        sectionKey,
        itemIndex,
        title: section.title || sectionKey,
        marksAwarded,
        status,
        feedback: String(item?.feedback || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.itemIndex - b.itemIndex);

  submission.review = {
    decision,
    comment: String(comment || "").trim(),
    codingReviews: normalizedCodingReviews,
    sectionReviews: normalizedSectionReviews,
    reviewedAt: new Date(),
    reviewedBy: userId,
  };
  await submission.save();

  return {
    message: "Review decision saved",
    review: {
      decision: submission.review.decision,
      comment: submission.review.comment,
      codingReviews: submission.review.codingReviews || [],
      sectionReviews: submission.review.sectionReviews || [],
      reviewedAt: toIsoDateTime(submission.review.reviewedAt),
    },
  };
}

async function loadCandidates({ userId, search = "", severity = "all", position = "all", page = 1, pageSize = 20 }) {
  const testIds = await getAdminTestIds(userId);
  const submissions = await Submission.find({ test: { $in: testIds } })
    .populate("test")
    .sort({ updatedAt: -1 });

  const submissionIds = submissions.map((item) => item._id);
  const violations = await Violation.aggregate([
    { $match: { submission: { $in: submissionIds } } },
    { $group: { _id: "$submission", count: { $sum: 1 } } },
  ]);
  const violationBySubmissionId = new Map(violations.map((item) => [toObjectIdString(item._id), item.count]));

  const rows = submissions
    .map((submission) => {
      const score = getOverallScoreAndPercent(submission);
      const violationCount = violationBySubmissionId.get(toObjectIdString(submission._id)) || 0;
      const finalStatus = submission.review?.decision
        ? submission.review.decision === "Passed"
          ? "Passed"
          : "Failed"
        : "Pending";
      return {
        id: toObjectIdString(submission._id),
        candidate: submission.candidateName,
        position: submission.test?.position || "-",
        mcqScore: `${score.percent}%`,
        codingStatus: submission.review?.decision ? "Reviewed" : "Pending",
        violations: violationCount,
        finalStatus,
        date: toIsoDateTime(submission.submittedAt || submission.updatedAt),
      };
    })
    .filter((row) => {
      const q = String(search || "").trim().toLowerCase();
      if (!q) return true;
      return row.candidate.toLowerCase().includes(q) || row.position.toLowerCase().includes(q);
    })
    .filter((row) => {
      if (position === "all") return true;
      return row.position.toLowerCase().includes(String(position).toLowerCase());
    })
    .filter((row) => {
      if (severity === "all") return true;
      if (severity === "high") return row.violations >= 3;
      if (severity === "medium") return row.violations >= 1 && row.violations < 3;
      return row.violations === 0;
    });

  const paged = paginateRows(rows, page, pageSize);
  return { rows: paged.rows, pagination: paged.pagination };
}

async function loadViolations({ userId, search = "", severity = "all", page = 1, pageSize = 20 }) {
  const testIds = await getAdminTestIds(userId);
  const violations = await Violation.find({ test: { $in: testIds } })
    .populate("test")
    .populate("submission")
    .sort({ occurredAt: -1, createdAt: -1 });

  const rows = violations
    .map((entry) => ({
      id: toObjectIdString(entry._id),
      candidate: entry.submission?.candidateName || "-",
      test: entry.test?.title || "-",
      violationType: entry.type,
      timestamp: toIsoDateTime(entry.occurredAt || entry.createdAt),
      severity: String(entry.severity || "medium"),
      actionTaken: String(entry.actionTaken || "logged"),
    }))
    .filter((row) => {
      const q = String(search || "").trim().toLowerCase();
      if (!q) return true;
      return (
        row.candidate.toLowerCase().includes(q) ||
        row.test.toLowerCase().includes(q) ||
        row.violationType.toLowerCase().includes(q)
      );
    })
    .filter((row) => {
      if (severity === "all") return true;
      return row.severity.toLowerCase() === String(severity).toLowerCase();
    });

  const paged = paginateRows(rows, page, pageSize);
  return { rows: paged.rows, pagination: paged.pagination };
}

module.exports = {
  parsePositiveInt,
  loadDashboardData,
  loadReviewSubmissions,
  loadReviewSubmissionDetail,
  persistReviewDecision,
  loadCandidates,
  loadViolations,
};
