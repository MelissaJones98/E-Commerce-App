// Tests for the /account routes: the logged-in customer's own details.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test
// database (see .env.test), so real data is never touched.
//
// How these tests work:
//   - `describe(name, fn)` groups related tests under a heading.
//   - `test(name, fn)` is one test: it does something, then checks the result.
//   - `assert.*` functions do the checking. If an assertion fails, the test
//     fails and the output shows what was expected and what actually happened.
//   - Each test sends real HTTP requests to the app using supertest, and
//     reads the real test database to check what changed. Nothing is faked.

// node:test is Node's built-in test runner.
//   beforeEach: runs a function before every test
//   after:      runs a function once, after all the tests in this file
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict provides the checks, e.g. assert.equal(actual, expected).
// "strict" means values must match exactly: 1 and '1' are NOT equal.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';

import app from '../app.js';
// pool: the database connection pool, used here to read and write test data directly.
import pool from '../db/index.js';
// Shared test helpers (see tests/helpers.js):
//   resetTables:   empties every table, so each test starts from a clean database
//   loggedInAgent: registers a customer, logs them in, and returns an "agent"
//                  that keeps the login cookie, so its requests are made as that customer
import { resetTables, loggedInAgent } from './helpers.js';

// The customer most tests log in as. They're registered first in each test,
// and the database restarts id numbering for every test, so their id is 1.
const ada = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

// A second customer, for checking one customer can't see or change another's account.
const grace = {
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  password: 'another-password',
};

// A valid PUT /account body. Tests copy it and change one field, using the
// "spread" syntax: `{ ...updatedDetails, email: 'x' }` means "a copy of
// updatedDetails, but with email set to 'x'".
const updatedDetails = {
  first_name: 'Augusta Ada',
  last_name: 'King',
  email: 'ada.king@example.com',
  phone: '+44 20 7946 0000',
};

// Reads a customer's row straight from the database by email, so tests can
// check what was actually saved (not just what the API said). Returns
// undefined if no customer has that email.
const getCustomerRow = async (email) => {
  const result = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
  return result.rows[0];
};

// Counts every customer in the database.
// `::int` converts PostgreSQL's count (a big integer, which pg returns as a
// string) into a regular integer, so it comes back as a JavaScript number.
const countCustomers = async () => {
  const result = await pool.query('SELECT count(*)::int AS count FROM customers');
  return result.rows[0].count;
};

// Empty every table before each test, so tests can't affect each other.
beforeEach(resetTables);
// Close the database connections after the last test, or Node won't exit.
after(() => pool.end());

describe('GET /account', () => {
  test('returns 401 when not logged in', async () => {
    // `request(app)` has no login cookie, so this is an anonymous request.
    const res = await request(app).get('/account');

    // `res.status` is the HTTP status code; `res.body` is the parsed JSON body.
    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });

  test("returns 200 with the logged-in customer's details, and no password hash", async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.get('/account');

    assert.equal(res.status, 200);
    // deepEqual checks every property matches, and that there are no EXTRA
    // properties. So this also proves password_hash isn't in the response.
    // phone is null because Ada registered without one.
    assert.deepEqual(res.body, {
      id: 1,
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone: null,
    });
  });

  test("returns only the logged-in customer's details", async () => {
    // Register two customers, then ask as the second one.
    await loggedInAgent(ada);
    const graceAgent = await loggedInAgent(grace);

    const res = await graceAgent.get('/account');

    // Grace must get her own account, not Ada's (the first in the table).
    assert.equal(res.body.email, 'grace@example.com');
  });
});

describe('PUT /account', () => {
  test('returns 401 and changes nothing when not logged in', async () => {
    await loggedInAgent(ada);

    const res = await request(app).put('/account').send(updatedDetails);

    assert.equal(res.status, 401);
    // Read the database directly: Ada's name must be unchanged.
    assert.equal((await getCustomerRow('ada@example.com')).first_name, 'Ada');
  });

  test('returns 200 with the updated details', async () => {
    const agent = await loggedInAgent(ada);

    // .send() attaches a JSON body to the request.
    const res = await agent.put('/account').send(updatedDetails);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      id: 1,
      first_name: 'Augusta Ada',
      last_name: 'King',
      email: 'ada.king@example.com',
      phone: '+44 20 7946 0000',
    });
  });

  test('saves the changes, so GET /account returns them', async () => {
    const agent = await loggedInAgent(ada);

    await agent.put('/account').send(updatedDetails);
    const res = await agent.get('/account');

    assert.equal(res.body.first_name, 'Augusta Ada');
    assert.equal(res.body.email, 'ada.king@example.com');
  });

  test('stores the email trimmed and lower-cased', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.put('/account').send({ ...updatedDetails, email: '  Ada.King@Example.COM ' });

    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'ada.king@example.com');
  });

  test('allows keeping the same email', async () => {
    // Ada's own current email must not count as "already taken".
    const agent = await loggedInAgent(ada);

    const res = await agent.put('/account').send({ ...updatedDetails, email: 'ada@example.com' });

    assert.equal(res.status, 200);
  });

  test('lets the customer log in with their new email', async () => {
    const agent = await loggedInAgent(ada);
    await agent.put('/account').send(updatedDetails);

    // A fresh (logged-out) request, logging in with the NEW email.
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ada.king@example.com', password: ada.password });

    assert.equal(res.status, 200);
  });

  test('clears the phone number when phone is left out', async () => {
    const agent = await loggedInAgent(ada);
    // First give Ada a phone number...
    await agent.put('/account').send(updatedDetails);

    // ...then send the details again without phone.
    // This destructuring takes `phone` out and puts everything else into
    // `detailsWithoutPhone`, i.e. a copy of updatedDetails minus phone.
    const { phone, ...detailsWithoutPhone } = updatedDetails;
    const res = await agent.put('/account').send(detailsWithoutPhone);

    assert.equal(res.status, 200);
    assert.equal(res.body.phone, null);
  });

  test("changes only the logged-in customer's details", async () => {
    const adaAgent = await loggedInAgent(ada);
    await loggedInAgent(grace);

    const res = await adaAgent.put('/account').send(updatedDetails);

    // Ada's update must succeed, otherwise Grace is trivially unchanged.
    assert.equal(res.status, 200);
    const graceRow = await getCustomerRow('grace@example.com');
    assert.equal(graceRow.first_name, 'Grace');
    assert.equal(graceRow.last_name, 'Hopper');
  });

  test('ignores fields that customers must not change, such as id and password_hash', async () => {
    // A malicious client might send extra fields hoping they get saved
    // (this is called "mass assignment"). They must be ignored.
    const agent = await loggedInAgent(ada);
    const hashBefore = (await getCustomerRow('ada@example.com')).password_hash;

    const res = await agent
      .put('/account')
      .send({ ...updatedDetails, id: 99, password_hash: 'not-a-real-hash' });

    assert.equal(res.status, 200);
    assert.equal(res.body.id, 1);
    assert.equal((await getCustomerRow('ada.king@example.com')).password_hash, hashBefore);
  });

  describe('when the new email belongs to another customer', () => {
    test('returns 409 and changes nothing', async () => {
      await loggedInAgent(grace);
      const adaAgent = await loggedInAgent(ada);

      const res = await adaAgent.put('/account').send({ ...updatedDetails, email: 'grace@example.com' });

      assert.equal(res.status, 409);
      assert.equal(typeof res.body.error, 'string');
      assert.equal((await getCustomerRow('ada@example.com')).first_name, 'Ada');
    });

    test('returns 409 if the email differs only by letter case', async () => {
      await loggedInAgent(grace);
      const adaAgent = await loggedInAgent(ada);

      // 'GRACE@example.com' is stored as 'grace@example.com', so it clashes.
      const res = await adaAgent.put('/account').send({ ...updatedDetails, email: 'GRACE@example.com' });

      assert.equal(res.status, 409);
    });
  });

  describe('with invalid details', () => {
    // A "table-driven" test: each entry is [description, request body].
    // The loop below creates one test per entry, so adding a new invalid
    // case only needs one new line here.
    // Setting a field to `undefined` leaves it out of the JSON body entirely.
    const invalidCases = [
      ['first_name is missing', { ...updatedDetails, first_name: undefined }],
      ['first_name is only spaces', { ...updatedDetails, first_name: '   ' }],
      ['first_name is longer than 100 characters', { ...updatedDetails, first_name: 'a'.repeat(101) }],
      ['last_name is missing', { ...updatedDetails, last_name: undefined }],
      ['last_name is longer than 100 characters', { ...updatedDetails, last_name: 'a'.repeat(101) }],
      ['email is missing', { ...updatedDetails, email: undefined }],
      ['email has no @', { ...updatedDetails, email: 'ada.example.com' }],
      // 250 'a's + '@example.com' (12 characters) = 262 characters.
      ['email is longer than 255 characters', { ...updatedDetails, email: `${'a'.repeat(250)}@example.com` }],
      ['phone is not a string', { ...updatedDetails, phone: 2079460000 }],
      ['phone is longer than 30 characters', { ...updatedDetails, phone: '1'.repeat(31) }],
      ['phone contains letters', { ...updatedDetails, phone: '020 CALL ME' }],
    ];

    // `for...of` loops over the array. `[name, body]` unpacks each entry.
    for (const [name, body] of invalidCases) {
      test(`returns 400 when ${name}`, async () => {
        const agent = await loggedInAgent(ada);

        const res = await agent.put('/account').send(body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        // The rejected update must not have changed anything.
        assert.equal((await getCustomerRow('ada@example.com')).first_name, 'Ada');
      });
    }

    test('returns 400 when no body is sent', async () => {
      const agent = await loggedInAgent(ada);

      // No .send(), so the request has no body at all.
      const res = await agent.put('/account');

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  });
});

describe('DELETE /account', () => {
  test('returns 401 and deletes nothing when not logged in', async () => {
    await loggedInAgent(ada);

    const res = await request(app).delete('/account');

    assert.equal(res.status, 401);
    assert.equal(await countCustomers(), 1);
  });

  test('returns 204 and deletes the account', async () => {
    const agent = await loggedInAgent(ada);

    const res = await agent.delete('/account');

    assert.equal(res.status, 204);
    // getCustomerRow returns undefined when no row is found.
    assert.equal(await getCustomerRow('ada@example.com'), undefined);
  });

  test("deletes only the logged-in customer's account", async () => {
    const adaAgent = await loggedInAgent(ada);
    await loggedInAgent(grace);

    const res = await adaAgent.delete('/account');

    // Ada's delete must succeed, otherwise Grace trivially still exists.
    assert.equal(res.status, 204);
    assert.notEqual(await getCustomerRow('grace@example.com'), undefined);
  });

  test('logs the customer out', async () => {
    const agent = await loggedInAgent(ada);

    await agent.delete('/account');
    // The same agent (still holding its old cookie) is no longer logged in.
    const res = await agent.get('/account');

    assert.equal(res.status, 401);
  });

  test('returns 409 and keeps the account when the customer has orders', async () => {
    const agent = await loggedInAgent(ada);
    // Orders are protected by ON DELETE RESTRICT, so a customer with order
    // history can't be deleted. There are no order routes yet, so insert an
    // address and an order for Ada (customer id 1) directly into the database.
    const address = await pool.query(
      `INSERT INTO addresses (customer_id, line_1, city, postal_code, country_code)
       VALUES (1, '10 Downing Street', 'London', 'SW1A 2AA', 'GB') RETURNING id`
    );
    await pool.query(
      'INSERT INTO orders (customer_id, shipping_address_id, total_amount) VALUES (1, $1, 10)',
      [address.rows[0].id]
    );

    const res = await agent.delete('/account');

    assert.equal(res.status, 409);
    assert.equal(typeof res.body.error, 'string');
    assert.notEqual(await getCustomerRow('ada@example.com'), undefined);
  });
});
