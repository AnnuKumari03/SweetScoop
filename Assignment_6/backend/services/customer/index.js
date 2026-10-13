// Customer Service — profiles, addresses, JWT auth
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../middleware/db');
const { validate } = require('../../middleware/validate');
const { idempotency } = require('../../middleware/idempotency');
const { authenticate, signToken } = require('../../middleware/auth');
const { etag } = require('../../middleware/etag');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../middleware/logger');

const router = express.Router();
const log = createLogger('customer');
const DB = 'sweetscoop_customer';

const customerSchema = {
  type: 'object',
  required: ['email', 'password', 'fullName'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
    fullName: { type: 'string', minLength: 1 },
    phone: { type: 'string' }
  }
};

const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 }
  }
};

const addressSchema = {
  type: 'object',
  required: ['label', 'line1', 'city', 'state', 'postalCode'],
  properties: {
    label: { type: 'string' },
    line1: { type: 'string' },
    line2: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string', default: 'United States' },
    isDefault: { type: 'boolean' }
  }
};

// POST /v1/customers — register
router.post('/customers', idempotency(), validate(customerSchema), async (req, res, next) => {
  try {
    const { email, password, fullName, phone } = req.body;
    const existing = await query(DB, `SELECT id FROM customers WHERE email=$1`, [email]);
    if (existing.rows.length > 0) throw new AppError(409, 'Conflict', `Email '${email}' is already registered.`);

    const id = `cust_${uuidv4().slice(0, 8)}`;
    const hash = await bcrypt.hash(password, 10);
    await query(DB, `INSERT INTO customers (id, email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4,$5)`,
      [id, email, hash, fullName, phone || null]);
    log.info('customer registered', { customerId: id });
    res.status(201).json({ id, email, fullName, phone, createdAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

// POST /v1/auth/login
router.post('/auth/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await query(DB, `SELECT * FROM customers WHERE email=$1`, [email]);
    if (result.rows.length === 0) throw new AppError(401, 'Unauthorized', 'Invalid email or password.');
    const cust = result.rows[0];
    const ok = await bcrypt.compare(password, cust.password_hash);
    if (!ok) throw new AppError(401, 'Unauthorized', 'Invalid email or password.');
    const token = signToken({ sub: cust.id, email: cust.email });
    log.info('customer login', { customerId: cust.id });
    res.json({ token, customerId: cust.id, email: cust.email, fullName: cust.full_name });
  } catch (e) { next(e); }
});

// GET /v1/customers/:id
router.get('/customers/:id', authenticate, etag, async (req, res, next) => {
  try {
    if (req.customer.sub !== req.params.id) throw new AppError(403, 'Forbidden', 'You can only access your own profile.');
    const result = await query(DB, `SELECT id, email, full_name, phone, created_at FROM customers WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Customer '${req.params.id}' not found.`);
    res.json({ id: result.rows[0].id, email: result.rows[0].email, fullName: result.rows[0].full_name, phone: result.rows[0].phone, createdAt: result.rows[0].created_at });
  } catch (e) { next(e); }
});

// GET /v1/customers/:id/addresses
router.get('/customers/:id/addresses', authenticate, etag, async (req, res, next) => {
  try {
    if (req.customer.sub !== req.params.id) throw new AppError(403, 'Forbidden', 'You can only access your own addresses.');
    const result = await query(DB, `SELECT * FROM addresses WHERE customer_id=$1 ORDER BY is_default DESC, created_at`, [req.params.id]);
    res.json(result.rows.map(mapAddress));
  } catch (e) { next(e); }
});

// POST /v1/customers/:id/addresses
router.post('/customers/:id/addresses', authenticate, idempotency(), validate(addressSchema), async (req, res, next) => {
  try {
    if (req.customer.sub !== req.params.id) throw new AppError(403, 'Forbidden', 'You can only add addresses to your own account.');
    const id = `addr_${uuidv4().slice(0, 8)}`;
    const { label, line1, line2, city, state, postalCode, country = 'United States', isDefault = false } = req.body;
    if (isDefault) await query(DB, `UPDATE addresses SET is_default=false WHERE customer_id=$1`, [req.params.id]);
    await query(DB,
      `INSERT INTO addresses (id, customer_id, label, line1, line2, city, state, postal_code, country, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.params.id, label, line1, line2 || null, city, state, postalCode, country, isDefault]);
    res.status(201).json({ id, customerId: req.params.id, label, line1, line2, city, state, postalCode, country, isDefault });
  } catch (e) { next(e); }
});

function mapAddress(r) {
  return {
    id: r.id, label: r.label, line1: r.line1, line2: r.line2,
    city: r.city, state: r.state, postalCode: r.postal_code,
    country: r.country, isDefault: r.is_default
  };
}

module.exports = router;
