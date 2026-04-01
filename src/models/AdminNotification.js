const mongoose = require("mongoose");

const adminNotificationSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["new_candidate", "test_completed", "high_violation"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
