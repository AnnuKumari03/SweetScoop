// Order Service — orders, order items, placeOrder saga orchestration
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../middleware/db');
const { validate } = require('../../middleware/validate');
const { idempotency } = require('../../middleware/idempotency');
const { etag } = require('../../middleware/etag');
const { authenticate } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../middleware/logger');
const { CircuitBreaker } = require('../../middleware/circuitBreaker');
const { requestWithRetry } = require('../../middleware/httpClient');
const { paginate, decodeCursor } = require('../../middleware/pagination');

const router = express.Router();
const log = createLogger('order');
const DB = 'sweetscoop_order';

const CATALOGUE_URL = process.env.CATALOGUE_URL || 'http://localhost:3001';
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://localhost:3004';
const DELIVERY_URL = process.env.DELIVERY_URL || 'http://localhost:3005';
const CUSTOMER_URL = process.env.CUSTOMER_URL || 'http://localhost:3002';

const paymentBreaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });
const deliveryBreaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

const orderSchema = {
  type: 'object',
  required: ['customerId', 'items', 'addressId', 'paymentMethod'],
  properties: {
    customerId: { type: 'string' },
    items: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', required: ['productId', 'quantity'],
        properties: { productId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } }
      }
    },
    addressId: { type: 'string' },
    couponCode: { type: 'string' },
    paymentMethod: { type: 'string', enum: ['card', 'wallet', 'cod'] }
  }
};

// POST /v1/orders — placeOrder saga
router.post('/orders', authenticate, idempotency(), validate(orderSchema), async (req, res, next) => {
  try {
    const { customerId, items, addressId, couponCode, paymentMethod } = req.body;
    const orderId = `ord_${uuidv4().slice(0, 8)}`;
    const idemKey = req.headers['idempotency-key'];

    log.info('placeOrder started', { orderId, customerId, correlationId: req.correlationId });

    // 1. Verify customer exists (call Customer Service)
    try {
      await requestWithRetry({ method: 'GET', url: `${CUSTOMER_URL}/v1/customers/${customerId}`, headers: { Authorization: req.headers.authorization } });
    } catch (e) {
      throw new AppError(404, 'Not Found', `Customer '${customerId}' not found.`);
    }

    // 2. Fetch product details & verify stock (call Catalogue Service)
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      let product;
      try {
        const resp = await requestWithRetry({ method: 'GET', url: `${CATALOGUE_URL}/v1/products/${item.productId}` });
        product = resp.data;
      } catch (e) {
        throw new AppError(422, 'Validation Failed', `Product '${item.productId}' not found.`);
      }
      if (product.stock < item.quantity) {
        throw new AppError(422, 'Validation Failed', `Insufficient stock for '${product.name}'.`);
      }
      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;
      orderItems.push({ ...item, productName: product.name, unitPrice: product.price, lineTotal });
    }

    // 3. Apply coupon
    let discount = 0;
    if (couponCode) {
      const couponResult = await query(DB, `SELECT * FROM coupons WHERE code=$1 AND active=TRUE AND (expires_at IS NULL OR expires_at > NOW())`, [couponCode]);
      if (couponResult.rows.length > 0) {
        const c = couponResult.rows[0];
        discount = (subtotal * parseFloat(c.discount_pct)) / 100;
      }
    }
    const tax = subtotal * 0.08;
    const total = Math.max(0, subtotal - discount + tax);

    // 4. Create order record (PENDING_PAYMENT)
    await query(DB,
      `INSERT INTO orders (id, customer_id, address_id, status, subtotal, discount, tax, total, coupon_code, idempotency_key)
       VALUES ($1,$2,$3,'PENDING_PAYMENT',$4,$5,$6,$7,$8,$9)`,
      [orderId, customerId, addressId, subtotal, discount, tax, total, couponCode || null, idemKey]);

    for (const oi of orderItems) {
      await query(DB,
        `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`oi_${uuidv4().slice(0, 8)}`, orderId, oi.productId, oi.productName, oi.unitPrice, oi.quantity, oi.lineTotal]);
    }

    let paymentId = null;
    let deliveryId = null;

    try {
      // 5. Process payment (call Payment Service)
      const payResp = await paymentBreaker.execute(() =>
        requestWithRetry({
          method: 'POST', url: `${PAYMENT_URL}/v1/payments`,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `pay-${idemKey}` },
          data: { orderId, customerId, amount: total, method: paymentMethod }
        })
      );
      paymentId = payResp.data.id;
      await query(DB, `UPDATE orders SET payment_id=$1, status='CONFIRMED' WHERE id=$2`, [paymentId, orderId]);
      log.info('payment completed', { orderId, paymentId });

      // 6. Reserve inventory (call Catalogue Service)
      for (const item of items) {
        try {
          await requestWithRetry({ method: 'PATCH', url: `${CATALOGUE_URL}/v1/products/${item.productId}/inventory`, data: { delta: -item.quantity } });
        } catch (e) { log.warn('inventory reservation failed', { productId: item.productId }); }
      }

      // 7. Create delivery (call Delivery Service → SOAP)
      const delResp = await deliveryBreaker.execute(() =>
        requestWithRetry({
          method: 'POST', url: `${DELIVERY_URL}/v1/deliveries`,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `del-${idemKey}` },
          data: { orderId, customerId, addressId }
        })
      );
      deliveryId = delResp.data.id;
      await query(DB, `UPDATE orders SET delivery_id=$1 WHERE id=$2`, [deliveryId, orderId]);
      log.info('delivery created', { orderId, deliveryId });

    } catch (sagaErr) {
      // Saga compensation: refund payment if it succeeded
      log.error('saga step failed, compensating', { orderId, error: sagaErr.message });
      if (paymentId) {
        try {
          await requestWithRetry({ method: 'POST', url: `${PAYMENT_URL}/v1/payments/${paymentId}/refund`, headers: { 'Idempotency-Key': `refund-${idemKey}` } });
        } catch (refundErr) { log.error('refund failed during compensation', { paymentId }); }
      }
      await query(DB, `UPDATE orders SET status='FAILED' WHERE id=$1`, [orderId]);
      throw new AppError(502, 'Bad Gateway', `Order processing failed: ${sagaErr.message}`, { orderId });
    }

    // 8. Return 201 Created
    log.info('placeOrder completed', { orderId });
    res.status(201).json({
      id: orderId, status: 'CONFIRMED', customerId, addressId,
      subtotal, discount, tax, total, couponCode: couponCode || null,
      items: orderItems, paymentId, deliveryId,
      trackingUrl: `/v1/deliveries/${deliveryId}/tracking`,
      createdAt: new Date().toISOString()
    });
  } catch (e) { next(e); }
});

// GET /v1/orders/:id
router.get('/orders/:id', authenticate, etag, async (req, res, next) => {
  try {
    const orderResult = await query(DB, `SELECT * FROM orders WHERE id=$1`, [req.params.id]);
    if (orderResult.rows.length === 0) throw new AppError(404, 'Not Found', `Order '${req.params.id}' not found.`);
    const itemsResult = await query(DB, `SELECT * FROM order_items WHERE order_id=$1`, [req.params.id]);
    const o = orderResult.rows[0];
    res.json({
      id: o.id, customerId: o.customer_id, addressId: o.address_id, status: o.status,
      subtotal: parseFloat(o.subtotal), discount: parseFloat(o.discount), tax: parseFloat(o.tax),
      total: parseFloat(o.total), couponCode: o.coupon_code, items: itemsResult.rows.map(i => ({
        productId: i.product_id, productName: i.product_name, unitPrice: parseFloat(i.unit_price),
        quantity: i.quantity, lineTotal: parseFloat(i.line_total)
      })),
      paymentId: o.payment_id, deliveryId: o.delivery_id,
      trackingUrl: o.delivery_id ? `/v1/deliveries/${o.delivery_id}/tracking` : null,
      createdAt: o.created_at
    });
  } catch (e) { next(e); }
});

// PATCH /v1/orders/:id/cancel
router.patch('/orders/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const result = await query(DB, `SELECT * FROM orders WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Order '${req.params.id}' not found.`);
    const o = result.rows[0];
    if (['DELIVERED', 'CANCELLED'].includes(o.status)) throw new AppError(409, 'Conflict', `Order cannot be cancelled in status '${o.status}'.`);
    await query(DB, `UPDATE orders SET status='CANCELLED', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    if (o.payment_id) {
      try { await requestWithRetry({ method: 'POST', url: `${PAYMENT_URL}/v1/payments/${o.payment_id}/refund`, headers: { 'Idempotency-Key': `refund-cancel-${req.params.id}` } }); } catch (e) {}
    }
    res.json({ id: req.params.id, status: 'CANCELLED' });
  } catch (e) { next(e); }
});

// GET /v1/customers/:id/orders
router.get('/customers/:id/orders', authenticate, etag, async (req, res, next) => {
  try {
    const cursor = decodeCursor(req.query.cursor);
    const limit = parseInt(req.query.limit || '20', 10);
    let sql = `SELECT * FROM orders WHERE customer_id=$1`;
    const params = [req.params.id];
    if (cursor?.id) { sql += ` AND id > $2`; params.push(cursor.id); }
    sql += ` ORDER BY id LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const result = await query(DB, sql, params);
    const body = paginate(req, result.rows.map(mapOrder), `/v1/customers/${req.params.id}/orders`);
    res.json(body);
  } catch (e) { next(e); }
});

function mapOrder(o) {
  return {
    id: o.id, customerId: o.customer_id, addressId: o.address_id, status: o.status,
    subtotal: parseFloat(o.subtotal), discount: parseFloat(o.discount), tax: parseFloat(o.tax),
    total: parseFloat(o.total), couponCode: o.coupon_code, createdAt: o.created_at
  };
}

module.exports = router;
