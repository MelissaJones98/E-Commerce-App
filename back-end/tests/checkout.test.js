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
//   - The payment processor is a fake that behaves like Stripe's test mode:
//     special card numbers make it decline or fail (see
//     services/payment-processor.js). So every outcome is tested for real,
//     with nothing mocked.
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
//   resetTables:   empties every table
//   loggedInAgent: registers and logs in a customer; returns an agent that stays logged in
//   insertProduct: adds a product with SQL, returning its id
import { resetTables, loggedInAgent, insertProduct } from './helpers.js';

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

// Stripe's standard test card numbers, which the fake processor copies.
// (They're published test numbers, not real cards, and they pass the Luhn check.)
const SUCCEEDS = '4242 4242 4242 4242';
const DECLINED = '4000 0000 0000 0002';
const PROCESSOR_ERROR = '4000 0000 0000 0119';

// A valid checkout body. Tests copy it and change one part, using spread
// syntax: `{ ...validCheckout, payment: {...} }`.
const validCheckout = {
  shipping_address: {
    line_1: '10 Downing Street',
    line_2: null,
    city: 'London',
    region: null,
    postal_code: 'SW1A 2AA',
    country_code: 'GB',
  },
  payment: {
    cardholder_name: 'Ada Lovelace',
    card_number: SUCCEEDS,
    expiry_month: 12,
    expiry_year: 2099,
    cvc: '123',
  },
};

// Returns a copy of validCheckout with some payment fields changed,
// e.g. withPayment({ cvc: '1' }).
const withPayment = (changes) => ({
  ...validCheckout,
  payment: { ...validCheckout.payment, ...changes },
});

// Returns a copy of validCheckout with some shipping address fields changed.
const withAddress = (changes) => ({
  ...validCheckout,
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

// Checks that a failed checkout left everything exactly as it was: no
// order, no order lines, no saved address, the cart still full, and the
// stock unchanged. `expectedCart` and `expectedStock` are what they were before.
const assertNothingChanged = async (expectedCart, productId, expectedStock) => {
  assert.equal(await countRows('orders'), 0);
  assert.equal(await countRows('order_items'), 0);
  assert.equal(await countRows('addresses'), 0);
  assert.deepEqual(await getCartRows('ada@example.com'), expectedCart);
  assert.equal(await getStock(productId), expectedStock);
};

// Empty every table before each test, so tests can't affect each other.
beforeEach(resetTables);
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

      const res = await agent.post('/cart/checkout').send(validCheckout);

      assert.equal(res.status, 201);
      // created_at is the current time, so it can't be a fixed literal. Take
      // it out with destructuring, check it's a valid date, then compare the rest.
      const { created_at, ...order } = res.body;
      assert.equal(Number.isNaN(Date.parse(created_at)), false);
      // Hand-checked: 2 x 8.50 = 17.00; 1 x 24.00 = 24.00; total 41.00.
      assert.deepEqual(order, {
        id: 1,
        status: 'paid',
        total_amount: '41.00',
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

    test("saves the order to the database as paid, for the logged-in customer", async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 3 }]);

      await agent.post('/cart/checkout').send(validCheckout);

      const result = await pool.query('SELECT customer_id, status, total_amount FROM orders');
      // Hand-checked: 3 x 8.50 = 25.50. Ada is customer 1.
      assert.deepEqual(result.rows, [{ customer_id: 1, status: 'paid', total_amount: '25.50' }]);
    });

    test("saves the shipping address as one of the customer's addresses", async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      await agent.post('/cart/checkout').send(validCheckout);

      const result = await pool.query('SELECT customer_id, line_1, postal_code FROM addresses');
      assert.deepEqual(result.rows, [{ customer_id: 1, line_1: '10 Downing Street', postal_code: 'SW1A 2AA' }]);
    });

    test('freezes each price in order_items, so later price changes do not alter the order', async () => {
      const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);
      await agent.post('/cart/checkout').send(validCheckout);

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

      await agent.post('/cart/checkout').send(validCheckout);

      // 10 - 3 = 7; 4 - 4 = 0 (buying exactly the last ones is allowed).
      assert.equal(await getStock(mug), 7);
      assert.equal(await getStock(teapot), 0);
    });

    test('empties the cart', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      await agent.post('/cart/checkout').send(validCheckout);

      assert.deepEqual(await getCartRows('ada@example.com'), []);
      // The cart API agrees.
      assert.deepEqual((await agent.get('/cart')).body, { items: [], total: '0.00' });
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

      const res = await agent.post('/cart/checkout').send(validCheckout);

      assert.equal(res.status, 201);
      // Only the mug is ordered and charged for.
      assert.deepEqual(res.body.items.map((item) => item.name), ['Coffee Mug']);
      assert.equal(res.body.total_amount, '8.50');
    });

    test('accepts a card number written with spaces or without', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      // The same card number with its spaces removed.
      const res = await agent.post('/cart/checkout').send(withPayment({ card_number: '4242424242424242' }));

      assert.equal(res.status, 201);
    });

    test('accepts a card that expires this month (boundary)', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);
      // A card is valid until the END of its expiry month, so one expiring
      // this month must still work. new Date() is now; getMonth() counts
      // from 0 (January = 0), so add 1.
      const now = new Date();

      const res = await agent
        .post('/cart/checkout')
        .send(withPayment({ expiry_month: now.getMonth() + 1, expiry_year: now.getFullYear() }));

      assert.equal(res.status, 201);
    });

    test('stores the country code in capitals', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await agent.post('/cart/checkout').send(withAddress({ country_code: 'gb' }));

      assert.equal(res.status, 201);
      assert.equal(res.body.shipping_address.country_code, 'GB');
    });

    test('never sends the card details back', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await agent.post('/cart/checkout').send(validCheckout);

      assert.equal(res.status, 201);
      // res.text is the raw response body. Neither the card number (with or
      // without spaces) nor the CVC may appear anywhere in it.
      assert.equal(res.text.includes('4242'), false);
      assert.equal(res.text.includes('cvc'), false);
    });

    test("does not touch another customer's cart", async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const graceAgent = await loggedInAgent(grace);
      await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 2 });
      const adaAgent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      const res = await adaAgent.post('/cart/checkout').send(validCheckout);

      // Ada's checkout must succeed, otherwise Grace's cart is trivially unchanged.
      assert.equal(res.status, 201);
      assert.deepEqual(await getCartRows('grace@example.com'), [{ product_id: 1, quantity: 2 }]);
    });
  });

  describe('validating the cart', () => {
    test('returns 401 and creates nothing when not logged in', async () => {
      const res = await request(app).post('/cart/checkout').send(validCheckout);

      assert.equal(res.status, 401);
      assert.equal(await countRows('orders'), 0);
    });

    test('returns 400 when the cart is empty', async () => {
      const agent = await loggedInAgent(ada);

      const res = await agent.post('/cart/checkout').send(validCheckout);

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
      assert.equal(await countRows('orders'), 0);
      assert.equal(await countRows('addresses'), 0);
    });

    test('returns 400 when every product in the cart has been retired', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);
      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [mug]);

      const res = await agent.post('/cart/checkout').send(validCheckout);

      // Retired products are hidden, so as far as the customer can see the cart is empty.
      assert.equal(res.status, 400);
      assert.equal(await countRows('orders'), 0);
    });

    test('returns 409 and changes nothing when stock has run out since adding to the cart', async () => {
      const mug = await insertProduct({ stock_quantity: 5 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 3 }]);
      // Someone else buys most of the stock after Ada added hers to the cart.
      await pool.query('UPDATE products SET stock_quantity = 2 WHERE id = $1', [mug]);

      const res = await agent.post('/cart/checkout').send(validCheckout);

      assert.equal(res.status, 409);
      assert.equal(typeof res.body.error, 'string');
      // Ada's cart is kept, so she can lower the quantity and try again.
      await assertNothingChanged([{ product_id: 1, quantity: 3 }], mug, 2);
    });

    test('sells the last item to only one of two customers checking out at the same moment', async () => {
      // One mug left, and two customers each have it in their cart.
      const mug = await insertProduct({ stock_quantity: 1 });
      const adaAgent = await loggedInAgent(ada);
      const graceAgent = await loggedInAgent(grace);
      await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });
      await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });

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
        adaAgent.post('/cart/checkout').send(validCheckout),
        graceAgent.post('/cart/checkout').send(validCheckout),
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

      const res = await agent.post('/cart/checkout').send(withPayment({ card_number: DECLINED }));

      // 402 Payment Required: the request was fine, but the payment didn't go through.
      assert.equal(res.status, 402);
      assert.equal(typeof res.body.error, 'string');
      // No order, cart kept, stock untouched, so the customer can try another card.
      await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
    });

    test('returns 502 and changes nothing when the payment processor fails', async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 2 }]);

      const res = await agent.post('/cart/checkout').send(withPayment({ card_number: PROCESSOR_ERROR }));

      // 502 Bad Gateway: a service this API depends on (the payment
      // processor) failed. It's not the customer's fault, and not a bug here.
      assert.equal(res.status, 502);
      assert.equal(typeof res.body.error, 'string');
      await assertNothingChanged([{ product_id: 1, quantity: 2 }], mug, 10);
    });
  });

  describe('validating the payment details', () => {
    // A "table-driven" test: each entry is [description, request body], one
    // way the payment details can be wrong. The loop turns each into a test.
    // All must be rejected with 400 BEFORE any payment is attempted.
    // Setting a field to `undefined` leaves it out of the JSON body entirely.
    const invalidPayments = [
      ['payment is missing', { ...validCheckout, payment: undefined }],
      ['cardholder_name is missing', withPayment({ cardholder_name: undefined })],
      ['cardholder_name is only spaces', withPayment({ cardholder_name: '   ' })],
      ['card_number is missing', withPayment({ card_number: undefined })],
      ['card_number is a JSON number', withPayment({ card_number: 4242424242424242 })],
      ['card_number contains letters', withPayment({ card_number: '4242 4242 4242 ABCD' })],
      ['card_number is too short', withPayment({ card_number: '4242 4242 42' })],
      ['card_number is too long', withPayment({ card_number: '4242 4242 4242 4242 4242' })],
      // One digit changed from the valid test card, so the Luhn check fails.
      // This is the kind of typo the check exists to catch.
      ['card_number fails the Luhn check (a typo)', withPayment({ card_number: '4242 4242 4242 4241' })],
      ['expiry_month is missing', withPayment({ expiry_month: undefined })],
      ['expiry_month is 0', withPayment({ expiry_month: 0 })],
      ['expiry_month is 13', withPayment({ expiry_month: 13 })],
      ['expiry_month is a string', withPayment({ expiry_month: '12' })],
      ['expiry_year is missing', withPayment({ expiry_year: undefined })],
      ['expiry_year is written with 2 digits', withPayment({ expiry_year: 99 })],
      ['the card expired in an earlier year', withPayment({ expiry_month: 12, expiry_year: 2020 })],
      ['cvc is missing', withPayment({ cvc: undefined })],
      ['cvc is too short', withPayment({ cvc: '12' })],
      ['cvc is too long', withPayment({ cvc: '12345' })],
      ['cvc contains letters', withPayment({ cvc: '12a' })],
      ['cvc is a JSON number', withPayment({ cvc: 123 })],
    ];

    // `for...of` loops over the array; `[name, body]` unpacks each entry.
    for (const [name, body] of invalidPayments) {
      test(`returns 400 and changes nothing when ${name}`, async () => {
        const mug = await insertProduct({ stock_quantity: 10 });
        const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

        const res = await agent.post('/cart/checkout').send(body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        await assertNothingChanged([{ product_id: 1, quantity: 1 }], mug, 10);
      });
    }

    test('returns 400 when the card expired earlier this year', async () => {
      // Only possible to test after January, since it needs a month that has
      // already passed this year. Built from today's date so it never goes stale.
      const now = new Date();
      // getMonth() is 0 for January, so in January there's no earlier month.
      if (now.getMonth() === 0) return;
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

      // getMonth() counts from 0, so getMonth() (without + 1) is LAST month.
      const res = await agent
        .post('/cart/checkout')
        .send(withPayment({ expiry_month: now.getMonth(), expiry_year: now.getFullYear() }));

      assert.equal(res.status, 400);
    });
  });

  describe('validating the shipping address', () => {
    // Same table-driven approach. Limits match the addresses columns in schema.sql.
    const invalidAddresses = [
      ['shipping_address is missing', { ...validCheckout, shipping_address: undefined }],
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

    for (const [name, body] of invalidAddresses) {
      test(`returns 400 and changes nothing when ${name}`, async () => {
        const mug = await insertProduct({ stock_quantity: 10 });
        const agent = await adaWithCart([{ product_id: mug, quantity: 1 }]);

        const res = await agent.post('/cart/checkout').send(body);

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
