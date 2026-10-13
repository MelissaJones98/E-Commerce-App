// Import the PostgreSQL client library.
import pg from 'pg';

// A pool keeps a set of open database connections and hands them out as
// queries come in, instead of opening a new connection for every request.
// Connection details come from environment variables set in back-end/.env,
// so the password never appears in the code or in Git.
const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

// Run a SQL query using a connection from the pool.
// Use $1, $2... placeholders for values, never string concatenation, e.g.
//   query('SELECT * FROM customers WHERE id = $1', [id])
// pg sends the values separately from the SQL, which prevents SQL injection.
export const query = (text, params) => pool.query(text, params);

export default pool;
