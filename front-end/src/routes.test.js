// Tests for the app's pages and navigation (React Router).
//
// These tests use the SAME route table the real app uses (routes.js), but put it inside a
// "memory router": a router that keeps its URL history in memory instead of the browser's
// address bar. That lets each test start at any URL, with no browser and no server.

// `import { a, b } from '...'` is a "named import": it picks exports out of a module by name.
// render() draws a component into a fake page (jsdom); screen searches that page; within()
// searches inside one part of it; act() waits for React to finish updating.
import { act, render, screen, within } from '@testing-library/react';
// `import x from '...'` (no braces) is a "default import": the module's main export.
// userEvent simulates a real person, e.g. clicking a link.
import userEvent from '@testing-library/user-event';
// createMemoryRouter builds a router from a route table; RouterProvider shows its current page.
import { createMemoryRouter, RouterProvider } from 'react-router';
// The app's real route table, the thing under test.
import { routes } from './routes';

// Helper: show the app as if the browser had opened `url`.
// `function name(params) { ... }` declares a function. It returns the router so a test can
// drive it directly (e.g. press "Back" with router.navigate(-1)).
function renderAt(url) {
  // initialEntries is the starting history: a list of URLs, and the last one is the current page.
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  // <RouterProvider router={router} /> is JSX: HTML-like syntax for creating React elements.
  // `router={router}` passes the router to the component as a "prop" (an input).
  render(<RouterProvider router={router} />);
  return router;
}

// Helper: find the main nav bar. `async` marks a function that uses `await`; `await` pauses
// until a Promise (a value that arrives later) is ready. findBy... queries keep retrying for a
// short time, which suits React Router because it can update the page a moment after a click.
async function findNav() {
  return screen.findByRole('navigation', { name: 'Main' });
}

// Each row is [url, the page's <h1> heading]: one row for every route in routes.js.
// `const` declares a variable that can't be reassigned.
const pages = [
  ['/', 'Products'],
  ['/products/42', 'Product'],
  ['/register', 'Register'],
  ['/login', 'Log in'],
  ['/account', 'Your account'],
  ['/cart', 'Your cart'],
  ['/checkout', 'Checkout'],
  ['/orders', 'Your orders'],
  ['/orders/7', 'Order'],
  ['/no-such-page', 'Page not found'],
];

// test.each runs the same test once per row. Each row's values arrive as the arguments
// (url, heading), and `%s` in the test name is replaced by them, so each run has its own name.
test.each(pages)('%s shows the "%s" page', async (url, heading) => {
  renderAt(url);

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

  userEvent.click(await screen.findByRole('link', { name: 'E-Commerce App' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});

// ----- Pages that take an id from the URL -----

test('a product page shows the product id from the URL', async () => {
  renderAt('/products/42');

  // findByText finds an element by its visible text (exact match by default).
  expect(await screen.findByText('Product id: 42')).toBeInTheDocument();
});

test('an order page shows the order id from the URL', async () => {
  renderAt('/orders/7');

  expect(await screen.findByText('Order id: 7')).toBeInTheDocument();
});

// ----- The nav bar -----

// Each row is [the nav link's text, the heading of the page it should open].
const navTargets = [
  ['Products', 'Products'],
  ['Cart', 'Your cart'],
  ['Orders', 'Your orders'],
  ['Account', 'Your account'],
  ['Log in', 'Log in'],
  ['Register', 'Register'],
];

test.each(navTargets)('clicking the "%s" nav link opens the "%s" page', async (linkText, heading) => {
  // Start on the not-found page, so reaching ANY real page proves the click navigated.
  renderAt('/no-such-page');

  // within(nav) searches only inside the nav bar, so we click the nav's link and not some
  // other link on the page with the same text.
  userEvent.click(within(await findNav()).getByRole('link', { name: linkText }));

  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
});

test("the current page's nav link is marked active, and Products is not", async () => {
  renderAt('/cart');
  const nav = await findNav();

  // NavLink sets aria-current="page" on the link to the current page, which screen readers
  // announce. (It also adds class="active", which is what App.css uses to highlight the link.)
  expect(within(nav).getByRole('link', { name: 'Cart' })).toHaveAttribute('aria-current', 'page');
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
  renderAt('/cart');

  userEvent.click(await screen.findByRole('link', { name: 'Go to checkout' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument();
});

// ----- URLs people might type, and the Back button -----

test('a URL with a trailing slash still finds its page', async () => {
  renderAt('/cart/');

  expect(await screen.findByRole('heading', { level: 1, name: 'Your cart' })).toBeInTheDocument();
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
  const router = renderAt('/cart');

  userEvent.click(within(await findNav()).getByRole('link', { name: 'Orders' }));
  await screen.findByRole('heading', { level: 1, name: 'Your orders' });

  // router.navigate(-1) goes one step back in history, like the browser's Back button.
  // act() makes the test wait until React has finished drawing the result.
  await act(async () => {
    await router.navigate(-1);
  });

  expect(await screen.findByRole('heading', { level: 1, name: 'Your cart' })).toBeInTheDocument();
});
