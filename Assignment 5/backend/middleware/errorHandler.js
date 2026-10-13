// Centralized error-handling middleware (Checklist #19)
// Produces RFC 7807 Problem Details (Checklist #12)

function problemDetails(status, title, detail, instance, extra = {}) {
  return {
    type: `https://sweetscoop.example.com/errors/${slug(title)}`,
    title,
    status,
    detail,
    instance,
    ...extra
  };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Custom error class
class AppError extends Error {
  constructor(status, title, detail, extra = {}) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.extra = extra;
  }
}

function notFound(req, res, next) {
  next(new AppError(404, 'Not Found', `Resource ${req.method} ${req.originalUrl} was not found.`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const title = err.title || (status >= 500 ? 'Internal Server Error' : 'Error');
  const detail = err.detail || err.message || 'An unexpected error occurred.';
  const instance = req.originalUrl;

  const body = problemDetails(status, title, detail, instance, {
    ...(err.extra || {}),
    correlationId: req.correlationId
  });

  // Content negotiation for errors (JSON vs XML) — Checklist #11
  const accept = req.headers.accept || 'application/json';
  if (accept.includes('application/xml')) {
    res.setHeader('Content-Type', 'application/problem+xml');
    return res.status(status).send(jsonToXml(body));
  }

  res.setHeader('Content-Type', 'application/problem+json');
  res.status(status).json(body);
}

function jsonToXml(obj, root = 'problem') {
  const toXml = (o) => Object.entries(o).map(([k, v]) => {
    if (v === null || v === undefined) return `<${k}/>`;
    if (typeof v === 'object') return `<${k}>${toXml(v)}</${k}>`;
    return `<${k}>${String(v)}</${k}>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><${root}>${toXml(obj)}</${root}>`;
}

module.exports = { AppError, errorHandler, notFound, problemDetails, jsonToXml };
