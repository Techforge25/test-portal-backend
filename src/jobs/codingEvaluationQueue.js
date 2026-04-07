const { logger } = require("../utils/logger");

const QUEUE_NAME = "coding-evaluation";
let queueInstance = null;
let workerInstance = null;
let redisConnection = null;
let mode = "memory";
let memoryProcessor = null;
const memoryJobs = new Set();
const memoryPendingJobs = [];
let memoryActiveWorkers = 0;
const MEMORY_CONCURRENCY = Math.max(1, Number(process.env.CODING_EVAL_MEMORY_CONCURRENCY || 1));

function getRedisUrl() {
  const value = String(process.env.REDIS_URL || "").trim();
  return value || "";
}

async function initCodingEvaluationQueue({ processor }) {
  memoryProcessor = processor;
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    mode = "memory";
    logger.warn("coding-eval queue running in memory mode (REDIS_URL missing)");
    return { mode };
  }

  try {
    const IORedis = require("ioredis");
    const { Queue, Worker } = require("bullmq");
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    await redisConnection.connect();

    queueInstance = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1500 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });

    const runInlineWorker = String(process.env.CODING_EVAL_INLINE_WORKER || "true").toLowerCase() !== "false";
    if (runInlineWorker && processor) {
      workerInstance = new Worker(
        QUEUE_NAME,
        async (job) => processor(String(job?.data?.submissionId || "")),
        {
          connection: redisConnection,
          concurrency: Number(process.env.CODING_EVAL_WORKER_CONCURRENCY || 2),
        }
      );
      workerInstance.on("failed", (job, error) => {
        logger.error("coding-eval job failed", {
          jobId: job?.id,
          submissionId: job?.data?.submissionId,
          message: error?.message,
        });
      });
    }

    mode = "redis";
    logger.info("coding-eval queue initialized", {
      mode,
      inlineWorker: Boolean(workerInstance),
      queue: QUEUE_NAME,
    });
    return { mode };
  } catch (error) {
    mode = "memory";
    queueInstance = null;
    workerInstance = null;
    if (redisConnection) {
      try {
        redisConnection.disconnect();
      } catch {
        // ignore cleanup errors
      }
    }
    redisConnection = null;
    logger.error("coding-eval queue init failed, fallback to memory mode", { message: error.message });
    return { mode, error: error.message };
  }
}

function pumpMemoryQueue() {
  if (!memoryProcessor) return;
  while (memoryActiveWorkers < MEMORY_CONCURRENCY && memoryPendingJobs.length) {
    const nextSubmissionId = memoryPendingJobs.shift();
    if (!nextSubmissionId) continue;
    memoryActiveWorkers += 1;
    setImmediate(async () => {
      try {
        await memoryProcessor(nextSubmissionId);
      } finally {
        memoryJobs.delete(nextSubmissionId);
        memoryActiveWorkers = Math.max(0, memoryActiveWorkers - 1);
        pumpMemoryQueue();
      }
    });
  }
}

async function enqueueCodingEvaluation(submissionId) {
  const id = String(submissionId || "");
  if (!id) return;

  if (mode === "redis" && queueInstance) {
    try {
      await queueInstance.add(
        "evaluate",
        { submissionId: id },
        { jobId: `submission:${id}` }
      );
      return;
    } catch (error) {
      // If duplicate job id already exists, ignore.
      if (!String(error?.message || "").toLowerCase().includes("job id")) {
        logger.error("coding-eval enqueue failed, fallback to memory", { message: error.message });
      }
    }
  }

  if (!memoryProcessor || memoryJobs.has(id)) return;
  memoryJobs.add(id);
  memoryPendingJobs.push(id);
  pumpMemoryQueue();
}

async function shutdownCodingEvaluationQueue() {
  try {
    if (workerInstance) {
      await workerInstance.close();
      workerInstance = null;
    }
    if (queueInstance) {
      await queueInstance.close();
      queueInstance = null;
    }
    if (redisConnection) {
      await redisConnection.quit();
      redisConnection = null;
    }
  } catch (error) {
    logger.error("coding-eval queue shutdown failed", { message: error.message });
  }
}

module.exports = {
  initCodingEvaluationQueue,
  enqueueCodingEvaluation,
  shutdownCodingEvaluationQueue,
};
