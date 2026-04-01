const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const {
  getNotificationSettings,
  updateNotificationSettings,
  getBrandingSettings,
  updateBrandingSettings,
  getProfileSettings,
  updateProfileSettings,
  getSecurityDefaults,
  updateSecurityDefaults,
  getPublicBranding,
} = require("../controllers/adminSettingsController");
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/adminNotificationController");

const router = express.Router();

router.get("/public/branding", getPublicBranding);

router.use(auth, requireRole("admin"));

router.get("/settings/notifications", getNotificationSettings);
router.patch("/settings/notifications", updateNotificationSettings);
router.get("/settings/branding", getBrandingSettings);
router.patch("/settings/branding", updateBrandingSettings);
router.get("/settings/profile", getProfileSettings);
router.patch("/settings/profile", updateProfileSettings);
router.get("/settings/security-defaults", getSecurityDefaults);
router.patch("/settings/security-defaults", updateSecurityDefaults);
router.get("/notifications", listNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
