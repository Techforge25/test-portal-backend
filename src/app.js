const express = require("express");
const cors = require("cors");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const candidateRoutes = require("./routes/candidateRoutes");

const app = express();
const allowedOriginSet = new Set(
  String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
);

function isPrivateNetworkOrigin(origin = "") {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
    origin
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!allowedOriginSet.size) {
        if (process.env.NODE_ENV === "production") {
          const error = new Error("CORS origins are not configured");
          error.statusCode = 500;
          return callback(error, false);
        }
        return callback(null, true);
      }
      if (allowedOriginSet.has(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== "production" && isPrivateNetworkOrigin(origin)) {
        return callback(null, true);
      }
      const error = new Error("CORS blocked for this origin");
      error.statusCode = 403;
      return callback(error, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/candidate", candidateRoutes);

// API status route
app.get("/", (request, response) => response.send(`Test portal server is up and running at port ${process.env.PORT}`));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
