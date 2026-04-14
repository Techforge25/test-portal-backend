const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const {
  getNotificationSettings,
  updateNotificationSettings,
  getSecurityDefaults,
  updateSecurityDefaults,
  uploadUiPreviewImage,
  uploadUiTaskPdf,
} = require("../controllers/adminSettingsController");
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/adminNotificationController");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/settings/notifications", getNotificationSettings);
router.patch("/settings/notifications", updateNotificationSettings);
router.get("/settings/security-defaults", getSecurityDefaults);
router.patch("/settings/security-defaults", updateSecurityDefaults);
router.post("/settings/uploads/ui-preview-image", uploadUiPreviewImage);
router.post("/settings/uploads/ui-task-pdf", uploadUiTaskPdf);
router.get("/notifications", listNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
