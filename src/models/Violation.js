const mongoose = require("mongoose");

const violationSchema = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true, index: true },
    submission: { type: mongoose.Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
    type: { type: String, required: true, trim: true },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    actionTaken: { type: String, default: "logged" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

violationSchema.index({ submission: 1, type: 1, occurredAt: -1 });
violationSchema.index({ severity: 1, occurredAt: -1 });

module.exports = mongoose.model("Violation", violationSchema);

