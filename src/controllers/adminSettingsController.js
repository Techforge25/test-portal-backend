const { getAdminSettings } = require("../utils/adminNotifier");
const { parsePositiveInt } = require("../utils/common");
const {
  isCloudinaryReady,
  uploadBase64Image,
  uploadBase64Pdf,
} = require("../services/cloudinaryService");
const { emitAdmin, emitAdminDataChanged } = require("../realtime/socketServer");

function requireCloudinary(res) {
  if (isCloudinaryReady()) return true;
  res.status(500).json({
    message:
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
  });
  return false;
}

function extractBase64Bytes(dataUrl) {
  const base64Payload = String(dataUrl || "").split(",")[1] || "";
  const uploadBytes = Buffer.byteLength(base64Payload, "base64");
  return Number.isFinite(uploadBytes) ? uploadBytes : 0;
}

function sanitizePublicIdPart(fileName, fallback) {
  const value = String(fileName || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32);
  return value || fallback;
}

async function getNotificationSettings(req, res) {
  try {
    const settings = await getAdminSettings();
    return res.json({
      notifications: {
        testCompleted: Boolean(settings.notifications?.testCompleted),
        newCandidate: Boolean(settings.notifications?.newCandidate),
        violationAlert: Boolean(settings.notifications?.violationAlert),
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load notification settings" });
  }
}

async function updateNotificationSettings(req, res) {
  try {
    const { testCompleted, newCandidate, violationAlert } = req.body || {};
    if (
      typeof testCompleted !== "boolean" ||
      typeof newCandidate !== "boolean" ||
      typeof violationAlert !== "boolean"
    ) {
      return res.status(400).json({ message: "testCompleted, newCandidate, violationAlert must be boolean" });
    }

    const settings = await getAdminSettings();
    settings.notifications = {
      testCompleted,
      newCandidate,
      violationAlert,
    };
    await settings.save();
    emitAdmin("admin:notifications.updated", { action: "settings_updated" });
    emitAdminDataChanged({ source: "notification_settings_updated" });

    return res.json({
      message: "Notification settings saved",
      notifications: settings.notifications,
    });
  } catch {
    return res.status(500).json({ message: "Failed to save notification settings" });
  }
}

async function getSecurityDefaults(req, res) {
  try {
    const settings = await getAdminSettings();
    return res.json({
      securityDefaults: {
        forceFullscreen: Boolean(settings.securityDefaults?.forceFullscreen),
        disableCopyPaste: Boolean(settings.securityDefaults?.disableCopyPaste),
        warningLimit: Number(settings.securityDefaults?.warningLimit || 2),
        autoSaveInterval: Number(settings.securityDefaults?.autoSaveInterval || 60),
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load security defaults" });
  }
}

async function updateSecurityDefaults(req, res) {
  try {
    const { forceFullscreen, disableCopyPaste, warningLimit, autoSaveInterval } = req.body || {};
    if (typeof forceFullscreen !== "boolean" || typeof disableCopyPaste !== "boolean") {
      return res.status(400).json({ message: "forceFullscreen and disableCopyPaste must be boolean" });
    }

    const warning = parsePositiveInt(warningLimit, -1);
    const autosave = parsePositiveInt(autoSaveInterval, -1);
    if (!Number.isFinite(warning) || warning < 1 || warning > 10) {
      return res.status(400).json({ message: "warningLimit must be between 1 and 10" });
    }
    if (!Number.isFinite(autosave) || autosave < 15) {
      return res.status(400).json({ message: "autoSaveInterval must be at least 15 seconds" });
    }

    const settings = await getAdminSettings();
    settings.securityDefaults = {
      forceFullscreen,
      disableCopyPaste,
      warningLimit: warning,
      autoSaveInterval: autosave,
    };
    await settings.save();
    emitAdminDataChanged({ source: "security_defaults_updated" });

    return res.json({
      message: "Security defaults saved",
      securityDefaults: settings.securityDefaults,
    });
  } catch {
    return res.status(500).json({ message: "Failed to save security defaults" });
  }
}

async function uploadUiPreviewImage(req, res) {
  try {
    const { dataUrl, fileName } = req.body || {};
    if (typeof dataUrl !== "string" || !dataUrl.trim()) {
      return res.status(400).json({ message: "dataUrl is required" });
    }

    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
      return res.status(400).json({ message: "Only base64 image data URLs are allowed" });
    }

    const maxBytes = parsePositiveInt(process.env.UI_PREVIEW_UPLOAD_MAX_BYTES, 1_500_000);
    const uploadBytes = extractBase64Bytes(dataUrl);
    if (!uploadBytes) {
      return res.status(400).json({ message: "Invalid image payload" });
    }
    if (uploadBytes > maxBytes) {
      return res.status(400).json({ message: `Image is too large. Max allowed is ${maxBytes} bytes` });
    }

    if (!requireCloudinary(res)) return;

    const upload = await uploadBase64Image(dataUrl, {
      publicIdPrefix: `ui-preview-${sanitizePublicIdPart(fileName, "image")}`,
    });

    return res.json({
      message: "Image uploaded successfully",
      url: upload.url,
      publicId: upload.publicId,
    });
  } catch {
    return res.status(500).json({ message: "Failed to upload image" });
  }
}

async function uploadUiTaskPdf(req, res) {
  try {
    const { dataUrl, fileName } = req.body || {};
    if (typeof dataUrl !== "string" || !dataUrl.trim()) {
      return res.status(400).json({ message: "dataUrl is required" });
    }

    if (!/^data:application\/pdf;base64,/.test(dataUrl)) {
      return res.status(400).json({ message: "Only base64 PDF data URLs are allowed" });
    }

    const maxBytes = parsePositiveInt(process.env.UI_TASK_PDF_UPLOAD_MAX_BYTES, 5_000_000);
    const uploadBytes = extractBase64Bytes(dataUrl);
    if (!uploadBytes) {
      return res.status(400).json({ message: "Invalid PDF payload" });
    }
    if (uploadBytes > maxBytes) {
      return res.status(400).json({ message: `PDF is too large. Max allowed is ${maxBytes} bytes` });
    }

    if (!requireCloudinary(res)) return;

    const upload = await uploadBase64Pdf(dataUrl, {
      publicIdPrefix: `ui-task-${sanitizePublicIdPart(fileName, "document")}`,
    });

    return res.json({
      message: "PDF uploaded successfully",
      url: upload.url,
      publicId: upload.publicId,
    });
  } catch {
    return res.status(500).json({ message: "Failed to upload PDF" });
  }
}

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  getSecurityDefaults,
  updateSecurityDefaults,
  uploadUiPreviewImage,
  uploadUiTaskPdf,
};
