// Sets up the connection to PostgreSQL. Every other file that talks to the
// database imports `query` (or `pool`) from here.

// `pg` is the PostgreSQL client library for Node.js.
import pg from 'pg';

// A pool keeps a set of open database connections and lends one out each time
// a query runs, instead of opening a brand-new connection for every request
// (which is slow). `new pg.Pool({...})` creates the pool with these settings.
//
// The connection details come from environment variables (`process.env`),
// which are loaded from back-end/.env. That way the password never appears in
// the code or in Git. When the tests run, .env.test overrides PGDATABASE so
// they use the ecommerce_test database instead.
const pool = new pg.Pool({
  host: process.env.PGHOST, // where the database server is, e.g. localhost
  port: process.env.PGPORT, // the port PostgreSQL listens on, usually 5432
  database: process.env.PGDATABASE, // which database to use, e.g. ecommerce
  user: process.env.PGUSER, // the PostgreSQL user to log in as
  password: process.env.PGPASSWORD, // that user's password
});

// Runs a SQL query using a connection borrowed from the pool, and returns a
// Promise (a value that arrives later; use `await` to wait for it) that
// resolves to the result. The result's `rows` property is an array of rows.
//
// `text` is the SQL; `params` is an array of values for its placeholders.
// Always use $1, $2... placeholders for values, never join them into the SQL
// string yourself:
//   query('SELECT * FROM customers WHERE id = $1', [id])
// pg sends the values to PostgreSQL separately from the SQL text, so a value
// like "1; DROP TABLE customers" is treated as plain data, never run as SQL.
// This prevents "SQL injection" attacks.
//
// `(text, params) => pool.query(text, params)` is an "arrow function": a short
// way of writing a function that takes text and params and returns pool.query(...).
export const query = (text, params) => pool.query(text, params);

// The pool itself is also exported, for code that needs it directly, e.g. the
// tests close it with pool.end() when they finish.
export default pool;
