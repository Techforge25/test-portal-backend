const Submission = require("../models/Submission");
const { logger } = require("../utils/logger");
const { emitCandidateEvaluationUpdated, emitAdminDataChanged } = require("./socketServer");

let submissionStream = null;

async function startRealtimeChangeStreamWatcher() {
  try {
    if (submissionStream) return;
    submissionStream = Submission.watch([], { fullDocument: "updateLookup" });

    submissionStream.on("change", (change) => {
      try {
        const fullDocument = change?.fullDocument;
        const submissionId = String(
          fullDocument?._id ||
            change?.documentKey?._id ||
            ""
        );
        if (!submissionId) return;

        if (change?.operationType === "insert" || change?.operationType === "update" || change?.operationType === "replace") {
          emitCandidateEvaluationUpdated(submissionId, {
            source: "change_stream",
            submissionId,
          });
          emitAdminDataChanged({
            source: "submission_changed",
            submissionId,
          });
        }
      } catch (error) {
        logger.warn("realtime change event failed", {
          message: error?.message || "Unknown change event error",
        });
      }
    });

    submissionStream.on("error", (error) => {
      logger.warn("submission change stream error", {
        message: error?.message || "Unknown change stream error",
      });
    });
  } catch (error) {
    logger.warn("realtime watcher not started", {
      message: error?.message || "Change streams unavailable",
    });
  }
}

async function stopRealtimeChangeStreamWatcher() {
  try {
    if (!submissionStream) return;
    await submissionStream.close();
  } catch {
    // no-op
  } finally {
    submissionStream = null;
  }
}

module.exports = {
  startRealtimeChangeStreamWatcher,
  stopRealtimeChangeStreamWatcher,
};

