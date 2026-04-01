const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function listAdmins(req, res) {
  try {
    const users = await User.find({ role: "admin" })
      .select("_id name email role mustChangePassword isActive createdAt")
      .sort({ createdAt: -1 });
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch admin users" });
  }
}

async function createSubAdmin(req, res) {
  try {
    const { name, email, temporaryPassword, forcePasswordChange = true } = req.body;
    if (!name || !email || !temporaryPassword) {
      return res.status(400).json({ message: "name, email, temporaryPassword are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "admin",
      mustChangePassword: Boolean(forcePasswordChange),
      isActive: true,
    });

    return res.status(201).json({
      message: "Sub-admin created",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create sub-admin" });
  }
}

module.exports = { listAdmins, createSubAdmin };
