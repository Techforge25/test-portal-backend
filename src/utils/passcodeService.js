const Test = require("../models/Test");
const { generatePasscode } = require("./generatePasscode");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getRotationMinutes() {
  return parsePositiveInt(process.env.PASSCODE_ROTATION_MINUTES, 60);
}

function getRotationMs() {
  return getRotationMinutes() * 60 * 1000;
}

function getNextPasscodeExpiry(fromDate = new Date()) {
  return new Date(fromDate.getTime() + getRotationMs());
}

async function getUniquePasscode(excludeTestId) {
  for (let i = 0; i < 8; i += 1) {
    const passcode = generatePasscode();
    const filter = { passcode };
    if (excludeTestId) {
      filter._id = { $ne: excludeTestId };
    }
    // eslint-disable-next-line no-await-in-loop
    const exists = await Test.exists(filter);
    if (!exists) return passcode;
  }
  throw new Error("Unable to generate unique passcode");
}

module.exports = {
  getRotationMinutes,
  getRotationMs,
  getNextPasscodeExpiry,
  getUniquePasscode,
};

