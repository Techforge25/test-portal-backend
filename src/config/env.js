function normalize(value) {
  return String(value || "").trim();
}

function isPrivateNetworkOrigin(origin = "") {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
    String(origin || "")
  );
}

function parseCsvList(value) {
  return normalize(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRequiredEnv(name) {
  const value = normalize(process.env[name]);
  if (!value) {
    throw new Error(`${name} is missing in backend/.env`);
  }
  return value;
}

function getCorsOrigins() {
  return new Set(parseCsvList(process.env.CORS_ORIGINS));
}

function getSocketPath() {
  const path = normalize(process.env.SOCKET_PATH);
  return path || "/socket.io";
}

function getServerPort() {
  const parsed = Number(process.env.PORT || 5000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

function getServerHost() {
  return normalize(process.env.HOST) || "0.0.0.0";
}

module.exports = {
  isPrivateNetworkOrigin,
  parseCsvList,
  getRequiredEnv,
  getCorsOrigins,
  getSocketPath,
  getServerPort,
  getServerHost,
};
