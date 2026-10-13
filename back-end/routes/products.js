// Routes for browsing and managing products, mounted at /products in app.js.
import express from 'express';
import { query } from '../db/index.js';
import { parseId, MAX_INTEGER } from '../utils/parse-id.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = express.Router();

// The columns sent back to the client. is_active and timestamps are internal.
const PRODUCT_COLUMNS = 'id, category_id, sku, name, description, price, stock_quantity';

// The largest value numeric(10,2) can hold: 8 digits before the point, 2 after.
const MAX_PRICE = 99999999.99;

// PostgreSQL error codes.
const UNIQUE_VIOLATION = '23505'; // e.g. a SKU that's already used
const FOREIGN_KEY_VIOLATION = '23503'; // e.g. a category_id that doesn't exist

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// True if a number has at most 2 decimal places. Multiplying by 100 should
// give a whole number, but floating-point maths makes e.g. 0.29 * 100 equal
// 28.999999999999996, so allow a tiny margin of error.
const hasAtMostTwoDecimals = (value) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

// Checks a product body for POST and PUT. Returns an error message describing
// the first problem found, or null if everything is valid.
const validateProduct = ({ sku, name, description, price, stock_quantity, category_id }) => {
  if (!isNonEmptyString(sku)) return 'sku is required';
  if (sku.length > 50) return 'sku must be 50 characters or fewer';

  if (!isNonEmptyString(name)) return 'name is required';
  if (name.length > 255) return 'name must be 255 characters or fewer';

  if (description != null && typeof description !== 'string') {
    return 'description must be a string';
  }

  // Prices must be sent as JSON numbers (8.5), not strings ("8.50").
  if (typeof price !== 'number' || !Number.isFinite(price)) return 'price must be a number';
  if (price < 0) return 'price cannot be negative';
  if (price > MAX_PRICE) return `price cannot be more than ${MAX_PRICE}`;
  if (!hasAtMostTwoDecimals(price)) return 'price cannot have more than 2 decimal places';

  if (!Number.isInteger(stock_quantity)) return 'stock_quantity must be a whole number';
  if (stock_quantity < 0) return 'stock_quantity cannot be negative';
  if (stock_quantity > MAX_INTEGER) return 'stock_quantity is too large';

  // category_id is optional: leave it out or send null for no category.
  if (category_id != null) {
    if (!Number.isInteger(category_id) || category_id < 1 || category_id > MAX_INTEGER) {
      return 'category_id must be a valid category id';
    }
  }

  return null;
};

// Turns database errors caused by the request into 400/409 responses.
// Returns true if it sent a response, false if the error was unexpected.
const handleProductWriteError = (err, res) => {
  if (err.code === UNIQUE_VIOLATION) {
    res.status(409).json({ error: 'Another product already has this SKU' });
    return true;
  }
  if (err.code === FOREIGN_KEY_VIOLATION) {
    res.status(400).json({ error: 'category_id does not match an existing category' });
    return true;
  }
  return false;
};

// GET /products: list active products, optionally filtered by category.
// e.g. GET /products?category=3
router.get('/', async (req, res) => {
  const { category } = req.query;

  // No filter: return every active product.
  if (category === undefined) {
    const result = await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE is_active ORDER BY id`
    );
    return res.json(result.rows);
  }

  const categoryId = parseId(category);
  if (categoryId === null) {
    return res.status(400).json({ error: 'category must be a valid category id' });
  }

  // A category with no products (or that doesn't exist) returns an empty list.
  const result = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM products
     WHERE is_active AND category_id = $1
     ORDER BY id`,
    [categoryId]
  );
  res.json(result.rows);
});

// GET /products/:productId: get a single product.
router.get('/:productId', async (req, res) => {
  const id = parseId(req.params.productId);
  if (id === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  const result = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND is_active`,
    [id]
  );
  // Retired products are treated as not found: they're no longer in the shop.
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(result.rows[0]);
});

// POST /products: create a product. Requires login.
router.post('/', requireAuth, async (req, res) => {
  // req.body is undefined if the request had no body at all.
  const body = req.body ?? {};
  const validationError = validateProduct(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { sku, name, description = null, price, stock_quantity, category_id = null } = body;

  try {
    const result = await query(
      `INSERT INTO products (sku, name, description, price, stock_quantity, category_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${PRODUCT_COLUMNS}`,
      [sku, name, description, price, stock_quantity, category_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (!handleProductWriteError(err, res)) throw err;
  }
});

// PUT /products/:productId: replace a product's details. Requires login.
// The body must be a complete product, the same as for POST.
router.put('/:productId', requireAuth, async (req, res) => {
  const id = parseId(req.params.productId);
  if (id === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  const body = req.body ?? {};
  const validationError = validateProduct(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { sku, name, description = null, price, stock_quantity, category_id = null } = body;

  try {
    const result = await query(
      `UPDATE products
       SET sku = $1, name = $2, description = $3, price = $4, stock_quantity = $5, category_id = $6
       WHERE id = $7 AND is_active
       RETURNING ${PRODUCT_COLUMNS}`,
      [sku, name, description, price, stock_quantity, category_id, id]
    );
    // No row updated: the product doesn't exist or has been retired.
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (!handleProductWriteError(err, res)) throw err;
  }
});

// DELETE /products/:productId: retire a product. Requires login.
// The row is kept (is_active = false) because past orders refer to it;
// the database's ON DELETE RESTRICT rule would block a real delete anyway.
router.delete('/:productId', requireAuth, async (req, res) => {
  const id = parseId(req.params.productId);
  if (id === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  const result = await query(
    'UPDATE products SET is_active = false WHERE id = $1 AND is_active',
    [id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.sendStatus(204);
});

export default router;
