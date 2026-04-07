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
    path: req.path,
    method: req.method,
  });

  return res.status(status).json({ message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

