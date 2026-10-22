// Tests for Your Orders (/orders): the table of the customer's past orders.
// renderAt (test-utils.js) answers GET /orders from its `orders` option (full orders, which it
// turns into the API's summaries).

// screen searches the fake page; within() searches inside one part of it (here, the table).
import { screen, within } from '@testing-library/react';
// The shared sample orders: #12 (paid, 21 Oct 2026, £44.50) and #7 (delivered, 3 Oct 2026,
// £12.00). See orders/fixtures.js.
import { order12, order7 } from '../orders/fixtures';
import { REQUEST_FAILS, REQUEST_PENDING, REQUEST_UNAUTHORIZED, renderAt } from '../test-utils';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// Opens Your Orders logged in as Ada, and waits for the heading. `orders = [...]` is a default
// value: the two sample orders, newest first (as the API sends them), unless a test passes its
// own (e.g. [] for no orders).
async function openOrders(orders = [order12, order7]) {
  renderAt('/orders', { customer: ada, orders });
  await screen.findByRole('heading', { level: 1, name: 'Your Orders' });
}

test('shows a table with Order, Date, Status and Total columns', async () => {
  await openOrders();

  const table = await screen.findByRole('table', { name: 'Your past orders' });
  // .map(...) turns each column header into its text, to compare the whole list at once.
  const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent);
  expect(headers).toEqual(['Order', 'Date', 'Status', 'Total']);
});

test("shows each order's number, date, status and total, newest first", async () => {
  await openOrders();

  const table = await screen.findByRole('table', { name: 'Your past orders' });
  // The rows after the header row (.slice(1) skips the first), each turned into a list of its
  // cells' text, so the whole table can be compared in one go.
  const rows = within(table)
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent));
  expect(rows).toEqual([
    ['Order #12', '21 Oct 2026', 'Paid', '£44.50'],
    ['Order #7', '3 Oct 2026', 'Delivered', '£12.00'],
  ]);
});

test('each order number links to its page', async () => {
  await openOrders();

  expect(await screen.findByRole('link', { name: 'Order #12' })).toHaveAttribute('href', '/orders/12');
});

test('no orders: says so and links to products', async () => {
  await openOrders([]);

  expect(await screen.findByText("You haven't placed any orders yet.")).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('shows an error when the orders cannot be loaded', async () => {
  await openOrders(REQUEST_FAILS);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load your orders. Please try again.",
  );
});

test('shows "Loading…" first', async () => {
  await openOrders(REQUEST_PENDING);

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
});

test('a 401 sends you to Log in', async () => {
  // /auth/providers (asked for by the login page) gets no Google or Facebook buttons.
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  renderAt('/orders', { customer: ada, orders: REQUEST_UNAUTHORIZED });

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
});
