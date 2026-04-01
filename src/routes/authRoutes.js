const express = require("express");
const { login } = require("../controllers/authController");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();
const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many login attempts. Please try again later.",
});

router.post("/login", loginRateLimit, login);

module.exports = router;
