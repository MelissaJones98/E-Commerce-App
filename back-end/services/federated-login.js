// The rules for signing in with Google or Facebook ("federated" login: another
// service vouches for who the person is). config/passport.js calls
// findOrCreateCustomer() once Google or Facebook has confirmed the person.
//
// Kept apart from Passport so the rules can be tested directly against the
// test database, without contacting Google or Facebook.

// pool: the database connection pool. A transaction needs all of its queries
// on ONE connection, so this file borrows one with pool.connect().
import pool from '../db/index.js';
// normalizeEmail(): trims and lower-cases an email, the same way registration does.
import { normalizeEmail } from '../utils/normalize-email.js';

// The columns we return. password_hash is deliberately left out, so it can
// never end up in a session or a response.
const CUSTOMER_COLUMNS = 'id, first_name, last_name, email';

// An error for a sign-in we refuse on purpose (not a bug). `extends Error`
// makes it a kind of Error. Its `code` says why:
//   'no_email'          the provider didn't share an email address
//   'email_unverified'  the provider hasn't confirmed the person owns the email
// The routes turn the code into a message on the login page.
export class FederatedLoginError extends Error {
  // A constructor runs when you write `new FederatedLoginError('no_email')`.
  constructor(code) {
    // super(...) runs Error's own constructor, which sets the message.
    super(`Federated sign-in refused: ${code}`);
    // `this` is the new error object. The name shows in logs, and the tests
    // check it.
    this.name = 'FederatedLoginError';
    this.code = code;
  }
}

// Finds (or creates) the customer for a Google or Facebook sign-in.
//   provider       'google' or 'facebook'
//   subject        the provider's id for this person (never changes)
//   email          their email, or undefined if the provider didn't share one
//   emailVerified  true if the provider confirmed they own that email
//   firstName, lastName   their name, either of which may be undefined
// The `{ ... }` in the parameters is destructuring: the function is called with
// one object, and this unpacks its properties into variables.
// Returns { id, first_name, last_name, email }.
export async function findOrCreateCustomer({ provider, subject, email, emailVerified, firstName, lastName }) {
  // 1. Already linked? Look up the link by provider + subject, and JOIN
  //    (combine) it with the matching customer row. This works even if the
  //    customer changed their email here since linking.
  //    `c.` and `fc.` are short names ("aliases") for the two tables.
  const linked = await pool.query(
    `SELECT c.id, c.first_name, c.last_name, c.email
       FROM federated_credentials fc
       JOIN customers c ON c.id = fc.customer_id
      WHERE fc.provider = $1 AND fc.subject = $2`,
    [provider, subject]
  );
  if (linked.rows[0]) return linked.rows[0];

  // 2. Not linked yet, so we need an email to find or create the account.
  //    `?.` stops safely if email is undefined; `!` turns "" into true too.
  if (!email?.trim()) throw new FederatedLoginError('no_email');

  // 3. Only trust the email if the provider has confirmed the person owns it.
  //    Otherwise someone could claim another person's email and get into
  //    their account here.
  if (!emailVerified) throw new FederatedLoginError('email_unverified');

  // 4. Find the customer by email, or create one, then add the link. Done in
  //    one transaction, so we never end up with a customer but no link.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE email = $1`,
      [normalizeEmail(email)]
    );
    // `let` because it may be replaced by the newly created customer below.
    let customer = existing.rows[0];

    if (!customer) {
      // A new customer with no password (password_hash is left out, so it's
      // NULL). `?? ''` uses an empty string when the provider didn't send a
      // name part; the customer can fill it in later on their account page.
      const created = await client.query(
        `INSERT INTO customers (first_name, last_name, email)
         VALUES ($1, $2, $3)
         RETURNING ${CUSTOMER_COLUMNS}`,
        [firstName ?? '', lastName ?? '', normalizeEmail(email)]
      );
      customer = created.rows[0];
    }

    // Remember the link, so next time step 1 finds them straight away.
    await client.query(
      'INSERT INTO federated_credentials (customer_id, provider, subject) VALUES ($1, $2, $3)',
      [customer.id, provider, subject]
    );

    // COMMIT makes both changes permanent, together.
    await client.query('COMMIT');
    return customer;
  } catch (err) {
    // Something failed part-way: undo everything, then pass the error on.
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Always give the connection back to the pool, success or failure.
    client.release();
  }
}
