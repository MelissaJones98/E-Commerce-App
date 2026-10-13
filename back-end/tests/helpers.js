// Shared helpers for tests.
import pool from '../db/index.js';

// Empties every table and restarts ID numbering at 1.
// Refuses to run against any database whose name doesn't end in _test,
// so a misconfigured .env can never wipe real data.
export const resetTables = async () => {
  const result = await pool.query('SELECT current_database() AS name');
  const { name } = result.rows[0];
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset tables in "${name}": not a test database.`);
  }
  await pool.query(
    'TRUNCATE customers, addresses, products, orders, order_items RESTART IDENTITY CASCADE'
  );
};
