// Tests for stockAdjustment() (stock.js): what to do when the API refuses a quantity because
// there isn't enough stock (409). The API's message reads "Not enough stock: N available".

import { stockAdjustment } from './stock';

test('stock has dropped below the cart: jump down to what is available', () => {
  // 6 in the cart, only 3 left: even − (6 → 5) was refused.
  expect(stockAdjustment(6, 'Not enough stock: 3 available')).toEqual({
    quantity: 3,
    kind: 'adjusted',
    text: 'Only 3 in stock, so your quantity is now 3.',
  });
});

test('+ went past the stock: say how many there are, change nothing', () => {
  // 5 in the cart and 5 in stock: + (5 → 6) was refused.
  expect(stockAdjustment(5, 'Not enough stock: 5 available')).toEqual({
    quantity: null,
    kind: 'error',
    text: 'Only 5 in stock.',
  });
});

test('sold out since it was added: ask to remove it', () => {
  expect(stockAdjustment(2, 'Not enough stock: 0 available')).toEqual({
    quantity: null,
    kind: 'error',
    text: 'Sorry, this is now out of stock. Please remove it from your cart.',
  });
});

test("a message in a different wording is shown as it is", () => {
  expect(stockAdjustment(2, 'Something else')).toEqual({
    quantity: null,
    kind: 'error',
    text: 'Something else',
  });
});
