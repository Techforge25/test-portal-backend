const Test = require("../models/Test");
const { getNextPasscodeExpiry, getRotationMs, getUniquePasscode } = require("../utils/passcodeService");
const { logger } = require("../utils/logger");

const CHECK_INTERVAL_MS = 60 * 1000;
let intervalRef = null;
let isRunning = false;

async function rotateExpiredPasscodes() {
  if (isRunning) return;
  isRunning = true;
  try {
    const now = new Date();
    const expiredActiveTests = await Test.find({
      status: "active",
      $or: [{ passcodeExpiresAt: { $lte: now } }, { passcodeExpiresAt: { $exists: false } }],
    }).select("_id title passcode");

    for (const test of expiredActiveTests) {
      // eslint-disable-next-line no-await-in-loop
      const nextPasscode = await getUniquePasscode(test._id);
      const rotatedAt = new Date();
      test.passcode = nextPasscode;
      test.passcodeRotatedAt = rotatedAt;
      test.passcodeExpiresAt = getNextPasscodeExpiry(rotatedAt);
      // eslint-disable-next-line no-await-in-loop
      await test.save();
      logger.info("passcode-rotator rotated passcode", { testId: String(test._id), title: test.title });
    }
  } catch (error) {
    logger.error("passcode-rotator failed", { message: error.message });
  } finally {
    isRunning = false;
  }
}

async function startPasscodeRotator() {
  if (intervalRef) return;
  const rotationMs = getRotationMs();
  logger.info("passcode-rotator enabled", { rotationMinutes: Math.round(rotationMs / 60000) });
  await rotateExpiredPasscodes();
  intervalRef = setInterval(() => {
    void rotateExpiredPasscodes();
  }, CHECK_INTERVAL_MS);
}

module.exports = {
  startPasscodeRotator,
};
