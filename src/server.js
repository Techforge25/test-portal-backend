require("dotenv").config();
const app = require("./app");
const mongoose = require("mongoose");
const { connectDB } = require("./config/db");
const { bootstrapSuperAdmin } = require("./config/bootstrapSuperAdmin");
const { startPasscodeRotator, stopPasscodeRotator } = require("./jobs/passcodeRotator");
const { initCodingEvaluationQueue, shutdownCodingEvaluationQueue } = require("./jobs/codingEvaluationQueue");
const { processSubmissionCodingEvaluation } = require("./controllers/candidateController");
const { logger } = require("./utils/logger");

const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || "0.0.0.0";
let serverInstance = null;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutting down backend", { signal });

  try {
    stopPasscodeRotator();
    await shutdownCodingEvaluationQueue();
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  } catch (error) {
    logger.error("Shutdown error", { message: error.message });
  } finally {
    process.exit(0);
  }
}

async function start() {
  try {
    await connectDB();
    await bootstrapSuperAdmin();
    await initCodingEvaluationQueue({
      processor: processSubmissionCodingEvaluation,
    });
    await startPasscodeRotator();
    serverInstance = app.listen(port, host, () => {
      logger.info("Backend running", { url: `http://${host}:${port}` });
    });
  } catch (error) {
    logger.error("Failed to start backend", { message: error.message });
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

start();
