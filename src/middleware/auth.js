const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { parseBearerToken } = require("../utils/token");
const { getRequiredEnv } = require("../config/env");

async function auth(req, res, next) {
  try {
    const token = parseBearerToken(req.headers.authorization || "");
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: token missing" });
    }

    const payload = jwt.verify(token, getRequiredEnv("JWT_SECRET"));
    const user = await User.findById(payload.userId).select("_id name email role");
    if (!user) {
      return res.status(401).json({ message: "Unauthorized: user not found" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

function requireRole(roleOrRoles) {
  const allowedRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

module.exports = { auth, requireRole };
