const { getRateLimitStore } = require("./rateLimitStore");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ windowMs, max, message }) {
  return async (req, res, next) => {
    const store = await getRateLimitStore();
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${req.method}:${req.path}:${ip}`;
    const { count } = await store.increment(key, windowMs);
    if (count > max) {
      return res.status(429).json({ message });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
