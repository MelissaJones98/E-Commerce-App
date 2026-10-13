// Tests for POST /auth/login and POST /auth/logout.
// Run with: npm test (uses the ecommerce_test database, see .env.test)
import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../app.js';
import pool from '../db/index.js';
import { resetTables } from './helpers.js';

const customer = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

const credentials = { email: customer.email, password: customer.password };

// An agent keeps cookies between requests, like a browser does, so it stays
// logged in after a successful login.
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
      const res = await newAgent().post('/auth/login').send(credentials);

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

      const cookies = res.headers['set-cookie'] ?? [];
      assert.equal(cookies.length, 1);
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
      assert.deepEqual(wrongPassword.body, unknownEmail.body);
    });

    test('does not log the customer in', async () => {
      const agent = newAgent();
      await agent.post('/auth/login').send({ ...credentials, password: 'wrong-password' });

      const res = await agent.post('/auth/logout');

      assert.equal(res.status, 401);
    });
  });

  describe('with missing details', () => {
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
});

describe('POST /auth/logout', () => {
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
    const res = await newAgent().post('/auth/logout');

    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });
});
