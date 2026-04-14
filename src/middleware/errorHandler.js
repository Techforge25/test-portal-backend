const { logger } = require("../utils/logger");

function notFoundHandler(req, res) {
  return res.status(404).json({ message: "Route not found" });
}

function errorHandler(error, req, res, next) {
  const status =
    Number.isFinite(Number(error?.statusCode)) && Number(error.statusCode) >= 400
      ? Number(error.statusCode)
      : 500;
  const message =
    status >= 500
      ? "Internal server error"
      : String(error?.message || "Request failed");

  logger.error("Unhandled server error", {
    status,
    message: String(error?.message || "Unknown error"),
    code: String(error?.code || ""),
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === "production" ? undefined : error?.stack,
  });

  return res.status(status).json({ message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
