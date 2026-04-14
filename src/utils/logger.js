function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ message: "Unable to stringify log metadata" });
  }
}

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${safeStringify(meta)}` : "";
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

