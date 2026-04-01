const mongoose = require("mongoose");

const mcqOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const mcqQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    options: {
      type: [mcqOptionSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 4,
        message: "Each MCQ must have exactly 4 options",
      },
    },
    correctOptionIndex: { type: Number, min: 0, max: 3, required: true },
    marks: { type: Number, min: 1, default: 1 },
  },
  { _id: false }
);

const codingTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    language: { type: String, default: "JavaScript" },
    marks: { type: Number, min: 1, default: 10 },
    sampleInput: { type: String, default: "" },
    sampleOutput: { type: String, default: "" },
  },
  { _id: false }
);

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    passPercentage: { type: Number, required: true, min: 0, max: 100 },
    passcode: { type: String, required: true, unique: true, index: true },
    passcodeRotatedAt: { type: Date, default: Date.now },
    passcodeExpiresAt: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ["draft", "active"],
      default: "draft",
      index: true,
    },
    security: {
      forceFullscreen: { type: Boolean, default: true },
      disableTabSwitch: { type: Boolean, default: true },
      autoEndOnTabChange: { type: Boolean, default: false },
      disableCopyPaste: { type: Boolean, default: true },
      disableRightClick: { type: Boolean, default: true },
      detectDevTools: { type: Boolean, default: true },
      warningLimit: { type: Number, default: 2, min: 1, max: 10 },
      autoSaveIntervalSeconds: { type: Number, default: 60, min: 15 },
    },
    mcqQuestions: { type: [mcqQuestionSchema], default: [] },
    codingTasks: { type: [codingTaskSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Test", testSchema);
