// POST /cart/checkout: turn the logged-in customer's cart into a paid order.
// app.js mounts this router at /cart/checkout, so router.post('/') below
// handles POST /cart/checkout.
//
// The request body:
//   shipping_address   where to deliver (see utils/validate-checkout.js)
//   payment_method_id  Stripe's id for the customer's card ('pm_...'). The
//                      browser sends the card itself straight to Stripe, so
//                      card details never reach this API.
//   expected_total     the total the checkout page showed on its Pay button,
//                      e.g. '28.45'
//
// The steps, in order:
//   1. Check the request (400 if anything is wrong).
//   2. Lock the cart's products and check the cart: it must hold at least one
//      product (400 if empty), with enough stock of each (409 if not).
//   3. Work out the total: items + delivery (services/delivery.js).
//   4. The total check: if it no longer matches expected_total (the cart or a
//      price changed while the page was open), refuse with 409. Nothing has
//      been sent to Stripe yet.
//   5. HOLD the money on the card (402 if declined, 400 if Stripe doesn't
//      accept the PaymentMethod, 502 if Stripe fails).
//   6. Write the order: save the address, create the order as 'paid', copy
//      each cart item into order_items with its price frozen, reduce the
//      stock, and empty the cart.
//   7. TAKE the held money (502 if that fails).
//   8. COMMIT, then reply 201 with the order.
//
// Steps 2 to 8 run inside ONE database transaction: a group of changes that
// either all happen or none do. If anything fails part-way, PostgreSQL undoes
// ("rolls back") everything, so there can never be, say, an order without
// its items, or stock taken with no order to show for it.
//
// "Hold, then take" keeps the money safe too: if anything fails after the hold
// (step 6, or the take itself), the hold is CANCELLED, so the customer is never
// charged and no refund is needed. The money is only taken once every database
// change has already succeeded, leaving just the COMMIT. The one gap left is
// that COMMIT failing AFTER the money is taken: very unlikely, because every
// change has already been made. If it happens, the PaymentIntent id is logged
// so the payment can be found in the Stripe dashboard. (Refunds are Future Work.)

// express: the web framework, used here to create a router.
import express from 'express';
// pool: the database connection pool (see db/index.js). A transaction needs
// every one of its queries to run on the SAME connection, so this route
// borrows one from the pool with pool.connect(), instead of using query(),
// which may pick a different connection each time.
import pool from '../db/index.js';
// requireAuth: middleware that sends 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';
// The checks for each part of the request body.
import {
  validateShippingAddress,
  validatePaymentMethodId,
  validateExpectedTotal,
} from '../utils/validate-checkout.js';
// The Stripe payment steps, and the error type they throw when Stripe fails.
import {
  holdPayment,
  capturePayment,
  cancelPayment,
  PaymentProcessorError,
} from '../services/payment-processor.js';
// Exact money maths in whole pence: toPence('24.50') -> 2450, fromPence(2450) -> '24.50'.
import { toPence, fromPence } from '../utils/money.js';
// The delivery rule, shared with GET /cart so the cart and the charge always agree.
import { deliveryChargePence } from '../services/delivery.js';
// Builds a full order (address and items); shared with GET /orders/:orderId.
import { getOrderDetails } from '../services/orders.js';

const router = express.Router();

// The message sent when Stripe itself fails (502).
const PAYMENT_UNAVAILABLE = 'Payment could not be processed. Please try again later.';
// The message sent when the cart isn't what the customer was shown (409).
const CART_CHANGED = 'Your cart has changed. Please check the new total.';

// Thrown (and caught at the bottom of the route) when the cart changes while the money is held,
// so the order would no longer match the amount held. A class of its own, so `instanceof` can
// tell it apart from a real bug.
class CartChangedError extends Error {}

router.post('/', requireAuth, async (req, res) => {
  // -------------------------------------------------------------------------
  // Step 1: check the request, before touching the database.
  // -------------------------------------------------------------------------
  // req.body is undefined if the request had no body, so `?? {}` substitutes
  // an empty object (which then fails validation with a 400).
  const { shipping_address, payment_method_id, expected_total } = req.body ?? {};

  // Each validator returns an error message or null. `a ?? b ?? c` gives the
  // first one that isn't null: the address error, otherwise the payment
  // method error, otherwise the total error (or null if all are fine).
  const validationError =
    validateShippingAddress(shipping_address) ??
    validatePaymentMethodId(payment_method_id) ??
    validateExpectedTotal(expected_total);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const customerId = req.user.id;

  // Borrow one connection from the pool for the whole transaction.
  const client = await pool.connect();

  // Stripe's id for the held payment, once step 5 succeeds. `let` because it's
  // set later. While it's set and the money hasn't been taken, any failure
  // must cancel the hold (see the catch block at the bottom).
  let heldPaymentId = null;
  // Becomes true once step 7 has taken the money: from then on there's no
  // hold left to cancel.
  let captured = false;

  // try/catch/finally:
  //   try     runs the checkout
  //   catch   runs if anything throws: cancel any hold, undo the transaction,
  //           then reply 502 or re-throw (500)
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
    //
    // `ci` is locked too: the customer's own cart rows. Holding the money means
    // waiting a moment for Stripe, and a change to the cart in another tab
    // during that wait would make the order differ from what's being charged.
    // With the rows locked, such a change waits until this checkout is over.
    // (A row ADDED during the wait can't be locked in advance, so step 6
    // double-checks the order's total too.)
    const cartResult = await client.query(
      `SELECT p.id AS product_id, p.name, p.stock_quantity, ci.quantity
       FROM cart_items AS ci
       JOIN products AS p ON p.id = ci.product_id
       WHERE ci.customer_id = $1 AND p.is_active
       ORDER BY p.id
       FOR UPDATE OF p, ci`,
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

    // -----------------------------------------------------------------------
    // Step 3: work out the total.
    // -----------------------------------------------------------------------
    // The items' total, calculated by PostgreSQL's exact decimal maths (not
    // JavaScript's, which can't represent most decimals exactly).
    // ::numeric(12,2) gives exactly 2 decimal places, e.g. '41.00'.
    const itemsResult = await client.query(
      `SELECT SUM(p.price * ci.quantity)::numeric(12,2) AS items_total
       FROM cart_items AS ci
       JOIN products AS p ON p.id = ci.product_id
       WHERE ci.customer_id = $1 AND p.is_active`,
      [customerId]
    );
    // Then the delivery and the total, in whole pence so the maths is exact.
    const itemsPence = toPence(itemsResult.rows[0].items_total);
    const deliveryPence = deliveryChargePence(itemsPence);
    const totalPence = itemsPence + deliveryPence;

    // -----------------------------------------------------------------------
    // Step 4: the total check.
    // -----------------------------------------------------------------------
    // Compared as whole pence, so '28.45' and the total always compare exactly.
    // `!==` means "is not equal to".
    if (toPence(expected_total) !== totalPence) {
      await client.query('ROLLBACK');
      // 409 Conflict: the cart isn't what the customer saw. Nothing was charged,
      // so they can check the new total and try again.
      return res.status(409).json({ error: CART_CHANGED });
    }

    // -----------------------------------------------------------------------
    // Step 5: hold the money.
    // -----------------------------------------------------------------------
    // This happens BEFORE the order is written, and only reserves the money.
    // A PaymentProcessorError (Stripe failed) goes to the catch block below.
    const hold = await holdPayment({ amountPence: totalPence, paymentMethodId: payment_method_id, customerId });

    if (hold.status === 'declined') {
      // The card was declined. Undo everything and keep the cart, so the
      // customer can try a different card.
      await client.query('ROLLBACK');
      // 402 Payment Required: the request was fine, but payment didn't go through.
      return res.status(402).json({ error: hold.reason });
    }
    if (hold.status === 'rejected') {
      // Stripe didn't accept the PaymentMethod id (e.g. it doesn't exist).
      await client.query('ROLLBACK');
      return res.status(400).json({ error: hold.reason });
    }
    // The money is held. From here on, any failure must cancel the hold.
    heldPaymentId = hold.paymentIntentId;

    // -----------------------------------------------------------------------
    // Step 6: write the order.
    // -----------------------------------------------------------------------
    // Save the shipping address as one of the customer's addresses.
    // `?? null` stores NULL for optional fields that were left out.
    // .toUpperCase() stores the country code in capitals, e.g. 'gb' -> 'GB'.
    // RETURNING id gives back the new address's id, needed for the order below.
    const addressResult = await client.query(
      `INSERT INTO addresses (customer_id, line_1, line_2, city, region, postal_code, country_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
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

    // Create the order itself, marked 'paid', with its total (items +
    // delivery), its delivery charge, and Stripe's id for the payment.
    // Only its new id is needed here; the full order is read back at the end.
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, shipping_address_id, status, total_amount, delivery_charge, payment_reference)
       VALUES ($1, $2, 'paid', $3, $4, $5)
       RETURNING id`,
      [customerId, address.id, fromPence(totalPence), fromPence(deliveryPence), heldPaymentId]
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

    // Double-check the order holds exactly what's being paid for. An item added
    // to the cart (in another tab) while the money was held would have been
    // copied in above, so the items would now come to more than was held. If
    // so, stop: the catch block below cancels the hold and replies 409.
    const orderItemsResult = await client.query(
      `SELECT SUM(unit_price * quantity)::numeric(12,2) AS items_total
       FROM order_items
       WHERE order_id = $1`,
      [order.id]
    );
    if (toPence(orderItemsResult.rows[0].items_total) !== itemsPence) {
      throw new CartChangedError();
    }

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

    // Read the complete order back for the response, using the same function
    // as GET /orders/:orderId, so the customer sees the order the same way in
    // both places. It's passed `client` (not the pool) because the order isn't
    // committed yet: only this transaction's own connection can see it.
    const orderDetails = await getOrderDetails(client, customerId, order.id);

    // -----------------------------------------------------------------------
    // Step 7: take the held money.
    // -----------------------------------------------------------------------
    // Every database change has succeeded, so now it's safe to take the money.
    // If this fails (a PaymentProcessorError), the catch block cancels the hold.
    await capturePayment(heldPaymentId);
    captured = true;

    // -----------------------------------------------------------------------
    // Step 8: save everything.
    // -----------------------------------------------------------------------
    // COMMIT makes every change since BEGIN permanent, all at once.
    try {
      await client.query('COMMIT');
    } catch (err) {
      // The one gap described at the top: the money is taken but the order
      // couldn't be saved. Log the payment id so it can be found and refunded
      // by hand, then let the outer catch reply 500.
      console.error(`Checkout COMMIT failed after payment ${heldPaymentId} was captured:`, err.message);
      throw err;
    }

    // 201 Created, with the new order. No payment details are included.
    res.status(201).json(orderDetails);
  } catch (err) {
    // Something went wrong part-way. If the money is held but not taken,
    // release the hold first, so the customer is never charged.
    if (heldPaymentId && !captured) {
      try {
        await cancelPayment(heldPaymentId);
      } catch {
        // Even the cancel failed. The hold expires by itself after about 7
        // days, but log the id so someone can release it sooner by hand.
        console.error(`Could not cancel the hold on payment ${heldPaymentId}; it will expire by itself.`);
      }
    }

    // Undo the whole transaction. (After a failed COMMIT there's nothing left
    // to undo, and ROLLBACK just does nothing.)
    await client.query('ROLLBACK');

    // The cart changed while the money was held (see step 6): nothing was
    // taken, so the customer can check the new total and pay again.
    if (err instanceof CartChangedError) {
      return res.status(409).json({ error: CART_CHANGED });
    }
    // Stripe failed (at the hold or the take): not our bug, so 502.
    if (err instanceof PaymentProcessorError) {
      return res.status(502).json({ error: PAYMENT_UNAVAILABLE });
    }
    // Anything else is unexpected: re-throw so app.js's error handler logs it
    // and sends a 500.
    throw err;
  } finally {
    // Always give the connection back to the pool.
    client.release();
  }
});

// Make the router available to app.js.
export default router;
