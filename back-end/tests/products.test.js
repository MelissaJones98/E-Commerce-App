// Tests for the /products routes.
// Run with: npm test (uses the ecommerce_test database, see .env.test)
import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../app.js';
import pool from '../db/index.js';
import { resetTables, loggedInAgent, insertCategory, insertProduct } from './helpers.js';

// A valid product body for POST and PUT. Tests copy it and change one field.
const validProduct = {
  sku: 'MUG-001',
  name: 'Coffee Mug',
  description: 'A 350ml ceramic mug',
  price: 8.5,
  stock_quantity: 42,
  category_id: null,
};

const getProductRow = async (id) => {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  return result.rows[0];
};

const countProducts = async () => {
  const result = await pool.query('SELECT count(*)::int AS count FROM products');
  return result.rows[0].count;
};

beforeEach(resetTables);
after(() => pool.end());

describe('GET /products', () => {
  test('returns 200 with every active product, in id order', async () => {
    const kitchen = await insertCategory('Kitchen');
    await insertProduct({
      sku: 'MUG-001',
      name: 'Coffee Mug',
      description: 'A 350ml ceramic mug',
      price: '8.50',
      stock_quantity: 42,
      category_id: kitchen,
    });
    await insertProduct({ sku: 'TEA-001', name: 'Teapot', price: '24.00', stock_quantity: 3 });

    const res = await request(app).get('/products');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [
      {
        id: 1,
        category_id: 1,
        sku: 'MUG-001',
        name: 'Coffee Mug',
        description: 'A 350ml ceramic mug',
        price: '8.50',
        stock_quantity: 42,
      },
      {
        id: 2,
        category_id: null,
        sku: 'TEA-001',
        name: 'Teapot',
        description: null,
        price: '24.00',
        stock_quantity: 3,
      },
    ]);
  });

  test('does not include retired (inactive) products', async () => {
    await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug' });
    await insertProduct({ sku: 'OLD-001', name: 'Retired Mug', is_active: false });

    const res = await request(app).get('/products');

    assert.deepEqual(
      res.body.map((product) => product.name),
      ['Coffee Mug']
    );
  });

  test('returns an empty list when there are no products', async () => {
    const res = await request(app).get('/products');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  describe('?category=', () => {
    test('returns only products in that category', async () => {
      const kitchen = await insertCategory('Kitchen');
      const garden = await insertCategory('Garden');
      await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', category_id: kitchen });
      await insertProduct({ sku: 'SPADE-001', name: 'Spade', category_id: garden });
      await insertProduct({ sku: 'TEA-001', name: 'Teapot', category_id: kitchen });
      await insertProduct({ sku: 'MISC-001', name: 'Uncategorised thing' });

      const res = await request(app).get(`/products?category=${kitchen}`);

      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((product) => product.name),
        ['Coffee Mug', 'Teapot']
      );
    });

    test('does not include retired products in the category', async () => {
      const kitchen = await insertCategory('Kitchen');
      await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug', category_id: kitchen });
      await insertProduct({ sku: 'OLD-001', name: 'Retired Mug', category_id: kitchen, is_active: false });

      const res = await request(app).get(`/products?category=${kitchen}`);

      assert.deepEqual(
        res.body.map((product) => product.name),
        ['Coffee Mug']
      );
    });

    test('returns an empty list for a category with no products', async () => {
      await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug' });

      const res = await request(app).get('/products?category=999');

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    for (const value of ['abc', '1.5', '-1', '0', '99999999999']) {
      test(`returns 400 when category is "${value}"`, async () => {
        const res = await request(app).get(`/products?category=${value}`);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
      });
    }
  });
});

describe('GET /products/:productId', () => {
  test('returns 200 with the product', async () => {
    const kitchen = await insertCategory('Kitchen');
    const id = await insertProduct({
      sku: 'MUG-001',
      name: 'Coffee Mug',
      description: 'A 350ml ceramic mug',
      price: '8.50',
      stock_quantity: 42,
      category_id: kitchen,
    });

    const res = await request(app).get(`/products/${id}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      id: 1,
      category_id: 1,
      sku: 'MUG-001',
      name: 'Coffee Mug',
      description: 'A 350ml ceramic mug',
      price: '8.50',
      stock_quantity: 42,
    });
  });

  test('returns 404 when the product does not exist', async () => {
    const res = await request(app).get('/products/999');

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 404 when the product has been retired', async () => {
    const id = await insertProduct({ is_active: false });

    const res = await request(app).get(`/products/${id}`);

    assert.equal(res.status, 404);
    // The app's JSON error, not Express's built-in "route not found" page.
    assert.equal(typeof res.body.error, 'string');
  });

  for (const value of ['abc', '1.5', '0', '99999999999']) {
    test(`returns 400 when the id is "${value}"`, async () => {
      const res = await request(app).get(`/products/${value}`);

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }
});

describe('POST /products', () => {
  test('returns 401 and creates nothing when not logged in', async () => {
    const res = await request(app).post('/products').send(validProduct);

    assert.equal(res.status, 401);
    assert.equal(await countProducts(), 0);
  });

  test('returns 201 with the new product', async () => {
    const agent = await loggedInAgent();

    const res = await agent.post('/products').send(validProduct);

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, {
      id: 1,
      category_id: null,
      sku: 'MUG-001',
      name: 'Coffee Mug',
      description: 'A 350ml ceramic mug',
      price: '8.50',
      stock_quantity: 42,
    });
  });

  test('saves the product to the database as active', async () => {
    const agent = await loggedInAgent();

    const res = await agent.post('/products').send(validProduct);

    const row = await getProductRow(res.body.id);
    assert.equal(row.name, 'Coffee Mug');
    assert.equal(row.is_active, true);
  });

  test('accepts a product with a category', async () => {
    const kitchen = await insertCategory('Kitchen');
    const agent = await loggedInAgent();

    const res = await agent.post('/products').send({ ...validProduct, category_id: kitchen });

    assert.equal(res.status, 201);
    assert.equal(res.body.category_id, kitchen);
  });

  test('accepts a product with no description or category', async () => {
    const agent = await loggedInAgent();
    const { description, category_id, ...minimalProduct } = validProduct;

    const res = await agent.post('/products').send(minimalProduct);

    assert.equal(res.status, 201);
    assert.equal(res.body.description, null);
    assert.equal(res.body.category_id, null);
  });

  test('accepts a price of 0 and stock of 0', async () => {
    const agent = await loggedInAgent();

    const res = await agent.post('/products').send({ ...validProduct, price: 0, stock_quantity: 0 });

    assert.equal(res.status, 201);
    assert.equal(res.body.price, '0.00');
    assert.equal(res.body.stock_quantity, 0);
  });

  test('returns 409 when another product already has the SKU', async () => {
    await insertProduct({ sku: 'MUG-001' });
    const agent = await loggedInAgent();

    const res = await agent.post('/products').send(validProduct);

    assert.equal(res.status, 409);
    assert.equal(typeof res.body.error, 'string');
    assert.equal(await countProducts(), 1);
  });

  test('returns 400 when the category does not exist', async () => {
    const agent = await loggedInAgent();

    const res = await agent.post('/products').send({ ...validProduct, category_id: 999 });

    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, 'string');
    assert.equal(await countProducts(), 0);
  });

  // Every way a product body can be invalid. All should be rejected with
  // 400 and must not create a product. PUT uses the same rules.
  const invalidCases = [
    ['sku is missing', { ...validProduct, sku: undefined }],
    ['sku is only spaces', { ...validProduct, sku: '   ' }],
    ['sku is longer than 50 characters', { ...validProduct, sku: 'a'.repeat(51) }],
    ['name is missing', { ...validProduct, name: undefined }],
    ['name is longer than 255 characters', { ...validProduct, name: 'a'.repeat(256) }],
    ['description is not a string', { ...validProduct, description: 123 }],
    ['price is missing', { ...validProduct, price: undefined }],
    ['price is a string', { ...validProduct, price: '8.50' }],
    ['price is negative', { ...validProduct, price: -1 }],
    ['price has more than 2 decimal places', { ...validProduct, price: 8.505 }],
    ['price is too large for the database', { ...validProduct, price: 100000000 }],
    ['stock_quantity is missing', { ...validProduct, stock_quantity: undefined }],
    ['stock_quantity is negative', { ...validProduct, stock_quantity: -1 }],
    ['stock_quantity is not a whole number', { ...validProduct, stock_quantity: 1.5 }],
    ['stock_quantity is too large for the database', { ...validProduct, stock_quantity: 2147483648 }],
    ['category_id is not a whole number', { ...validProduct, category_id: 1.5 }],
    ['category_id is a string', { ...validProduct, category_id: '1' }],
  ];

  for (const [name, body] of invalidCases) {
    test(`returns 400 when ${name}`, async () => {
      const agent = await loggedInAgent();

      const res = await agent.post('/products').send(body);

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
      assert.equal(await countProducts(), 0);
    });
  }

  test('returns 400 when no body is sent', async () => {
    const agent = await loggedInAgent();

    const res = await agent.post('/products');

    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, 'string');
  });
});

describe('PUT /products/:productId', () => {
  // PUT replaces the product's details, so the body must be a complete product.
  const updatedProduct = {
    sku: 'MUG-002',
    name: 'Large Coffee Mug',
    description: 'A 500ml ceramic mug',
    price: 12,
    stock_quantity: 10,
    category_id: null,
  };

  test('returns 401 and changes nothing when not logged in', async () => {
    const id = await insertProduct({ name: 'Coffee Mug' });

    const res = await request(app).put(`/products/${id}`).send(updatedProduct);

    assert.equal(res.status, 401);
    assert.equal((await getProductRow(id)).name, 'Coffee Mug');
  });

  test('returns 200 with the updated product', async () => {
    const id = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug' });
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send(updatedProduct);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      id: 1,
      category_id: null,
      sku: 'MUG-002',
      name: 'Large Coffee Mug',
      description: 'A 500ml ceramic mug',
      price: '12.00',
      stock_quantity: 10,
    });
  });

  test('saves the changes to the database', async () => {
    const id = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug' });
    const agent = await loggedInAgent();

    await agent.put(`/products/${id}`).send(updatedProduct);

    const row = await getProductRow(id);
    assert.equal(row.name, 'Large Coffee Mug');
    assert.equal(row.price, '12.00');
  });

  test('can move a product into a category', async () => {
    const id = await insertProduct();
    const kitchen = await insertCategory('Kitchen');
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send({ ...updatedProduct, category_id: kitchen });

    assert.equal(res.status, 200);
    assert.equal((await getProductRow(id)).category_id, kitchen);
  });

  test('returns 404 when the product does not exist', async () => {
    const agent = await loggedInAgent();

    const res = await agent.put('/products/999').send(updatedProduct);

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 404 when the product has been retired', async () => {
    const id = await insertProduct({ is_active: false });
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send(updatedProduct);

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 400 and changes nothing when the body is invalid', async () => {
    const id = await insertProduct({ name: 'Coffee Mug' });
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send({ ...updatedProduct, price: -1 });

    assert.equal(res.status, 400);
    assert.equal((await getProductRow(id)).name, 'Coffee Mug');
  });

  test('returns 400 when the id is not a valid id', async () => {
    const agent = await loggedInAgent();

    const res = await agent.put('/products/abc').send(updatedProduct);

    assert.equal(res.status, 400);
  });

  test('returns 409 when another product already has the new SKU', async () => {
    await insertProduct({ sku: 'MUG-002', name: 'Other Mug' });
    const id = await insertProduct({ sku: 'MUG-001', name: 'Coffee Mug' });
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send(updatedProduct);

    assert.equal(res.status, 409);
    assert.equal((await getProductRow(id)).sku, 'MUG-001');
  });

  test('allows keeping the same SKU', async () => {
    const id = await insertProduct({ sku: 'MUG-002', name: 'Coffee Mug' });
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send(updatedProduct);

    assert.equal(res.status, 200);
  });

  test('returns 400 when the category does not exist', async () => {
    const id = await insertProduct();
    const agent = await loggedInAgent();

    const res = await agent.put(`/products/${id}`).send({ ...updatedProduct, category_id: 999 });

    assert.equal(res.status, 400);
  });
});

describe('DELETE /products/:productId', () => {
  test('returns 401 and keeps the product when not logged in', async () => {
    const id = await insertProduct();

    const res = await request(app).delete(`/products/${id}`);

    assert.equal(res.status, 401);
    assert.equal((await getProductRow(id)).is_active, true);
  });

  test('returns 204 when logged in', async () => {
    const id = await insertProduct();
    const agent = await loggedInAgent();

    const res = await agent.delete(`/products/${id}`);

    assert.equal(res.status, 204);
  });

  test('retires the product, so it no longer appears in the shop', async () => {
    const id = await insertProduct();
    const agent = await loggedInAgent();

    await agent.delete(`/products/${id}`);

    assert.equal((await request(app).get(`/products/${id}`)).status, 404);
    assert.deepEqual((await request(app).get('/products')).body, []);
  });

  test('keeps the product row so past orders still refer to it', async () => {
    const id = await insertProduct();
    const agent = await loggedInAgent();

    await agent.delete(`/products/${id}`);

    const row = await getProductRow(id);
    assert.equal(row.is_active, false);
  });

  test('returns 404 when the product does not exist', async () => {
    const agent = await loggedInAgent();

    const res = await agent.delete('/products/999');

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 404 when the product is already retired', async () => {
    const id = await insertProduct({ is_active: false });
    const agent = await loggedInAgent();

    const res = await agent.delete(`/products/${id}`);

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('returns 400 when the id is not a valid id', async () => {
    const agent = await loggedInAgent();

    const res = await agent.delete('/products/abc');

    assert.equal(res.status, 400);
  });
});
