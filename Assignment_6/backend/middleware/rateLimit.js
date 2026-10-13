// Rate limiting middleware (Checklist #9)
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://sweetscoop.example.com/errors/rate-limited',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Rate limit exceeded. Please try again later.'
  },
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip
});

// Custom handler that sets Retry-After
const rateLimitWithRetryAfter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.setHeader('Retry-After', '60');
    res.status(429).json({
      type: 'https://sweetscoop.example.com/errors/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Please try again later.',
      instance: req.originalUrl,
      correlationId: req.correlationId
    });
  }
});

module.exports = { limiter, rateLimitWithRetryAfter };
