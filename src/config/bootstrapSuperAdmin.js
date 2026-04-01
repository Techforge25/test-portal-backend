const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { logger } = require("../utils/logger");

async function bootstrapSuperAdmin() {
  const fallbackName = process.env.ADMIN_NAME || "Admin";
  const fallbackEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const fallbackPassword = process.env.ADMIN_PASSWORD || "";

  if (!fallbackEmail || !fallbackPassword) {
    throw new Error(
      "Admin bootstrap missing. Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env"
    );
  }

  const existingAdmin = await User.findOne({ email: fallbackEmail });
  if (existingAdmin) {
    if (existingAdmin.role !== "admin") {
      existingAdmin.role = "admin";
      await existingAdmin.save();
    }
    return existingAdmin;
  }

  const passwordHash = await bcrypt.hash(fallbackPassword, 10);
  const adminUser = await User.create({
    name: fallbackName,
    email: fallbackEmail,
    passwordHash,
    role: "admin",
    mustChangePassword: false,
    isActive: true,
  });

  logger.info("Admin created", { email: adminUser.email });
  return adminUser;
}

module.exports = { bootstrapSuperAdmin };
