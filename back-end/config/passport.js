// Configures Passport.js: how to check a login, and how to remember the
// logged-in customer between requests.
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { query } from '../db/index.js';
import { normalizeEmail } from '../utils/normalize-email.js';

// The "local" strategy logs in with credentials stored in our own database
// (as opposed to e.g. Google). By default it reads req.body.username, so we
// tell it to use the email field instead.
passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const result = await query(
        'SELECT id, first_name, last_name, email, password_hash FROM customers WHERE email = $1',
        [normalizeEmail(email)]
      );
      const customer = result.rows[0];

      // Wrong email and wrong password both return `false` with no detail,
      // so the response can't reveal which emails are registered.
      if (!customer) return done(null, false);

      const passwordMatches = await bcrypt.compare(password, customer.password_hash);
      if (!passwordMatches) return done(null, false);

      // Remove the hash so it can't accidentally be sent in a response.
      const { password_hash, ...safeCustomer } = customer;
      return done(null, safeCustomer);
    } catch (err) {
      return done(err);
    }
  })
);

// After login, store only the customer's id in the session (not the whole
// customer), keeping the session small and never holding stale details.
passport.serializeUser((customer, done) => done(null, customer.id));

// On every later request, look the customer up from the id in the session.
// The result becomes req.user.
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query(
      'SELECT id, first_name, last_name, email FROM customers WHERE id = $1',
      [id]
    );
    // If the account has since been deleted, treat the session as logged out.
    done(null, result.rows[0] ?? false);
  } catch (err) {
    done(err);
  }
});

export default passport;
