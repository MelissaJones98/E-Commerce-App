// Configures Passport.js, the library that handles logging in. It answers
// three questions:
//   1. How do we check a login attempt?            (the LocalStrategy below)
//   2. What do we store in the session after login? (serializeUser)
//   3. How do we get the customer back from the session on later requests?
//      (deserializeUser)
// app.js and routes/auth.js import the configured `passport` from this file.

// The Passport library itself.
import passport from 'passport';
// passport-local provides the "local" strategy: logging in with an email and
// password stored in our own database (as opposed to e.g. "Sign in with Google").
// `{ Strategy as LocalStrategy }` imports the export named Strategy and calls
// it LocalStrategy in this file, which reads more clearly.
import { Strategy as LocalStrategy } from 'passport-local';
// bcryptjs (pure-JavaScript bcrypt): used here to check a password against its
// stored hash. Imported under the name `bcrypt`.
import bcrypt from 'bcryptjs';
// query(): runs SQL against PostgreSQL (see db/index.js).
import { query } from '../db/index.js';
// normalizeEmail(): trims and lower-cases an email, the same way registration does.
import { normalizeEmail } from '../utils/normalize-email.js';

// ---------------------------------------------------------------------------
// 1. Checking a login attempt
// ---------------------------------------------------------------------------
// passport.use() registers a strategy. When routes/auth.js calls
// passport.authenticate('local', ...), Passport runs this one.
//
// By default the local strategy reads req.body.username, so
// `{ usernameField: 'email' }` tells it to read req.body.email instead.
//
// The function we give it receives the email and password from the request,
// and `done`: a callback we must call exactly once with the outcome:
//   done(null, customer)  login succeeded; `null` means "no error"
//   done(null, false)     wrong email or password
//   done(err)             something went wrong, e.g. the database is down
passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      // Look the customer up by email. Emails are stored normalised (trimmed
      // and lower-case), so normalise the login email the same way to match.
      // password_hash is needed here to check the password.
      const result = await query(
        'SELECT id, first_name, last_name, email, password_hash FROM customers WHERE email = $1',
        [normalizeEmail(email)]
      );
      // The first matching row, or undefined if no customer has this email.
      const customer = result.rows[0];

      // No such email: fail. A wrong email and a wrong password both fail
      // in the same way, with no detail, so the response can't reveal which
      // emails are registered.
      if (!customer) return done(null, false);

      // bcrypt.compare() hashes the password that was sent, using the same salt
      // stored inside the saved hash, and checks whether the results match.
      // It returns true or false. (A hash can't be "decrypted" back into the password.)
      const passwordMatches = await bcrypt.compare(password, customer.password_hash);
      if (!passwordMatches) return done(null, false);

      // Login succeeded. This destructuring pulls password_hash out, and puts
      // every OTHER property into a new object called safeCustomer. The hash is
      // then not in the object we pass on, so it can't be sent in a response by mistake.
      const { password_hash, ...safeCustomer } = customer;
      return done(null, safeCustomer);
    } catch (err) {
      // An unexpected error (e.g. the database query failed).
      return done(err);
    }
  })
);

// ---------------------------------------------------------------------------
// 2. What to store in the session after login
// ---------------------------------------------------------------------------
// Called by req.login() in routes/auth.js. Store only the customer's id in
// the session, not the whole customer: it keeps the session small, and the
// session never holds out-of-date details (e.g. after a name change).
passport.serializeUser((customer, done) => done(null, customer.id));

// ---------------------------------------------------------------------------
// 3. Getting the customer back on later requests
// ---------------------------------------------------------------------------
// On every request with a session (see passport.session() in app.js),
// Passport passes the stored id to this function. Whatever we pass to done()
// becomes req.user for that request.
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query(
      'SELECT id, first_name, last_name, email FROM customers WHERE id = $1',
      [id]
    );
    // If the account no longer exists (e.g. it was deleted with
    // DELETE /account), result.rows[0] is undefined. `?? false` turns that
    // into false, which tells Passport to treat the session as logged out.
    done(null, result.rows[0] ?? false);
  } catch (err) {
    done(err);
  }
});

// Export the configured passport so app.js and routes/auth.js use this setup.
export default passport;
