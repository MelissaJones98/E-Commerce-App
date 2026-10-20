// Tests for the Google and Facebook sign-in routes when they are NOT set up.
// .env.test sets every provider key to an empty value, so in this file both
// providers are off, whatever keys back-end/.env has.
// (auth.providers-on.test.js tests them switched on, with fake keys.)

// node:test is Node's built-in test runner.
import { describe, test, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';

import app from '../app.js';
// pool: closed at the end, so the test process can exit.
import pool from '../db/index.js';

after(() => pool.end());

describe('sign-in providers switched off', () => {
  test('GET /auth/providers reports both providers off', async () => {
    const res = await request(app).get('/auth/providers');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { google: false, facebook: false });
  });

  test('the Google routes reply 404 JSON when Google is not set up', async () => {
    // `for...of` runs the same checks on both addresses.
    for (const url of ['/auth/google', '/auth/google/callback']) {
      const res = await request(app).get(url);

      assert.equal(res.status, 404, url);
      assert.equal(res.body.error, 'Google sign-in is not set up', url);
    }
  });

  test('the Facebook routes reply 404 JSON when Facebook is not set up', async () => {
    for (const url of ['/auth/facebook', '/auth/facebook/callback']) {
      const res = await request(app).get(url);

      assert.equal(res.status, 404, url);
      assert.equal(res.body.error, 'Facebook sign-in is not set up', url);
    }
  });
});
