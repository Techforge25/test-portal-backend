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
      reviewedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Submission", submissionSchema);
