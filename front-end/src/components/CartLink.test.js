// Tests for the cart icon in the nav (CartLink.js): its badge showing how many items are in the
// cart, and its name for screen readers (cartLabel).
// renderAt (test-utils.js) answers GET /cart with its `cart` option.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REQUEST_FAILS, renderAt } from '../test-utils';
import { cartLabel } from './CartLink';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// A cart holding 2 of one product and 1 of another: 3 items.
const cart = {
  items: [
    { product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', quantity: 2, line_total: '17.00' },
    { product_id: 2, sku: 'POT-001', name: 'Teapot', price: '24.00', quantity: 1, line_total: '24.00' },
  ],
  total: '41.00',
};

function findNav() {
  return screen.findByRole('navigation', { name: 'Main' });
}

// ----- cartLabel: the link's name for screen readers -----

test('cartLabel says just "Cart" when the count is unknown or the cart is empty', () => {
  expect(cartLabel(null)).toBe('Cart');
  expect(cartLabel(0)).toBe('Cart');
});

test('cartLabel says "1 item" for one item', () => {
  expect(cartLabel(1)).toBe('Cart, 1 item');
});

test('cartLabel says "items" for more than one', () => {
  expect(cartLabel(3)).toBe('Cart, 3 items');
});

// ----- The link in the nav -----

test('logged in, the nav shows the cart with its item count', async () => {
  renderAt('/', { customer: ada, cart });
  const nav = await findNav();

  const link = await within(nav).findByRole('link', { name: 'Cart, 3 items' });
  // The badge is the number drawn on the icon. It's hidden from screen readers (the link's name
  // already says it), so it's found by its class rather than its role.
  expect(link.querySelector('.cart-badge')).toHaveTextContent('3');
});

test('an empty cart shows no badge', async () => {
  renderAt('/', { customer: ada });
  const nav = await findNav();

  const link = await within(nav).findByRole('link', { name: 'Cart' });
  expect(link.querySelector('.cart-badge')).toBeNull();
});

test('a cart that fails to load shows the icon without a number', async () => {
  renderAt('/', { customer: ada, cart: REQUEST_FAILS });
  const nav = await findNav();

  const link = await within(nav).findByRole('link', { name: 'Cart' });
  expect(link.querySelector('.cart-badge')).toBeNull();
});

test('the cart link opens the cart page', async () => {
  renderAt('/', { customer: ada, cart });
  const nav = await findNav();

  userEvent.click(await within(nav).findByRole('link', { name: 'Cart, 3 items' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Your cart' })).toBeInTheDocument();
});

test('logged out, there is no cart link', async () => {
  renderAt('/');
  const nav = await findNav();

  // Wait for the logged-out nav (Log in appears once the app knows nobody is logged in).
  await within(nav).findByRole('link', { name: 'Log in' });
  // /^Cart/ matches any name starting with "Cart".
  expect(within(nav).queryByRole('link', { name: /^Cart/ })).not.toBeInTheDocument();
});
