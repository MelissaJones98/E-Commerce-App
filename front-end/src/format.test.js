// Tests for formatPrice() (format.js): turning the API's price strings into what the customer
// sees, e.g. "8.50" → "£8.50".

// A named import: picks formatPrice out of format.js by name.
import { formatPrice } from './format';

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
