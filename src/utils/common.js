function toObjectIdString(value) {
  return String(value);
}

function toIsoDateTime(value) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function paginateRows(rows, page, pageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  return {
    rows: rows.slice(start, end),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  };
}

module.exports = {
  toObjectIdString,
  toIsoDateTime,
  parsePositiveInt,
  paginateRows,
};

