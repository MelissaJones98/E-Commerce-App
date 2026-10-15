// Shared helpers used by the test files. This file has no tests of its own:
// `npm test` only runs files ending in .test.js.

// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';
import app from '../app.js';
// The database connection pool, used to set up and inspect test data directly.
import pool from '../db/index.js';

// Empties every table and restarts id numbering at 1, so each test starts
// from a clean, predictable database (e.g. the first customer always has id 1).
// The test files run this before every test with beforeEach(resetTables).
export const resetTables = async () => {
  // Safety check: ask PostgreSQL which database we're connected to, and refuse
  // to continue unless its name ends in _test. Even if the settings were
  // wrong, this could never wipe the real ecommerce database.
  const result = await pool.query('SELECT current_database() AS name');
  const { name } = result.rows[0];
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset tables in "${name}": not a test database.`);
  }
  // TRUNCATE deletes every row from the listed tables, much faster than DELETE.
  //   RESTART IDENTITY  resets the automatic id numbering back to 1
  //   CASCADE           also empties any table that refers to these ones
  await pool.query(
    'TRUNCATE customers, addresses, categories, products, cart_items, orders, order_items RESTART IDENTITY CASCADE'
  );
};

// Registers a customer, logs them in, and returns a supertest "agent".
// An agent keeps cookies between requests like a browser does, so after
// logging in, every request made with it is made as that customer.
//
// `details = {}` is a default parameter: if called with no argument, details
// is an empty object. Pass details to override the defaults below, e.g.
// loggedInAgent({ email: 'grace@example.com' }) for a second customer.
export const loggedInAgent = async (details = {}) => {
  // Default customer details, then `...details` copies in any overrides
  // (later properties replace earlier ones with the same name).
  const customer = {
    first_name: 'Test',
    last_name: 'Customer',
    email: 'test.customer@example.com',
    password: 'test-password',
    ...details,
  };
  // Register using the real API, exactly as a client would.
  await request(app).post('/auth/register').send(customer);

  // Create an agent and log in with it, so it receives and keeps the session cookie.
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ email: customer.email, password: customer.password });
  return agent;
};

// Inserts a category directly into the database and returns its new id.
// (There are no category API routes yet, so tests add them with SQL.)
export const insertCategory = async (name) => {
  const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]);
  return result.rows[0].id;
};

// Inserts a product directly into the database and returns its new id.
// Adding test data with SQL keeps the GET tests independent of POST /products.
// Fields not given use the defaults below, so a test only needs to mention
// the fields it cares about, e.g. insertProduct({ is_active: false }).
export const insertProduct = async (fields = {}) => {
  const product = {
    sku: 'SKU-001',
    name: 'Test product',
    description: null,
    price: '10.00',
    stock_quantity: 5,
    category_id: null,
    is_active: true,
    ...fields,
  };
  const result = await pool.query(
    `INSERT INTO products (sku, name, description, price, stock_quantity, category_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    // The values for $1–$7, in the same order as the columns above.
    [
      product.sku,
      product.name,
      product.description,
      product.price,
      product.stock_quantity,
      product.category_id,
      product.is_active,
    ]
  );
  return result.rows[0].id;
};
