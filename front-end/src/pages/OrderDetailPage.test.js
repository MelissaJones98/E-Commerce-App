// Tests for one order's page (/orders/:orderId). renderAt (test-utils.js) answers
// GET /orders/:id from its `orders` option, the way the API does.

import { act, screen, within } from '@testing-library/react';
import { order12, order7 } from '../orders/fixtures';
import { REQUEST_FAILS, REQUEST_PENDING, REQUEST_UNAUTHORIZED, renderAt } from '../test-utils';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// Opens an order's page logged in as Ada (and returns the router, for moving between orders).
function openOrder(id, orders = [order12, order7]) {
  return renderAt(`/orders/${id}`, { customer: ada, orders });
}

function findHeading(name) {
  return screen.findByRole('heading', { level: 1, name });
}

// One item's row: the list item containing its name.
function row(name) {
  return screen.getByText(name).closest('li');
}

test('the heading is "Order #12", with the date and status underneath', async () => {
  openOrder(12);

  expect(await findHeading('Order #12')).toBeInTheDocument();
  expect(screen.getByText('Placed 21 Oct 2026 · Paid')).toBeInTheDocument();
});

test('shows each item with the price paid, quantity and row price', async () => {
  openOrder(12);
  await findHeading('Order #12');

  const serum = row('Hydrating Face Serum');
  expect(within(serum).getByText('£18.50 each')).toBeInTheDocument();
  expect(within(serum).getByText('× 2')).toBeInTheDocument();
  expect(within(serum).getByText('£37.00')).toBeInTheDocument();
  // The hand cream costs £7.50 each AND £7.50 in total, so "£7.50" appears twice in its row.
  // { selector: '.order-item-total' } narrows the search to the row-price element only.
  expect(within(row('Rose Hand Cream')).getByText('£7.50', { selector: '.order-item-total' })).toBeInTheDocument();
});

test('shows the total with the number of items', async () => {
  openOrder(12);
  await findHeading('Order #12');

  expect(screen.getByText('Total (3 items)')).toBeInTheDocument();
  expect(screen.getByText('£44.50')).toBeInTheDocument();
});

test('a one-item order says "1 item"', async () => {
  openOrder(7);
  await findHeading('Order #7');

  expect(screen.getByText('Total (1 item)')).toBeInTheDocument();
});

test('shows the delivery address', async () => {
  openOrder(12);
  await findHeading('Order #12');

  expect(screen.getByText('Delivered to')).toBeInTheDocument();
  for (const line of ['10 Downing Street', 'London', 'SW1A 2AA', 'GB']) {
    expect(screen.getByText(line)).toBeInTheDocument();
  }
});

test('skips empty address lines', async () => {
  openOrder(12);
  await findHeading('Order #12');

  // order12's address has no line_2 or region: exactly four lines, and never the word "null".
  const address = screen.getByText('Delivered to').closest('.order-address');
  expect(within(address).getAllByRole('listitem')).toHaveLength(4);
  expect(screen.queryByText('null')).not.toBeInTheDocument();
});

test('a × goes back to your orders', async () => {
  openOrder(12);
  await findHeading('Order #12');

  expect(screen.getByRole('link', { name: 'Back to your orders' })).toHaveAttribute('href', '/orders');
});

test("an unknown order (or someone else's) shows \"Order not found\"", async () => {
  openOrder(99);

  expect(await findHeading('Order not found')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to your orders' })).toHaveAttribute('href', '/orders');
});

test('an invalid id shows Order not found', async () => {
  openOrder('abc');

  expect(await findHeading('Order not found')).toBeInTheDocument();
});

test('shows an error when the order cannot be loaded', async () => {
  openOrder(12, REQUEST_FAILS);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load this order. Please try again.",
  );
});

test('shows "Loading…" first', async () => {
  openOrder(12, REQUEST_PENDING);

  // Wait until the app knows Ada is logged in: RequireAuth shows its OWN "Loading…" while it's
  // still checking, which would make this test pass without the page doing anything.
  const nav = screen.getByRole('navigation', { name: 'Main' });
  await within(nav).findByText('Hi, Ada');
  expect(screen.getByText('Loading…')).toBeInTheDocument();
});

test('opening another order loads it', async () => {
  const router = openOrder(12);
  await findHeading('Order #12');

  await act(async () => {
    await router.navigate('/orders/7');
  });

  expect(await findHeading('Order #7')).toBeInTheDocument();
  expect(screen.getByText('Gentle Cream Cleanser')).toBeInTheDocument();
});

test('a 401 sends you to Log in', async () => {
  // /auth/providers (asked for by the login page) gets no Google or Facebook buttons.
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  openOrder(12, REQUEST_UNAUTHORIZED);

  expect(await findHeading('Log in')).toBeInTheDocument();
});
