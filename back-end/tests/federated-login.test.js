// Tests for findOrCreateCustomer() in services/federated-login.js: the rules
// for signing in with Google or Facebook.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test database.
//
// These tests call the function directly, with the details a provider would
// send, so they never need to contact Google or Facebook.

// node:test is Node's built-in test runner.
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app (used to register customers).
import request from 'supertest';

import app from '../app.js';
// pool: the database connection pool, used to inspect rows directly.
import pool from '../db/index.js';
import { resetTables } from './helpers.js';
// The function under test, and the error it throws for refused sign-ins.
import { findOrCreateCustomer } from '../services/federated-login.js';

// What Google might send for Ada. Tests copy it with `{ ...google, ... }` to
// change one detail at a time.
const google = {
  provider: 'google',
  subject: 'g-123',
  email: 'ada@example.com',
  emailVerified: true,
  firstName: 'Ada',
  lastName: 'Lovelace',
};

// Registers Ada with a password through the real API and returns her id.
const registerAda = async () => {
  const res = await request(app).post('/auth/register').send({
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery',
  });
  return res.body.id;
};

// How many rows a table has. `::int` turns Postgres's count (a big number type
// that pg returns as a string) into an ordinary integer.
// The table name is joined into the SQL text, which is only safe because the
// tests pass fixed names, never user input.
const countRows = async (table) => {
  const result = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
  return result.rows[0].n;
};

// Close the database connections once every test in this file has finished.
after(() => pool.end());

describe('findOrCreateCustomer', () => {
  // Every test starts with empty tables.
  beforeEach(resetTables);

  test('creates a new customer with no password, and links them', async () => {
    const customer = await findOrCreateCustomer(google);

    assert.equal(customer.email, 'ada@example.com');
    assert.equal(customer.first_name, 'Ada');
    assert.equal(customer.last_name, 'Lovelace');
    // `in` checks whether an object has a property at all, even an undefined one.
    assert.equal('password_hash' in customer, false);

    const row = await pool.query('SELECT password_hash FROM customers WHERE id = $1', [customer.id]);
    assert.equal(row.rows[0].password_hash, null);

    const links = await pool.query('SELECT customer_id, provider, subject FROM federated_credentials');
    // deepEqual compares every property of every row.
    assert.deepEqual(links.rows, [{ customer_id: customer.id, provider: 'google', subject: 'g-123' }]);
  });

  test('links to an existing customer with the same verified email', async () => {
    const adaId = await registerAda();

    const customer = await findOrCreateCustomer(google);

    assert.equal(customer.id, adaId);
    assert.equal(await countRows('customers'), 1);
    assert.equal(await countRows('federated_credentials'), 1);
  });

  test('matches emails case-insensitively and ignoring spaces', async () => {
    const adaId = await registerAda();

    const customer = await findOrCreateCustomer({ ...google, email: '  Ada@Example.COM ' });

    assert.equal(customer.id, adaId);
    assert.equal(await countRows('customers'), 1);
  });

  test('signing in twice gives the same customer, with no duplicates', async () => {
    const first = await findOrCreateCustomer(google);
    const second = await findOrCreateCustomer(google);

    assert.equal(second.id, first.id);
    assert.equal(await countRows('customers'), 1);
    assert.equal(await countRows('federated_credentials'), 1);
  });

  test('finds a linked customer even after they change their email', async () => {
    const first = await findOrCreateCustomer(google);
    await pool.query("UPDATE customers SET email = 'ada.king@example.com' WHERE id = $1", [first.id]);

    // Google still sends the old email, but the link (provider + subject) wins.
    const second = await findOrCreateCustomer(google);

    assert.equal(second.id, first.id);
    assert.equal(second.email, 'ada.king@example.com');
  });

  test('can link both Google and Facebook to one customer', async () => {
    const viaGoogle = await findOrCreateCustomer(google);
    const viaFacebook = await findOrCreateCustomer({ ...google, provider: 'facebook', subject: 'f-9' });

    assert.equal(viaFacebook.id, viaGoogle.id);
    assert.equal(await countRows('federated_credentials'), 2);
  });

  test('throws no_email when the provider shares no email', async () => {
    // assert.rejects waits for the Promise and checks it fails with an error
    // whose properties match this object.
    await assert.rejects(findOrCreateCustomer({ ...google, email: undefined }), {
      name: 'FederatedLoginError',
      code: 'no_email',
    });
    assert.equal(await countRows('customers'), 0);
  });

  test('throws email_unverified and changes nothing', async () => {
    await registerAda();

    await assert.rejects(findOrCreateCustomer({ ...google, emailVerified: false }), {
      name: 'FederatedLoginError',
      code: 'email_unverified',
    });
    assert.equal(await countRows('federated_credentials'), 0);
  });

  test('stores empty names when the provider leaves them out', async () => {
    const customer = await findOrCreateCustomer({ ...google, firstName: undefined, lastName: undefined });

    assert.equal(customer.first_name, '');
    assert.equal(customer.last_name, '');
  });
});
