// Shared helpers for tests.
import request from 'supertest';
import app from '../app.js';
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
    'TRUNCATE customers, addresses, categories, products, orders, order_items RESTART IDENTITY CASCADE'
  );
};

// Registers a customer and logs them in. Returns a supertest agent that
// keeps the session cookie, so its requests are made as that customer.
// Pass details to override the defaults, e.g. a different email for a second customer.
export const loggedInAgent = async (details = {}) => {
  const customer = {
    first_name: 'Test',
    last_name: 'Customer',
    email: 'test.customer@example.com',
    password: 'test-password',
    ...details,
  };
  await request(app).post('/auth/register').send(customer);

  const agent = request.agent(app);
  await agent.post('/auth/login').send({ email: customer.email, password: customer.password });
  return agent;
};

// Inserts a category directly into the database and returns its id.
export const insertCategory = async (name) => {
  const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]);
  return result.rows[0].id;
};

// Inserts a product directly into the database and returns its id.
// Fields not given use the defaults below.
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
