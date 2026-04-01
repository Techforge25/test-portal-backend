const Test = require("../models/Test");
const { getNextPasscodeExpiry, getUniquePasscode } = require("../utils/passcodeService");

async function createTest(req, res) {
  try {
    const {
      title,
      position,
      durationMinutes,
      passPercentage,
      status = "draft",
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
      security,
      mcqQuestions,
      codingTasks,
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

    const tests = await Test.find(filter).sort({ createdAt: -1 });
    return res.json({ tests });
  } catch (error) {
    return res.status(500).json({ message: "Failed to list tests" });
  }
}

async function getTestById(req, res) {
  try {
    const test = await Test.findOne({ _id: req.params.id, createdBy: req.user._id });
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
