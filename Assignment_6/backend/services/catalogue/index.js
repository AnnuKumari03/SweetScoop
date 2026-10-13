// Catalogue Service — products, categories, inventory
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../middleware/db');
const { validate } = require('../../middleware/validate');
const { etag } = require('../../middleware/etag');
const { idempotency } = require('../../middleware/idempotency');
const { authenticate } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const { paginate, decodeCursor } = require('../../middleware/pagination');
const { createLogger } = require('../../middleware/logger');

const router = express.Router();
const log = createLogger('catalogue');
const DB = 'sweetscoop_catalogue';

const productSchema = {
  type: 'object',
  required: ['name', 'category', 'price'],
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    category: { type: 'string', minLength: 1 },
    price: { type: 'number', minimum: 0 },
    dietaryTags: { type: 'array', items: { type: 'string' } },
    flavor: { type: 'string' },
    imageUrl: { type: 'string' },
    isBestseller: { type: 'boolean' },
    stock: { type: 'integer', minimum: 0 }
  }
};

const inventorySchema = {
  type: 'object',
  required: ['delta'],
  properties: {
    delta: { type: 'integer' },
    reason: { type: 'string' }
  }
};

// GET /v1/products — list with pagination, filters, search
router.get('/products', etag, async (req, res, next) => {
  try {
    const cursor = decodeCursor(req.query.cursor);
    const limit = parseInt(req.query.limit || '20', 10);
    const { category, flavor, tag, search } = req.query;

    let sql = `SELECT p.*, c.name AS category_name, i.stock, i.reserved
               FROM products p
               JOIN categories c ON p.category_id = c.id
               LEFT JOIN inventory i ON i.product_id = p.id
               WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (category) { sql += ` AND c.slug = $${idx++}`; params.push(category); }
    if (flavor) { sql += ` AND p.flavor = $${idx++}`; params.push(flavor); }
    if (tag) { sql += ` AND $${idx++} = ANY(p.dietary_tags)`; params.push(tag); }
    if (search) { sql += ` AND p.name ILIKE $${idx++}`; params.push(`%${search}%`); }
    if (cursor?.id) { sql += ` AND p.id > $${idx++}`; params.push(cursor.id); }

    sql += ` ORDER BY p.id LIMIT $${idx++}`;
    params.push(limit + 1);

    const result = await query(DB, sql, params);
    const rows = result.rows.map(r => mapProduct(r));
    const body = paginate(req, rows, '/v1/products');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(body);
  } catch (e) { next(e); }
});

// GET /v1/products/:id
router.get('/products/:id', etag, async (req, res, next) => {
  try {
    const result = await query(DB,
      `SELECT p.*, c.name AS category_name, i.stock, i.reserved
       FROM products p
       JOIN categories c ON p.category_id = c.id
       LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.id = $1`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Product '${req.params.id}' not found.`);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(mapProduct(result.rows[0]));
  } catch (e) { next(e); }
});

// POST /v1/products
router.post('/products', authenticate, idempotency(), validate(productSchema), etag, async (req, res, next) => {
  try {
    const id = `prod_${uuidv4().slice(0, 8)}`;
    const { name, description, category, price, dietaryTags = [], flavor, imageUrl, isBestseller = false, stock = 0 } = req.body;
    const catResult = await query(DB, `SELECT id FROM categories WHERE slug = $1 OR name = $1`, [category]);
    const categoryId = catResult.rows[0]?.id;
    if (!categoryId) throw new AppError(422, 'Validation Failed', `Category '${category}' does not exist.`);

    await query(DB,
      `INSERT INTO products (id, name, description, category_id, price, dietary_tags, flavor, image_url, is_bestseller)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, name, description || null, categoryId, price, dietaryTags, flavor || null, imageUrl || null, isBestseller]);
    await query(DB, `INSERT INTO inventory (product_id, stock) VALUES ($1, $2)`, [id, stock]);

    res.status(201).setHeader('Location', `/v1/products/${id}`);
    res.json({ id, name, description, category, price, dietaryTags, flavor, imageUrl, isBestseller, stock, createdAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

// PUT /v1/products/:id
router.put('/products/:id', authenticate, etag, validate(productSchema), async (req, res, next) => {
  try {
    const { name, description, category, price, dietaryTags = [], flavor, imageUrl, isBestseller, stock } = req.body;
    const result = await query(DB, `UPDATE products SET name=$1, description=$2, price=$3, dietary_tags=$4, flavor=$5, image_url=$6, is_bestseller=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, description || null, price, dietaryTags, flavor || null, imageUrl || null, isBestseller, req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Product '${req.params.id}' not found.`);
    if (stock !== undefined) await query(DB, `UPDATE inventory SET stock=$1, updated_at=NOW() WHERE product_id=$2`, [stock, req.params.id]);
    res.json(mapProduct(result.rows[0]));
  } catch (e) { next(e); }
});

// PATCH /v1/products/:id/inventory
router.patch('/products/:id/inventory', authenticate, validate(inventorySchema), async (req, res, next) => {
  try {
    const { delta } = req.body;
    const result = await query(DB, `UPDATE inventory SET stock = stock + $1, reserved = GREATEST(0, reserved), updated_at=NOW() WHERE product_id=$2 RETURNING *`,
      [delta, req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Product '${req.params.id}' not found.`);
    res.json({ productId: req.params.id, stock: result.rows[0].stock, reserved: result.rows[0].reserved });
  } catch (e) { next(e); }
});

// DELETE /v1/products/:id
router.delete('/products/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(DB, `DELETE FROM products WHERE id=$1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, 'Not Found', `Product '${req.params.id}' not found.`);
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /v1/categories
router.get('/categories', etag, async (req, res, next) => {
  try {
    const result = await query(DB, `SELECT id, name, slug, description FROM categories ORDER BY name`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(result.rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, description: r.description })));
  } catch (e) { next(e); }
});

// GET /v1/products/bestsellers
router.get('/products/bestsellers/list', etag, async (req, res, next) => {
  try {
    const result = await query(DB,
      `SELECT p.*, c.name AS category_name, i.stock FROM products p
       JOIN categories c ON p.category_id = c.id
       LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.is_bestseller = TRUE LIMIT 12`);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json(result.rows.map(mapProduct));
  } catch (e) { next(e); }
});

function mapProduct(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category_name,
    price: parseFloat(r.price),
    dietaryTags: r.dietary_tags || [],
    flavor: r.flavor,
    imageUrl: r.image_url,
    isBestseller: r.is_bestseller,
    stock: r.stock ?? 0,
    reserved: r.reserved ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

module.exports = router;
