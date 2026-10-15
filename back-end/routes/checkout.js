// POST /cart/checkout: turn the logged-in customer's cart into a paid order.
// app.js mounts this router at /cart/checkout, so router.post('/') below
// handles POST /cart/checkout.
//
// The steps, in order:
//   1. Check the request: the shipping address and payment details (400 if wrong).
//   2. Check the cart: it must hold at least one product (400 if empty), and
//      there must be enough stock of each (409 if not).
//   3. Take the payment (402 if declined, 502 if the processor fails).
//   4. Create the order: save the address, create the order as 'paid', copy
//      each cart item into order_items with its price frozen, reduce the
//      stock, and empty the cart.
//
// Steps 2 to 4 run inside ONE database transaction: a group of changes that
// either all happen or none do. If anything fails part-way, PostgreSQL undoes
// ("rolls back") everything, so there can never be, say, an order without
// its items, or stock taken with no order to show for it.

// express: the web framework, used here to create a router.
import express from 'express';
// pool: the database connection pool (see db/index.js). A transaction needs
// every one of its queries to run on the SAME connection, so this route
// borrows one from the pool with pool.connect(), instead of using query(),
// which may pick a different connection each time.
import pool from '../db/index.js';
// requireAuth: middleware that sends 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';
// The checks for the shipping address and payment details.
import { validateShippingAddress, validatePayment, cardDigits } from '../utils/validate-checkout.js';
// The (fake) payment processor, and the error type it throws when it fails.
import { processPayment, PaymentProcessorError } from '../services/payment-processor.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  // -------------------------------------------------------------------------
  // Step 1: check the request, before touching the database.
  // -------------------------------------------------------------------------
  // req.body is undefined if the request had no body, so `?? {}` substitutes
  // an empty object (which then fails validation with a 400).
  const { shipping_address, payment } = req.body ?? {};

  // Each validator returns an error message or null. `a ?? b` gives the
  // address error if there is one, otherwise checks the payment.
  const validationError = validateShippingAddress(shipping_address) ?? validatePayment(payment);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const customerId = req.user.id;

  // Borrow one connection from the pool for the whole transaction.
  const client = await pool.connect();

  // try/catch/finally:
  //   try     runs the checkout
  //   catch   runs if anything throws: undo the transaction, then re-throw
  //   finally ALWAYS runs at the end, success or failure: return the
  //           connection to the pool (forgetting this would slowly use up
  //           every connection and freeze the app)
  try {
    // BEGIN starts the transaction. Nothing below is permanent until COMMIT.
    await client.query('BEGIN');

    // -----------------------------------------------------------------------
    // Step 2: check the cart.
    // -----------------------------------------------------------------------
    // Read the cart's active products, with each one's current price and stock.
    //
    // FOR UPDATE OF p "locks" these product rows until the transaction ends.
    // If another customer checks out the same product at the same moment,
    // their query waits here until this checkout has finished, then sees the
    // updated stock. Without the lock, both could read "1 in stock", and both
    // could buy the last one.
    // ORDER BY p.id means every checkout locks rows in the same order, which
    // stops two checkouts from each waiting on the other forever (a "deadlock").
    const cartResult = await client.query(
      `SELECT p.id AS product_id, p.name, p.stock_quantity, ci.quantity
       FROM cart_items AS ci
       JOIN products AS p ON p.id = ci.product_id
       WHERE ci.customer_id = $1 AND p.is_active
       ORDER BY p.id
       FOR UPDATE OF p`,
      [customerId]
    );
    const cartItems = cartResult.rows;

    // Retired products are hidden from the cart, so a cart holding only
    // retired products counts as empty.
    if (cartItems.length === 0) {
      // ROLLBACK ends the transaction without saving anything.
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Your cart is empty' });
    }

    // Stock may have changed since the items were added to the cart, so
    // check every item again now that the rows are locked.
    // .find() returns the first item where the condition is true, or undefined.
    const shortItem = cartItems.find((item) => item.quantity > item.stock_quantity);
    if (shortItem) {
      await client.query('ROLLBACK');
      // 409 Conflict. The cart is kept, so the customer can adjust it and retry.
      return res.status(409).json({
        error: `Not enough stock of ${shortItem.name}: ${shortItem.stock_quantity} available`,
      });
    }

    // The order total, calculated by PostgreSQL's exact decimal maths (not
    // JavaScript's, which can't represent most decimals exactly).
    // ::numeric(12,2) gives exactly 2 decimal places, e.g. '41.00'.
    const totalResult = await client.query(
      `SELECT SUM(p.price * ci.quantity)::numeric(12,2) AS total
       FROM cart_items AS ci
       JOIN products AS p ON p.id = ci.product_id
       WHERE ci.customer_id = $1 AND p.is_active`,
      [customerId]
    );
    const { total } = totalResult.rows[0];

    // -----------------------------------------------------------------------
    // Step 3: take the payment.
    // -----------------------------------------------------------------------
    // This happens BEFORE the order is written, so a failed payment never
    // leaves an order behind. The card number goes to the processor as digits
    // only, and is never saved or logged.
    let paymentResult;
    try {
      paymentResult = await processPayment({ amount: total, cardNumber: cardDigits(payment.card_number) });
    } catch (err) {
      // The processor itself failed (it threw a PaymentProcessorError).
      // `instanceof` checks which kind of error it is.
      if (err instanceof PaymentProcessorError) {
        await client.query('ROLLBACK');
        // 502 Bad Gateway: a service this API relies on failed. Not the
        // customer's fault, and nothing was charged.
        return res.status(502).json({ error: 'Payment could not be processed. Please try again later.' });
      }
      // Any other error is unexpected: re-throw it to the outer catch below.
      throw err;
    }

    if (!paymentResult.succeeded) {
      // The card was declined. Undo everything and keep the cart, so the
      // customer can try a different card.
      await client.query('ROLLBACK');
      // 402 Payment Required: the request was fine, but payment didn't go through.
      return res.status(402).json({ error: paymentResult.reason });
    }

    // From here on, the customer has been charged, so the order must be saved.
    // (If saving somehow failed now, a real system would refund the charge.
    // Refunds are listed under Future Work, so the fake has nothing to undo.)

    // -----------------------------------------------------------------------
    // Step 4: create the order.
    // -----------------------------------------------------------------------
    // Save the shipping address as one of the customer's addresses.
    // `?? null` stores NULL for optional fields that were left out.
    // .toUpperCase() stores the country code in capitals, e.g. 'gb' -> 'GB'.
    const addressResult = await client.query(
      `INSERT INTO addresses (customer_id, line_1, line_2, city, region, postal_code, country_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, line_1, line_2, city, region, postal_code, country_code`,
      [
        customerId,
        shipping_address.line_1,
        shipping_address.line_2 ?? null,
        shipping_address.city,
        shipping_address.region ?? null,
        shipping_address.postal_code,
        shipping_address.country_code.toUpperCase(),
      ]
    );
    const address = addressResult.rows[0];

    // Create the order itself, marked 'paid' because the payment succeeded.
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, shipping_address_id, status, total_amount)
       VALUES ($1, $2, 'paid', $3)
       RETURNING id, status, total_amount, created_at`,
      [customerId, address.id, total]
    );
    const order = orderResult.rows[0];

    // Copy every active cart item into order_items in one statement.
    // INSERT ... SELECT inserts the rows that the SELECT produces, instead of
    // values written out by hand. p.price is copied into unit_price HERE,
    // which freezes it: later price changes won't alter this order.
    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
       SELECT $1, p.id, ci.quantity, p.price
       FROM cart_items AS ci
       JOIN products AS p ON p.id = ci.product_id
       WHERE ci.customer_id = $2 AND p.is_active`,
      [order.id, customerId]
    );

    // Reduce each product's stock by the quantity bought.
    // UPDATE ... FROM joins another table into an UPDATE: for each product,
    // find its row in this customer's cart and subtract that quantity.
    await client.query(
      `UPDATE products AS p
       SET stock_quantity = p.stock_quantity - ci.quantity
       FROM cart_items AS ci
       WHERE ci.product_id = p.id AND ci.customer_id = $1 AND p.is_active`,
      [customerId]
    );

    // Empty the cart, including any retired products that were hidden in it.
    await client.query('DELETE FROM cart_items WHERE customer_id = $1', [customerId]);

    // Read the order's items back for the response, each with its line total.
    const itemsResult = await client.query(
      `SELECT oi.product_id, p.sku, p.name, oi.quantity, oi.unit_price,
              (oi.unit_price * oi.quantity)::numeric(12,2) AS line_total
       FROM order_items AS oi
       JOIN products AS p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY oi.product_id`,
      [order.id]
    );

    // COMMIT makes every change since BEGIN permanent, all at once.
    await client.query('COMMIT');

    // 201 Created, with the new order. Spread syntax (`...order`) copies the
    // order's id, status, total_amount and created_at into the response.
    // No payment details are included.
    res.status(201).json({ ...order, shipping_address: address, items: itemsResult.rows });
  } catch (err) {
    // Something unexpected went wrong part-way: undo the whole transaction,
    // then re-throw so app.js's error handler logs it and sends a 500.
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Always give the connection back to the pool.
    client.release();
  }
});

// Make the router available to app.js.
export default router;
