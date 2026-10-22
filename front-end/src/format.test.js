// Tests for formatPrice() (format.js): turning the API's price strings into what the customer
// sees, e.g. "8.50" → "£8.50".

// Named imports: pick the functions out of format.js by name.
import { formatDate, formatPrice, formatStatus } from './format';

// test(name, fn) defines one test; expect(value).toBe(expected) checks value === expected.
test('shows a price in pounds with two decimal places', () => {
  expect(formatPrice('8.50')).toBe('£8.50');
});

test('adds a thousands separator and fills in the missing zero', () => {
  // The API always sends 2 decimals, but this proves the formatting doesn't depend on it.
  expect(formatPrice('1234.5')).toBe('£1,234.50');
});

test('shows a free item as £0.00', () => {
  expect(formatPrice('0.00')).toBe('£0.00');
});

// ----- Dates and order statuses -----

test('formatDate shows a date as day, short month and year', () => {
  // Midday UTC, so the date is the 21st whatever time zone the tests run in.
  expect(formatDate('2026-10-21T12:00:00.000Z')).toBe('21 Oct 2026');
});

test('formatStatus capitalises the first letter of an order status', () => {
  expect(formatStatus('paid')).toBe('Paid');
  expect(formatStatus('delivered')).toBe('Delivered');
});
