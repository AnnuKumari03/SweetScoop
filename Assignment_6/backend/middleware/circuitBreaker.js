// Circuit Breaker for outbound service calls (Checklist #16)
class CircuitBreaker {
  constructor(opts = {}) {
    this.failureThreshold = opts.failureThreshold || 3;
    this.resetTimeout = opts.resetTimeout || 30000; // 30s
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        const err = new Error('Circuit breaker is OPEN');
        err.status = 503;
        throw err;
      }
    }
    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') this.state = 'CLOSED';
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
      }
      throw err;
    }
  }
}

module.exports = { CircuitBreaker };
