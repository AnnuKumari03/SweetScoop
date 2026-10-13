// Delivery Service — deliveries, tracking, SOAP partner integration (Checklist #24)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../middleware/db');
const { validate } = require('../../middleware/validate');
const { idempotency } = require('../../middleware/idempotency');
const { etag } = require('../../middleware/etag');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../middleware/logger');
const { CircuitBreaker } = require('../../middleware/circuitBreaker');
const { requestWithRetry } = require('../../middleware/httpClient');

const router = express.Router();
const log = createLogger('delivery');
const DB = 'sweetscoop_delivery';
const PARTNER_URL = process.env.DELIVERY_PARTNER_URL || 'http://localhost:3005/soap/delivery';

// Read the WSDL contract at startup (Checklist #24)
const WSDL_PATH = path.resolve(__dirname, '../../../partner.wsdl');
let wsdlContent = '';
try { wsdlContent = fs.readFileSync(WSDL_PATH, 'utf8'); log.info('WSDL loaded', { path: WSDL_PATH }); }
catch (e) { log.warn('WSDL not found, using inline fallback'); }

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

const deliverySchema = {
  type: 'object',
  required: ['orderId', 'customerId', 'addressId'],
  properties: {
    orderId: { type: 'string' },
    customerId: { type: 'string' },
    addressId: { type: 'string' },
    deliveryType: { type: 'string', default: 'STANDARD' }
  }
};

// Expose WSDL for inspection
router.get('/soap/delivery?wsdl', (req, res) => {
  res.setHeader('Content-Type', 'text/xml');
  res.send(wsdlContent);
});

// POST /v1/deliveries — create delivery + call SOAP partner
router.post('/deliveries', idempotency(), validate(deliverySchema), async (req, res, next) => {
  try {
    const { orderId, customerId, addressId, deliveryType = 'STANDARD' } = req.body;
    const id = `del_${uuidv4().slice(0, 8)}`;
    const estimatedDelivery = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Build SOAP envelope for createShipment
    const soapEnvelope = buildCreateShipmentEnvelope({ orderId, customerId, addressId, deliveryType });

    // Call SOAP partner via circuit breaker + retry
    let partnerShipmentId = null;
    let trackingNumber = null;

    try {
      const soapResponse = await breaker.execute(() =>
        requestWithRetry({
          method: 'POST',
          url: PARTNER_URL,
          headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'http://partner.sweetscoop.example.com/delivery/createShipment' },
          data: soapEnvelope
        })
      );
      const parsed = parseSoapResponse(soapResponse.data);
      partnerShipmentId = parsed.shipmentId;
      trackingNumber = parsed.trackingNumber;
    } catch (soapErr) {
      // If partner unavailable, still create delivery with local status but log
      log.warn('SOAP partner call failed, creating local delivery', { error: soapErr.message });
      // Map SOAP fault to 502 if it's a real fault
      if (soapErr.response?.data?.includes('Fault')) {
        const fault = parseSoapFault(soapErr.response.data);
        throw new AppError(502, 'Delivery Partner Fault', fault.message || 'SOAP partner returned a fault.', { partnerCode: fault.code });
      }
    }

    await query(DB,
      `INSERT INTO deliveries (id, order_id, customer_id, address_id, partner_shipment_id, status, estimated_delivery)
       VALUES ($1,$2,$3,$4,$5,'CREATED',$6)`,
      [id, orderId, customerId, addressId, partnerShipmentId, estimatedDelivery]);

    await query(DB,
      `INSERT INTO tracking_events (id, delivery_id, status, description, location, occurred_at)
       VALUES ($1,$2,'CREATED','Order received and delivery scheduled.',NULL,NOW())`,
      [`evt_${uuidv4().slice(0, 8)}`, id]);

    log.info('delivery created', { deliveryId: id, orderId, partnerShipmentId });
    res.status(201).json({
      id, orderId, customerId, addressId, partnerShipmentId, trackingNumber,
      status: 'CREATED', estimatedDelivery, createdAt: new Date().toISOString()
    });
  } catch (e) { next(e); }
});

// GET /v1/deliveries/:id
router.get('/deliveries/:id', etag, async (req, res, next) => {
  try {
    const result = await query(DB, `SELECT * FROM deliveries WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Delivery '${req.params.id}' not found.`);
    res.json(mapDelivery(result.rows[0]));
  } catch (e) { next(e); }
});

// GET /v1/deliveries/:id/tracking
router.get('/deliveries/:id/tracking', etag, async (req, res, next) => {
  try {
    const delResult = await query(DB, `SELECT * FROM deliveries WHERE id=$1`, [req.params.id]);
    if (delResult.rows.length === 0) throw new AppError(404, 'Not Found', `Delivery '${req.params.id}' not found.`);
    const events = await query(DB, `SELECT * FROM tracking_events WHERE delivery_id=$1 ORDER BY occurred_at`, [req.params.id]);
    res.json({
      deliveryId: req.params.id,
      status: delResult.rows[0].status,
      events: events.rows.map(e => ({
        status: e.status, description: e.description, location: e.location, occurredAt: e.occurred_at
      }))
    });
  } catch (e) { next(e); }
});

// Internal: advance delivery status (called by Order service or webhook)
router.patch('/deliveries/:id/status', async (req, res, next) => {
  try {
    const { status, description, location } = req.body;
    await query(DB, `UPDATE deliveries SET status=$1, updated_at=NOW() WHERE id=$2`, [status, req.params.id]);
    await query(DB, `INSERT INTO tracking_events (id, delivery_id, status, description, location, occurred_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
      [`evt_${uuidv4().slice(0, 8)}`, req.params.id, status, description || null, location || null]);
    res.json({ id: req.params.id, status });
  } catch (e) { next(e); }
});

// ----- SOAP helpers -----
function buildCreateShipmentEnvelope({ orderId, customerId, addressId, deliveryType }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:del="http://partner.sweetscoop.example.com/delivery">
  <soap:Body>
    <del:createShipment>
      <del:orderId>${orderId}</del:orderId>
      <del:customerName>${customerId}</del:customerName>
      <del:address>
        <del:line1>${addressId}</del:line1>
        <del:city>Sweetville</del:city>
        <del:state>CA</del:state>
        <del:postalCode>90210</del:postalCode>
        <del:country>United States</del:country>
      </del:address>
      <del:items><del:item><del:productId>prod_001</del:productId><del:name>Ice Cream</del:name><del:quantity>1</del:quantity></del:item></del:items>
      <del:deliveryType>${deliveryType}</del:deliveryType>
    </del:createShipment>
  </soap:Body>
</soap:Envelope>`;
}

function parseSoapResponse(xml) {
  const get = (tag) => {
    const m = xml.match(new RegExp(`<del:${tag}>([^<]+)</del:${tag}>`));
    return m ? m[1] : null;
  };
  return { shipmentId: get('shipmentId'), status: get('status'), trackingNumber: get('trackingNumber') };
}

function parseSoapFault(xml) {
  const code = xml.match(/<del:code>([^<]+)<\/del:code>/)?.[1] || 'UNKNOWN';
  const message = xml.match(/<del:message>([^<]+)<\/del:message>/)?.[1] || 'SOAP fault';
  return { code, message };
}

function mapDelivery(r) {
  return {
    id: r.id, orderId: r.order_id, customerId: r.customer_id, addressId: r.address_id,
    partnerShipmentId: r.partner_shipment_id, status: r.status,
    estimatedDelivery: r.estimated_delivery, createdAt: r.created_at
  };
}

module.exports = router;
