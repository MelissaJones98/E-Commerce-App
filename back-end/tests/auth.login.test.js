// Tests for POST /auth/login and POST /auth/logout.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test
// database (see .env.test), so real data is never touched.
//
// How these tests work:
//   - `describe(name, fn)` groups related tests; `test(name, fn)` is one test.
//   - `assert.*` functions check results; a failed check fails the test.
//   - Logging in sets a session cookie. To check you STAY logged in, a test
//     needs something that keeps cookies between requests, like a browser.
//     That's a supertest "agent" (see newAgent below).

// node:test is Node's built-in test runner.
//   beforeEach: runs a function before every test in its describe block
//   after:      runs a function once, after all the tests
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';

import app from '../app.js';
// pool: the database connection pool (closed at the end with pool.end()).
import pool from '../db/index.js';
// resetTables: empties every table (see tests/helpers.js).
import { resetTables } from './helpers.js';

// The customer registered before each test.
const customer = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

// The correct login details for that customer: a body for POST /auth/login.
const credentials = { email: customer.email, password: customer.password };

// Creates a new agent. An agent keeps cookies between its requests, like a
// browser does, so after a successful login its later requests are logged in.
// A plain `request(app)` call has no memory: every request starts logged out.
const newAgent = () => request.agent(app);

// Close the database connections once every test in this file has finished.
after(() => pool.end());

describe('POST /auth/login', () => {
  // Every test starts with one registered customer.
  beforeEach(async () => {
    await resetTables();
    await request(app).post('/auth/register').send(customer);
  });

  describe('with correct credentials', () => {
    test('returns 200 with the customer', async () => {
      // Requests can be "chained": create an agent, make it a POST to
      // /auth/login, attach the JSON body, then await the response.
      const res = await newAgent().post('/auth/login').send(credentials);

      // `res.status` is the HTTP status code; `res.body` is the parsed JSON body.
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.id, 'number');
      assert.equal(res.body.first_name, 'Ada');
      assert.equal(res.body.last_name, 'Lovelace');
      assert.equal(res.body.email, 'ada@example.com');
    });

    test('never returns the password or its hash', async () => {
      const res = await newAgent().post('/auth/login').send(credentials);

      // Check login succeeded first, otherwise an error response
      // (which has no password in it either) would pass this test.
      assert.equal(res.status, 200);
      assert.equal(res.body.password, undefined);
      assert.equal(res.body.password_hash, undefined);
    });

    test('accepts the email in any letter case, with surrounding spaces', async () => {
      // `{ ...credentials, email: '...' }` is a copy of credentials with a
      // differently-typed email. Login normalises it, so it should still match.
      const res = await newAgent()
        .post('/auth/login')
        .send({ ...credentials, email: '  ADA@Example.com ' });

      assert.equal(res.status, 200);
    });

    test('keeps the customer logged in on later requests', async () => {
      const agent = newAgent();
      await agent.post('/auth/login').send(credentials);

      // Logging out requires being logged in, so 204 proves the session persisted.
      const res = await agent.post('/auth/logout');

      assert.equal(res.status, 204);
    });

    test('sets the session cookie as HttpOnly, so browser JavaScript cannot read it', async () => {
      const res = await newAgent().post('/auth/login').send(credentials);

      // The server sends cookies in "Set-Cookie" response headers. supertest
      // gives them as an array of strings like
      //   "connect.sid=abc123; Path=/; HttpOnly"
      // `?? []` uses an empty array if there were none, so the next line fails
      // cleanly instead of crashing.
      const cookies = res.headers['set-cookie'] ?? [];
      // Exactly one cookie: the session cookie.
      assert.equal(cookies.length, 1);
      // assert.match checks the text matches a regular expression:
      //   ;       a semicolon (cookie settings are separated by them)
      //   \s*     any number of spaces
      //   HttpOnly  the setting itself
      //   /i      "case-insensitive", so httponly would also match
      assert.match(cookies[0], /;\s*HttpOnly/i);
    });
  });

  describe('with incorrect credentials', () => {
    test('returns 401 when the password is wrong', async () => {
      const res = await newAgent()
        .post('/auth/login')
        .send({ ...credentials, password: 'wrong-password' });

      assert.equal(res.status, 401);
      assert.equal(typeof res.body.error, 'string');
    });

    test('returns 401 when no account has that email', async () => {
      const res = await newAgent()
        .post('/auth/login')
        .send({ ...credentials, email: 'nobody@example.com' });

      assert.equal(res.status, 401);
      assert.equal(typeof res.body.error, 'string');
    });

    test('gives the same error for a wrong password and an unknown email', async () => {
      // Different messages would let anyone find out which emails are registered.
      const wrongPassword = await newAgent()
        .post('/auth/login')
        .send({ ...credentials, password: 'wrong-password' });
      const unknownEmail = await newAgent()
        .post('/auth/login')
        .send({ ...credentials, email: 'nobody@example.com' });

      // Both must be login failures; two identical 404s would also be equal.
      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, 401);
      // deepEqual compares every property of the two bodies, so the error
      // messages must be identical.
      assert.deepEqual(wrongPassword.body, unknownEmail.body);
    });

    test('does not log the customer in', async () => {
      const agent = newAgent();
      await agent.post('/auth/login').send({ ...credentials, password: 'wrong-password' });

      // Logout requires being logged in, so 401 here proves the failed login
      // didn't create a logged-in session.
      const res = await agent.post('/auth/logout');

      assert.equal(res.status, 401);
    });
  });

  describe('with missing details', () => {
    // A "table-driven" test: each entry is [description, request body], and
    // the loop below turns each one into its own test.
    const invalidCases = [
      ['email is missing', { password: customer.password }],
      ['password is missing', { email: customer.email }],
      ['email is not a string', { ...credentials, email: 12345 }],
      ['password is not a string', { ...credentials, password: 12345678 }],
    ];

    for (const [name, body] of invalidCases) {
      test(`returns 400 when ${name}`, async () => {
        const res = await newAgent().post('/auth/login').send(body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
      });
    }

    test('returns 400 when no body is sent', async () => {
      const res = await newAgent().post('/auth/login');

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  });

  // Customers who only sign in with Google or Facebook have no password:
  // their password_hash is NULL in the database.
  describe('customers without a password', () => {
    test('logging in with the email form gives 401, not 500', async () => {
      // Add the customer straight into the database, as Google sign-in would.
      // NULL is SQL's "no value".
      await pool.query(
        `INSERT INTO customers (first_name, last_name, email, password_hash)
         VALUES ('Grace', 'Hopper', 'grace@example.com', NULL)`
      );

      const res = await newAgent()
        .post('/auth/login')
        .send({ email: 'grace@example.com', password: 'anything-at-all' });

      // The same reply as any wrong password, so nobody can tell this account
      // exists or has no password.
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Incorrect email or password');
    });
  });
});

describe('POST /auth/logout', () => {
  // Before each test: empty the tables and register the customer again.
  beforeEach(async () => {
    await resetTables();
    await request(app).post('/auth/register').send(customer);
  });

  test('returns 204 when logged in', async () => {
    const agent = newAgent();
    await agent.post('/auth/login').send(credentials);

    const res = await agent.post('/auth/logout');

    assert.equal(res.status, 204);
  });

  test('ends the session, so the customer is no longer logged in', async () => {
    const agent = newAgent();
    await agent.post('/auth/login').send(credentials);
    await agent.post('/auth/logout');

    // A second logout fails because the first one ended the session.
    const res = await agent.post('/auth/logout');

    assert.equal(res.status, 401);
  });

  test('returns 401 when not logged in', async () => {
    // A brand-new agent has never logged in.
    const res = await newAgent().post('/auth/logout');

    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });
});
