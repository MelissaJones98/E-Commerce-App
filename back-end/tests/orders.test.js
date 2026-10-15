// Tests for the /orders routes: the logged-in customer's order history.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test
// database (see .env.test), so real data is never touched.
//
// How these tests work:
//   - `describe(name, fn)` groups related tests; `test(name, fn)` is one test.
//   - `assert.*` functions check results; a failed check fails the test.
//   - Orders are placed through the REAL cart and checkout APIs with the
//     placeOrder() helper, exactly as a customer would, then read back
//     through the order routes.
//   - Expected values are worked out by hand and written as literals.

// node:test is Node's built-in test runner.
//   beforeEach: runs a function before every test
//   after:      runs a function once, after all the tests
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';

import app from '../app.js';
// pool: the database connection pool, used to change data behind the API's back.
import pool from '../db/index.js';
// Helpers (see tests/helpers.js):
//   resetTables:   empties every table
//   loggedInAgent: registers and logs in a customer; returns an agent that stays logged in
//   insertProduct: adds a product with SQL, returning its id
//   placeOrder:    adds items to the agent's cart, then checks out; returns the response
import { resetTables, loggedInAgent, insertProduct, placeOrder } from './helpers.js';

// The customer most tests log in as. Registered first, so their id is 1.
const ada = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

// A second customer, for checking nobody can see another customer's orders.
const grace = {
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  password: 'another-password',
};

// Checks a value is a valid date-time string, e.g. '2026-10-15T09:36:52.487Z'.
// Date.parse() returns NaN ("not a number") if the text isn't a valid date.
const assertIsDate = (value) => {
  assert.equal(typeof value, 'string');
  assert.equal(Number.isNaN(Date.parse(value)), false);
};

// Empty every table before each test, so tests can't affect each other.
beforeEach(resetTables);
// Close the database connections after the last test, or Node won't exit.
after(() => pool.end());

describe('GET /orders', () => {
  test('returns 401 when not logged in', async () => {
    // `request(app)` has no login cookie, so this is an anonymous request.
    const res = await request(app).get('/orders');

    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns an empty list when the customer has no orders', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.get('/orders');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test('lists each order as a summary, newest first', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', price: '8.50', stock_quantity: 10 });
    const teapot = await insertProduct({ sku: 'TEA-001', price: '24.00', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    // First order: 2 mugs + 1 teapot. Second order: 1 mug.
    await placeOrder(agent, [
      { product_id: mug, quantity: 2 },
      { product_id: teapot, quantity: 1 },
    ]);
    await placeOrder(agent, [{ product_id: mug, quantity: 1 }]);

    const res = await agent.get('/orders');

    assert.equal(res.status, 200);
    // created_at is the time each order was placed, so check those
    // separately, then remove them to compare the rest exactly.
    // .map() runs the function on every order and builds a new array.
    res.body.forEach((order) => assertIsDate(order.created_at));
    const withoutDates = res.body.map(({ created_at, ...summary }) => summary);
    // Newest first, so order 2 comes before order 1.
    // Hand-checked: order 1 = 2 x 8.50 + 1 x 24.00 = 41.00, with 2 + 1 = 3 items;
    //               order 2 = 1 x 8.50 = 8.50, with 1 item.
    assert.deepEqual(withoutDates, [
      { id: 2, status: 'paid', total_amount: '8.50', item_count: 1 },
      { id: 1, status: 'paid', total_amount: '41.00', item_count: 3 },
    ]);
  });

  test("shows only the logged-in customer's orders", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);
    await placeOrder(adaAgent, [{ product_id: mug, quantity: 1 }]);
    const graceOrder = await placeOrder(graceAgent, [{ product_id: mug, quantity: 2 }]);

    const res = await graceAgent.get('/orders');

    // Grace sees her one order (order 2), and never Ada's (order 1).
    // .map() turns the orders into just their ids, which is easy to compare.
    assert.deepEqual(res.body.map((order) => order.id), [graceOrder.body.id]);
  });

  test('keeps showing what was paid after the product price changes', async () => {
    const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await placeOrder(agent, [{ product_id: mug, quantity: 2 }]);

    // The shop changes the price after the order was placed.
    await pool.query("UPDATE products SET price = '99.00' WHERE id = $1", [mug]);
    const res = await agent.get('/orders');

    // Still 2 x 8.50, the price actually paid.
    assert.equal(res.body[0].total_amount, '17.00');
  });
});

describe('GET /orders/:orderId', () => {
  test('returns 401 when not logged in', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    const order = await placeOrder(agent, [{ product_id: mug, quantity: 1 }]);

    // A template literal builds the URL with the order's id, e.g. /orders/1.
    const res = await request(app).get(`/orders/${order.body.id}`);

    assert.equal(res.status, 401);
  });

  test('returns 200 with the full order: status, total, address and items', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
    const teapot = await insertProduct({ sku: 'TEA-001', name: 'Teapot', price: '24.00', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    const order = await placeOrder(agent, [
      { product_id: mug, quantity: 2 },
      { product_id: teapot, quantity: 1 },
    ]);

    const res = await agent.get(`/orders/${order.body.id}`);

    assert.equal(res.status, 200);
    const { created_at, ...details } = res.body;
    assertIsDate(created_at);
    // Hand-checked: 2 x 8.50 = 17.00; 1 x 24.00 = 24.00; total 41.00.
    assert.deepEqual(details, {
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

  test('returns exactly the same order that checkout returned', async () => {
    // Checkout and this route share one function to build an order, so a
    // customer always sees an order the same way.
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    const order = await placeOrder(agent, [{ product_id: mug, quantity: 3 }]);

    const res = await agent.get(`/orders/${order.body.id}`);

    // Check checkout succeeded first, otherwise two error bodies could match.
    assert.equal(order.status, 201);
    assert.deepEqual(res.body, order.body);
  });

  test('still shows the price paid, and the product, after the product is changed or retired', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    const order = await placeOrder(agent, [{ product_id: mug, quantity: 2 }]);

    // After the order: the price goes up AND the product is retired from the shop.
    await pool.query("UPDATE products SET price = '99.00', is_active = false WHERE id = $1", [mug]);
    const res = await agent.get(`/orders/${order.body.id}`);

    // The order history is unaffected: same item, same price paid.
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items, [
      { product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', quantity: 2, unit_price: '8.50', line_total: '17.00' },
    ]);
    assert.equal(res.body.total_amount, '17.00');
  });

  test('returns 404 when the order does not exist', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.get('/orders/999');

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test("returns 404 for another customer's order, the same as for one that doesn't exist", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);
    const adaOrder = await placeOrder(adaAgent, [{ product_id: mug, quantity: 1 }]);

    // Grace tries to look at Ada's order by guessing its id...
    const res = await graceAgent.get(`/orders/${adaOrder.body.id}`);
    // ...and, for comparison, an order that doesn't exist at all.
    const missing = await graceAgent.get('/orders/999');

    // A 403 ("forbidden") would confirm the order exists. Replying exactly as
    // if it didn't exist reveals nothing about other customers' orders.
    assert.equal(res.status, 404);
    // It must be the app's own JSON error, not Express's built-in "route not
    // found" page (two of those would also match each other).
    assert.equal(typeof res.body.error, 'string');
    assert.deepEqual(res.body, missing.body);
  });

  // One test per invalid id. '99999999999' is too big for PostgreSQL's
  // integer type; without the check it would cause a database error (500).
  for (const value of ['abc', '1.5', '0', '-1', '99999999999']) {
    test(`returns 400 when the id is "${value}"`, async () => {
      const agent = await loggedInAgent(ada);

      const res = await agent.get(`/orders/${value}`);

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }
});
