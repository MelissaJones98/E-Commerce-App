// Tests for the Google and Facebook sign-in routes when they ARE set up.
// Fake keys are used, so nothing here ever contacts Google or Facebook: the
// tests check where we send the browser, and how we handle what comes back.
//
// Each test file runs in its own Node process, so the fake keys set below
// can't leak into any other test file.

// node:test is Node's built-in test runner.
import { describe, test, beforeEach, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';
// pool doesn't read the provider keys, so it can be imported normally.
import pool from '../db/index.js';

// Fake keys, set BEFORE the app is loaded: config/passport.js reads them once,
// when it's first imported.
process.env.GOOGLE_CLIENT_ID = 'fake-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'fake-google-secret';
process.env.FACEBOOK_APP_ID = 'fake-facebook-id';
process.env.FACEBOOK_APP_SECRET = 'fake-facebook-secret';
process.env.OAUTH_CALLBACK_BASE_URL = 'http://localhost:3001';

// A normal `import` at the top of the file would run BEFORE the lines above
// (imports are always loaded first), and so would see no keys. `await
// import(...)` ("dynamic import") loads the file here, after the keys are set.
// helpers.js imports app.js too, so it must also be loaded this way.
// `{ default: app }` takes the file's default export and names it app.
const { default: app } = await import('../app.js');
const { resetTables } = await import('./helpers.js');
// `default: passport` is the configured Passport itself (one test swaps a strategy).
const { default: passport, verifyGoogle, verifyFacebook } = await import('../config/passport.js');

after(() => pool.end());

// Reads the redirect from a response. `new URL(...)` splits an address into
// parts: url.hostname, url.pathname, and url.searchParams (the ?a=b values).
const redirectTarget = (res) => new URL(res.headers.location);

// Calls a verify function the way Passport would, and waits for its answer.
// Verify functions report through a callback, done(err, customer, info);
// this wraps that in a Promise so the tests can `await` it.
const runVerify = (verify, profile) =>
  new Promise((resolve) => {
    verify('fake-access-token', 'fake-refresh-token', profile, (err, customer, info) =>
      resolve({ err, customer, info })
    );
  });

describe('sign-in providers switched on', () => {
  test('GET /auth/providers reports both on', async () => {
    const res = await request(app).get('/auth/providers');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { google: true, facebook: true });
  });

  test('GET /auth/google redirects to Google with our client id, callback URL, scopes and a state value', async () => {
    const res = await request(app).get('/auth/google');

    // 302 Found: "go to this other address instead" (in the Location header).
    assert.equal(res.status, 302);
    const target = redirectTarget(res);
    assert.equal(target.hostname, 'accounts.google.com');
    assert.equal(target.searchParams.get('client_id'), 'fake-google-id');
    assert.equal(target.searchParams.get('redirect_uri'), 'http://localhost:3001/auth/google/callback');
    assert.match(target.searchParams.get('scope'), /email/);
    // state: a random value Google must send back, which protects against
    // forged sign-in responses. `?? ''` handles it being missing entirely.
    assert.ok((target.searchParams.get('state') ?? '').length > 0, 'state is missing');
  });

  test('GET /auth/facebook redirects to Facebook', async () => {
    const res = await request(app).get('/auth/facebook');

    assert.equal(res.status, 302);
    const target = redirectTarget(res);
    assert.equal(target.hostname, 'www.facebook.com');
    assert.match(target.pathname, /\/dialog\/oauth$/);
    assert.equal(target.searchParams.get('client_id'), 'fake-facebook-id');
    assert.equal(target.searchParams.get('redirect_uri'), 'http://localhost:3001/auth/facebook/callback');
    assert.match(target.searchParams.get('scope'), /email/);
    assert.ok((target.searchParams.get('state') ?? '').length > 0, 'state is missing');
  });

  test('cancelling at Google sends you back to the login page', async () => {
    // When someone clicks "Cancel" at Google, Google sends the browser back
    // with ?error=access_denied.
    const res = await request(app).get('/auth/google/callback?error=access_denied');

    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?error=cancelled&provider=google');
  });

  test('cancelling at Facebook sends you back to the login page', async () => {
    const res = await request(app).get('/auth/facebook/callback?error=access_denied');

    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?error=cancelled&provider=facebook');
  });

  test('if logging in fails after Google approves, the browser still goes back to the login page', async () => {
    // Swap the real Google strategy for a fake one that says "Google approved this person"
    // without contacting Google. The customer it returns has no id, so saving it in the session
    // (req.login) fails: the rare case being tested.
    // passport._strategy(name) returns a registered strategy, so it can be put back afterwards.
    const realGoogle = passport._strategy('google');
    // A strategy only needs an authenticate() method; Passport adds this.success() and friends.
    passport.use('google', { authenticate() { this.success({ email: 'no-id@example.com' }); } });

    try {
      const res = await request(app).get('/auth/google/callback?code=fake-code');

      // A redirect the browser can follow, not a JSON error page.
      assert.equal(res.status, 302);
      assert.equal(res.headers.location, '/login?error=failed&provider=google');
    } finally {
      // `finally` runs whether the checks passed or failed, so the real strategy always returns.
      passport.use('google', realGoogle);
    }
  });
});

// The verify functions turn a provider's profile into one of our customers.
// They're called with made-up profiles shaped like the real ones.
describe('verify functions', () => {
  beforeEach(resetTables);

  // A profile shaped like the one passport-google-oauth20 builds.
  const googleProfile = {
    id: 'g-1',
    emails: [{ value: 'ada@example.com', verified: true }],
    name: { givenName: 'Ada', familyName: 'Lovelace' },
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

  test('verifyGoogle signs in a verified Google user', async () => {
    const { err, customer } = await runVerify(verifyGoogle, googleProfile);

    assert.equal(err, null);
    assert.equal(customer.email, 'ada@example.com');
  });

  test('verifyGoogle refuses an unverified email, with the email_unverified code', async () => {
    await registerAda();
    const unverified = { ...googleProfile, emails: [{ value: 'ada@example.com', verified: false }] };

    const result = await runVerify(verifyGoogle, unverified);

    // deepEqual: no error, no customer (false), and the reason in `info`.
    assert.deepEqual(result, { err: null, customer: false, info: { code: 'email_unverified' } });
  });

  test('verifyFacebook refuses a profile with no email, with the no_email code', async () => {
    const result = await runVerify(verifyFacebook, { id: 'f-1', name: { givenName: 'Ada', familyName: 'Lovelace' } });

    assert.deepEqual(result, { err: null, customer: false, info: { code: 'no_email' } });
  });

  test('verifyFacebook trusts the email (Facebook sends no verified flag) and links to Ada', async () => {
    const adaId = await registerAda();

    const { err, customer } = await runVerify(verifyFacebook, {
      id: 'f-1',
      emails: [{ value: 'ada@example.com' }],
      name: { givenName: 'Ada', familyName: 'Lovelace' },
    });

    assert.equal(err, null);
    assert.equal(customer.id, adaId);
  });
});
