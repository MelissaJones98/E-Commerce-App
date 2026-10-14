// Routes for the logged-in customer's own account, mounted at /account in app.js.
//
// There's no customer id in these URLs (it's /account, not /customers/5).
// Instead, the customer is worked out from their login session: Passport puts
// the logged-in customer on `req.user` for every request (see config/passport.js).
// This means nobody can reach another customer's account by changing a number
// in the URL.

// `import` loads code from other files or packages so this file can use it.
// express: the web framework. We use it here to create a "router".
import express from 'express';
// query(): runs a SQL statement against PostgreSQL (defined in db/index.js).
import { query } from '../db/index.js';
// requireAuth: middleware that sends back 401 if nobody is logged in.
import { requireAuth } from '../middleware/require-auth.js';
// normalizeEmail(): trims spaces and lower-cases an email, e.g.
// " Ada@Example.com " becomes "ada@example.com".
import { normalizeEmail } from '../utils/normalize-email.js';
// Validation functions shared with registration, so both use the same rules.
import { validateNameAndEmail, validatePhone } from '../utils/validate-customer.js';

// A router is a mini-app holding a group of related routes. app.js attaches
// it at /account, so `router.get('/')` below handles GET /account.
const router = express.Router();

// The columns sent back to the client, written once so every query uses the
// same list. password_hash is deliberately NOT included: it must never leave
// the server.
const ACCOUNT_COLUMNS = 'id, first_name, last_name, email, phone';

// PostgreSQL error codes. When a query breaks a database rule, the error
// object `pg` throws has a `code` property saying which rule was broken.
// 23505 = a UNIQUE constraint was broken. Here: the new email already belongs
// to another customer (customers.email is UNIQUE in schema.sql).
const UNIQUE_VIOLATION = '23505';
// 23001 = an ON DELETE RESTRICT rule blocked a delete. Here: the customer has
// orders, and orders.customer_id is ON DELETE RESTRICT in schema.sql.
// (The general foreign key error, 23503, is what the default NO ACTION rule
// raises instead, so it doesn't apply here.)
const RESTRICT_VIOLATION = '23001';

// router.use() runs a middleware before EVERY route in this router.
// So all three routes below require a logged-in customer; anyone else gets a
// 401 response and the route itself never runs.
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /account: return the logged-in customer's details.
// ---------------------------------------------------------------------------
// `async` marks a function that can use `await`. `await` pauses the function
// until a slow operation (like a database query) finishes, then gives back its
// result, without freezing the rest of the server in the meantime.
// `req` (request) holds what the client sent; `res` (response) is how we reply.
router.get('/', async (req, res) => {
  // Look the customer up by the id from their session.
  // `$1` is a placeholder: pg sends `req.user.id` to PostgreSQL separately from
  // the SQL text, so a value can never be run as SQL (this prevents SQL injection).
  const result = await query(`SELECT ${ACCOUNT_COLUMNS} FROM customers WHERE id = $1`, [
    req.user.id,
  ]);

  // `result.rows` is an array of matching rows. There's exactly one customer
  // with this id, so send back the first (and only) row as JSON.
  // res.json() sends a 200 OK response by default.
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// PUT /account: replace the logged-in customer's details.
// ---------------------------------------------------------------------------
// PUT replaces the whole set of details, so the body must include
// first_name, last_name and email. phone is optional, and leaving it out
// clears it. Only these four fields can change: anything else in the body
// (e.g. "id" or "password_hash") is simply never read, so it's ignored.
router.put('/', async (req, res) => {
  // req.body is the parsed JSON body (express.json() in app.js does this).
  // It's undefined if the request had no body at all, so `?? {}` swaps in an
  // empty object instead. `??` means "use the right side if the left side is
  // null or undefined". This stops the validation below from crashing.
  const body = req.body ?? {};

  // Check the name and email first, then the phone.
  // Each validator returns an error message string, or null if everything is
  // fine. `a ?? b` gives `a` if it's an error message, otherwise checks `b`,
  // so validationError ends up as the first problem found, or null.
  const validationError = validateNameAndEmail(body) ?? validatePhone(body.phone);
  if (validationError) {
    // 400 Bad Request: the client sent invalid data. `return` stops the
    // function here, so the database update below never runs.
    return res.status(400).json({ error: validationError });
  }

  // "Destructuring": pull these properties out of `body` into variables of the
  // same name. `phone = null` is a default value, used when body.phone is
  // missing, so leaving phone out stores NULL (clearing it) in the database.
  const { first_name, last_name, phone = null } = body;

  // try/catch: run the code in `try`; if it throws an error, jump to `catch`
  // instead of crashing. We expect one possible error: a duplicate email.
  try {
    // UPDATE changes the existing row. WHERE id = $5 makes sure only the
    // logged-in customer's row is changed. RETURNING sends back the row as it
    // is after the update, so we don't need a separate SELECT.
    // Each $n matches the value at the same position in the array below
    // ($1 = first_name, $2 = last_name, and so on).
    const result = await query(
      `UPDATE customers
       SET first_name = $1, last_name = $2, email = $3, phone = $4
       WHERE id = $5
       RETURNING ${ACCOUNT_COLUMNS}`,
      [first_name, last_name, normalizeEmail(body.email), phone, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    // If the new email belongs to another customer, the database's UNIQUE
    // constraint rejects the update. Turn that into 409 Conflict.
    // (Relying on the constraint, rather than checking with a SELECT first,
    // also stays correct if two requests arrive at the same moment.)
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    // Any other error is unexpected: re-throw it so the error handler in
    // app.js logs it and sends a 500 response.
    throw err;
  }
});

// ---------------------------------------------------------------------------
// DELETE /account: delete the logged-in customer's account and log them out.
// ---------------------------------------------------------------------------
// The customer's saved addresses are deleted automatically by the database
// (addresses.customer_id is ON DELETE CASCADE in schema.sql).
// `next` is a function Express provides for passing an error on to the error
// handler in app.js; it's needed inside the req.logout() callback below.
router.delete('/', async (req, res, next) => {
  try {
    await query('DELETE FROM customers WHERE id = $1', [req.user.id]);
  } catch (err) {
    // Customers with orders can't be deleted: the database blocks it so that
    // order history stays intact. Turn that into 409 Conflict.
    if (err.code === RESTRICT_VIOLATION) {
      return res.status(409).json({
        error: 'Accounts with order history cannot be deleted',
      });
    }
    throw err;
  }

  // The account is gone, so end the login session too.
  // req.logout() is added by Passport. It takes a "callback": a function it
  // calls once it has finished, passing an error if something went wrong.
  req.logout((err) => {
    // If logging out failed, hand the error to app.js's error handler.
    if (err) return next(err);
    // 204 No Content: success, with nothing to send back.
    res.sendStatus(204);
  });
});

// Make the router available to app.js, which imports it and mounts it at /account.
export default router;
