function parseBearerToken(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (value.toLowerCase().startsWith("bearer ")) return value.slice(7).trim();
  return value;
}

module.exports = {
  parseBearerToken,
};
