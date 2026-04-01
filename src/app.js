const express = require("express");
const cors = require("cors");
const { logger } = require("./utils/logger");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const candidateRoutes = require("./routes/candidateRoutes");

const app = express();
const allowedOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function isPrivateNetworkOrigin(origin = "") {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
    origin
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.length) {
        if (process.env.NODE_ENV === "production") {
          return callback(new Error("CORS origins are not configured"), false);
        }
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== "production" && isPrivateNetworkOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked for this origin"), false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/candidate", candidateRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  logger.error("Unhandled server error", { message: error.message, path: req.path });
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
