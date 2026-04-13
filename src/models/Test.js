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
    starterCode: { type: String, default: "" },
    timeLimitMs: { type: Number, min: 500, max: 30000, default: 4000 },
    memoryLimitKb: { type: Number, min: 16384, max: 524288, default: 131072 },
    testCases: {
      type: [
        new mongoose.Schema(
          {
            input: { type: String, default: "" },
            expectedOutput: { type: String, default: "" },
            isHidden: { type: Boolean, default: true },
            weight: { type: Number, min: 0, default: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    sampleInput: { type: String, default: "" },
    sampleOutput: { type: String, default: "" },
  },
  { _id: false }
);

const sectionConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: [
        "short_answer",
        "long_answer",
        "scenario",
        "ui_preview",
        "portfolio_link",
        "bug_report",
        "test_case",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    prompt: { type: String, default: "", trim: true },
    instructions: { type: String, default: "", trim: true },
    required: { type: Boolean, default: true },
    marks: { type: Number, min: 1, default: 10 },
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
    roleCategory: {
      type: String,
      enum: ["developer", "frontend", "designer", "video_editor", "qa_manual", "hr", "sales", "other"],
      default: "developer",
      index: true,
    },
    enabledSections: {
      type: [String],
      default: ["mcq", "coding"],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.every((v) =>
            [
              "mcq",
              "coding",
              "short_answer",
              "long_answer",
              "scenario",
              "ui_preview",
              "portfolio_link",
              "bug_report",
              "test_case",
            ].includes(v)
          ),
        message: "enabledSections contains invalid section keys",
      },
    },
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
    sectionConfigs: { type: [sectionConfigSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

testSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
testSchema.index({ status: 1, passcodeExpiresAt: 1 });

module.exports = mongoose.model("Test", testSchema);
