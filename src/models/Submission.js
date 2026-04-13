const mongoose = require("mongoose");

const mcqAnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    selectedOptionIndex: { type: Number, min: 0, max: 3, required: true },
  },
  { _id: false }
);

const codingAnswerSchema = new mongoose.Schema(
  {
    taskIndex: { type: Number, required: true },
    code: { type: String, default: "" },
    language: { type: String, default: "JavaScript" },
    lastRunAt: { type: Date },
  },
  { _id: false }
);

const codingEvaluationTaskCaseResultSchema = new mongoose.Schema(
  {
    caseIndex: { type: Number, required: true, min: 0 },
    passed: { type: Boolean, default: false },
    runtimeMs: { type: Number, default: 0, min: 0 },
    memoryKb: { type: Number, default: 0, min: 0 },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const codingEvaluationTaskResultSchema = new mongoose.Schema(
  {
    taskIndex: { type: Number, required: true, min: 0 },
    title: { type: String, default: "" },
    marksAwarded: { type: Number, default: 0, min: 0 },
    maxMarks: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    cases: { type: [codingEvaluationTaskCaseResultSchema], default: [] },
  },
  { _id: false }
);

const sectionAnswerSchema = new mongoose.Schema(
  {
    sectionKey: {
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
    itemIndex: { type: Number, required: true, min: 0 },
    answer: { type: String, default: "" },
  },
  { _id: false }
);

const sectionEvaluationItemSchema = new mongoose.Schema(
  {
    sectionKey: {
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
    itemIndex: { type: Number, required: true, min: 0 },
    title: { type: String, default: "" },
    marksAwarded: { type: Number, default: 0, min: 0 },
    maxMarks: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["under_review", "completed", "failed"],
      default: "under_review",
    },
    feedback: { type: String, default: "" },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true, index: true },
    candidateName: { type: String, required: true, trim: true },
    candidateEmail: { type: String, required: true, lowercase: true, trim: true },
    candidateProfile: {
      phoneNumber: { type: String, default: "" },
      cnic: { type: String, default: "" },
      maritalStatus: { type: String, default: "" },
      qualification: { type: String, default: "" },
      dateOfBirth: { type: String, default: "" },
      positionAppliedFor: { type: String, default: "" },
      residentialAddress: { type: String, default: "" },
      workExperience: { type: String, default: "" },
      startDate: { type: String, default: "" },
      endDate: { type: String, default: "" },
      currentSalary: { type: String, default: "" },
      expectedSalary: { type: String, default: "" },
      expectedJoiningDate: { type: String, default: "" },
      shiftComfortable: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "auto_submitted"],
      default: "in_progress",
      index: true,
    },
    mcqAnswers: { type: [mcqAnswerSchema], default: [] },
    codingAnswers: { type: [codingAnswerSchema], default: [] },
    sectionAnswers: { type: [sectionAnswerSchema], default: [] },
    codingEvaluation: {
      status: {
        type: String,
        enum: ["not_required", "queued", "running", "completed", "failed"],
        default: "not_required",
      },
      startedAt: { type: Date },
      completedAt: { type: Date },
      totalMarks: { type: Number, default: 0, min: 0 },
      maxMarks: { type: Number, default: 0, min: 0 },
      version: { type: Number, default: 1 },
      tasks: { type: [codingEvaluationTaskResultSchema], default: [] },
      error: { type: String, default: "" },
    },
    sectionEvaluation: {
      status: {
        type: String,
        enum: ["not_required", "pending_review", "completed"],
        default: "not_required",
      },
      totalMarks: { type: Number, default: 0, min: 0 },
      maxMarks: { type: Number, default: 0, min: 0 },
      items: { type: [sectionEvaluationItemSchema], default: [] },
    },
    warningCount: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    endedReason: { type: String, default: "" },
    review: {
      decision: {
        type: String,
        enum: ["", "Passed", "Failed", "Shortlisted", "On Hold"],
        default: "",
      },
      comment: { type: String, default: "" },
      codingReviews: [
        {
          taskIndex: { type: Number, required: true },
          title: { type: String, default: "" },
          marksAwarded: { type: Number, default: 0, min: 0 },
          status: {
            type: String,
            enum: ["Under Review", "Passed", "Failed", "On Hold"],
            default: "Under Review",
          },
          feedback: { type: String, default: "" },
        },
      ],
      sectionReviews: [
        {
          sectionKey: {
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
          itemIndex: { type: Number, required: true, min: 0 },
          title: { type: String, default: "" },
          marksAwarded: { type: Number, default: 0, min: 0 },
          status: {
            type: String,
            enum: ["Under Review", "Passed", "Failed", "On Hold"],
            default: "Under Review",
          },
          feedback: { type: String, default: "" },
        },
      ],
      reviewedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  },
  { timestamps: true }
);

submissionSchema.index({ test: 1, candidateEmail: 1, createdAt: -1 });
submissionSchema.index({ candidateEmail: 1, createdAt: -1 });
submissionSchema.index({ status: 1, submittedAt: -1 });

module.exports = mongoose.model("Submission", submissionSchema);
