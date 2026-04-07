require("dotenv").config();
const { connectDB } = require("../config/db");
const { initCodingEvaluationQueue } = require("../jobs/codingEvaluationQueue");
const { processSubmissionCodingEvaluation } = require("../controllers/candidateController");
const { logger } = require("../utils/logger");

async function startWorker() {
  try {
    await connectDB();
    process.env.CODING_EVAL_INLINE_WORKER = "true";
    await initCodingEvaluationQueue({
      processor: processSubmissionCodingEvaluation,
    });
    logger.info("coding evaluation worker started");
  } catch (error) {
    logger.error("coding evaluation worker failed to start", { message: error.message });
    process.exit(1);
  }
}

startWorker();

