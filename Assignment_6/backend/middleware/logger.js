// Structured JSON logger with correlationId (Checklist #25)
const crypto = require('crypto');

const levels = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(serviceName) {
  return {
    _service: serviceName,
    log(level, message, meta = {}) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        service: serviceName,
        message,
        ...meta
      };
      if (levels[level] >= (process.env.LOG_LEVEL ? levels[process.env.LOG_LEVEL] : levels.info)) {
        process.stdout.write(JSON.stringify(entry) + '\n');
      }
    },
    debug(msg, meta) { this.log('debug', msg, meta); },
    info(msg, meta) { this.log('info', msg, meta); },
    warn(msg, meta) { this.log('warn', msg, meta); },
    error(msg, meta) { this.log('error', msg, meta); }
  };
}

// Middleware: attach correlationId to request and response
function correlationMiddleware(req, res, next) {
  const corrId = req.headers['x-correlation-id'] || `corr_${crypto.randomBytes(8).toString('hex')}`;
  req.correlationId = corrId;
  res.setHeader('X-Correlation-Id', corrId);
  next();
}

module.exports = { createLogger, correlationMiddleware };
