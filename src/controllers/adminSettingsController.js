const { getAdminSettings } = require("../utils/adminNotifier");

function getDataUrlBytes(value = "") {
  const text = String(value || "");
  const idx = text.indexOf("base64,");
  if (idx === -1) return 0;
  const base64 = text.slice(idx + 7);
  return Math.floor((base64.length * 3) / 4);
}

function isAllowedImageDataUrl(value = "") {
  const text = String(value || "");
  if (!text) return true;
  return /^data:image\/(png|jpeg|jpg);base64,/i.test(text);
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

async function getBrandingSettings(req, res) {
  try {
    const settings = await getAdminSettings();
    return res.json({
      branding: {
        companyName: String(settings.branding?.companyName || "Techforge Innovation"),
        logoDataUrl: String(settings.branding?.logoDataUrl || ""),
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load branding settings" });
  }
}

async function updateBrandingSettings(req, res) {
  try {
    const { companyName, logoDataUrl = "" } = req.body || {};
    if (!String(companyName || "").trim()) {
      return res.status(400).json({ message: "companyName is required" });
    }
    if (!isAllowedImageDataUrl(logoDataUrl)) {
      return res.status(400).json({ message: "Only PNG/JPG image data URLs are allowed" });
    }
    if (getDataUrlBytes(logoDataUrl) > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "Logo image size must be <= 2MB" });
    }

    const settings = await getAdminSettings();
    settings.branding = {
      companyName: String(companyName).trim(),
      logoDataUrl: String(logoDataUrl || ""),
    };
    await settings.save();

    return res.json({
      message: "Branding settings saved",
      branding: settings.branding,
    });
  } catch {
    return res.status(500).json({ message: "Failed to save branding settings" });
  }
}

async function getProfileSettings(req, res) {
  try {
    const settings = await getAdminSettings();
    return res.json({
      profile: {
        name: String(settings.profile?.name || "Alexa John"),
        avatarDataUrl: String(settings.profile?.avatarDataUrl || ""),
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load profile settings" });
  }
}

async function updateProfileSettings(req, res) {
  try {
    const { name, avatarDataUrl = "" } = req.body || {};
    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    if (!isAllowedImageDataUrl(avatarDataUrl)) {
      return res.status(400).json({ message: "Only PNG/JPG image data URLs are allowed" });
    }
    if (getDataUrlBytes(avatarDataUrl) > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "Profile image size must be <= 2MB" });
    }

    const settings = await getAdminSettings();
    settings.profile = {
      name: String(name).trim(),
      avatarDataUrl: String(avatarDataUrl || ""),
    };
    await settings.save();

    return res.json({
      message: "Profile settings saved",
      profile: settings.profile,
    });
  } catch {
    return res.status(500).json({ message: "Failed to save profile settings" });
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

    const warning = Number.parseInt(String(warningLimit), 10);
    const autosave = Number.parseInt(String(autoSaveInterval), 10);
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

async function getPublicBranding(req, res) {
  try {
    const settings = await getAdminSettings();
    return res.json({
      branding: {
        companyName: String(settings.branding?.companyName || "Techforge Innovation"),
        logoDataUrl: String(settings.branding?.logoDataUrl || ""),
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load branding" });
  }
}

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  getBrandingSettings,
  updateBrandingSettings,
  getProfileSettings,
  updateProfileSettings,
  getSecurityDefaults,
  updateSecurityDefaults,
  getPublicBranding,
};
