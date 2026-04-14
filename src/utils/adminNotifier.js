const User = require("../models/User");
const AdminSetting = require("../models/AdminSetting");
const AdminNotification = require("../models/AdminNotification");
const { sendEmail } = require("./emailService");
const { emitAdmin, emitAdminDataChanged } = require("../realtime/socketServer");

async function getAdminSettings() {
  let settings = await AdminSetting.findOne({ key: "default" });
  if (!settings) {
    settings = await AdminSetting.create({
      key: "default",
      notifications: {
        testCompleted: true,
        newCandidate: true,
        violationAlert: true,
      },
      securityDefaults: {
        forceFullscreen: true,
        disableCopyPaste: true,
        warningLimit: 2,
        autoSaveInterval: 60,
      },
    });
  }

  if (!settings.securityDefaults) {
    settings.securityDefaults = {
      forceFullscreen: true,
      disableCopyPaste: true,
      warningLimit: 2,
      autoSaveInterval: 60,
    };
  }

  return settings;
}

async function getAdminEmails() {
  const admins = await User.find({ role: "admin", isActive: true }).select("email");
  return admins.map((item) => item.email).filter(Boolean);
}

function buildEmail(event, payload) {
  if (event === "new_candidate") {
    return {
      subject: `New Candidate Started: ${payload.testTitle}`,
      text: `${payload.candidateName} (${payload.candidateEmail}) started ${payload.testTitle}.`,
    };
  }
  if (event === "test_completed") {
    return {
      subject: `Test Submitted: ${payload.testTitle}`,
      text: `${payload.candidateName} (${payload.candidateEmail}) submitted ${payload.testTitle}. Score: ${payload.score}.`,
    };
  }
  return {
    subject: `High Severity Violation: ${payload.testTitle}`,
    text: `${payload.candidateName} (${payload.candidateEmail}) triggered ${payload.violationType} in ${payload.testTitle}.`,
  };
}

function buildInAppNotification(event, payload) {
  if (event === "new_candidate") {
    return {
      title: "New Candidate Registered",
      message: `${payload.candidateName} started ${payload.testTitle}.`,
    };
  }
  if (event === "test_completed") {
    return {
      title: "Submission Completed",
      message: `${payload.candidateName} submitted ${payload.testTitle}.`,
    };
  }
  return {
    title: "High Severity Violation",
    message: `${payload.candidateName} triggered ${payload.violationType} in ${payload.testTitle}.`,
  };
}

async function notifyAdmins(event, payload) {
  const inApp = buildInAppNotification(event, payload);
  const savedNotification = await AdminNotification.create({
    eventType: event,
    title: inApp.title,
    message: inApp.message,
    metadata: payload || {},
  });
  emitAdmin("admin:notifications.updated", {
    action: "created",
    notificationId: String(savedNotification._id),
    eventType: event,
  });
  emitAdminDataChanged({
    source: "notification_created",
    eventType: event,
  });

  const settings = await getAdminSettings();
  const enabled =
    (event === "new_candidate" && settings.notifications?.newCandidate) ||
    (event === "test_completed" && settings.notifications?.testCompleted) ||
    (event === "high_violation" && settings.notifications?.violationAlert);

  if (!enabled) return;

  const recipients = await getAdminEmails();
  if (!recipients.length) return;

  const email = buildEmail(event, payload);
  await sendEmail({
    to: recipients.join(","),
    subject: email.subject,
    text: email.text,
  });
}

module.exports = { notifyAdmins, getAdminSettings };
