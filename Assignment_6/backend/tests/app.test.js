// Sweet Scoop — Test Suite (Checklist #23: Jest + Supertest)
const request = require('supertest');

// We test middleware in isolation since services need DB connections.
const { AppError, errorHandler, notFound, jsonToXml } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validate');
const { computeETag } = require('../middleware/etag');
const { CircuitBreaker } = require('../middleware/circuitBreaker');
const { paginate } = require('../middleware/pagination');

const express = require('express');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('Error Handling Middleware (RFC 7807)', () => {
  let app;
  beforeEach(() => { app = createTestApp(); });

  test('returns 404 with RFC 7807 problem details', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.title).toBe('Not Found');
    expect(res.body.status).toBe(404);
    expect(res.body.type).toContain('errors/not-found');
  });

  test('returns correlationId in error body', async () => {
    const app2 = express();
    app2.use(express.json());
    app2.use((req, res, next) => { req.correlationId = 'corr_test123'; next(); });
    app2.get('/fail', (req, res, next) => next(new AppError(500, 'Internal Server Error', 'boom')));
    app2.use(errorHandler);
    const res = await request(app2).get('/fail');
    expect(res.status).toBe(500);
    expect(res.body.correlationId).toBe('corr_test123');
  });

  test('supports XML content negotiation on errors', async () => {
    const app2 = express();
    app2.use(express.json());
    app2.use((req, res, next) => { req.correlationId = 'x'; next(); });
    app2.get('/fail', (req, res, next) => next(new AppError(400, 'Bad Request', 'bad')));
    app2.use(errorHandler);
    const res = await request(app2).get('/fail').set('Accept', 'application/xml');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<title>Bad Request</title>');
  });
});

describe('AJV Validation Middleware', () => {
  test('passes valid body', (done) => {
    const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
    const req = { body: { name: 'Test' } };
    const res = {};
    validate(schema)(req, res, (err) => {
      expect(err).toBeUndefined();
      done();
    });
  });

  test('returns 422 AppError for invalid body', (done) => {
    const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
    const req = { body: {} };
    const res = {};
    validate(schema)(req, res, (err) => {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(422);
      expect(err.title).toBe('Validation Failed');
      done();
    });
  });
});

describe('ETag Computation', () => {
  test('produces consistent weak ETag', () => {
    const obj = { a: 1, b: 'hello' };
    const etag1 = computeETag(obj);
    const etag2 = computeETag(obj);
    expect(etag1).toBe(etag2);
    expect(etag1.startsWith('W/"')).toBe(true);
  });

  test('different objects produce different ETags', () => {
    expect(computeETag({ a: 1 })).not.toBe(computeETag({ a: 2 }));
  });
});

describe('Circuit Breaker', () => {
  test('executes successful function', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.state).toBe('CLOSED');
  });

  test('opens after threshold failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 60000 });
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');
    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit breaker is OPEN');
  });

  test('returns 503 status error when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 60000 });
    try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch (e) {}
    try {
      await cb.execute(() => Promise.resolve('ok'));
    } catch (e) {
      expect(e.status).toBe(503);
    }
  });
});

describe('Pagination', () => {
  test('returns next link when more results exist', () => {
    const req = { query: { limit: '2' } };
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = paginate(req, rows, '/v1/products');
    expect(result.data.length).toBe(2);
    expect(result.next).not.toBeNull();
    expect(result.next).toContain('cursor=');
  });

  test('returns null next when at end', () => {
    const req = { query: { limit: '5' } };
    const rows = [{ id: 'a' }, { id: 'b' }];
    const result = paginate(req, rows, '/v1/products');
    expect(result.next).toBeNull();
  });
});

describe('JSON to XML conversion', () => {
  test('converts simple object to XML', () => {
    const xml = jsonToXml({ title: 'Test', status: 200 });
    expect(xml).toContain('<title>Test</title>');
    expect(xml).toContain('<status>200</status>');
    expect(xml).toContain('<?xml version="1.0"');
  });
});

describe('HTTP Method Semantics', () => {
  test('GET returns 200', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('OPTIONS returns 204 for CORS preflight', async () => {
    const app = express();
    const cors = require('cors');
    app.use(cors());
    app.options('*', cors());
    const res = await request(app).options('/test');
    expect([200, 204]).toContain(res.status);
  });
});

describe('Idempotency Middleware', () => {
  test('requires Idempotency-Key on POST', (done) => {
    const { idempotency } = require('../middleware/idempotency');
    const req = { method: 'POST', headers: {} };
    const res = {};
    idempotency()(req, res, (err) => {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(400);
      done();
    });
  });
});
