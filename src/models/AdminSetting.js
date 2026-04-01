const mongoose = require("mongoose");

const adminSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    notifications: {
      testCompleted: { type: Boolean, default: true },
      newCandidate: { type: Boolean, default: true },
      violationAlert: { type: Boolean, default: true },
    },
    branding: {
      companyName: { type: String, default: "Techforge Innovation", trim: true },
      logoDataUrl: { type: String, default: "" },
    },
    profile: {
      name: { type: String, default: "Alexa John", trim: true },
      avatarDataUrl: { type: String, default: "" },
    },
    securityDefaults: {
      forceFullscreen: { type: Boolean, default: true },
      disableCopyPaste: { type: Boolean, default: true },
      warningLimit: { type: Number, default: 2, min: 1, max: 10 },
      autoSaveInterval: { type: Number, default: 60, min: 15 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminSetting", adminSettingSchema);
