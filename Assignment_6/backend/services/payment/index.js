// Payment Service — payments, transactions, refunds
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../middleware/db');
const { validate } = require('../../middleware/validate');
const { idempotency } = require('../../middleware/idempotency');
const { etag } = require('../../middleware/etag');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../middleware/logger');

const router = express.Router();
const log = createLogger('payment');
const DB = 'sweetscoop_payment';

const paymentSchema = {
  type: 'object',
  required: ['orderId', 'customerId', 'amount', 'method'],
  properties: {
    orderId: { type: 'string' },
    customerId: { type: 'string' },
    amount: { type: 'number', minimum: 0 },
    currency: { type: 'string', default: 'USD' },
    method: { type: 'string', enum: ['card', 'wallet', 'cod'] }
  }
};

// POST /v1/payments — process payment
router.post('/payments', idempotency(), validate(paymentSchema), async (req, res, next) => {
  try {
    const { orderId, customerId, amount, currency = 'USD', method } = req.body;
    const id = `pay_${uuidv4().slice(0, 8)}`;
    const txnId = `txn_${uuidv4().slice(0, 8)}`;

    // Simulate payment gateway processing
    const gatewayResponse = simulateGateway(method, amount);
    const status = gatewayResponse.success ? 'COMPLETED' : 'FAILED';

    await query(DB,
      `INSERT INTO payments (id, order_id, customer_id, amount, currency, method, status, provider_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, orderId, customerId, amount, currency, method, status, gatewayResponse.ref]);
    await query(DB,
      `INSERT INTO transactions (id, payment_id, type, amount, status, gateway_response)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [txnId, id, 'CHARGE', amount, status, gatewayResponse]);

    log.info('payment processed', { paymentId: id, orderId, status });

    if (!gatewayResponse.success) {
      throw new AppError(402, 'Payment Required', gatewayResponse.message || 'Payment was declined.');
    }
    res.status(201).json({ id, orderId, customerId, amount, currency, method, status, createdAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

// GET /v1/payments/:id
router.get('/payments/:id', etag, async (req, res, next) => {
  try {
    const result = await query(DB, `SELECT * FROM payments WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Payment '${req.params.id}' not found.`);
    res.json(mapPayment(result.rows[0]));
  } catch (e) { next(e); }
});

// POST /v1/payments/:id/refund
router.post('/payments/:id/refund', idempotency(), async (req, res, next) => {
  try {
    const result = await query(DB, `SELECT * FROM payments WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Payment '${req.params.id}' not found.`);
    const pay = result.rows[0];
    if (pay.status === 'REFUNDED') throw new AppError(409, 'Conflict', 'Payment has already been refunded.');
    if (pay.status !== 'COMPLETED') throw new AppError(409, 'Conflict', 'Only completed payments can be refunded.');

    await query(DB, `UPDATE payments SET status='REFUNDED', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await query(DB, `INSERT INTO transactions (id, payment_id, type, amount, status, gateway_response) VALUES ($1,$2,$3,$4,$5,$6)`,
      [`txn_${uuidv4().slice(0, 8)}`, req.params.id, 'REFUND', pay.amount, 'COMPLETED', { refunded: true }]);
    log.info('payment refunded', { paymentId: req.params.id });
    res.json({ ...mapPayment(pay), status: 'REFUNDED' });
  } catch (e) { next(e); }
});

function simulateGateway(method, amount) {
  // Simulate: card payments always succeed in dev; wallet succeeds if amount < 1000
  if (method === 'card') return { success: true, ref: `gw_${Date.now()}`, message: 'Approved' };
  if (method === 'wallet') return amount < 1000
    ? { success: true, ref: `gw_${Date.now()}`, message: 'Approved' }
    : { success: false, ref: null, message: 'Insufficient wallet balance' };
  if (method === 'cod') return { success: true, ref: `gw_${Date.now()}`, message: 'Cash on delivery' };
  return { success: false, ref: null, message: 'Unknown payment method' };
}

function mapPayment(r) {
  return {
    id: r.id, orderId: r.order_id, customerId: r.customer_id,
    amount: parseFloat(r.amount), currency: r.currency, method: r.method,
    status: r.status, createdAt: r.created_at
  };
}

module.exports = router;
