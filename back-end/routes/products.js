// Routes for browsing and managing products.
// app.js mounts this router at /products, so router.get('/') below handles
// GET /products and router.get('/:productId') handles e.g. GET /products/7.
//
// Browsing (the two GET routes) is public. Creating, updating and retiring
// products require a logged-in customer.

// express: the web framework, used here to create a router.
import express from 'express';
// query(): runs SQL against PostgreSQL (see db/index.js).
import { query } from '../db/index.js';
// parseId(): turns an id from the URL into a number, or null if it's invalid.
// MAX_INTEGER: the largest value a PostgreSQL `integer` column can hold.
import { parseId, MAX_INTEGER } from '../utils/parse-id.js';
// requireAuth: middleware that sends 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';

const router = express.Router();

// The columns sent back to the client, written once so every query returns
// the same shape. is_active and the timestamps are internal, so they're left out.
const PRODUCT_COLUMNS = 'id, category_id, sku, name, description, price, stock_quantity';

// The largest value a numeric(10,2) column can hold: 10 digits in total,
// 2 of them after the decimal point, so 8 before it.
const MAX_PRICE = 99999999.99;

// PostgreSQL error codes. When a query breaks a database rule, the error `pg`
// throws has a `code` property saying which rule was broken.
const UNIQUE_VIOLATION = '23505'; // e.g. a SKU another product already uses
const FOREIGN_KEY_VIOLATION = '23503'; // e.g. a category_id that doesn't exist

// True if `value` is a string with at least one non-space character.
// `.trim()` removes spaces from both ends, so '   ' becomes '' and fails.
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// True if a number has at most 2 decimal places, e.g. 8.5 or 8.55 but not 8.555.
// The idea: multiply by 100 and check the result is a whole number.
// But computers store decimals in binary, which can't represent most of them
// exactly, so 0.29 * 100 gives 28.999999999999996 rather than 29. So instead
// of requiring an exact whole number, allow a tiny difference (1e-9 means
// 0.000000001) between the result and the nearest whole number.
// Math.round() rounds to the nearest whole number; Math.abs() removes any minus sign.
const hasAtMostTwoDecimals = (value) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

// Checks a product body for POST and PUT, so both apply exactly the same rules.
// The parameter is destructured: the function is passed the request body and
// pulls out just these six properties.
// Returns a string describing the first problem found, or null if all is valid.
const validateProduct = ({ sku, name, description, price, stock_quantity, category_id }) => {
  // SKU ("stock keeping unit"): a product's unique code. varchar(50) in schema.sql.
  if (!isNonEmptyString(sku)) return 'sku is required';
  if (sku.length > 50) return 'sku must be 50 characters or fewer';

  if (!isNonEmptyString(name)) return 'name is required';
  if (name.length > 255) return 'name must be 255 characters or fewer';

  // description is optional. `!= null` (two equals signs) is true when the
  // value is anything other than null or undefined, so this only checks the
  // type when a description was actually sent.
  if (description != null && typeof description !== 'string') {
    return 'description must be a string';
  }

  // Prices must be sent as JSON numbers (8.5), not strings ("8.50").
  // Number.isFinite() rules out special values like Infinity.
  if (typeof price !== 'number' || !Number.isFinite(price)) return 'price must be a number';
  if (price < 0) return 'price cannot be negative';
  // Without this check, PostgreSQL would reject the value with an error and
  // the client would get a confusing 500 instead of a clear 400.
  // `${...}` inside backticks inserts a value into a string ("template literal").
  if (price > MAX_PRICE) return `price cannot be more than ${MAX_PRICE}`;
  // Without this check, PostgreSQL would silently round 8.555 to 8.56.
  if (!hasAtMostTwoDecimals(price)) return 'price cannot have more than 2 decimal places';

  // Number.isInteger() is true only for whole numbers, so 1.5 and '5' both fail.
  if (!Number.isInteger(stock_quantity)) return 'stock_quantity must be a whole number';
  if (stock_quantity < 0) return 'stock_quantity cannot be negative';
  if (stock_quantity > MAX_INTEGER) return 'stock_quantity is too large';

  // category_id is optional: leave it out or send null for no category.
  if (category_id != null) {
    if (!Number.isInteger(category_id) || category_id < 1 || category_id > MAX_INTEGER) {
      return 'category_id must be a valid category id';
    }
  }

  // Every rule passed.
  return null;
};

// Used by POST and PUT when the database rejects a write. If the error was
// caused by the request (a duplicate SKU or an unknown category), this sends
// a helpful 409 or 400 response and returns true. Otherwise it returns false,
// meaning "unexpected error, nothing sent", and the route re-throws it.
const handleProductWriteError = (err, res) => {
  // The products.sku column is UNIQUE, so a second product with the same SKU
  // is rejected. 409 Conflict: clashes with existing data.
  if (err.code === UNIQUE_VIOLATION) {
    res.status(409).json({ error: 'Another product already has this SKU' });
    return true;
  }
  // products.category_id must refer to a row in categories (a foreign key),
  // so a category_id that doesn't exist is rejected.
  if (err.code === FOREIGN_KEY_VIOLATION) {
    res.status(400).json({ error: 'category_id does not match an existing category' });
    return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// GET /products: list active products, optionally filtered by category.
// e.g. GET /products or GET /products?category=3
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  // req.query holds the "query string": the part of the URL after the ?.
  // For /products?category=3, req.query is { category: '3' }. Values in the
  // query string are always strings.
  const { category } = req.query;

  // No ?category= in the URL: return every active product.
  // `WHERE is_active` keeps only rows where is_active is true, i.e. products
  // that haven't been retired. ORDER BY id returns them in a stable order.
  if (category === undefined) {
    const result = await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE is_active ORDER BY id`
    );
    // result.rows is an array of products, sent back as a JSON array.
    return res.json(result.rows);
  }

  // Check the category is a valid id (e.g. "3", not "abc" or "-1").
  const categoryId = parseId(category);
  if (categoryId === null) {
    return res.status(400).json({ error: 'category must be a valid category id' });
  }

  // Only active products in that category. A category with no products (or
  // that doesn't exist) simply matches no rows, so it returns an empty list [].
  const result = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM products
     WHERE is_active AND category_id = $1
     ORDER BY id`,
    [categoryId]
  );
  res.json(result.rows);
});

// ---------------------------------------------------------------------------
// GET /products/:productId: get a single product, e.g. GET /products/7
// ---------------------------------------------------------------------------
// `:productId` is a "route parameter": whatever is in that part of the URL is
// available as req.params.productId (always a string, e.g. '7').
router.get('/:productId', async (req, res) => {
  const id = parseId(req.params.productId);
  if (id === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  const result = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND is_active`,
    [id]
  );
  // No matching row: the product doesn't exist, or it has been retired.
  // Retired products are treated as not found because they're no longer in the shop.
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  // Exactly one product matched; send it back as a single object.
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// POST /products: create a product. Requires login.
// ---------------------------------------------------------------------------
// requireAuth runs before the route function: if nobody is logged in it
// sends 401 and the function below never runs.
router.post('/', requireAuth, async (req, res) => {
  // req.body is undefined if the request had no body at all, so `?? {}`
  // substitutes an empty object (which then fails validation with a 400).
  const body = req.body ?? {};
  const validationError = validateProduct(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Pull the fields out of the body. `= null` gives a default value when the
  // field was left out, so the database stores NULL (no description / no category).
  const { sku, name, description = null, price, stock_quantity, category_id = null } = body;

  try {
    // INSERT a new row; RETURNING sends it back, including its new id.
    // New products are active by default (is_active DEFAULT true in schema.sql).
    const result = await query(
      `INSERT INTO products (sku, name, description, price, stock_quantity, category_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${PRODUCT_COLUMNS}`,
      [sku, name, description, price, stock_quantity, category_id]
    );
    // 201 Created, with the new product.
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // If the error was a duplicate SKU or unknown category, a response has
    // been sent. Otherwise re-throw so app.js's error handler sends a 500.
    if (!handleProductWriteError(err, res)) throw err;
  }
});

// ---------------------------------------------------------------------------
// PUT /products/:productId: replace a product's details. Requires login.
// ---------------------------------------------------------------------------
// PUT replaces the whole product, so the body must be a complete product,
// the same as for POST (and is checked with the same rules).
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
    // UPDATE changes the existing row's columns. `WHERE id = $7 AND is_active`
    // means only an existing, active product can be updated.
    const result = await query(
      `UPDATE products
       SET sku = $1, name = $2, description = $3, price = $4, stock_quantity = $5, category_id = $6
       WHERE id = $7 AND is_active
       RETURNING ${PRODUCT_COLUMNS}`,
      [sku, name, description, price, stock_quantity, category_id, id]
    );
    // RETURNING gives back no rows if nothing was updated: the product doesn't
    // exist or has been retired.
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    // 200 OK (the default), with the updated product.
    res.json(result.rows[0]);
  } catch (err) {
    if (!handleProductWriteError(err, res)) throw err;
  }
});

// ---------------------------------------------------------------------------
// DELETE /products/:productId: retire a product. Requires login.
// ---------------------------------------------------------------------------
// The row isn't really deleted. It's marked inactive (is_active = false) so
// past orders can still refer to it; the database's ON DELETE RESTRICT rule
// on order_items would block a real delete anyway. Retired products are
// hidden by every other route in this file.
router.delete('/:productId', requireAuth, async (req, res) => {
  const id = parseId(req.params.productId);
  if (id === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  // `AND is_active` means retiring an already-retired product changes nothing.
  const result = await query(
    'UPDATE products SET is_active = false WHERE id = $1 AND is_active',
    [id]
  );
  // result.rowCount is how many rows the UPDATE changed. 0 means the product
  // doesn't exist or was already retired.
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  // 204 No Content: success, with nothing to send back.
  res.sendStatus(204);
});

// Make the router available to app.js.
export default router;
