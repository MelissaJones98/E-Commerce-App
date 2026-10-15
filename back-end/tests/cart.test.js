// Tests for the /cart routes: the logged-in customer's shopping cart.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test
// database (see .env.test), so real data is never touched.
//
// How these tests work:
//   - `describe(name, fn)` groups related tests; `test(name, fn)` is one test.
//   - `assert.*` functions check results; a failed check fails the test.
//   - Products are inserted straight into the database with insertProduct(),
//     then the cart API is called with a logged-in supertest agent.
//   - Expected responses are written out by hand (e.g. line_total: '17.00'),
//     so a wrong, missing or extra field fails the test.

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

// A second customer, for checking one customer's cart never affects another's.
const grace = {
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  password: 'another-password',
};

// Reads a customer's cart rows straight from the database (by email), so
// tests can check what was actually saved. Returns an array of
// { product_id, quantity } objects, in product order.
// JOIN combines rows from two tables: here, each cart row with its customer,
// so we can filter by the customer's email.
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

// Empty every table before each test, so tests can't affect each other.
beforeEach(resetTables);
// Close the database connections after the last test, or Node won't exit.
after(() => pool.end());

describe('GET /cart', () => {
  test('returns 401 when not logged in', async () => {
    // `request(app)` has no login cookie, so this is an anonymous request.
    const res = await request(app).get('/cart');

    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns an empty cart with a total of 0.00', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.get('/cart');

    assert.equal(res.status, 200);
    // Money is always sent as a string with 2 decimal places, like product prices.
    assert.deepEqual(res.body, { items: [], total: '0.00' });
  });

  test('lists each item with its line total, plus the cart total, in the order added', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
    const teapot = await insertProduct({ sku: 'TEA-001', name: 'Teapot', price: '24.00', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    // Add the teapot first, so the expected order (teapot, then mug) differs
    // from id order (mug is id 1). This proves items are listed in the order added.
    await agent.post('/cart/items').send({ product_id: teapot, quantity: 1 });
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    const res = await agent.get('/cart');

    assert.equal(res.status, 200);
    // Hand-checked: 2 x 8.50 = 17.00; 1 x 24.00 = 24.00; 17.00 + 24.00 = 41.00.
    assert.deepEqual(res.body, {
      items: [
        { product_id: 2, sku: 'TEA-001', name: 'Teapot', price: '24.00', quantity: 1, line_total: '24.00' },
        { product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', quantity: 2, line_total: '17.00' },
      ],
      total: '41.00',
    });
  });

  test('shows the current price if the price changes after adding', async () => {
    // The cart stores no price; it always reads the product's current one.
    // (Prices are only frozen when an order is placed.)
    const mug = await insertProduct({ price: '8.50', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    // Change the price directly in the database, as a shop owner would.
    await pool.query("UPDATE products SET price = '9.00' WHERE id = $1", [mug]);
    const res = await agent.get('/cart');

    assert.equal(res.body.items[0].price, '9.00');
    assert.equal(res.body.total, '18.00');
  });

  test('hides retired products and leaves them out of the total', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
    const teapot = await insertProduct({ sku: 'TEA-001', name: 'Teapot', price: '24.00', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 1 });
    await agent.post('/cart/items').send({ product_id: teapot, quantity: 1 });

    // Retire the teapot after it was added to the cart.
    await pool.query('UPDATE products SET is_active = false WHERE id = $1', [teapot]);
    const res = await agent.get('/cart');

    // .map() turns the items into just their names, which is easy to compare.
    assert.deepEqual(res.body.items.map((item) => item.name), ['Coffee Mug']);
    assert.equal(res.body.total, '8.50');
  });

  test("shows only the logged-in customer's cart", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);
    await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 3 });

    const res = await graceAgent.get('/cart');

    // Grace hasn't added anything, so her cart is empty even though Ada's isn't.
    assert.deepEqual(res.body, { items: [], total: '0.00' });
  });
});

describe('POST /cart/items', () => {
  test('returns 401 and adds nothing when not logged in', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });

    const res = await request(app).post('/cart/items').send({ product_id: mug, quantity: 1 });

    assert.equal(res.status, 401);
    const countResult = await pool.query('SELECT count(*)::int AS count FROM cart_items');
    assert.equal(countResult.rows[0].count, 0);
  });

  test('returns 201 with the updated cart', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);

    const res = await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    assert.equal(res.status, 201);
    // The response is the whole cart, so a client can redraw it in one go.
    assert.deepEqual(res.body, {
      items: [
        { product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', quantity: 2, line_total: '17.00' },
      ],
      total: '17.00',
    });
  });

  test('saves the item to the database', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);

    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
  });

  test('adds to the quantity when the product is already in the cart', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);

    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });
    const res = await agent.post('/cart/items').send({ product_id: mug, quantity: 3 });

    assert.equal(res.status, 201);
    // Still ONE row for the mug, now with 2 + 3 = 5.
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 5 }]);
  });

  test('accepts a quantity equal to the stock available (boundary)', async () => {
    // Bugs often hide at limits, e.g. writing `>=` where `>` was meant.
    const mug = await insertProduct({ stock_quantity: 3 });
    const agent = await loggedInAgent(ada);

    const res = await agent.post('/cart/items').send({ product_id: mug, quantity: 3 });

    assert.equal(res.status, 201);
  });

  test('returns 409 and adds nothing when asking for more than is in stock', async () => {
    const mug = await insertProduct({ stock_quantity: 3 });
    const agent = await loggedInAgent(ada);

    const res = await agent.post('/cart/items').send({ product_id: mug, quantity: 4 });

    assert.equal(res.status, 409);
    assert.equal(typeof res.body.error, 'string');
    assert.deepEqual(await getCartRows('ada@example.com'), []);
  });

  test('returns 409 when the combined quantity would be more than is in stock', async () => {
    const mug = await insertProduct({ stock_quantity: 5 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 3 });

    // 3 already in the cart + 3 more = 6, but only 5 are in stock.
    const res = await agent.post('/cart/items').send({ product_id: mug, quantity: 3 });

    assert.equal(res.status, 409);
    // The quantity is left as it was.
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 3 }]);
  });

  test('returns 404 when the product does not exist', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.post('/cart/items').send({ product_id: 999, quantity: 1 });

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 404 when the product has been retired', async () => {
    const retired = await insertProduct({ stock_quantity: 10, is_active: false });
    const agent = await loggedInAgent(ada);

    const res = await agent.post('/cart/items').send({ product_id: retired, quantity: 1 });

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
    assert.deepEqual(await getCartRows('ada@example.com'), []);
  });

  test("adds only to the logged-in customer's cart", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    await loggedInAgent(grace);

    const res = await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });

    // Ada's add must succeed, otherwise Grace's cart is trivially empty.
    assert.equal(res.status, 201);
    assert.deepEqual(await getCartRows('grace@example.com'), []);
  });

  describe('with invalid details', () => {
    // A "table-driven" test: each entry is [description, request body].
    // The loop below turns each one into its own test. All must be rejected
    // with 400 before anything reaches the database.
    // Setting a field to `undefined` leaves it out of the JSON body entirely.
    const invalidCases = [
      ['product_id is missing', { product_id: undefined, quantity: 1 }],
      ['product_id is a string', { product_id: '1', quantity: 1 }],
      ['product_id is not a whole number', { product_id: 1.5, quantity: 1 }],
      ['product_id is 0', { product_id: 0, quantity: 1 }],
      ['quantity is missing', { product_id: 1, quantity: undefined }],
      ['quantity is 0', { product_id: 1, quantity: 0 }],
      ['quantity is negative', { product_id: 1, quantity: -1 }],
      ['quantity is not a whole number', { product_id: 1, quantity: 1.5 }],
      ['quantity is a string', { product_id: 1, quantity: '2' }],
      // One more than the largest PostgreSQL integer.
      ['quantity is too large for the database', { product_id: 1, quantity: 2147483648 }],
    ];

    // `for...of` loops over the array; `[name, body]` unpacks each entry.
    for (const [name, body] of invalidCases) {
      test(`returns 400 when ${name}`, async () => {
        // Product 1 exists, so a 400 can only come from the validation.
        await insertProduct({ stock_quantity: 10 });
        const agent = await loggedInAgent(ada);

        const res = await agent.post('/cart/items').send(body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        assert.deepEqual(await getCartRows('ada@example.com'), []);
      });
    }

    test('returns 400 when no body is sent', async () => {
      const agent = await loggedInAgent(ada);

      // No .send(), so the request has no body at all.
      const res = await agent.post('/cart/items');

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  });
});

describe('PUT /cart/items/:productId', () => {
  test('returns 401 and changes nothing when not logged in', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    // A template literal builds the URL with the product's id, e.g. /cart/items/1.
    const res = await request(app).put(`/cart/items/${mug}`).send({ quantity: 5 });

    assert.equal(res.status, 401);
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
  });

  test('sets the quantity (replacing it, not adding to it) and returns the cart', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    const res = await agent.put(`/cart/items/${mug}`).send({ quantity: 5 });

    assert.equal(res.status, 200);
    // 5, not 2 + 5 = 7. Hand-checked: 5 x 8.50 = 42.50.
    assert.deepEqual(res.body, {
      items: [
        { product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', quantity: 5, line_total: '42.50' },
      ],
      total: '42.50',
    });
  });

  test('returns 404 when the product is not in the cart', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);

    // The mug exists, but Ada never added it.
    const res = await agent.put(`/cart/items/${mug}`).send({ quantity: 1 });

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 409 and changes nothing when asking for more than is in stock', async () => {
    const mug = await insertProduct({ stock_quantity: 3 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    const res = await agent.put(`/cart/items/${mug}`).send({ quantity: 4 });

    assert.equal(res.status, 409);
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
  });

  test("changes only the logged-in customer's cart", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);
    // Both customers have the mug in their cart.
    await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });
    await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });

    const res = await adaAgent.put(`/cart/items/${mug}`).send({ quantity: 4 });

    // Ada's update must succeed, otherwise Grace's cart is trivially unchanged.
    assert.equal(res.status, 200);
    assert.deepEqual(await getCartRows('grace@example.com'), [{ product_id: 1, quantity: 1 }]);
  });

  // Each invalid quantity must be rejected with 400, leaving the cart unchanged.
  // A quantity of 0 is rejected too: removing an item is done with DELETE.
  for (const [name, quantity] of [
    ['quantity is 0', 0],
    ['quantity is negative', -1],
    ['quantity is not a whole number', 1.5],
    ['quantity is missing', undefined],
  ]) {
    test(`returns 400 when ${name}`, async () => {
      const mug = await insertProduct({ stock_quantity: 10 });
      const agent = await loggedInAgent(ada);
      await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

      // `{ quantity }` is shorthand for `{ quantity: quantity }`.
      const res = await agent.put(`/cart/items/${mug}`).send({ quantity });

      assert.equal(res.status, 400);
      assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
    });
  }

  test('returns 400 when the product id in the URL is not a valid id', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.put('/cart/items/abc').send({ quantity: 1 });

    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, 'string');
  });
});

describe('DELETE /cart/items/:productId', () => {
  test('returns 401 and removes nothing when not logged in', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    const res = await request(app).delete(`/cart/items/${mug}`);

    assert.equal(res.status, 401);
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
  });

  test('returns 204 and removes only that item', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', stock_quantity: 10 });
    const teapot = await insertProduct({ sku: 'TEA-001', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });
    await agent.post('/cart/items').send({ product_id: teapot, quantity: 1 });

    const res = await agent.delete(`/cart/items/${mug}`);

    assert.equal(res.status, 204);
    // Only the teapot (product 2) is left.
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 2, quantity: 1 }]);
  });

  test('returns 404 when the product is not in the cart', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);

    const res = await agent.delete(`/cart/items/${mug}`);

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test("removes the item only from the logged-in customer's cart", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);
    await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });
    await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });

    const res = await adaAgent.delete(`/cart/items/${mug}`);

    // Ada's delete must succeed, otherwise Grace's item trivially remains.
    assert.equal(res.status, 204);
    assert.deepEqual(await getCartRows('grace@example.com'), [{ product_id: 1, quantity: 1 }]);
  });

  test('returns 400 when the product id in the URL is not a valid id', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.delete('/cart/items/abc');

    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, 'string');
  });
});

describe('DELETE /cart', () => {
  test('returns 401 and empties nothing when not logged in', async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });

    const res = await request(app).delete('/cart');

    assert.equal(res.status, 401);
    assert.deepEqual(await getCartRows('ada@example.com'), [{ product_id: 1, quantity: 2 }]);
  });

  test('returns 204 and empties the cart', async () => {
    const mug = await insertProduct({ sku: 'MUG-001', stock_quantity: 10 });
    const teapot = await insertProduct({ sku: 'TEA-001', stock_quantity: 10 });
    const agent = await loggedInAgent(ada);
    await agent.post('/cart/items').send({ product_id: mug, quantity: 2 });
    await agent.post('/cart/items').send({ product_id: teapot, quantity: 1 });

    const res = await agent.delete('/cart');

    assert.equal(res.status, 204);
    assert.deepEqual(await getCartRows('ada@example.com'), []);
  });

  test('returns 204 when the cart is already empty', async () => {
    // Emptying an empty cart isn't an error: the end result is the same.
    const agent = await loggedInAgent(ada);

    const res = await agent.delete('/cart');

    assert.equal(res.status, 204);
  });

  test("empties only the logged-in customer's cart", async () => {
    const mug = await insertProduct({ stock_quantity: 10 });
    const adaAgent = await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);
    await adaAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });
    await graceAgent.post('/cart/items').send({ product_id: mug, quantity: 1 });

    const res = await adaAgent.delete('/cart');

    // Ada's empty must succeed, otherwise Grace's cart trivially remains.
    assert.equal(res.status, 204);
    assert.deepEqual(await getCartRows('grace@example.com'), [{ product_id: 1, quantity: 1 }]);
  });
});
