// Deletes and recreates the test database, then creates its tables from
// schema.sql, giving the tests a fresh database that matches the latest schema.
// Run with: npm run db:test:reset (from the back-end folder)
//
// The npm script loads .env and then .env.test, so process.env.PGDATABASE is
// "ecommerce_test" here, while the other connection settings come from .env.
//
// This file uses "top-level await": `await` outside any function. That works
// because the file is an ES module ("type": "module" in package.json).

// readFile reads a file's contents. The `/promises` version returns a Promise,
// so it can be used with `await`.
import { readFile } from 'node:fs/promises';
// The PostgreSQL client library.
import pg from 'pg';

// The name of the database to reset, e.g. "ecommerce_test".
const testDb = process.env.PGDATABASE;

// Safety check: refuse to delete any database whose name doesn't end in
// "_test", so a misconfigured setting can never wipe the real database.
// `?.` ("optional chaining") stops safely if testDb is undefined, instead of
// crashing with an error.
if (!testDb?.endsWith('_test')) {
  console.error(`Refusing to reset "${testDb}": name must end in _test.`);
  // Exit the program. A non-zero exit code (1) signals that it failed.
  process.exit(1);
}

// You can't delete or create a database while connected to it, so this step
// connects to PostgreSQL's built-in "postgres" database instead.
// A Client is a single connection (simpler than a Pool for a one-off script).
// Settings not given here (host, user, password...) are read from the PG*
// environment variables automatically.
const admin = new pg.Client({ database: 'postgres' });
await admin.connect();
// DROP DATABASE deletes the database. IF EXISTS avoids an error the first time,
// when it doesn't exist yet. WITH (FORCE) disconnects anyone still connected.
await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${testDb}`);
// Close the connection now that we're finished with it.
await admin.end();

// Read schema.sql as text.
// `import.meta.url` is this file's own location, so `new URL('./schema.sql', ...)`
// finds schema.sql in the same folder, wherever the command was run from.
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');

// Connect to the new, empty test database and run the whole schema in one go.
const client = new pg.Client({ database: testDb });
await client.connect();
await client.query(schema);
await client.end();

console.log(`Test database "${testDb}" reset.`);
