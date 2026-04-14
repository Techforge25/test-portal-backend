const AdminNotification = require("../models/AdminNotification");
const { emitAdmin } = require("../realtime/socketServer");

function toNotificationRow(notification, currentUserId) {
  const readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
  const isRead = readBy.some((id) => String(id) === String(currentUserId));
  return {
    id: String(notification._id),
    title: notification.title,
    message: notification.message,
    eventType: notification.eventType,
    isRead,
    createdAt: notification.createdAt,
  };
}

async function listNotifications(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSizeRaw = Number.parseInt(String(req.query.pageSize || "20"), 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);

    const total = await AdminNotification.countDocuments();
    const rows = await AdminNotification.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("_id title message eventType readBy createdAt");

    const notifications = rows.map((item) => toNotificationRow(item, req.user._id));
    const unreadCount = notifications.filter((item) => !item.isRead).length;

    return res.json({
      notifications,
      unreadCount,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load notifications" });
  }
}

async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    const updated = await AdminNotification.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    ).select("_id title message eventType readBy createdAt");

    if (!updated) {
      return res.status(404).json({ message: "Notification not found" });
    }
    emitAdmin("admin:notifications.updated", {
      action: "marked_read",
      notificationId: String(updated._id),
      userId: String(req.user?._id || ""),
    });

    return res.json({
      message: "Notification marked as read",
      notification: toNotificationRow(updated, req.user._id),
    });
  } catch {
    return res.status(500).json({ message: "Failed to update notification" });
  }
}

async function markAllNotificationsRead(req, res) {
  try {
    await AdminNotification.updateMany({}, { $addToSet: { readBy: req.user._id } });
    emitAdmin("admin:notifications.updated", {
      action: "marked_all_read",
      userId: String(req.user?._id || ""),
    });
    return res.json({ message: "All notifications marked as read" });
  } catch {
    return res.status(500).json({ message: "Failed to update notifications" });
  }
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
