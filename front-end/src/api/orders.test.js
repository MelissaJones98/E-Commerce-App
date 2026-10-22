// Tests for the orders API functions (orders.js). fetch is replaced by a fake for each test.

import { getOrder, getOrders } from './orders';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  delete global.fetch;
});

test('getOrders resolves to the list from GET /orders', async () => {
  const list = [{ id: 12, status: 'paid', total_amount: '44.50', item_count: 3, created_at: '2026-10-21T12:00:00.000Z' }];
  global.fetch.mockResolvedValue(jsonResponse(200, list));

  expect(await getOrders()).toEqual(list);
  expect(global.fetch.mock.calls[0][0]).toBe('/orders');
});

test('getOrder asks for /orders/:id', async () => {
  global.fetch.mockResolvedValue(jsonResponse(200, { id: 7 }));

  expect(await getOrder('7')).toEqual({ id: 7 });
  expect(global.fetch.mock.calls[0][0]).toBe('/orders/7');
});

test('an unknown order rejects with status 404 and the API message', async () => {
  global.fetch.mockResolvedValue(jsonResponse(404, { error: 'Order not found' }));

  await expect(getOrder('7')).rejects.toMatchObject({ status: 404, message: 'Order not found' });
});
