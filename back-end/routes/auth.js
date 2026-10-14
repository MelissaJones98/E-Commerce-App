// Routes for creating an account, logging in and logging out.
// app.js mounts this router at /auth, so router.post('/register') below
// handles POST /auth/register.

// express: the web framework, used here to create a router.
import express from 'express';
// bcrypt: turns passwords into one-way "hashes" that are safe to store.
import bcrypt from 'bcrypt';
// query(): runs SQL against PostgreSQL (see db/index.js).
import { query } from '../db/index.js';
// Passport, configured with our login check (see config/passport.js).
import passport from '../config/passport.js';
// requireAuth: middleware that sends 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';
// normalizeEmail(): trims and lower-cases an email so " Ada@X.com " = "ada@x.com".
import { normalizeEmail } from '../utils/normalize-email.js';
// Validation rules shared with PUT /account (see utils/validate-customer.js).
import { isNonEmptyString, validateNameAndEmail } from '../utils/validate-customer.js';

// A router is a mini-app holding a group of related routes.
const router = express.Router();

// How much work bcrypt does when hashing a password. Each +1 doubles the time
// taken. Slow hashing is deliberate: it makes guessing passwords from stolen
// hashes far slower for an attacker. 12 takes roughly 0.25 seconds.
const SALT_ROUNDS = 12;

// PostgreSQL's error code for breaking a UNIQUE constraint. Here: registering
// with an email that's already in customers.email (which is UNIQUE).
const UNIQUE_VIOLATION = '23505';

// Checks the registration details sent by the client.
// Returns a string describing the first problem found, or null if all is valid.
const validateRegistration = (details) => {
  // Check first_name, last_name and email using the shared rules.
  // If there's a problem, return its message straight away.
  const nameOrEmailError = validateNameAndEmail(details);
  if (nameOrEmailError) return nameOrEmailError;

  // "Destructuring": pull the password property out into its own variable.
  const { password } = details;
  if (typeof password !== 'string') return 'password is required';
  if (password.length < 8) return 'password must be at least 8 characters';
  // bcrypt only uses the first 72 BYTES of a password and silently ignores the
  // rest, so a longer password would only be partly checked. Some characters,
  // like "é", take 2 or more bytes, so measure bytes rather than characters.
  // Buffer.byteLength(text, 'utf8') counts the bytes in the text.
  if (Buffer.byteLength(password, 'utf8') > 72) return 'password is too long';

  return null;
};

// ---------------------------------------------------------------------------
// POST /auth/register: create a new customer account.
// ---------------------------------------------------------------------------
// `async` lets this function use `await` to wait for slow operations
// (hashing, database queries) without blocking other requests.
router.post('/register', async (req, res) => {
  // req.body is the parsed JSON body. It's undefined if the request had no
  // body at all, so `?? {}` substitutes an empty object (`??` means "use the
  // right side if the left side is null or undefined").
  const validationError = validateRegistration(req.body ?? {});
  if (validationError) {
    // 400 Bad Request. `return` stops the function so nothing below runs.
    return res.status(400).json({ error: validationError });
  }

  // Pull the fields we need out of the body.
  const { first_name, last_name, password } = req.body;

  // Store the email in one standard form, so differently-typed versions of
  // the same address count as the same account.
  const email = normalizeEmail(req.body.email);

  // Never store the password itself, only a one-way hash of it. bcrypt.hash()
  // also mixes in a random "salt", so two customers with the same password get
  // different hashes. bcrypt.compare() can later check a password against it.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    // INSERT adds a new row. $1–$4 are placeholders, filled in safely from the
    // array below in order. RETURNING sends back the new row's details,
    // including the id the database generated, without a separate SELECT.
    // password_hash is deliberately left out of RETURNING.
    const result = await query(
      `INSERT INTO customers (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email`,
      [first_name, last_name, email, passwordHash]
    );
    // 201 Created: a new resource was made. Send back the new customer.
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // If the email is already registered, the database's UNIQUE constraint
    // rejects the INSERT. We rely on that rather than checking first with a
    // SELECT: if two identical requests arrive at the same moment, both could
    // pass a SELECT check, but only one can pass the constraint.
    if (err.code === UNIQUE_VIOLATION) {
      // 409 Conflict: clashes with existing data.
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    // Any other error is unexpected: re-throw it so app.js's error handler
    // logs it and sends a 500.
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /auth/login: log in with email and password.
// ---------------------------------------------------------------------------
// `next` is provided by Express; calling next(err) passes an error on to the
// error handler in app.js.
router.post('/login', (req, res, next) => {
  // Check both fields were sent as non-empty strings before doing any work.
  const { email, password } = req.body ?? {};
  // `||` means "or": if EITHER check fails, reply 400.
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Run the "local" strategy set up in config/passport.js, which looks the
  // customer up and checks their password.
  // passport.authenticate() returns a middleware function; the `(req, res, next)`
  // on the last line calls it straight away with this request.
  // The callback we pass, `(err, customer) => {...}`, receives the result.
  // Using a callback lets us reply with JSON, instead of Passport's default
  // behaviour of redirecting to another page.
  passport.authenticate('local', (err, customer) => {
    // Something went wrong (e.g. the database is down): pass it to app.js.
    if (err) return next(err);
    // `customer` is false if the email or password was wrong. Use one message
    // for both cases, so the response never reveals which emails are registered.
    if (!customer) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    // req.login() saves the customer in the session, which logs them in.
    // From now on the browser's session cookie identifies them.
    // Passport also gives the session a brand-new ID at this point, so any
    // session ID an attacker planted in the browser before login becomes
    // useless (an attack called "session fixation").
    req.login(customer, (err) => {
      if (err) return next(err);
      // 200 OK (the default) with the customer's details.
      res.json(customer);
    });
  })(req, res, next);
});

// ---------------------------------------------------------------------------
// POST /auth/logout: end the logged-in customer's session.
// ---------------------------------------------------------------------------
// requireAuth runs first: if nobody is logged in, it sends 401 and this
// route's function never runs.
router.post('/logout', requireAuth, (req, res, next) => {
  // req.logout() (added by Passport) removes the customer from the session.
  // It calls the function we pass once it's finished.
  req.logout((err) => {
    if (err) return next(err);
    // 204 No Content: success, with nothing to send back.
    res.sendStatus(204);
  });
});

// Make the router available to app.js.
export default router;
