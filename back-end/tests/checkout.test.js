// Tests for POST /cart/checkout: turning the logged-in customer's cart into
// a paid order.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test
// database (see .env.test), so real data is never touched.
//
// How these tests work:
//   - `describe(name, fn)` groups related tests; `test(name, fn)` is one test.
//   - `assert.*` functions check results; a failed check fails the test.
//   - Products are inserted straight into the database with insertProduct(),
//     added to the cart through the real cart API, then checked out.
//   - Stripe is a pretend one (tests/fake-stripe.js, installed by helpers.js),
//     so the real Stripe is never contacted. It copies Stripe's test
//     PaymentMethod ids: 'pm_card_visa' is held, 'pm_card_visa_chargeDeclined'
//     is declined, and so on. fakeStripe.calls records what was asked of it.
//   - Expected values (totals, statuses) are worked out by hand and written
//     as literals.

// node:test is Node's built-in test runner.
//   beforeEach: runs a function before every test
//   after:      runs a function once, after all the tests
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';

import app from '../app.js';
// pool: the database connection pool, used to check what was actually saved.
import pool from '../db/index.js';
// Helpers (see tests/helpers.js):
//   resetTables:     empties every table
//   loggedInAgent:   registers and logs in a customer; returns an agent that stays logged in
//   insertProduct:   adds a product with SQL, returning its id
//   validCheckout:   a valid shipping address and the 'pm_card_visa' PaymentMethod
//   fakeStripe:      the pretend Stripe, with its record of calls
//   resetFakeStripe: clears that record (and any failure settings)
import {
  resetTables,
  loggedInAgent,
  insertProduct,
  validCheckout,
  fakeStripe,
  resetFakeStripe,
} from './helpers.js';

// The customer most tests log in as. Registered first in each test, and id
// numbering restarts for every test, so their id is 1.
const ada = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

// A second customer, for checking one customer's checkout never affects another.
const grace = {
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  password: 'another-password',
};

// Checks out as `agent`, the way the checkout page does: first read the cart
// to find the total the customer was shown (order_total), then send it as
// expected_total along with the address and PaymentMethod. `changes` replaces
// any part of the body, e.g. checkout(agent, { payment_method_id: 'pm_x' }).
// Setting a field to `undefined` leaves it out of the JSON body entirely.
const checkout = async (agent, changes = {}) => {
  const cart = await agent.get('/cart');
  return agent
    .post('/cart/checkout')
    .send({ ...validCheckout, expected_total: cart.body.order_total, ...changes });
};

// Returns a copy of validCheckout's address with some fields changed, e.g.
// withAddress({ city: undefined }), ready to pass to checkout() as changes.
const withAddress = (changes) => ({
  shipping_address: { ...validCheckout.shipping_address, ...changes },
});

// Logs in as Ada and fills her cart. `items` is an array of
// { product_id, quantity }; each is added through the real cart API.
// Returns the logged-in agent, ready to check out.
const adaWithCart = async (items) => {
  const agent = await loggedInAgent(ada);
  for (const item of items) {
    await agent.post('/cart/items').send(item);
  }
  return agent;
};

// Counts the rows in a table, e.g. countRows('orders').
// The table name is joined into the SQL, so this must only ever be called
// with a fixed name written in this file, never with outside input.
const countRows = async (table) => {
  const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
  return result.rows[0].count;
};

// Reads a product's current stock straight from the database.
const getStock = async (productId) => {
  const result = await pool.query('SELECT stock_quantity FROM products WHERE id = $1', [productId]);
  return result.rows[0].stock_quantity;
};

// Reads a customer's cart rows straight from the database (by email).
const getCartRows = async (email) => {
  const result = await pool.query(
    `SELECT cart_items.product_id, cart_items.quantity
     FROM cart_items
     JOIN customers ON customers.id = cart_items.customer_id
     WHERE customers.email = $1
     ORDER BY cart_items.product_id`,
    [email]
  );
  return result.rows;
};

// The names of the Stripe calls made so far, in order, e.g. ['create', 'capture'].
// .map() turns each recorded call into just its method name.
const stripeCalls = () => fakeStripe.calls.map((call) => call.method);

// Checks that a failed checkout left everything exactly as it was: no
// order, no order lines, no saved address, the cart still full, the stock
// unchanged, and no money taken (Stripe's capture never called).
// `expectedCart` and `expectedStock` are what they were before.
const assertNothingChanged = async (expectedCart, productId, expectedStock) => {
  assert.equal(await countRows('orders'), 0);
  assert.equal(await countRows('order_items'), 0);
  assert.equal(await countRows('addresses'), 0);
  assert.deepEqual(await getCartRows('ada@example.com'), expectedCart);
  assert.equal(await getStock(productId), expectedStock);
  assert.equal(stripeCalls().includes('capture'), false);
};

// Before each test: empty every table, and clear the pretend Stripe's record.
beforeEach(async () => {
  await resetTables();
  resetFakeStripe();
});
// Close the database connections after the last test, or Node won't exit.
after(() => pool.end());

describe('POST /cart/checkout', () => {
  describe('when checkout succeeds', () => {
    test('returns 201 with the new paid order, its address and its items', async () => {
      const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
      const teapot = await insertProduct({ sku: 'TEA-001', name: 'Teapot', price: '24.00', stock_quantity: 10 });
      const agent = await adaWithCart([
        { product_id: mug, quantity: 2 },
        { product_id: teapot, quantity: 1 },
      ]);

      const res = await checkout(agent);

      assert.equal(res.status, 201);
      // created_at is the current time, so it can't be a fixed literal. Take
      // it out with destructuring, check it's a valid date, then compare the rest.
      const { created_at, ...order } = res.body;
      assert.equal(Number.isNaN(Date.parse(created_at)), false);
      // Hand-checked: 2 x 8.50 = 17.00; 1 x 24.00 = 24.00; items 41.00. That's
      // over £30, so delivery is free and the total is 41.00.
      assert.deepEqual(order, {
        id: 1,
        status: 'paid',
        total_amount: '41.00',
        delivery_charge: '0.00',
        items_total: '41.00',
        shipping_address: {
          id: 1,
          line_1: '10 Downing Street',
          line_2: null,
          city: 'London',
          region: null,
          postal_code: 'SW1A 2AA',
          country_code: 'GB',
        },
        items: [
          { product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', quantity: 2, unit_price: '8.50', line_total: '17.00' },
          { product_id: 2, sku: 'TEA-001', name: 'Teapot', quantity: 1, unit_price: '24.00', line_total: '24.00' },
        ],
      });
    });

    test('adds £3.95 delivery under £30.00, charges items + delivery, then takes the money', async () => {
      const serum = await insertProduct({ price: '24.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: serum, quantity: 1 }]);

      const res = await checkout(agent);

      assert.equal(res.status, 201);
      // Hand-checked: 24.50 + 3.95 = 28.45.
      assert.equal(res.body.total_amount, '28.45');
      assert.equal(res.body.delivery_charge, '3.95');
      assert.equal(res.body.items_total, '24.50');
      // Stripe was asked to hold 2845p, then to take that same payment. The
      // hold is never cancelled when everything works.
      assert.deepEqual(stripeCalls(), ['create', 'capture']);
      assert.equal(fakeStripe.calls[0].args[0].amount, 2845);
      assert.deepEqual(fakeStripe.calls[1].args, ['pi_fake_1']);
    });

    test('delivery is free when the items come to exactly £30.00', async () => {
      const serum = await insertProduct({ price: '30.00', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: serum, quantity: 1 }]);

      const res = await checkout(agent);

      assert.equal(res.status, 201);
      assert.equal(res.body.delivery_charge, '0.00');
      assert.equal(res.body.total_amount, '30.00');
      assert.equal(fakeStripe.calls[0].args[0].amount, 3000);
    });

    test('saves the order to the database as paid, with its delivery charge and Stripe payment id', async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 3 }]);

      await checkout(agent);

      const result = await pool.query(
        'SELECT customer_id, status, total_amount, delivery_charge, payment_reference FROM orders'
      );
      // Hand-checked: 3 x 8.50 = 25.50, + 3.95 = 29.45. Ada is customer 1.
      // 'pi_fake_1' is the pretend Stripe's id for the first payment.
      assert.deepEqual(result.rows, [
        { customer_id: 1, status: 'paid', total_amount: '29.45', delivery_charge: '3.95', payment_reference: 'pi_fake_1' },
      ]);
    });

    test("saves the shipping address as one of the customer's addresses", async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      await checkout(agent);

      const result = await pool.query('SELECT customer_id, line_1, postal_code FROM addresses');
      assert.deepEqual(result.rows, [{ customer_id: 1, line_1: '10 Downing Street', postal_code: 'SW1A 2AA' }]);
    });

    test('freezes each price in order_items, so later price changes do not alter the order', async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      await checkout(agent);

      // The shop raises the price AFTER the order was placed...
      await pool.query("UPDATE products SET price = '99.00' WHERE id = $1", [mug]);

      // ...but the order still records what Ada actually paid.
      const result = await pool.query('SELECT product_id, quantity, unit_price FROM order_items');
      assert.deepEqual(result.rows, [{ product_id: 1, quantity: 2, unit_price: '8.50' }]);
    });

    test('reduces each product\'s stock by the quantity bought', async () => {
      const mug = await insertProduct({ sku: 'MUG-001', stock_quantity: 10 });
      const teapot = await insertProduct({ sku: 'TEA-001', stock_quantity: 4 });
      const agent = await adaWithCart([
        { product_id: mug, quantity: 3 },
        { product_id: teapot, quantity: 4 },
      ]);

      await checkout(agent);

      // 10 - 3 = 7; 4 - 4 = 0 (buying exactly the last ones is allowed).
      assert.equal(await getStock(mug), 7);
      assert.equal(await getStock(teapot), 0);
    });

    test('empties the cart', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      await checkout(agent);

      assert.deepEqual(await getCartRows('ada@example.com'), []);
      // The cart API agrees.
      const cart = await agent.get('/cart');
      assert.deepEqual(cart.body.items, []);
      assert.equal(cart.body.order_total, '0.00');
    });

    test('leaves out retired products, which are hidden from the cart', async () => {
      const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
      const teapot = await insertProduct({ sku: 'TEA-001', name: 'Teapot', price: '24.00', stock_quantity: 10 });
      const agent = await adaWithCart([
        { product_id: mug, quantity: 1 },
        { product_id: teapot, quantity: 1 },
      ]);
      // The teapot is retired after it was added to the cart.
      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [teapot]);

      const res = await checkout(agent);

      assert.equal(res.status, 201);
      // Only the mug is ordered and charged for: 8.50 + 3.95 delivery = 12.45.
      assert.deepEqual(res.body.items.map((item) => item.name), ['Coffee Mug']);
      assert.equal(res.body.total_amount, '12.45');
    });

    test('stores the country code in capitals', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await checkout(agent, withAddress({ country_code: 'gb' }));

      assert.equal(res.status, 201);
      assert.equal(res.body.shipping_address.country_code, 'GB');
    });

    test('never sends the payment details back', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await checkout(agent);

      assert.equal(res.status, 201);
      // res.text is the raw response body. Neither the PaymentMethod nor
      // Stripe's payment id may appear anywhere in it.
      assert.equal(res.text.includes('pm_'), false);
      assert.equal(res.text.includes('pi_'), false);
    });

    test("does not touch another customer's cart", async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const graceAgent = await loggedInAgent(grace);
      await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 2 });
      const adaAgent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await checkout(adaAgent);

      // Ada's checkout must succeed, otherwise Grace's cart is trivially unchanged.
      assert.equal(res.status, 201);
      assert.deepEqual(await getCartRows('grace@example.com'), [{ product_id: 1, quantity: 2 }]);
    });
  });

  describe('validating the cart', () => {
    test('returns 401 and creates nothing when not logged in', async () => {
      const res = await request(app)
        .post('/cart/checkout')
        .send({ ...validCheckout, expected_total: '10.00' });

      assert.equal(res.status, 401);
      assert.equal(await countRows('orders'), 0);
    });

    test('returns 400 when the cart is empty', async () => {
      const agent = await loggedInAgent(ada);

      const res = await checkout(agent);

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Your cart is empty');
      assert.equal(await countRows('orders'), 0);
      assert.equal(await countRows('addresses'), 0);
      // Nothing to pay for, so Stripe is never asked.
      assert.deepEqual(stripeCalls(), []);
    });

    test('returns 400 when every product in the cart has been retired', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);
      // The total is read BEFORE the product is retired, as if the customer
      // had the checkout page open when it happened.
      const cart = await agent.get('/cart');
      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [mug]);

      const res = await agent
        .post('/cart/checkout')
        .send({ ...validCheckout, expected_total: cart.body.order_total });

      // Retired products are hidden, so as far as the customer can see the cart is empty.
      assert.equal(res.status, 400);
      assert.equal(await countRows('orders'), 0);
    });

    test('returns 409 and changes nothing when stock has run out since adding to the cart', async () => {
      const mug = await insertProduct({ stock_quantity: 5 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 3 }]);
      // Someone else buys most of the stock after Ada added hers to the cart.
      await pool.query('UPDATE products SET stock_quantity = 2 WHERE id = $1', [mug]);

      const res = await checkout(agent);

      assert.equal(res.status, 409);
      assert.equal(typeof res.body.error, 'string');
      // Ada's cart is kept, so she can lower the quantity and try again.
      await assertNothingChanged([{ product_id: 1, quantity: 3 }], mug, 2);
      assert.deepEqual(stripeCalls(), []);
    });

    test('returns 409 and charges nothing when the total has changed since the customer saw it', async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);

      // The page showed £1.00, but the cart now comes to £20.95.
      const res = await checkout(agent, { expected_total: '1.00' });

      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'Your cart has changed. Please check the new total.');
      await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
      // Refused before Stripe is asked for anything.
      assert.deepEqual(stripeCalls(), []);
    });

    test('returns 409 when the price changed after the customer saw the total', async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      const cart = await agent.get('/cart');
      // The shop changes the price while Ada has the checkout page open.
      await pool.query("UPDATE products SET price = '9.00' WHERE id = $1", [mug]);

      const res = await agent
        .post('/cart/checkout')
        .send({ ...validCheckout, expected_total: cart.body.order_total });

      assert.equal(res.status, 409);
      assert.deepEqual(stripeCalls(), []);
    });

    // The hold takes a moment (a call to Stripe over the internet). These two tests change the
    // cart at exactly that moment, from "another tab", using the fake's onCreate hook.
    test('a quantity change during the hold waits, so the order matches what was charged', async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      let change;
      fakeStripe.onCreate = async () => {
        // Start the change but DON'T wait for it: checkout locks the cart's rows, so it has to
        // wait until checkout finishes. Then pause briefly, long enough that without the lock
        // it would already have happened.
        change = pool.query('UPDATE cart_items SET quantity = 5 WHERE product_id = $1', [mug]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      };

      const res = await checkout(agent);
      await change;

      // Charged for 2 mugs (17.00 + 3.95), and the order holds exactly 2 mugs.
      assert.equal(res.status, 201);
      assert.equal(res.body.total_amount, '20.95');
      assert.equal(res.body.items[0].quantity, 2);
    });

    test('an item added during the hold is refused with 409, and the hold cancelled', async () => {
      const mug = await insertProduct({ sku: 'MUG-001', price: '8.50', stock_quantity: 10 });
      const teapot = await insertProduct({ sku: 'TEA-001', price: '24.00', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      // A brand-new cart row can't be locked in advance (it doesn't exist yet), so this one
      // isn't held back: it lands while the money is held.
      fakeStripe.onCreate = async () => {
        await pool.query('INSERT INTO cart_items (customer_id, product_id, quantity) VALUES (1, $1, 1)', [teapot]);
      };

      const res = await checkout(agent);

      // The order would no longer match the amount held, so nothing is saved or taken.
      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'Your cart has changed. Please check the new total.');
      assert.deepEqual(stripeCalls(), ['create', 'cancel']);
      assert.equal(await countRows('orders'), 0);
      assert.equal(await getStock(mug), 10);
    });

    test('sells the last item to only one of two customers checking out at the same moment', async () => {
      // One mug left, and two customers each have it in their cart.
      const mug = await insertProduct({ stock_quantity: 1 });
      const adaAgent = await loggedInAgent(ada);
      const graceAgent = await loggedInAgent(grace);
      await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });
      await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });
      // Both carts hold the same thing, so both customers were shown the same total.
      const { order_total } = (await adaAgent.get('/cart')).body;
      const body = { ...validCheckout, expected_total: order_total };

      // Simply sending two checkouts at once isn't enough: each takes only a
      // few milliseconds, so the first usually finishes before the second
      // starts, and the race never actually happens. So FORCE them to overlap:
      //   1. This test locks the mug's row itself, in its own transaction.
      //   2. Both checkouts start, and both get stuck waiting for that lock.
      //   3. Once PostgreSQL reports both are waiting, the test lets go.
      //   4. The two checkouts now genuinely compete for the last mug.
      // (If checkout didn't lock the row with FOR UPDATE, both would read
      // "1 in stock", and the second would crash on the stock >= 0 CHECK
      // with a 500, failing this test.)
      const blocker = await pool.connect();
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [mug]);

      // Promise.all() starts both checkouts at once. Don't `await` yet: they
      // can't finish while the test holds the lock.
      const checkouts = Promise.all([
        adaAgent.post('/cart/checkout').send(body),
        graceAgent.post('/cart/checkout').send(body),
      ]);

      // Poll PostgreSQL's activity view until 2 queries are waiting for a lock.
      // pg_stat_activity lists every connection; wait_event_type = 'Lock'
      // means that connection is stuck waiting for another's lock.
      // Gives up after 5 seconds, so a broken run fails instead of hanging.
      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (waiting < 2 && Date.now() < deadline) {
        const result = await pool.query(
          `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`
        );
        waiting = result.rows[0].count;
        // Pause 20 milliseconds between checks. `new Promise(...)` with
        // setTimeout is the standard way to "sleep" in JavaScript.
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(waiting, 2, 'both checkouts should be waiting on the lock');

      // Release the lock: COMMIT ends the test's transaction, and the
      // connection goes back to the pool. Now the checkouts race.
      await blocker.query('COMMIT');
      blocker.release();
      const responses = await checkouts;

      // We can't know who wins, so sort the status codes before comparing.
      const statuses = responses.map((res) => res.status).sort();
      assert.deepEqual(statuses, [201, 409]);
      // Exactly one order, and the stock is 0, never -1.
      assert.equal(await countRows('orders'), 1);
      assert.equal(await getStock(mug), 0);
    });
  });

  describe('processing the payment', () => {
    test('returns 402 and changes nothing when the card is declined', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);

      const res = await checkout(agent, { payment_method_id: 'pm_card_visa_chargeDeclined' });

      // 402 Payment Required: the request was fine, but the payment didn't go through.
      assert.equal(res.status, 402);
      assert.equal(res.body.error, 'Your card was declined.');
      // No order, cart kept, stock untouched, so the customer can try another card.
      await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
    });

    test('returns 402 with a friendly message for a card that needs 3-D Secure', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await checkout(agent, { payment_method_id: 'pm_card_threeDSecure2Required' });

      assert.equal(res.status, 402);
      assert.equal(
        res.body.error,
        "This card needs extra verification, which isn't supported. Please use a different card."
      );
      await assertNothingChanged([{ product_id: 1, quantity: 1 }], mug, 10);
    });

    test('returns 400 when Stripe does not recognise the PaymentMethod', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await checkout(agent, { payment_method_id: 'pm_does_not_exist' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Your payment details weren't accepted. Please re-enter your card.");
      await assertNothingChanged([{ product_id: 1, quantity: 1 }], mug, 10);
    });

    test('returns 502 and changes nothing when Stripe cannot be reached', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);

      const res = await checkout(agent, { payment_method_id: 'pm_fake_outage' });

      // 502 Bad Gateway: a service this API depends on (Stripe) failed.
      // It's not the customer's fault, and not a bug here.
      assert.equal(res.status, 502);
      assert.equal(res.body.error, 'Payment could not be processed. Please try again later.');
      await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
    });

    test('cancels the hold and changes nothing when taking the money fails', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      fakeStripe.captureFails = true;

      const res = await checkout(agent);

      assert.equal(res.status, 502);
      // After the failed capture, the payment was looked up (retrieve) to make sure the money
      // really wasn't taken, then the hold was released, so the customer is never charged.
      assert.deepEqual(stripeCalls(), ['create', 'capture', 'retrieve', 'cancel']);
      assert.deepEqual(fakeStripe.calls[3].args, ['pi_fake_1']);
      // Nothing saved. (assertNothingChanged's "no capture" check doesn't apply
      // here, because capture WAS attempted, so check the rest directly.)
      assert.equal(await countRows('orders'), 0);
      assert.equal(await countRows('addresses'), 0);
      assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
      assert.equal(await getStock(mug), 10);
    });

    // To make saving the order fail AFTER the money is held, these tests add a
    // temporary rule to the orders table that no row can pass:
    //   CHECK (false)  every new order is refused
    //   NOT VALID      don't check the orders already there (there are none anyway)
    // It's removed again in `finally`, which always runs, even if the test fails.
    const withOrdersRefused = async (fn) => {
      await pool.query('ALTER TABLE orders ADD CONSTRAINT test_refuse_orders CHECK (false) NOT VALID');
      try {
        await fn();
      } finally {
        await pool.query('ALTER TABLE orders DROP CONSTRAINT test_refuse_orders');
      }
    };

    test('cancels the hold and changes nothing when saving the order fails', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);

      await withOrdersRefused(async () => {
        const res = await checkout(agent);

        // 500: something went wrong in our own code or database.
        assert.equal(res.status, 500);
        // Held, then released: never taken.
        assert.deepEqual(stripeCalls(), ['create', 'cancel']);
        await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
      });
    });

    // `t` is the test's context; t.mock.method(console, 'error') swaps
    // console.error for a recording stand-in until the test ends, so the test
    // can check what was logged (and the output stays quiet).
    test('cancel failure is logged and still rolls back', async (t) => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      fakeStripe.cancelFails = true;
      const logged = t.mock.method(console, 'error', () => {});

      await withOrdersRefused(async () => {
        const res = await checkout(agent);

        assert.equal(res.status, 500);
        await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
      });

      // Someone running the shop needs the PaymentIntent id to release the
      // hold by hand, so it must appear in one of the logged messages.
      // .some() is true if at least one call's arguments mention it.
      const mentionsId = logged.mock.calls.some((call) => call.arguments.join(' ').includes('pi_fake_1'));
      assert.equal(mentionsId, true);
    });
  });

  describe('validating the payment details', () => {
    // A "table-driven" test: each entry is [description, changes to the
    // body], one way the payment details can be wrong. The loop turns each
    // into a test. All must be rejected with 400 BEFORE anything else.
    const invalidPayments = [
      ['payment_method_id is missing', { payment_method_id: undefined }],
      ['payment_method_id is empty', { payment_method_id: '' }],
      ['payment_method_id is not a PaymentMethod id', { payment_method_id: 'card_123' }],
      ['payment_method_id is a number', { payment_method_id: 123 }],
      // The old body shape, with raw card details, is no longer accepted.
      ['only the old card details are sent', { payment_method_id: undefined, payment: { card_number: '4242 4242 4242 4242' } }],
      ['expected_total is missing', { expected_total: undefined }],
      ['expected_total is a JSON number', { expected_total: 28.45 }],
      ['expected_total has 1 decimal place', { expected_total: '28.4' }],
    ];

    // `for...of` loops over the array; `[name, changes]` unpacks each entry.
    for (const [name, changes] of invalidPayments) {
      test(`returns 400 and changes nothing when ${name}`, async () => {
        const mug = await insertProduct({ stock_quantity: 10 });
        const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

        const res = await checkout(agent, changes);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        await assertNothingChanged([{ product_id: 1, quantity: 1 }], mug, 10);
        assert.deepEqual(stripeCalls(), []);
      });
    }
  });

  describe('validating the shipping address', () => {
    // Same table-driven approach. Limits match the addresses columns in schema.sql.
    const invalidAddresses = [
      ['shipping_address is missing', { shipping_address: undefined }],
      ['line_1 is missing', withAddress({ line_1: undefined })],
      ['line_1 is only spaces', withAddress({ line_1: '   ' })],
      ['line_1 is longer than 255 characters', withAddress({ line_1: 'a'.repeat(256) })],
      ['line_2 is not a string', withAddress({ line_2: 12 })],
      ['city is missing', withAddress({ city: undefined })],
      ['city is longer than 100 characters', withAddress({ city: 'a'.repeat(101) })],
      ['region is longer than 100 characters', withAddress({ region: 'a'.repeat(101) })],
      ['postal_code is missing', withAddress({ postal_code: undefined })],
      ['postal_code is longer than 20 characters', withAddress({ postal_code: '1'.repeat(21) })],
      ['country_code is missing', withAddress({ country_code: undefined })],
      ['country_code is 3 letters', withAddress({ country_code: 'GBR' })],
      ['country_code contains digits', withAddress({ country_code: 'G1' })],
    ];

    for (const [name, changes] of invalidAddresses) {
      test(`returns 400 and changes nothing when ${name}`, async () => {
        const mug = await insertProduct({ stock_quantity: 10 });
        const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

        const res = await checkout(agent, changes);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        await assertNothingChanged([{ product_id: 1, quantity: 1 }], mug, 10);
      });
    }

    test('returns 400 when no body is sent', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      // No .send(), so the request has no body at all.
      const res = await agent.post('/cart/checkout');

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  });
});
