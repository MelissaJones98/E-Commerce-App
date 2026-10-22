// Tests for the checkout API function (checkout.js). fetch is replaced by a fake for each test.

import { placeOrder } from './checkout';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  delete global.fetch;
});

const shippingAddress = {
  line_1: '12 Rose Lane',
  line_2: null,
  city: 'Bristol',
  region: null,
  postal_code: 'BS1 4AB',
  country_code: 'GB',
};

test('placeOrder POSTs the address, PaymentMethod id and shown total, and resolves to the order', async () => {
  global.fetch.mockResolvedValue(jsonResponse(201, { id: 15 }));

  const order = await placeOrder({ shippingAddress, paymentMethodId: 'pm_test_1', expectedTotal: '28.45' });

  expect(order).toEqual({ id: 15 });
  // mock.calls[0] is the first call's arguments: [url, options].
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/cart/checkout');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  // The API's field names use underscores.
  expect(JSON.parse(options.body)).toEqual({
    shipping_address: shippingAddress,
    payment_method_id: 'pm_test_1',
    expected_total: '28.45',
  });
});

test('a declined card rejects with status 402 and the API message', async () => {
  global.fetch.mockResolvedValue(jsonResponse(402, { error: 'Your card was declined.' }));

  await expect(
    placeOrder({ shippingAddress, paymentMethodId: 'pm_test_1', expectedTotal: '28.45' }),
  ).rejects.toMatchObject({ status: 402, message: 'Your card was declined.' });
});
