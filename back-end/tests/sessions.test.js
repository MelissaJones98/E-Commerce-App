// Tests for login sessions: where they're stored, how long they last, GET /auth/me, and what
// logging out does to them.
// Run with: npm test (from the back-end folder). Uses the ecommerce_test database.
//
// A "session" is the server's memory of who you are. The browser holds only a cookie
// (connect.sid) with the session's id; the session itself lives in the `session` table.

// node:test is Node's built-in test runner.
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';

import app from '../app.js';
// pool: the database connection pool, used to look at (and change) the stored sessions.
import pool from '../db/index.js';
import { resetTables } from './helpers.js';

// 7 days in milliseconds: 7 days × 24 hours × 60 minutes × 60 seconds × 1000 ms.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Registers Ada with an agent (which keeps cookies, like a browser). Registering also logs
// her in. Returns the agent and the registration response.
const registerAda = async () => {
  const agent = request.agent(app);
  const res = await agent.post('/auth/register').send({
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery',
  });
  return { agent, res };
};

// The session cookie's line from a response's Set-Cookie headers, e.g.
// "connect.sid=s%3A...; Path=/; Expires=Tue, 27 Oct 2026 10:00:00 GMT; HttpOnly; SameSite=Lax".
// .find() returns the first header that starts with "connect.sid=" (or undefined).
const sessionCookie = (res) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('connect.sid='));

// Reads the "Expires=..." date out of a cookie line and returns it as a Date.
// The regular expression /Expires=([^;]+)/i captures everything after "Expires=" up to the next ";".
const expiresOf = (cookie) => new Date(cookie.match(/Expires=([^;]+)/i)[1]);

// How many sessions are stored.
const countSessions = async () => (await pool.query('SELECT count(*)::int AS n FROM session')).rows[0].n;

after(() => pool.end());

describe('sessions', () => {
  // Every test starts with empty tables, including no stored sessions.
  beforeEach(resetTables);

  test('GET /auth/me says nobody is logged in, with 200', async () => {
    const res = await request(app).get('/auth/me');

    // 200, not 401: "nobody" is a normal answer to "who's logged in?", not an error.
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { customer: null });
  });

  test('GET /auth/me returns the logged-in customer, and only these four fields', async () => {
    const { agent, res: registered } = await registerAda();

    const res = await agent.get('/auth/me');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      customer: {
        id: registered.body.id,
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      },
    });
  });

  test('the session is stored in the session table', async () => {
    const { res: registered } = await registerAda();

    const result = await pool.query('SELECT sess FROM session');

    assert.equal(result.rows.length, 1);
    // sess is the session's data. Passport keeps the logged-in customer's id at sess.passport.user.
    assert.equal(result.rows[0].sess.passport.user, registered.body.id);
  });

  test('deleting the stored session logs the customer out', async () => {
    // This proves the login lives in the database, not in the server's memory. That's what makes
    // restarting the API harmless: the next server reads the same table.
    const { agent } = await registerAda();
    await pool.query('DELETE FROM session');

    const res = await agent.get('/auth/me');

    assert.deepEqual(res.body, { customer: null });
  });

  test('the cookie lasts 7 days, and is HttpOnly and SameSite=Lax', async () => {
    const { res } = await registerAda();
    const cookie = sessionCookie(res);

    // Within a minute of "now + 7 days" (the request itself takes a moment).
    const difference = Math.abs(expiresOf(cookie).getTime() - (Date.now() + SEVEN_DAYS_MS));
    assert.ok(difference < 60_000, `Expires is ${difference} ms away from 7 days ahead`);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  test('each visit pushes the expiry back (rolling)', async () => {
    const { agent } = await registerAda();
    // Pretend the session was due to expire in 1 day.
    await pool.query("UPDATE session SET expire = now() + interval '1 day'");

    const res = await agent.get('/auth/me');

    // The visit sent a fresh cookie that expires 7 days from now...
    const difference = Math.abs(expiresOf(sessionCookie(res)).getTime() - (Date.now() + SEVEN_DAYS_MS));
    assert.ok(difference < 60_000, 'the cookie was not renewed for 7 days');
    // ...and the stored session's expiry moved forward too (more than 6 days away now).
    const stored = await pool.query("SELECT expire > now() + interval '6 days' AS renewed FROM session");
    assert.equal(stored.rows[0].renewed, true);
  });

  test('an expired session counts as logged out', async () => {
    const { agent } = await registerAda();
    // Pretend the 7 days ran out a minute ago.
    await pool.query("UPDATE session SET expire = now() - interval '1 minute'");

    assert.deepEqual((await agent.get('/auth/me')).body, { customer: null });
    assert.equal((await agent.get('/account')).status, 401);
  });

  test('logging out deletes the stored session and clears the cookie', async () => {
    const { agent } = await registerAda();
    assert.equal(await countSessions(), 1);

    const res = await agent.post('/auth/logout');

    assert.equal(res.status, 204);
    assert.equal(await countSessions(), 0);
    // "Clearing" a cookie means sending it again with an empty value and a date in the past
    // (1 January 1970), which makes the browser delete it.
    const cookie = sessionCookie(res);
    assert.match(cookie, /^connect\.sid=;/);
    assert.match(cookie, /1970/);
  });

  test('the old cookie no longer works after logging out', async () => {
    const { agent, res: registered } = await registerAda();
    // Keep a copy of the cookie, as someone who'd copied it might.
    const oldCookie = sessionCookie(registered).split(';')[0];
    await agent.post('/auth/logout');

    // A brand-new request carrying the old cookie by hand.
    const me = await request(app).get('/auth/me').set('Cookie', oldCookie);
    const account = await request(app).get('/account').set('Cookie', oldCookie);

    assert.deepEqual(me.body, { customer: null });
    assert.equal(account.status, 401);
  });
});
