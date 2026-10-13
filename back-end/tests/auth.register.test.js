// Tests for POST /auth/register.
// Run with: npm test (uses the ecommerce_test database, see .env.test)
import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import pool from '../db/index.js';
import { resetTables } from './helpers.js';

// A valid registration. Tests copy it and change one field at a time.
const validUser = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

const register = (body) => request(app).post('/auth/register').send(body);

const countCustomers = async () => {
  const result = await pool.query('SELECT count(*)::int AS count FROM customers');
  return result.rows[0].count;
};

describe('POST /auth/register', () => {
  // Start every test with empty tables, so tests can't affect each other.
  beforeEach(resetTables);

  // Close the database connections once all tests finish, or Node won't exit.
  after(() => pool.end());

  describe('with valid details', () => {
    test('returns 201 with the new customer', async () => {
      const res = await register(validUser);

      assert.equal(res.status, 201);
      assert.equal(typeof res.body.id, 'number');
      assert.equal(res.body.first_name, 'Ada');
      assert.equal(res.body.last_name, 'Lovelace');
      assert.equal(res.body.email, 'ada@example.com');
    });

    test('saves the customer to the database', async () => {
      const res = await register(validUser);

      const result = await pool.query('SELECT email FROM customers WHERE id = $1', [res.body.id]);
      assert.equal(result.rows[0].email, 'ada@example.com');
    });

    test('never returns the password or its hash', async () => {
      const res = await register(validUser);

      // Check registration succeeded first, otherwise an error response
      // (which has no password in it either) would pass this test.
      assert.equal(res.status, 201);
      assert.equal(res.body.password, undefined);
      assert.equal(res.body.password_hash, undefined);
    });

    test('stores a bcrypt hash, not the plain-text password', async () => {
      await register(validUser);

      const result = await pool.query('SELECT password_hash FROM customers');
      const { password_hash } = result.rows[0];
      assert.notEqual(password_hash, 'correct-horse-battery');
      assert.equal(await bcrypt.compare('correct-horse-battery', password_hash), true);
    });

    test('stores the email trimmed and lower-cased', async () => {
      const res = await register({ ...validUser, email: '  Ada@Example.COM ' });

      assert.equal(res.status, 201);
      assert.equal(res.body.email, 'ada@example.com');
    });

    // Boundary values: the shortest and longest passwords that should be allowed.
    for (const [name, password] of [
      ['an 8-character password (the minimum)', 'a'.repeat(8)],
      ['a 72-character password (the maximum bcrypt supports)', 'a'.repeat(72)],
    ]) {
      test(`accepts ${name}`, async () => {
        const res = await register({ ...validUser, password });

        assert.equal(res.status, 201);
      });
    }
  });

  describe('when the customer already exists', () => {
    test('returns 409 if the email is already registered', async () => {
      await register(validUser);

      const res = await register({ ...validUser, first_name: 'Someone else' });

      assert.equal(res.status, 409);
      assert.equal(typeof res.body.error, 'string');
      assert.equal(await countCustomers(), 1);
    });

    test('returns 409 if the email differs only by letter case', async () => {
      await register(validUser);

      const res = await register({ ...validUser, email: 'ADA@example.com' });

      assert.equal(res.status, 409);
      assert.equal(await countCustomers(), 1);
    });

    test('returns 409 for one of two simultaneous registrations with the same email', async () => {
      const responses = await Promise.all([register(validUser), register(validUser)]);

      const statuses = responses.map((res) => res.status).sort();
      assert.deepEqual(statuses, [201, 409]);
      assert.equal(await countCustomers(), 1);
    });
  });

  describe('with invalid details', () => {
    // Each case is one way a registration can be invalid. All should be
    // rejected with 400 and must not create a customer.
    const invalidCases = [
      ['email is missing', { ...validUser, email: undefined }],
      ['email is empty', { ...validUser, email: '' }],
      ['email has no @', { ...validUser, email: 'ada.example.com' }],
      ['email has no domain', { ...validUser, email: 'ada@' }],
      ['email is longer than 255 characters', { ...validUser, email: `${'a'.repeat(250)}@example.com` }],
      ['password is missing', { ...validUser, password: undefined }],
      ['password is shorter than 8 characters', { ...validUser, password: 'a'.repeat(7) }],
      ['password is longer than 72 bytes', { ...validUser, password: 'a'.repeat(73) }],
      // "é" is 2 bytes in UTF-8, so 37 of them is 74 bytes despite being 37 characters.
      ['password is under 72 characters but over 72 bytes', { ...validUser, password: 'é'.repeat(37) }],
      ['password is not a string', { ...validUser, password: 12345678 }],
      ['first_name is missing', { ...validUser, first_name: undefined }],
      ['first_name is only spaces', { ...validUser, first_name: '   ' }],
      ['first_name is longer than 100 characters', { ...validUser, first_name: 'a'.repeat(101) }],
      ['last_name is missing', { ...validUser, last_name: undefined }],
      ['last_name is longer than 100 characters', { ...validUser, last_name: 'a'.repeat(101) }],
    ];

    for (const [name, body] of invalidCases) {
      test(`returns 400 when ${name}`, async () => {
        const res = await register(body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        assert.equal(await countCustomers(), 0);
      });
    }

    test('returns 400 when no body is sent', async () => {
      const res = await request(app).post('/auth/register');

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });

    test('returns 400 when the body is not valid JSON', async () => {
      const res = await request(app)
        .post('/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ not json');

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  });
});
