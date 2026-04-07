const Test = require("../models/Test");
const { getNextPasscodeExpiry, getUniquePasscode } = require("../utils/passcodeService");

const ALLOWED_ROLE_CATEGORIES = new Set([
  "developer",
  "designer",
  "video_editor",
  "qa_manual",
  "hr",
  "sales",
  "other",
]);

const ALLOWED_SECTIONS = new Set([
  "mcq",
  "coding",
  "short_answer",
  "long_answer",
  "scenario",
  "ui_preview",
  "portfolio_link",
  "bug_report",
  "test_case",
]);

const NON_CODING_SECTION_KEYS = new Set([
  "short_answer",
  "long_answer",
  "scenario",
  "ui_preview",
  "portfolio_link",
  "bug_report",
  "test_case",
]);

function normalizeRoleCategory(value) {
  const next = String(value || "").trim().toLowerCase();
  return ALLOWED_ROLE_CATEGORIES.has(next) ? next : "developer";
}

function normalizeEnabledSections(value) {
  if (!Array.isArray(value)) return ["mcq", "coding"];
  const next = value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item, index, arr) => ALLOWED_SECTIONS.has(item) && arr.indexOf(item) === index);
  return next.length > 0 ? next : ["mcq", "coding"];
}

function normalizeSectionConfigs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const key = String(item?.key || "").trim().toLowerCase();
      if (!NON_CODING_SECTION_KEYS.has(key)) return null;
      return {
        key,
        title: String(item?.title || key).trim(),
        prompt: String(item?.prompt || "").trim(),
        instructions: String(item?.instructions || "").trim(),
        required: item?.required !== false,
      };
    })
    .filter(Boolean);
}

function normalizeCodingTasks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((task) => {
      const title = String(task?.title || "").trim();
      const description = String(task?.description || "").trim();
      if (!title || !description) return null;

      const incomingCases = Array.isArray(task?.testCases) ? task.testCases : [];
      const normalizedCases = incomingCases
        .map((item) => {
          const input = String(item?.input || "").trim();
          const expectedOutput = String(item?.expectedOutput || "").trim();
          if (!input && !expectedOutput) return null;
          const weight = Number.isFinite(Number(item?.weight)) ? Number(item.weight) : 1;
          return {
            input,
            expectedOutput,
            isHidden: item?.isHidden !== false,
            weight: weight > 0 ? weight : 1,
          };
        })
        .filter(Boolean);

      // Backward compatibility: if no explicit testCases provided, create one from sample fields.
      if (normalizedCases.length === 0 && (task?.sampleInput || task?.sampleOutput)) {
        normalizedCases.push({
          input: String(task?.sampleInput || "").trim(),
          expectedOutput: String(task?.sampleOutput || "").trim(),
          isHidden: false,
          weight: 1,
        });
      }

      return {
        title,
        description,
        language: String(task?.language || "JavaScript"),
        marks: Number.isFinite(Number(task?.marks)) ? Number(task.marks) : 10,
        starterCode: String(task?.starterCode || ""),
        timeLimitMs: Number.isFinite(Number(task?.timeLimitMs)) ? Number(task.timeLimitMs) : 4000,
        memoryLimitKb: Number.isFinite(Number(task?.memoryLimitKb)) ? Number(task.memoryLimitKb) : 131072,
        sampleInput: String(task?.sampleInput || ""),
        sampleOutput: String(task?.sampleOutput || ""),
        testCases: normalizedCases,
      };
    })
    .filter(Boolean);
}

async function createTest(req, res) {
  try {
    const {
      title,
      position,
      durationMinutes,
      passPercentage,
      status = "draft",
      roleCategory = "developer",
      enabledSections = ["mcq", "coding"],
      sectionConfigs = [],
      security,
      mcqQuestions = [],
      codingTasks = [],
    } = req.body;

    if (!title || !position || !durationMinutes || passPercentage === undefined) {
      return res.status(400).json({
        message: "title, position, durationMinutes, passPercentage are required",
      });
    }

    const passcode = await getUniquePasscode();
    const now = new Date();
    const doc = await Test.create({
      title,
      position,
      durationMinutes,
      passPercentage,
      status,
      roleCategory: normalizeRoleCategory(roleCategory),
      enabledSections: normalizeEnabledSections(enabledSections),
      sectionConfigs: normalizeSectionConfigs(sectionConfigs),
      security,
      mcqQuestions,
      codingTasks: normalizeCodingTasks(codingTasks),
      passcode,
      passcodeRotatedAt: now,
      passcodeExpiresAt: getNextPasscodeExpiry(now),
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Test created", test: doc });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create test" });
  }
}

async function listTests(req, res) {
  try {
    const { status, search = "" } = req.query;
    const filter = { createdBy: req.user._id };
    if (status && ["draft", "active"].includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { position: { $regex: search, $options: "i" } },
      ];
    }

    const tests = await Test.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ tests });
  } catch (error) {
    return res.status(500).json({ message: "Failed to list tests" });
  }
}

async function getTestById(req, res) {
  try {
    const test = await Test.findOne({ _id: req.params.id, createdBy: req.user._id }).lean();
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    return res.json({ test });
  } catch (error) {
    return res.status(500).json({ message: "Failed to get test" });
  }
}

async function updateTest(req, res) {
  try {
    const payload = { ...req.body };
    delete payload.passcode;
    delete payload.createdBy;
    if (Object.prototype.hasOwnProperty.call(payload, "roleCategory")) {
      payload.roleCategory = normalizeRoleCategory(payload.roleCategory);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "enabledSections")) {
      payload.enabledSections = normalizeEnabledSections(payload.enabledSections);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "sectionConfigs")) {
      payload.sectionConfigs = normalizeSectionConfigs(payload.sectionConfigs);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "codingTasks")) {
      payload.codingTasks = normalizeCodingTasks(payload.codingTasks);
    }

    const existing = await Test.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!existing) {
      return res.status(404).json({ message: "Test not found" });
    }

    if (payload.status === "active" && existing.status !== "active") {
      const now = new Date();
      payload.passcode = await getUniquePasscode(existing._id);
      payload.passcodeRotatedAt = now;
      payload.passcodeExpiresAt = getNextPasscodeExpiry(now);
    }

    const updated = await Test.findOneAndUpdate({ _id: req.params.id, createdBy: req.user._id }, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Test not found" });
    }
    return res.json({ message: "Test updated", test: updated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update test" });
  }
}

async function updateTestStatus(req, res) {
  try {
    const { status } = req.body;
    if (!["draft", "active"].includes(status)) {
      return res.status(400).json({ message: "status must be draft or active" });
    }

    const updatePayload = { status };
    if (status === "active") {
      const now = new Date();
      updatePayload.passcode = await getUniquePasscode(req.params.id);
      updatePayload.passcodeRotatedAt = now;
      updatePayload.passcodeExpiresAt = getNextPasscodeExpiry(now);
    }

    const updated = await Test.findOneAndUpdate({ _id: req.params.id, createdBy: req.user._id }, updatePayload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Test not found" });
    }
    return res.json({ message: "Status updated", test: updated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update status" });
  }
}

async function deleteTest(req, res) {
  try {
    const deleted = await Test.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
    if (!deleted) {
      return res.status(404).json({ message: "Test not found" });
    }
    return res.json({ message: "Test deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete test" });
  }
}

module.exports = {
  createTest,
  listTests,
  getTestById,
  updateTest,
  updateTestStatus,
  deleteTest,
};
