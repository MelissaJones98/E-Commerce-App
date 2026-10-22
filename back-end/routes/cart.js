// Routes for the logged-in customer's shopping cart, mounted at /cart in app.js.
//
// How the cart is stored: each row in the cart_items table means "this
// customer wants this many of this product" (see db/schema.sql). There's no
// separate carts table, because each customer has exactly one cart, so the
// customer's id (from their login session, req.user.id) identifies it.
//
// The cart deliberately stores no prices. Every time it's read, it joins
// each row to the products table and uses the product's CURRENT price. When
// the customer later checks out, each cart row will be copied into
// order_items together with the price at that moment, which freezes it for
// the order's history.

// express: the web framework, used here to create a router.
import express from 'express';
// query(): runs SQL against PostgreSQL (see db/index.js).
import { query } from '../db/index.js';
// requireAuth: middleware that sends 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';
// parseId(): turns an id from the URL into a number, or null if it's invalid.
// MAX_INTEGER: the largest value a PostgreSQL `integer` column can hold.
import { parseId, MAX_INTEGER } from '../utils/parse-id.js';
// toPence('24.50') -> 2450, and fromPence(2450) -> '24.50': exact money maths in whole pence.
import { toPence, fromPence } from '../utils/money.js';
// The delivery rule, shared with checkout so the cart and the charge always agree.
import { deliveryChargePence, FREE_DELIVERY_THRESHOLD_PENCE } from '../services/delivery.js';

const router = express.Router();

// Every route in this file needs a logged-in customer: router.use() runs
// requireAuth before each of them.
router.use(requireAuth);

// True if `value` is a whole number from 1 to MAX_INTEGER.
// Number.isInteger() is false for strings ('2'), decimals (1.5), null and
// undefined, so all of those are rejected too.
const isPositiveInteger = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER;

// Checks a quantity sent by the client. Returns an error message, or null if valid.
// Quantities must be at least 1: removing an item is done with DELETE instead.
const validateQuantity = (quantity) =>
  isPositiveInteger(quantity) ? null : 'quantity must be a whole number of at least 1';

// Reads a customer's whole cart and returns
//   { items, total, delivery_charge, order_total, free_delivery_remaining }
// where `total` is the items only, and order_total is items + delivery: what
// the customer will pay. free_delivery_remaining is how much more of items
// would make delivery free (0.00 once it's free, or for an empty cart).
// Used by GET /cart and returned after every change, so a client always gets
// the up-to-date cart back without a second request.
const getCart = async (customerId) => {
  // JOIN combines each cart row with its product, so we get the product's
  // name, SKU and current price alongside the quantity. In this SQL:
  //   cart_items AS ci, products AS p   short names ("aliases") for the tables
  //   p.price * ci.quantity             the line total, e.g. 8.50 x 2
  //   ::numeric(12,2)                   "cast" (convert) to a decimal with 2
  //                                     decimal places, so it's always e.g.
  //                                     '17.00'. pg returns numerics as strings,
  //                                     so the exact value is kept.
  //   AND p.is_active                   hide products that have been retired
  //   ORDER BY ci.added_at              oldest first, i.e. the order they were
  //                                     added; product_id breaks any ties
  const itemsResult = await query(
    `SELECT p.id AS product_id, p.sku, p.name, p.price, ci.quantity,
            (p.price * ci.quantity)::numeric(12,2) AS line_total
     FROM cart_items AS ci
     JOIN products AS p ON p.id = ci.product_id
     WHERE ci.customer_id = $1 AND p.is_active
     ORDER BY ci.added_at, ci.product_id`,
    [customerId]
  );

  // Add up the line totals in the database rather than in JavaScript, because
  // PostgreSQL's numeric type does exact decimal maths, while JavaScript
  // numbers can't represent most decimals exactly (0.1 + 0.2 = 0.30000000000000004).
  //   SUM(...)        adds the values from every matching row
  //   COALESCE(x, 0)  SUM of no rows is NULL (nothing), so use 0 for an empty cart
  const totalResult = await query(
    `SELECT COALESCE(SUM(p.price * ci.quantity), 0)::numeric(12,2) AS total
     FROM cart_items AS ci
     JOIN products AS p ON p.id = ci.product_id
     WHERE ci.customer_id = $1 AND p.is_active`,
    [customerId]
  );

  const { total } = totalResult.rows[0];

  // The delivery maths, in whole pence so it's exact (see utils/money.js).
  const itemsPence = toPence(total);
  const deliveryPence = deliveryChargePence(itemsPence);
  // How far short of free delivery the items are, but only while delivery is
  // being charged. `a > 0 ? b : c` picks b when delivery costs something,
  // otherwise c: so an empty cart, or one already over £30, gives 0.
  const remainingPence = deliveryPence > 0 ? FREE_DELIVERY_THRESHOLD_PENCE - itemsPence : 0;

  return {
    items: itemsResult.rows,
    total,
    delivery_charge: fromPence(deliveryPence),
    order_total: fromPence(itemsPence + deliveryPence),
    free_delivery_remaining: fromPence(remainingPence),
  };
};

// ---------------------------------------------------------------------------
// GET /cart: view the logged-in customer's cart.
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  // `await` waits for getCart's queries to finish, then res.json() sends the
  // { items, total } object as JSON with 200 OK.
  res.json(await getCart(req.user.id));
});

// ---------------------------------------------------------------------------
// POST /cart/items: add a product to the cart.
// Body: { "product_id": 7, "quantity": 2 }
// If the product is already in the cart, the quantities are added together.
// ---------------------------------------------------------------------------
router.post('/items', async (req, res) => {
  // req.body is undefined if the request had no body at all, so `?? {}`
  // substitutes an empty object (which then fails validation with a 400).
  const { product_id, quantity } = req.body ?? {};

  if (!isPositiveInteger(product_id)) {
    return res.status(400).json({ error: 'product_id must be a valid product id' });
  }
  const quantityError = validateQuantity(quantity);
  if (quantityError) {
    return res.status(400).json({ error: quantityError });
  }

  // Look up the product. Only active (not retired) products can be added.
  const productResult = await query(
    'SELECT stock_quantity FROM products WHERE id = $1 AND is_active',
    [product_id]
  );
  if (productResult.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const { stock_quantity } = productResult.rows[0];

  // How many are already in the cart (0 if none), so we can check the NEW
  // total against the stock, e.g. 3 in the cart + 3 more = 6.
  const existingResult = await query(
    'SELECT quantity FROM cart_items WHERE customer_id = $1 AND product_id = $2',
    [req.user.id, product_id]
  );
  // `?.` ("optional chaining") gives undefined instead of crashing when
  // there's no row; `?? 0` then turns that undefined into 0.
  const alreadyInCart = existingResult.rows[0]?.quantity ?? 0;

  // 409 Conflict: the request clashes with the current stock level.
  // (This is a friendly early check. Stock will be checked again, for
  // certain, when the order is placed, because it can change in between.)
  if (alreadyInCart + quantity > stock_quantity) {
    return res.status(409).json({
      error: `Not enough stock: ${stock_quantity} available, ${alreadyInCart} already in your cart`,
    });
  }

  // An "upsert": INSERT a new row, or, if this customer already has this
  // product in their cart, UPDATE that row instead.
  //   ON CONFLICT (customer_id, product_id)  the primary key; a second row for
  //                                          the same pair would break it
  //   DO UPDATE SET quantity = ...           so instead add to the existing quantity
  //   cart_items.quantity                    the quantity already stored
  //   EXCLUDED.quantity                      the quantity we just tried to insert
  // Doing this in one statement means two "add" requests arriving at the
  // same moment can't overwrite each other's quantity.
  await query(
    `INSERT INTO cart_items (customer_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (customer_id, product_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
    [req.user.id, product_id, quantity]
  );

  // 201 Created, with the whole updated cart.
  res.status(201).json(await getCart(req.user.id));
});

// ---------------------------------------------------------------------------
// PUT /cart/items/:productId: change how many of a product are in the cart.
// Body: { "quantity": 5 }. This REPLACES the quantity rather than adding to it.
// ---------------------------------------------------------------------------
// `:productId` is a route parameter: for /cart/items/7, req.params.productId is '7'.
router.put('/items/:productId', async (req, res) => {
  const productId = parseId(req.params.productId);
  if (productId === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  const { quantity } = req.body ?? {};
  const quantityError = validateQuantity(quantity);
  if (quantityError) {
    return res.status(400).json({ error: quantityError });
  }

  // Find the item in THIS customer's cart, along with the product's stock.
  // Retired products are hidden from the cart, so they count as not in it.
  const itemResult = await query(
    `SELECT p.stock_quantity
     FROM cart_items AS ci
     JOIN products AS p ON p.id = ci.product_id
     WHERE ci.customer_id = $1 AND ci.product_id = $2 AND p.is_active`,
    [req.user.id, productId]
  );
  if (itemResult.rows.length === 0) {
    return res.status(404).json({ error: 'That product is not in your cart' });
  }

  // The new quantity replaces the old one, so compare it to the stock directly.
  const { stock_quantity } = itemResult.rows[0];
  if (quantity > stock_quantity) {
    return res.status(409).json({ error: `Not enough stock: ${stock_quantity} available` });
  }

  await query(
    'UPDATE cart_items SET quantity = $1 WHERE customer_id = $2 AND product_id = $3',
    [quantity, req.user.id, productId]
  );

  // 200 OK (the default), with the whole updated cart.
  res.json(await getCart(req.user.id));
});

// ---------------------------------------------------------------------------
// DELETE /cart/items/:productId: remove one product from the cart.
// ---------------------------------------------------------------------------
router.delete('/items/:productId', async (req, res) => {
  const productId = parseId(req.params.productId);
  if (productId === null) {
    return res.status(400).json({ error: 'productId must be a valid product id' });
  }

  // `WHERE customer_id = $1` makes sure only this customer's cart is touched.
  const result = await query(
    'DELETE FROM cart_items WHERE customer_id = $1 AND product_id = $2',
    [req.user.id, productId]
  );
  // result.rowCount is how many rows were deleted: 0 means it wasn't in the cart.
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'That product is not in your cart' });
  }

  // 204 No Content: success, with nothing to send back.
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// DELETE /cart: empty the whole cart.
// ---------------------------------------------------------------------------
router.delete('/', async (req, res) => {
  await query('DELETE FROM cart_items WHERE customer_id = $1', [req.user.id]);
  // Always 204, even if the cart was already empty: either way, the customer
  // now has an empty cart, which is what they asked for.
  res.sendStatus(204);
});

// Make the router available to app.js.
export default router;
