// Tests for the products API functions (products.js) and the error details they inherit from
// requestJson (request.js). fetch is replaced by a fake for each test, so no server is needed.

import { getProduct, getProducts } from './products';

// One product, in the shape the API sends. `price` is a string so its exact value is kept.
const mug = {
  id: 1,
  category_id: null,
  sku: 'MUG-001',
  name: 'Coffee Mug',
  description: 'A 350ml ceramic mug',
  price: '8.50',
  stock_quantity: 42,
};

// Builds a fake fetch response with the given status and JSON body. `status >= 200 && status
// < 300` matches how real responses set `ok`.
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// beforeEach/afterEach run around every test in this file. jest.fn() makes a fake function
// that records its calls; each test tells it what to return.
beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  // `delete` removes the property, so no fake leaks into other test files.
  delete global.fetch;
});

test('getProducts resolves to the list from GET /products', async () => {
  // mockResolvedValue: every call returns a Promise that resolves to this response.
  global.fetch.mockResolvedValue(jsonResponse(200, [mug]));

  // toEqual compares contents (toBe would need the very same object).
  expect(await getProducts()).toEqual([mug]);
  // The first argument of the first call (calls[0][0]) is the URL.
  expect(global.fetch.mock.calls[0][0]).toBe('/products');
});

test('getProduct asks for /products/:id', async () => {
  global.fetch.mockResolvedValue(jsonResponse(200, mug));

  expect(await getProduct('42')).toEqual(mug);
  expect(global.fetch.mock.calls[0][0]).toBe('/products/42');
});

test('an API error carries its status and message', async () => {
  global.fetch.mockResolvedValue(jsonResponse(404, { error: 'Product not found' }));

  // `.rejects` waits for the Promise to fail; toMatchObject checks only the listed properties.
  await expect(getProduct('42')).rejects.toMatchObject({
    status: 404,
    message: 'Product not found',
  });
});

test('a network failure has status 0', async () => {
  // fetch rejects (instead of resolving) when no response arrives at all.
  global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

  await expect(getProducts()).rejects.toMatchObject({ status: 0 });
});

test('a non-JSON reply (dev proxy error page) has status 0', async () => {
  // A 500 whose body isn't JSON: what the dev proxy sends when the API isn't running.
  global.fetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  });

  await expect(getProducts()).rejects.toMatchObject({ status: 0 });
});
