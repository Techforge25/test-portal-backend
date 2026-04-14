const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { verifyCandidateSessionToken } = require("../utils/candidateSessionToken");
const { logger } = require("../utils/logger");
const { parseBearerToken } = require("../utils/token");
const { getCorsOrigins, getRequiredEnv, getSocketPath } = require("../config/env");

let io = null;

function initSocketServer(httpServer) {
  if (io) return io;

  const allowedOrigins = Array.from(getCorsOrigins());
  const socketPath = getSocketPath();
  io = new Server(httpServer, {
    path: socketPath,
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    try {
      const authToken = parseBearerToken(
        socket.handshake?.auth?.token ||
          socket.handshake?.auth?.accessToken ||
          socket.handshake?.query?.token
      );
      if (!authToken) {
        return next(new Error("Unauthorized socket"));
      }

      try {
        const candidatePayload = verifyCandidateSessionToken(authToken);
        socket.data.identity = {
          type: "candidate",
          submissionId: String(candidatePayload.sid || ""),
        };
        return next();
      } catch {
        // Try admin token below.
      }

      const payload = jwt.verify(authToken, getRequiredEnv("JWT_SECRET"));
      socket.data.identity = {
        type: "admin",
        userId: String(payload.userId || ""),
      };
      return next();
    } catch {
      return next(new Error("Unauthorized socket"));
    }
  });

  io.on("connection", (socket) => {
    const identity = socket.data.identity || {};
    if (identity.type === "admin") {
      socket.join("room:admin");
    }
    if (identity.type === "candidate" && identity.submissionId) {
      socket.join(`room:candidate:${identity.submissionId}`);
    }
  });

  logger.info("Socket.IO initialized", {
    path: socketPath,
  });

  return io;
}

function getSocketServer() {
  return io;
}

function emitAdmin(eventName, payload = {}) {
  if (!io) return;
  io.to("room:admin").emit(eventName, payload);
}

function emitAdminDataChanged(payload = {}) {
  emitAdmin("admin:data.changed", payload);
}

function emitCandidateEvaluationUpdated(submissionId, payload = {}) {
  if (!io || !submissionId) return;
  io.to(`room:candidate:${String(submissionId)}`).emit(
    `candidate:evaluation.updated:${String(submissionId)}`,
    payload
  );
  io.to(`room:candidate:${String(submissionId)}`).emit("candidate:evaluation.updated", payload);
  emitAdmin("admin:data.changed", { source: "candidate_evaluation", submissionId: String(submissionId) });
}

module.exports = {
  initSocketServer,
  getSocketServer,
  emitAdmin,
  emitAdminDataChanged,
  emitCandidateEvaluationUpdated,
};
