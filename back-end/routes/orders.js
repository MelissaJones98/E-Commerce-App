// Routes for the logged-in customer's order history, mounted at /orders in app.js.
//
// These routes only READ orders. Orders are created by checkout
// (POST /cart/checkout), and are never edited or deleted afterwards: they're
// a permanent record of what was bought, and at what price. (Cancelling a
// paid order would need a refund, which is listed under Future Work.)

// express: the web framework, used here to create a router.
import express from 'express';
// query() runs SQL on any connection; pool is passed to getOrderDetails().
import pool, { query } from '../db/index.js';
// requireAuth: middleware that sends 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';
// parseId(): turns an id from the URL into a number, or null if it's invalid.
import { parseId } from '../utils/parse-id.js';
// Builds a full order (address and items); shared with checkout.
import { getOrderDetails } from '../services/orders.js';

const router = express.Router();

// Every route in this file needs a logged-in customer.
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /orders: the logged-in customer's order history, newest first.
// ---------------------------------------------------------------------------
// Each order is a short summary. GET /orders/:orderId has the full details.
router.get('/', async (req, res) => {
  // In this SQL:
  //   LEFT JOIN order_items       attach each order's items (LEFT keeps an
  //                               order even if it somehow had no items)
  //   SUM(oi.quantity)            add up the quantities: 2 mugs + 1 teapot = 3
  //   COALESCE(..., 0)            SUM of no rows is NULL, so use 0 instead
  //   ::int                       convert to a normal integer (pg returns
  //                               big SUM results as strings)
  //   GROUP BY o.id               SUM per order, rather than one SUM for all
  //   ORDER BY ... DESC           newest first; id breaks ties between orders
  //                               placed at the very same moment
  const result = await query(
    `SELECT o.id, o.status, o.total_amount, o.created_at,
            COALESCE(SUM(oi.quantity), 0)::int AS item_count
     FROM orders AS o
     LEFT JOIN order_items AS oi ON oi.order_id = o.id
     WHERE o.customer_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC, o.id DESC`,
    [req.user.id]
  );
  // An array of summaries; [] if the customer hasn't ordered anything yet.
  res.json(result.rows);
});

// ---------------------------------------------------------------------------
// GET /orders/:orderId: one order in full, e.g. GET /orders/12
// ---------------------------------------------------------------------------
router.get('/:orderId', async (req, res) => {
  const orderId = parseId(req.params.orderId);
  if (orderId === null) {
    return res.status(400).json({ error: 'orderId must be a valid order id' });
  }

  // null if the order doesn't exist OR belongs to another customer.
  const order = await getOrderDetails(pool, req.user.id, orderId);
  if (order === null) {
    // The same 404 either way, so the response never confirms that another
    // customer's order exists.
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json(order);
});

// Make the router available to app.js.
export default router;
