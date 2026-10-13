// Idempotency-Key middleware (Checklist #6)
// Uses an in-memory store; in production use Redis/DB.
const { AppError } = require('./errorHandler');

const store = new Map(); // key -> { status, body, headers }

function idempotency() {
  return (req, res, next) => {
    if (req.method !== 'POST') return next();
    const key = req.headers['idempotency-key'];
    if (!key) {
      return next(new AppError(400, 'Bad Request', 'Idempotency-Key header is required for POST requests.'));
    }
    const existing = store.get(key);
    if (existing) {
      res.status(existing.status).set(existing.headers).json(existing.body);
      return;
    }
    // Monkey-patch res.json to capture the response
    const origJson = res.json.bind(res);
    res.json = (body) => {
      store.set(key, { status: res.statusCode, body, headers: res.getHeaders() });
      return origJson(body);
    };
    next();
  };
}

module.exports = { idempotency };
