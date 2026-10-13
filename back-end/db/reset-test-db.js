// Drops and recreates the test database, then creates the tables from schema.sql.
// Run with: npm run db:test:reset
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const testDb = process.env.PGDATABASE;

// Safety check: never drop a database unless its name ends in _test.
if (!testDb?.endsWith('_test')) {
  console.error(`Refusing to reset "${testDb}": name must end in _test.`);
  process.exit(1);
}

// CREATE/DROP DATABASE can't run while connected to the database itself,
// so connect to the default "postgres" database for this step.
const admin = new pg.Client({ database: 'postgres' });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${testDb}`);
await admin.end();

// Connect to the new test database and run the schema.
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ database: testDb });
await client.connect();
await client.query(schema);
await client.end();

console.log(`Test database "${testDb}" reset.`);
