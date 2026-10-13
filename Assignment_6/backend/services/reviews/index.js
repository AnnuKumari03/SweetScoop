// Reviews Service — MongoDB document store for product reviews (Checklist #21)
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const { validate } = require('../../middleware/validate');
const { idempotency } = require('../../middleware/idempotency');
const { etag } = require('../../middleware/etag');
const { authenticate } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../middleware/logger');
const { paginate, decodeCursor } = require('../../middleware/pagination');

const router = express.Router();
const log = createLogger('reviews');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'sweetscoop_reviews';
let db = null;

async function getDb() {
  if (!db) {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(MONGO_DB);
    log.info('MongoDB connected', { db: MONGO_DB });
  }
  return db;
}

const reviewSchema = {
  type: 'object',
  required: ['customerId', 'rating'],
  properties: {
    customerId: { type: 'string' },
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    comment: { type: 'string' }
  }
};

// POST /v1/products/:id/reviews
router.post('/products/:id/reviews', authenticate, idempotency(), validate(reviewSchema), async (req, res, next) => {
  try {
    const database = await getDb();
    const { customerId, rating, comment } = req.body;
    const doc = {
      _id: new ObjectId(),
      productId: req.params.id,
      customerId,
      rating,
      comment: comment || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await database.collection('reviews').insertOne(doc);
    log.info('review posted', { productId: req.params.id, customerId, rating });
    res.status(201).json({
      id: doc._id.toString(), productId: doc.productId, customerId: doc.customerId,
      rating: doc.rating, comment: doc.comment, createdAt: doc.createdAt
    });
  } catch (e) { next(e); }
});

// GET /v1/products/:id/reviews
router.get('/products/:id/reviews', etag, async (req, res, next) => {
  try {
    const database = await getDb();
    const cursor = decodeCursor(req.query.cursor);
    const limit = parseInt(req.query.limit || '20', 10);
    const query = { productId: req.params.id };
    if (cursor?.id) query._id = { $gt: new ObjectId(cursor.id) };
    const docs = await database.collection('reviews')
      .find(query).sort({ _id: 1 }).limit(limit + 1).toArray();
    const mapped = docs.map(d => ({
      id: d._id.toString(), productId: d.productId, customerId: d.customerId,
      rating: d.rating, comment: d.comment, createdAt: d.createdAt
    }));
    res.json(paginate(req, mapped, `/v1/products/${req.params.id}/reviews`));
  } catch (e) { next(e); }
});

// GET /v1/products/:id/reviews/average
router.get('/products/:id/reviews/average', etag, async (req, res, next) => {
  try {
    const database = await getDb();
    const result = await database.collection('reviews').aggregate([
      { $match: { productId: req.params.id } },
      { $group: { _id: '$productId', average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]).toArray();
    const avg = result[0] || { average: 0, count: 0 };
    res.json({ productId: req.params.id, average: Math.round(avg.average * 10) / 10, count: avg.count });
  } catch (e) { next(e); }
});

module.exports = router;
