const { getAdminSettings } = require("../utils/adminNotifier");
const { parsePositiveInt } = require("../utils/common");

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
  } catch (error) {
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

    return res.json({
      message: "Notification settings saved",
      notifications: settings.notifications,
    });
  } catch (error) {
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

    return res.json({
      message: "Security defaults saved",
      securityDefaults: settings.securityDefaults,
    });
  } catch {
    return res.status(500).json({ message: "Failed to save security defaults" });
  }
}

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  getSecurityDefaults,
  updateSecurityDefaults,
};
