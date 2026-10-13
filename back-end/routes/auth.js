// Routes for creating accounts and logging in, mounted at /auth in app.js.
import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/index.js';
import passport from '../config/passport.js';
import { requireAuth } from '../middleware/require-auth.js';
import { normalizeEmail } from '../utils/normalize-email.js';

const router = express.Router();

// How much work bcrypt does when hashing. Each +1 doubles the time taken,
// which makes stolen hashes slower to crack. 12 takes roughly 0.25s.
const SALT_ROUNDS = 12;

// PostgreSQL's error code for breaking a UNIQUE constraint.
const UNIQUE_VIOLATION = '23505';

// A deliberately simple email check: something@something.something, no spaces.
// Fully validating email addresses is notoriously complex; the real test is
// whether the address receives mail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// Checks the registration details. Returns an error message describing the
// first problem found, or null if everything is valid.
const validateRegistration = ({ first_name, last_name, email, password }) => {
  if (!isNonEmptyString(first_name)) return 'first_name is required';
  if (first_name.length > 100) return 'first_name must be 100 characters or fewer';

  if (!isNonEmptyString(last_name)) return 'last_name is required';
  if (last_name.length > 100) return 'last_name must be 100 characters or fewer';

  if (!isNonEmptyString(email)) return 'email is required';
  // Limits match the column sizes in schema.sql (varchar(255)).
  if (email.trim().length > 255) return 'email must be 255 characters or fewer';
  if (!EMAIL_PATTERN.test(email.trim())) return 'email must be a valid email address';

  if (typeof password !== 'string') return 'password is required';
  if (password.length < 8) return 'password must be at least 8 characters';
  // bcrypt only uses the first 72 bytes of a password and silently ignores
  // the rest. Characters like "é" take more than one byte, so count bytes.
  if (Buffer.byteLength(password, 'utf8') > 72) return 'password is too long';

  return null;
};

// POST /auth/register: create a new customer account.
router.post('/register', async (req, res) => {
  // req.body is undefined if the request had no body at all.
  const validationError = validateRegistration(req.body ?? {});
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { first_name, last_name, password } = req.body;

  const email = normalizeEmail(req.body.email);

  // Never store the password itself, only a one-way hash of it.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const result = await query(
      `INSERT INTO customers (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email`,
      [first_name, last_name, email, passwordHash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Rely on the database's UNIQUE constraint rather than checking first
    // with a SELECT: if two requests arrive at once, both could pass a
    // SELECT check, but only one can pass the constraint.
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw err;
  }
});

// POST /auth/login: log in with email and password.
router.post('/login', (req, res, next) => {
  const { email, password } = req.body ?? {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Run the local strategy from config/passport.js. Passing a callback lets
  // us send JSON responses instead of Passport's default redirects.
  passport.authenticate('local', (err, customer) => {
    if (err) return next(err);
    if (!customer) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    // req.login() stores the customer in the session. Passport also gives
    // the session a new ID at this point, so an ID an attacker planted in
    // the browser before login is useless afterwards ("session fixation").
    req.login(customer, (err) => {
      if (err) return next(err);
      res.json(customer);
    });
  })(req, res, next);
});

// POST /auth/logout: end the logged-in customer's session.
router.post('/logout', requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.sendStatus(204);
  });
});

export default router;
