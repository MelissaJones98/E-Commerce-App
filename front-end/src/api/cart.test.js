// Tests for the cart API functions that change the cart (cart.js): setting a product's
// quantity and removing it. fetch is replaced by a fake for each test, so no server is needed.

import { removeCartItem, setCartQuantity } from './cart';

// A cart in the API's shape, as returned after a change.
const cart = {
  items: [
    { product_id: 7, sku: 'MST-001', name: 'Moisturiser', price: '2.00', quantity: 3, line_total: '6.00' },
  ],
  total: '6.00',
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  delete global.fetch;
});

test('setCartQuantity sends PUT /cart/items/:id with the new quantity', async () => {
  global.fetch.mockResolvedValue(jsonResponse(200, cart));

  expect(await setCartQuantity(7, 3)).toEqual(cart);
  // mock.calls[0] is the first call's arguments: [url, options].
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/cart/items/7');
  expect(options.method).toBe('PUT');
  // JSON.parse turns the JSON text back into an object, to compare its contents.
  expect(JSON.parse(options.body)).toEqual({ quantity: 3 });
});

test('removeCartItem sends DELETE /cart/items/:id and resolves null', async () => {
  // 204 No Content: success, with no body (json() is never called).
  global.fetch.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });

  expect(await removeCartItem(7)).toBeNull();
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/cart/items/7');
  expect(options.method).toBe('DELETE');
});

test('a 409 carries its status and the API message', async () => {
  global.fetch.mockResolvedValue(jsonResponse(409, { error: 'Not enough stock: 3 available' }));

  await expect(setCartQuantity(7, 6)).rejects.toMatchObject({
    status: 409,
    message: 'Not enough stock: 3 available',
  });
});
