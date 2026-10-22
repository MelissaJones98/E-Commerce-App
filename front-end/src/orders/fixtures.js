// Sample orders for the tests (fixtures), in the exact shape GET /orders/:id sends, so every
// test file uses the same orders. Only test files import this; the app never does.
// Times are midday UTC, so the dates come out the same in any time zone.

export const address = {
  id: 1,
  line_1: '10 Downing Street',
  line_2: null,
  city: 'London',
  region: null,
  postal_code: 'SW1A 2AA',
  country_code: 'GB',
};

// 2 serums at £18.50 (£37.00) and 1 hand cream at £7.50: £44.50 for 3 items.
export const order12 = {
  id: 12,
  status: 'paid',
  total_amount: '44.50',
  created_at: '2026-10-21T12:00:00.000Z',
  shipping_address: address,
  items: [
    { product_id: 1, sku: 'SKN-001', name: 'Hydrating Face Serum', quantity: 2, unit_price: '18.50', line_total: '37.00' },
    { product_id: 2, sku: 'BAT-003', name: 'Rose Hand Cream', quantity: 1, unit_price: '7.50', line_total: '7.50' },
  ],
};

// One item: a cleanser at £12.00.
export const order7 = {
  id: 7,
  status: 'delivered',
  total_amount: '12.00',
  created_at: '2026-10-03T12:00:00.000Z',
  shipping_address: address,
  items: [
    { product_id: 3, sku: 'SKN-003', name: 'Gentle Cream Cleanser', quantity: 1, unit_price: '12.00', line_total: '12.00' },
  ],
};
