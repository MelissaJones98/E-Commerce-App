// Configures Passport.js, the library that handles logging in. It answers
// these questions:
//   1. How do we check a login attempt?            (the LocalStrategy below)
//   1b. How do we sign someone in with Google or Facebook? (the Google and
//       Facebook strategies below)
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
// The "Sign in with Google" and "Sign in with Facebook" strategies. Both use
// OAuth 2.0, the standard way to let another service confirm who someone is.
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
// The rules for turning a Google or Facebook person into one of our customers.
import { findOrCreateCustomer, FederatedLoginError } from '../services/federated-login.js';
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

      // No password (NULL): this customer only signs in with Google or
      // Facebook. Fail exactly like a wrong password. This check must come
      // before bcrypt.compare(), which throws an error (a 500) when the hash
      // isn't a string.
      if (customer.password_hash === null) return done(null, false);

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
// 1b. Signing in with Google or Facebook
// ---------------------------------------------------------------------------
// How it works (the OAuth "redirect dance"):
//   1. The customer clicks "Sign in with Google". GET /auth/google sends their
//      browser to Google, with our client id and the address to come back to.
//   2. They log in at Google and agree to share their name and email.
//   3. Google sends the browser back to GET /auth/google/callback with a
//      one-time code. Passport swaps that code (plus our secret) for the
//      person's profile, directly with Google.
//   4. Passport calls our "verify" function below with that profile, and we
//      find or create the matching customer.
//
// Each provider is switched on only if both its keys are set in back-end/.env.
// An empty value counts as "not set": .env.test uses empty values so the
// tests never pick up real keys.

// True if every value given is a non-empty string.
// `...values` ("rest parameter") collects all the arguments into an array.
const allSet = (...values) => values.every((value) => typeof value === 'string' && value !== '');

// Which providers are switched on. routes/auth.js uses this for
// GET /auth/providers and to reply 404 when a provider is off.
export const enabledProviders = {
  google: allSet(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
  facebook: allSet(process.env.FACEBOOK_APP_ID, process.env.FACEBOOK_APP_SECRET),
};

// The start of the address Google and Facebook send the browser back to. In
// development that's the React app on port 3001, whose proxy passes the
// request on to this API (see front-end/src/setupProxy.js). `||` uses the
// default when the variable is unset or empty.
const callbackBase = process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:3001';

// Shared by both verify functions: runs the sign-in rules and reports the
// outcome to Passport through `done`:
//   done(null, customer)              signed in
//   done(null, false, { code })       refused on purpose (no email, or not
//                                     verified); the route shows a message
//   done(err)                         something unexpected went wrong
const signIn = async (details, done) => {
  try {
    done(null, await findOrCreateCustomer(details));
  } catch (err) {
    // `instanceof` checks which kind of error it is.
    if (err instanceof FederatedLoginError) return done(null, false, { code: err.code });
    done(err);
  }
};

// Called by Passport after Google confirms who the person is. accessToken and
// refreshToken would let us call Google's APIs for them; we don't need to.
// `profile` is what Google told us about them. `?.` stops safely (giving
// undefined) if a part is missing, e.g. no emails at all.
export function verifyGoogle(accessToken, refreshToken, profile, done) {
  return signIn(
    {
      provider: 'google',
      subject: profile.id,
      email: profile.emails?.[0]?.value,
      // Google tells us whether it has confirmed the person owns the email.
      emailVerified: profile.emails?.[0]?.verified === true,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
    },
    done
  );
}

// The same for Facebook. Facebook doesn't send a "verified" flag, but it only
// shares an email address its user has confirmed, so any email it sends is
// treated as verified.
export function verifyFacebook(accessToken, refreshToken, profile, done) {
  const email = profile.emails?.[0]?.value;
  return signIn(
    {
      provider: 'facebook',
      subject: profile.id,
      email,
      emailVerified: Boolean(email),
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
    },
    done
  );
}

// Register each strategy only if its keys are set, so the app still starts
// (with that provider off) for anyone without keys.
if (enabledProviders.google) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Must match an "Authorised redirect URI" in the Google Cloud Console exactly.
        callbackURL: `${callbackBase}/auth/google/callback`,
        // state: Passport sends Google a random value, keeps a copy in the
        // session, and checks Google sends the same value back. That stops
        // another website pushing a forged sign-in response onto the customer.
        state: true,
      },
      verifyGoogle
    )
  );
}

if (enabledProviders.facebook) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        // Must match a "Valid OAuth Redirect URI" in the Meta app settings exactly.
        callbackURL: `${callbackBase}/auth/facebook/callback`,
        // Ask Facebook for these profile fields (it sends only the id by default).
        profileFields: ['id', 'emails', 'name'],
        state: true,
      },
      verifyFacebook
    )
  );
}

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
