// Tests for the app's pages and navigation (React Router).
//
// These tests use the SAME route table the real app uses (routes.js), but put it inside a
// "memory router": a router that keeps its URL history in memory instead of the browser's
// address bar. That lets each test start at any URL, with no browser and no server. The helper
// that does this, renderAt(), lives in test-utils.js so other test files can use it too.

// `import { a, b } from '...'` is a "named import": it picks exports out of a module by name.
// screen searches the fake page (jsdom); within() searches inside one part of it; act() waits
// for React to finish updating.
import { act, screen, within } from '@testing-library/react';
// `import x from '...'` (no braces) is a "default import": the module's main export.
// userEvent simulates a real person, e.g. clicking a link.
import userEvent from '@testing-library/user-event';
// renderAt(url) shows the app's real routes at `url` (see test-utils.js). It returns the
// router, so a test can drive it directly (e.g. press "Back" with router.navigate(-1)).
import { renderAt } from './test-utils';

// Helper: find the main nav bar. `function name(params) { ... }` declares a function.
// `async` marks a function that uses `await`; `await` pauses until a Promise (a value that
// arrives later) is ready. findBy... queries keep retrying for a short time, which suits React
// Router because it can update the page a moment after a click.
async function findNav() {
  return screen.findByRole('navigation', { name: 'Main' });
}

// The customer these tests log in as. Pages such as Cart and Orders need someone logged in
// (see auth/RequireAuth.js), so tests that open them pass { customer: ada } to renderAt.
const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// The one product these tests' shop holds: product 42. renderAt answers GET /products/42 with
// it (and every other product id with a 404).
const teapot = {
  id: 42,
  category_id: null,
  sku: 'POT-001',
  name: 'Teapot',
  description: 'Holds 1 litre',
  price: '24.00',
  stock_quantity: 5,
};
const products = [teapot];

// Each row is [url, the page's <h1> heading, who's logged in]: one row for every route in
// routes.js. Log in and Register are only for logged-out visitors, so they're opened logged out
// (null); every other page is opened logged in. (auth/access.test.js tests the other cases.)
// `const` declares a variable that can't be reassigned.
const pages = [
  ['/', 'Products', ada],
  ['/products/42', 'Teapot', ada], // a product page's heading is the product's name
  ['/register', 'Register', null],
  ['/login', 'Log in', null],
  ['/account', 'Your account', ada],
  ['/cart', 'Your Cart', ada],
  ['/checkout', 'Checkout', ada],
  ['/orders', 'Your orders', ada],
  ['/orders/7', 'Order', ada],
  ['/no-such-page', 'Page not found', ada],
];

// test.each runs the same test once per row. Each row's values arrive as the arguments
// (url, heading, customer), and `%s` in the test name is replaced by the first two, so each run
// has its own name.
test.each(pages)('%s shows the "%s" page', async (url, heading, customer) => {
  renderAt(url, { customer, products });

  // findByRole('heading', { level: 1, ... }) waits for an <h1>; `name` is its visible text (exact
  // match). expect(...).toBeInTheDocument() comes from jest-dom (loaded in setupTests.js).
  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  // getAllByRole returns a list of EVERY match. Exactly one <h1> per page, so a heading is a
  // reliable way to tell which page is showing.
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});

test('the not-found page still shows the main nav', async () => {
  renderAt('/no-such-page');

  expect(await findNav()).toBeInTheDocument();
});

test('the not-found page links back to the shop', async () => {
  renderAt('/no-such-page');

  // Wait for the page, then click its link the way a person would.
  userEvent.click(await screen.findByRole('link', { name: 'Back to the shop' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});

test('the site name in the header links to the home page', async () => {
  // Start somewhere other than home, so reaching Products proves the link worked.
  renderAt('/no-such-page');

  userEvent.click(await screen.findByRole('link', { name: 'Melsy Mart' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});

// ----- Pages that take an id from the URL -----

test('a product page shows the product whose id is in the URL', async () => {
  renderAt('/products/42', { products });

  // findByText finds an element by its visible text (exact match by default).
  expect(await screen.findByText('Holds 1 litre')).toBeInTheDocument();
});

test('an order page shows the order id from the URL', async () => {
  renderAt('/orders/7', { customer: ada });

  expect(await screen.findByText('Order id: 7')).toBeInTheDocument();
});

// ----- The nav bar -----

// Each row is [the nav link's text, the heading of the page it should open, who's logged in].
// Cart, Orders and Account only appear in the nav when logged in; Log in and Register only when
// logged out.
const navTargets = [
  ['Products', 'Products', ada],
  ['Cart', 'Your Cart', ada],
  ['Orders', 'Your orders', ada],
  ['Account', 'Your account', ada],
  ['Log in', 'Log in', null],
  ['Register', 'Register', null],
];

test.each(navTargets)('clicking the "%s" nav link opens the "%s" page', async (linkText, heading, customer) => {
  // Start on the not-found page, so reaching ANY real page proves the click navigated.
  renderAt('/no-such-page', { customer });

  // within(nav) searches only inside the nav bar, so we click the nav's link and not some
  // other link on the page with the same text. findByRole waits for the link, because the nav
  // shows only Products until the app has found out who's logged in.
  userEvent.click(await within(await findNav()).findByRole('link', { name: linkText }));

  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
});

test("the current page's nav link is marked active, and Products is not", async () => {
  renderAt('/cart', { customer: ada });
  const nav = await findNav();

  // NavLink sets aria-current="page" on the link to the current page, which screen readers
  // announce. (It also adds class="active", which is what App.css uses to highlight the link.)
  // findByRole waits for the Cart link, which appears once the app knows Ada is logged in.
  expect(await within(nav).findByRole('link', { name: 'Cart' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Products links to '/', which every URL starts with, but it must only be active on the home
  // page itself (React Router treats links to '/' that way).
  expect(within(nav).getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');
});

test('the Products nav link is marked active on the home page', async () => {
  renderAt('/');
  const nav = await findNav();

  expect(within(nav).getByRole('link', { name: 'Products' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

// ----- Links between pages -----

test('the cart page links to checkout', async () => {
  // The checkout link only appears when the cart has something in it.
  const cart = {
    items: [{ product_id: 42, sku: 'POT-001', name: 'Teapot', price: '24.00', quantity: 1, line_total: '24.00' }],
    total: '24.00',
  };
  renderAt('/cart', { customer: ada, cart });

  userEvent.click(await screen.findByRole('link', { name: 'Proceed to checkout' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument();
});

// ----- URLs people might type, and the Back button -----

test('a URL with a trailing slash still finds its page', async () => {
  renderAt('/cart/', { customer: ada });

  expect(await screen.findByRole('heading', { level: 1, name: 'Your Cart' })).toBeInTheDocument();
});

test('a query string does not stop the home page from showing', async () => {
  // Later, the products page will read ?category= from the URL to filter products.
  renderAt('/?category=3');

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});

test('extra path segments after a real page show "Page not found"', async () => {
  renderAt('/orders/7/extra');

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeInTheDocument();
  // And it's not the order page: a too-long URL must not partly match /orders/:orderId.
  // queryBy... returns null instead of throwing when nothing is found, so it suits "not there".
  expect(screen.queryByText('Order id: 7')).not.toBeInTheDocument();
});

// The memory router keeps history the same way the browser router does, so going back here
// stands in for the browser's Back button (which a test can't press).
test('going back in history returns to the previous page', async () => {
  // Keep the router that renderAt returns, so the test can go back.
  const router = renderAt('/cart', { customer: ada });

  userEvent.click(await within(await findNav()).findByRole('link', { name: 'Orders' }));
  await screen.findByRole('heading', { level: 1, name: 'Your orders' });

  // router.navigate(-1) goes one step back in history, like the browser's Back button.
  // act() makes the test wait until React has finished drawing the result.
  await act(async () => {
    await router.navigate(-1);
  });

  expect(await screen.findByRole('heading', { level: 1, name: 'Your Cart' })).toBeInTheDocument();
});
