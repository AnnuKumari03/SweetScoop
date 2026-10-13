// Outbound HTTP client with timeout, retry + exponential backoff + jitter (Checklist #17, #18)
const axios = require('axios');

async function requestWithRetry(config, opts = {}) {
  const maxRetries = opts.maxRetries || 3;
  const baseDelay = opts.baseDelay || 200;
  const timeout = opts.timeout || 5000;

  let attempt = 0;
  while (true) {
    try {
      return await axios({ timeout, ...config });
    } catch (err) {
      const status = err.response?.status;
      const retryable = !status || status >= 500 || status === 429;
      if (!retryable || attempt >= maxRetries) throw err;
      attempt++;
      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 2000) * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = { requestWithRetry };
