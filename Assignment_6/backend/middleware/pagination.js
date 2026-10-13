// Helper to build cursor-based pagination response (Checklist #5)
function paginate(req, rows, basePath) {
  const limit = parseInt(req.query.limit || '20', 10);
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  let next = null;
  if (hasMore && data.length > 0) {
    const last = data[data.length - 1];
    const cursor = Buffer.from(JSON.stringify({ id: last.id })).toString('base64');
    next = `${basePath}?cursor=${cursor}&limit=${limit}`;
  }
  return { data, next };
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = { paginate, decodeCursor };
