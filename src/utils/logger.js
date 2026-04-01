function log(level, message, meta) {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(`[${ts}] [${level}] ${message}${suffix}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [${level}] ${message}${suffix}`);
}

const logger = {
  info(message, meta) {
    log("info", message, meta);
  },
  warn(message, meta) {
    log("warn", message, meta);
  },
  error(message, meta) {
    log("error", message, meta);
  },
};

module.exports = { logger };

