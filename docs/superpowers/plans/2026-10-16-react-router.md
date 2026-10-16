# React Router Page Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the React front end a nav bar and ten placeholder pages that you can move between by
clicking links or typing URLs, using React Router's data router.

**Architecture:** One route array (`front-end/src/routes.js`) holds a layout route (header, nav and
`<Outlet />`) with every page as a child. `App.js` passes it to `createBrowserRouter`, and the
tests pass the same array to `createMemoryRouter`, so the tests check the real route table at any
starting URL.

**Tech Stack:** Create React App 5 (`react-scripts`), React 19, `react-router` **v7** (pinned),
Jest 27 (via CRA), React Testing Library 16, `@testing-library/user-event` 13,
`@testing-library/jest-dom`.

**Spec:** `docs/superpowers/specs/2026-10-15-react-router-design.md`

## Global Constraints
- Install `react-router@^7.18.4`, **not** v8 (v8 is ESM-only and CRA's Jest 27 can't load it),
  and **not** `react-router-dom`.
- Import everything from `'react-router'`, never `'react-router/dom'` (Jest 27 can't resolve
  package `exports` subpaths).
- Keep Create React App; don't eject and don't add Jest config overrides.
- Every page has exactly one `<h1>`. The header's site name ("E-Commerce App") is a link, not a
  heading.
- Exact text (the tests depend on it): nav links "Products", "Cart", "Orders", "Account",
  "Log in", "Register"; headings as in the route table in Task 2; "Product id: {id}",
  "Order id: {id}", "Go to checkout", "Back to the shop"; `<nav aria-label="Main">`.
- **Fully annotate every file**, tests and CSS included: comment every block, and explain
  JavaScript/JSX syntax the first time it appears in each file. The code below is already
  annotated; keep the comments.
- Run front-end tests with `npm test --prefix front-end -- --watchAll=false` from the repo root
  (CRA's runner otherwise waits in watch mode).
- **The user commits themselves.** No `git commit` steps; the final task gives a commit message.
- Windows PowerShell 5.1: no `&&`; set env vars with `$env:NAME = 'value'; command`.

## Review Focus
Inputs the spec implies but doesn't list, which a person could easily hit. Each has a test in
Task 2:
- **Trailing slash** (`/cart/`) should show the cart, not "Page not found".
- **Query string** (`/?category=3`, which the products page will use later) should still show
  Products.
- **Extra path segments under a real page** (`/orders/7/extra`) should show "Page not found", not
  the order page.
- **The browser Back button** after clicking a nav link should return to the previous page.
- **The real entry point** (`App.js` with the browser router, not the test's memory router) should
  render the Products page at `/`. This is covered by `App.test.js` in Task 1.

---

### Task 1: Router wiring, layout and the not-found page

Install React Router, replace the CRA demo, and build the frame every page shares: the header, the
nav, `<main>` with an `<Outlet />`, the Products home page and the catch-all "Page not found"
page. The other nav links point at routes that don't exist yet; they show "Page not found" until
Task 2.

**Files:**
- Modify: `front-end/package.json`, `front-end/package-lock.json` (via `npm install`)
- Modify (only if Step 4 shows it's needed): `front-end/src/setupTests.js`
- Create: `front-end/src/routes.test.js`
- Replace: `front-end/src/App.test.js` (the CRA demo test)
- Create: `front-end/src/routes.js`
- Create: `front-end/src/components/Layout.js`
- Create: `front-end/src/pages/ProductsPage.js`
- Create: `front-end/src/pages/NotFoundPage.js`
- Replace: `front-end/src/App.js`

**Interfaces:**
- Produces: `routes.js` exports a **named** export `routes`: an array with one object,
  `{ path: '/', element: <Layout />, children: [...] }`. Task 2 adds child routes to `children`.
- Produces: `routes.test.js` defines the helper `renderAt(url)`, which renders the routes at `url`
  and returns the memory router (so a test can call `router.navigate(-1)`). It also defines the
  table `pages` of `[url, heading]` rows, which Task 2 extends.
- Produces: each page is a default-exported function component in `src/pages/`.

- [ ] **Step 1: Install React Router v7**

Run (from the repo root):
```powershell
npm install react-router@^7.18.4 --prefix front-end
```
Expected: `package.json` gains `"react-router": "^7.18.4"` under `dependencies`. Check
`npm ls react-router --prefix front-end` shows a 7.x version.

- [ ] **Step 2: Write the failing routing tests**

Create `front-end/src/routes.test.js`:

```js
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

// Each row is [url, the page's <h1> heading]. Task 2 adds the rest of the pages to this table.
// `const` declares a variable that can't be reassigned.
const pages = [
  ['/', 'Products'],
  ['/no-such-page', 'Page not found'],
];

// test.each runs the same test once per row. Each row's values arrive as the arguments
// (url, heading), and `%s` in the test name is replaced by them, so each run has its own name.
test.each(pages)('%s shows the "%s" page', async (url, heading) => {
  renderAt(url);

  // getByRole('heading', { level: 1 }) finds an <h1>; `name` is its visible text (exact match).
  // expect(...).toBeInTheDocument() comes from jest-dom (loaded in setupTests.js).
  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  // Exactly one <h1> per page, so a heading is a reliable way to tell which page is showing.
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
```

Replace `front-end/src/App.test.js` (the CRA demo test) with:

```js
// Test for App, the real entry point. routes.test.js checks the route table with a memory
// router; this checks that App wires that table into the BROWSER router correctly.

// Named imports (picked out by name) from React Testing Library.
import { render, screen } from '@testing-library/react';
// Default import: App is the main (default) export of App.js.
import App from './App';

test('App shows the Products page at the home URL', async () => {
  // The fake browser (jsdom) starts at http://localhost/, so App should show the home page.
  render(<App />);

  // findByRole waits a moment for the page to appear; `await` pauses until it does.
  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Create an empty route table so the tests fail for the right reason**

Without `routes.js`, the whole file fails with "Cannot find module './routes'", which hides
the individual tests. Create `front-end/src/routes.js` with an empty table for now:

```js
// The app's route table: which component to show for each URL. Filled in during Step 5.
export const routes = [];
```

- [ ] **Step 4: Run the tests and check each fails for the right reason**

Run: `npm test --prefix front-end -- --watchAll=false`

Expected:
- **`routes.test.js`:** all 5 tests FAIL with "Unable to find role="heading"" / "role="link"" /
  "role="navigation"". The route table is empty, so nothing renders.
- **`App.test.js`:** FAILS. `App.js` still imports the deleted `./logo.svg` ("Cannot find module
  './logo.svg'").

**If instead** a suite fails with `ReferenceError: TextEncoder is not defined`, CRA's jsdom lacks
something React Router needs. Add this to the end of `front-end/src/setupTests.js`, then rerun:

```js
// React Router uses TextEncoder/TextDecoder (built-in text <-> bytes converters). Browsers and
// Node have them, but the fake browser (jsdom) these tests run in doesn't, so borrow Node's.
// Object.assign(target, source) copies each property of `source` onto `target`; `global` is the
// test environment's global object, so this makes them available everywhere.
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });
```

**If** a navigation test fails with `ReferenceError: Request is not defined`, run
`npm install --save-dev whatwg-fetch --prefix front-end` and add to `setupTests.js`:

```js
// React Router builds a `Request` object (part of the fetch API) for every navigation. jsdom
// doesn't have one; whatwg-fetch adds the fetch API to the test environment.
import 'whatwg-fetch';
```

Note which polyfills (if any) were needed, for the final summary. Rerun until the failures are
only the expected ones above.

- [ ] **Step 5: Write the layout, two pages and the route table**

Create `front-end/src/components/Layout.js`:

```js
// Layout: the frame shown around every page. It has a header (the site name and the main nav)
// and a <main> area where the current page appears.

// Named imports from React Router:
// - Link: a link that changes page without reloading the whole website;
// - NavLink: a Link that knows when it points at the current page and marks itself active
//   (it adds class="active" and aria-current="page");
// - Outlet: a placeholder that shows whichever child route matches the URL.
import { Link, NavLink, Outlet } from 'react-router';
// Importing a CSS file applies its styles; CRA's build tool bundles it into the page.
import '../App.css';

// The nav links, stored as data so the JSX below can loop over them instead of repeating
// <NavLink> six times. Each object has `to` (the URL) and `label` (the visible text).
const navLinks = [
  { to: '/', label: 'Products' },
  { to: '/cart', label: 'Cart' },
  { to: '/orders', label: 'Orders' },
  { to: '/account', label: 'Account' },
  { to: '/login', label: 'Log in' },
  { to: '/register', label: 'Register' },
];

// A React component is a function that returns JSX (HTML-like markup).
// `export default` makes Layout this file's main export, imported without braces.
export default function Layout() {
  return (
    // <>...</> is a "fragment": it groups elements without adding an extra <div> to the page.
    <>
      {/* In JSX, comments go inside {curly braces}. className is JSX's name for HTML's class. */}
      <header className="site-header">
        {/* The site name is a plain link home, not a heading: each page has its own <h1>. */}
        <Link to="/" className="site-name">
          E-Commerce App
        </Link>

        {/* aria-label names this nav for screen readers (and for the tests: name 'Main'). */}
        <nav aria-label="Main">
          <ul className="nav-links">
            {/* {...} inside JSX runs JavaScript. navLinks.map() turns each object into a <li>.
                ({ to, label }) is "destructuring": it unpacks those two properties into
                variables. `=>` defines an arrow function (a short way to write a function). */}
            {navLinks.map(({ to, label }) => (
              // React needs a unique `key` on each item in a list, to track them between updates.
              <li key={to}>
                {/* `end` means "only active on exactly this URL". Without it, the Products
                    link ('/') would count as active on every page, since every URL starts
                    with '/'. `to === '/'` is true only for that link. */}
                <NavLink to={to} end={to === '/'}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="page">
        {/* The page that matches the current URL is drawn here. */}
        <Outlet />
      </main>
    </>
  );
}
```

Create `front-end/src/pages/ProductsPage.js`:

```js
// The Products page (the home page, at '/'). A placeholder for now: a later ticket will fetch
// the products from the API and list them here.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function ProductsPage() {
  return (
    // A <section> groups the page's content. Every page has exactly one <h1>.
    <section>
      <h1>Products</h1>
      <p>Browse everything in the shop. (Coming soon.)</p>
    </section>
  );
}
```

Create `front-end/src/pages/NotFoundPage.js`:

```js
// The "Page not found" page, shown for any URL that doesn't match a route (the '*' route).

// Link changes page without reloading the whole website. `{ Link }` is a named import.
import { Link } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>Sorry, there's no page at this address.</p>
      {/* A way back, so the visitor isn't stuck. */}
      <Link to="/">Back to the shop</Link>
    </section>
  );
}
```

Replace the contents of `front-end/src/routes.js`:

```js
// The app's route table: which component to show for each URL.
// It's a plain array, shared by the real app (App.js, browser router) and the tests
// (routes.test.js, memory router), so the tests check exactly what users get.

// Default imports (no braces): each file's main export.
import Layout from './components/Layout';
import ProductsPage from './pages/ProductsPage';
import NotFoundPage from './pages/NotFoundPage';

// `export const` makes `routes` a named export (imported as `import { routes } from './routes'`).
export const routes = [
  {
    // The layout route matches every URL that starts with '/' (all of them) and draws Layout.
    // Layout's <Outlet /> then shows whichever child below matches the rest of the URL.
    path: '/',
    // `element` is what to draw: JSX for the Layout component.
    element: <Layout />,
    children: [
      // `index: true` means "the child for exactly '/'", i.e. the home page.
      { index: true, element: <ProductsPage /> },
      // '*' matches any URL no other route matched. React Router ranks routes by how specific
      // they are, not by their order, so this catch-all never hides a real page.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
```

Replace the contents of `front-end/src/App.js`:

```js
// App: the top-level component (index.js renders it into the page).
// It turns the route table into a router that follows the browser's real address bar.

// Named imports from React Router:
// - createBrowserRouter builds a router that reads and changes the browser's URL;
// - RouterProvider draws the page for the router's current URL.
import { createBrowserRouter, RouterProvider } from 'react-router';
// `{ routes }` is a named import of the route table from routes.js.
import { routes } from './routes';

// Build the router once, when this file first loads, not every time App draws. It keeps the
// app's navigation state, so it should only ever be created once.
const router = createBrowserRouter(routes);

// A component is a function returning JSX; `export default` makes App this file's main export.
export default function App() {
  // `router={router}` passes the router to RouterProvider as a prop (an input).
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test --prefix front-end -- --watchAll=false`
Expected: `Tests: 6 passed, 6 total` (5 in `routes.test.js`, 1 in `App.test.js`), and no
"act(...)" or other warnings in the output. If there are warnings, investigate them before
moving on.

- [ ] **Step 7: Mutation check on the catch-all route**

Temporarily delete the `{ path: '*', element: <NotFoundPage /> }` line in `routes.js` and rerun.
Expected: the `/no-such-page` table row and the three not-found/site-name tests FAIL. Put the line
back and rerun to confirm 6 pass.

---

### Task 2: The remaining pages, the full route table and navigation

Add the eight other pages, give each a route, and test every URL, the two `:id` pages, every nav
link, the active-link marking, cart to checkout, and the Review Focus inputs.

**Files:**
- Modify: `front-end/src/routes.test.js` (extend `pages`, add tests)
- Create: `front-end/src/pages/ProductDetailPage.js`, `RegisterPage.js`, `LoginPage.js`,
  `AccountPage.js`, `CartPage.js`, `CheckoutPage.js`, `OrdersPage.js`, `OrderDetailPage.js`
- Modify: `front-end/src/routes.js` (add eight child routes)

**Interfaces:**
- Consumes: `routes` (named export) and its `children` array from Task 1. Also `renderAt(url)`,
  `findNav()` and `pages` in `routes.test.js`.
- Produces: the full route table:

| Path | Component | `<h1>` | Other text |
|---|---|---|---|
| `/` (index) | `ProductsPage` | Products | |
| `/products/:productId` | `ProductDetailPage` | Product | "Product id: {productId}" |
| `/register` | `RegisterPage` | Register | |
| `/login` | `LoginPage` | Log in | |
| `/account` | `AccountPage` | Your account | |
| `/cart` | `CartPage` | Your cart | link "Go to checkout" → `/checkout` |
| `/checkout` | `CheckoutPage` | Checkout | |
| `/orders` | `OrdersPage` | Your orders | |
| `/orders/:orderId` | `OrderDetailPage` | Order | "Order id: {orderId}" |
| `*` | `NotFoundPage` | Page not found | link "Back to the shop" → `/` |

- [ ] **Step 1: Write the failing tests**

In `front-end/src/routes.test.js`, replace the `pages` table with the full one:

```js
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
```

Then add these tests to the end of the file:

```js
// ----- Pages that take an id from the URL -----

test('a product page shows the product id from the URL', async () => {
  renderAt('/products/42');

  // getByText finds an element by its visible text (exact match by default).
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

  // NavLink sets aria-current="page" on the link to the current page. Screen readers announce it,
  // and it's what the CSS uses to highlight the link.
  expect(within(nav).getByRole('link', { name: 'Cart' })).toHaveAttribute('aria-current', 'page');
  // Products links to '/'. Without `end`, it would wrongly count as active on every page.
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

test('the browser Back button returns to the previous page', async () => {
  // Keep the router that renderAt returns, so the test can press "Back".
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
```

- [ ] **Step 2: Run the tests and check each fails for the right reason**

Run: `npm test --prefix front-end -- --watchAll=false`

Expected: **19 FAIL, 10 pass** (29 total).

The 19 failures (8 + 2 + 5 + 1 + 1 + 1 + 1):
- the 8 new table rows;
- both id tests;
- the nav clicks for Cart, Orders, Account, Log in and Register;
- the "/cart" active-link test;
- cart to checkout;
- the trailing slash;
- Back.

Most fail with "Unable to find role="heading"" for the expected name, because the page shows
"Page not found" instead. The id tests fail with "Unable to find an element with the text". Check
that every failure in the output is one of these, failing for that reason.

**Expected early passes.** These pass before the new code, and that's correct, so say so in the
summary rather than treating it as a problem:
- the 6 Task 1 tests;
- the Products nav click;
- "Products is active on the home page";
- the query string test: these cover pages from Task 1.
- **"extra path segments"**: with no order routes yet, every unknown URL already shows "Page not
  found". The test's job is to catch a *future* mistake (a route like `orders/:orderId/*`), so
  mutation check 3 in Step 5 proves it can fail.

- [ ] **Step 3: Write the eight pages**

Create `front-end/src/pages/ProductDetailPage.js`:

```js
// A single product's page (at /products/:productId). A placeholder for now: a later ticket will
// fetch the product from the API.

// useParams is a React Router "hook": a function, starting with `use`, that a component calls to
// read something from React. It returns the URL's parameters, here { productId: '42' }.
import { useParams } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function ProductDetailPage() {
  // `const { productId } = ...` is destructuring: it takes the productId property out of the
  // object useParams() returns. URL parameters are always strings ('42', not 42).
  const { productId } = useParams();

  return (
    <section>
      <h1>Product</h1>
      {/* {productId} inside JSX inserts the variable's value into the text. */}
      <p>Product id: {productId}</p>
    </section>
  );
}
```

Create `front-end/src/pages/RegisterPage.js`:

```js
// The Register page (at /register). A placeholder for now: a later ticket adds the sign-up form.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function RegisterPage() {
  return (
    <section>
      <h1>Register</h1>
      <p>Create an account. (Coming soon.)</p>
    </section>
  );
}
```

Create `front-end/src/pages/LoginPage.js`:

```js
// The Log in page (at /login). A placeholder for now: a later ticket adds the login form.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function LoginPage() {
  return (
    <section>
      <h1>Log in</h1>
      <p>Log in to your account. (Coming soon.)</p>
    </section>
  );
}
```

Create `front-end/src/pages/AccountPage.js`:

```js
// The Account page (at /account). A placeholder for now: a later ticket shows and edits the
// logged-in customer's details.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function AccountPage() {
  return (
    <section>
      <h1>Your account</h1>
      <p>Your details. (Coming soon.)</p>
    </section>
  );
}
```

Create `front-end/src/pages/CartPage.js`:

```js
// The Cart page (at /cart). A placeholder for now: a later ticket fetches the cart from the API.

// Link changes page without reloading the whole website. `{ Link }` is a named import.
import { Link } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function CartPage() {
  return (
    <section>
      <h1>Your cart</h1>
      <p>The items in your cart. (Coming soon.)</p>
      {/* Checkout isn't in the nav bar: customers reach it from their cart. */}
      <Link to="/checkout">Go to checkout</Link>
    </section>
  );
}
```

Create `front-end/src/pages/CheckoutPage.js`:

```js
// The Checkout page (at /checkout). A placeholder for now: a later ticket adds the address and
// payment form.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function CheckoutPage() {
  return (
    <section>
      <h1>Checkout</h1>
      <p>Enter your address and pay. (Coming soon.)</p>
    </section>
  );
}
```

Create `front-end/src/pages/OrdersPage.js`:

```js
// The Orders page (at /orders). A placeholder for now: a later ticket lists the customer's
// order history from the API.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function OrdersPage() {
  return (
    <section>
      <h1>Your orders</h1>
      <p>Your order history. (Coming soon.)</p>
    </section>
  );
}
```

Create `front-end/src/pages/OrderDetailPage.js`:

```js
// A single order's page (at /orders/:orderId). A placeholder for now: a later ticket fetches the
// order's details from the API.

// useParams is a React Router "hook": a function, starting with `use`, that a component calls to
// read something from React. It returns the URL's parameters, here { orderId: '7' }.
import { useParams } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function OrderDetailPage() {
  // Destructuring: take the orderId property out of the object useParams() returns.
  // URL parameters are always strings ('7', not 7).
  const { orderId } = useParams();

  return (
    <section>
      <h1>Order</h1>
      {/* {orderId} inside JSX inserts the variable's value into the text. */}
      <p>Order id: {orderId}</p>
    </section>
  );
}
```

- [ ] **Step 4: Add the routes**

Replace the contents of `front-end/src/routes.js`:

```js
// The app's route table: which component to show for each URL.
// It's a plain array, shared by the real app (App.js, browser router) and the tests
// (routes.test.js, memory router), so the tests check exactly what users get.

// Default imports (no braces): each file's main export.
import Layout from './components/Layout';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import NotFoundPage from './pages/NotFoundPage';

// `export const` makes `routes` a named export (imported as `import { routes } from './routes'`).
export const routes = [
  {
    // The layout route matches every URL that starts with '/' (all of them) and draws Layout.
    // Layout's <Outlet /> then shows whichever child below matches the rest of the URL.
    path: '/',
    // `element` is what to draw: JSX for the Layout component.
    element: <Layout />,
    // Child paths have no leading '/': they're relative to the parent ('cart' means '/cart').
    children: [
      // `index: true` means "the child for exactly '/'", i.e. the home page.
      { index: true, element: <ProductsPage /> },
      // ':productId' is a URL parameter: it matches any one segment (e.g. '42') and the page
      // reads it with useParams(). The name must match what the page reads.
      { path: 'products/:productId', element: <ProductDetailPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
      // '*' matches any URL no other route matched. React Router ranks routes by how specific
      // they are, not by their order, so this catch-all never hides a real page.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
```

- [ ] **Step 5: Run the tests, then do mutation checks**

Run: `npm test --prefix front-end -- --watchAll=false`
Expected: `Tests: 29 passed, 29 total` (28 in `routes.test.js`, 1 in `App.test.js`), with no
warnings.

Mutation checks. Make each change, rerun, confirm the named test FAILS, then undo it:
1. Remove `end={to === '/'}` from `Layout.js`. Expected: "the current page's nav link is marked
   active, and Products is not" FAILS.
2. In `routes.js`, rename `:productId` to `:id`. Expected: "a product page shows the product id"
   FAILS (the page shows "Product id: " with nothing after it).
3. In `routes.js`, change `'orders/:orderId'` to `'orders/:orderId/*'`. Expected: "extra path
   segments after a real page" FAILS.

Rerun once more after undoing all three: 29 pass.

---

### Task 3: Styles, build check and documentation

Add basic styles for the header and nav (including the active link), check the production build
compiles without lint warnings, try it in a browser, and update the README.

**Files:**
- Replace: `front-end/src/App.css` (CRA demo styles)
- Modify: `README.md` (Project Structure, How to Use, Technologies, Testing)

**Interfaces:**
- Consumes: class names from `Layout.js`: `.site-header`, `.site-name`, `.nav-links`, `.page`,
  and NavLink's `.active`.

- [ ] **Step 1: Replace the CRA demo styles**

Replace the contents of `front-end/src/App.css`:

```css
/* Styles for the Layout component: the header, the main nav and the page area.
   (CSS comments use slash-star ... star-slash.) */

/* The header: the site name on the left, nav links on the right, in one row.
   display: flex lines its children up in a row; justify-content spaces them out;
   align-items centres them vertically; flex-wrap lets them wrap onto two lines on narrow screens. */
.site-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem; /* space between the site name and the nav (1rem = the root font size, ~16px) */
  padding: 1rem 1.5rem; /* 1rem top and bottom, 1.5rem left and right */
  border-bottom: 1px solid #ddd;
}

/* The site name: bold, and not underlined like a normal link. */
.site-name {
  font-weight: bold;
  font-size: 1.25rem;
  text-decoration: none;
  color: inherit; /* use the surrounding text colour instead of link blue */
}

/* The list of nav links: in a row, with the bullet points and default list spacing removed. */
.nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

/* Every nav link. ".nav-links a" means "any <a> inside .nav-links" (NavLink draws an <a>). */
.nav-links a {
  text-decoration: none;
  color: #1a4fa0;
}

/* The link to the current page. NavLink adds class="active" to it automatically.
   ".nav-links a.active" means an <a> that has the class "active", inside .nav-links. */
.nav-links a.active {
  font-weight: bold;
  text-decoration: underline;
}

/* The area where each page is drawn. */
.page {
  padding: 1.5rem;
}
```

- [ ] **Step 2: Check the production build compiles cleanly**

Run (PowerShell). `CI=true` makes CRA treat lint warnings, such as unused imports, as errors:
```powershell
$env:CI = 'true'; npm run build --prefix front-end
```
Expected: "Compiled successfully." and a `front-end/build/` folder. It's already ignored by
`front-end/.gitignore`. If it fails, fix the reported warning (and keep its file annotated).

- [ ] **Step 3: Try it in a browser**

Start the dev server in the background, with `BROWSER=none` so it doesn't try to open a window:
```powershell
$env:BROWSER = 'none'; npm start --prefix front-end
```
Poll `http://localhost:3000` until it answers. (Make sure the back end isn't running, because both
use port 3000. If it's taken, CRA asks to use another port, and a background process can't answer.)
Check that `http://localhost:3000/cart` returns the app's HTML: in development, every URL is
served `index.html` and the router picks the page. Stop the server afterwards. Tell the user they
can run `npm start` in `front-end/` to click around themselves.

- [ ] **Step 4: Update the README**

Make these changes in `README.md`:

1. **Project Structure**: add a `front-end/` block between `back-end/` and `docs/`. Use the
   same box-drawing style:

```
├── front-end/          # React app (Create React App)
│   ├── public/
│   │   └── index.html  # The one HTML page; React draws everything inside it
│   ├── src/
│   │   ├── index.js    # Entry point: draws <App /> into index.html
│   │   ├── App.js      # Builds the browser router from the route table
│   │   ├── App.css     # Styles for the header, nav and page area
│   │   ├── routes.js   # Route table: which page to show for each URL
│   │   ├── components/
│   │   │   └── Layout.js # Header, main nav and the area where each page appears
│   │   ├── pages/      # One component per page (placeholders for now)
│   │   ├── routes.test.js # Tests for every page URL and the navigation
│   │   ├── App.test.js # Tests that App shows the home page
│   │   └── setupTests.js # Test setup: jest-dom matchers (and any polyfills)
│   └── package.json
```

2. **How to Use → "1. Clone the repository and install dependencies"**: install both folders:

```bash
git clone <repository-url>
cd e-commerce-app/back-end
npm install
cd ../front-end
npm install
```

3. **How to Use**: after "API documentation (Swagger)" and before "6. Run the tests", add a new
   subsection:

```markdown
### Front end (React)
The front end is a React app in the `front-end` folder, made with Create React App. It uses
[React Router](https://reactrouter.com/) (v7) to move between pages without reloading the site.
So far it's a skeleton: each page is a placeholder that later tickets will connect to the API.

Start it from the `front-end` folder:
```bash
npm start
```
This opens http://localhost:3000. The back end also uses port 3000, so if the server is
running, Create React App asks to use another port (answer `y`). Connecting the two comes in a
later ticket.

| URL | Page |
|---|---|
| `/` | Products (the home page) |
| `/products/:productId` | A single product |
| `/register` | Register |
| `/login` | Log in |
| `/account` | Your account |
| `/cart` | Your cart (links to checkout) |
| `/checkout` | Checkout |
| `/orders` | Your orders |
| `/orders/:orderId` | A single order |
| anything else | Page not found |

The nav bar at the top links to the main pages and highlights the one you're on.
```

(In the README, use a four-backtick fence around the outer block if you paste it as one piece.
Or just write the section directly, without the outer fence.)

4. **6. Run the tests**: change the intro line "There are two kinds of automated test. Both are
   run from the `back-end` folder:" to say the table covers the **back end**, then add after
   the table:

```markdown
The front end has its own tests, run from the `front-end` folder:
```bash
npm test -- --watchAll=false
```
They use Jest and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/),
which come with Create React App. They draw each page in a fake browser (no server needed) and
click links the way a person would. Without `--watchAll=false`, `npm test` stays open and
reruns the tests whenever you save a file.
```

5. **Technologies**: add `- React Router: moving between pages in the React app` after `- React`,
   and `- Jest and React Testing Library: front-end tests` after the `node:test` line.

6. **Error Handling and Testing → Testing**: after the paragraph on the E2E collection and
   before "See [Run the tests]...", add:

```markdown
The **front end** has 29 tests (Jest and React Testing Library): every page URL showing the
right page (one `<h1>` each), product and order ids read from the URL, unknown URLs (including
extra segments after a real page) showing "Page not found" with the nav still there, every nav
link opening its page, the current page's link marked active, links from the cart to checkout
and from "not found" back to the shop, trailing slashes, query strings, the Back button, and
the real `App` showing the home page.
```

Keep the "There are 260 tests" wording, which is about the API.

- [ ] **Step 5: Final verification**

Run all of these and read the output before claiming anything:
- `npm test --prefix front-end -- --watchAll=false`. Expected: 29 passed, 0 failed, no warnings.
- `$env:CI = 'true'; npm run build --prefix front-end`. Expected: "Compiled successfully."
- `git status --short`. Expected changes:
  - `front-end/package.json` and `package-lock.json`;
  - `front-end/src/App.js`, `App.css`, `App.test.js`;
  - (maybe) `setupTests.js`;
  - new `routes.js`, `routes.test.js`, `components/`, `pages/`;
  - `README.md`;
  - the spec and plan under `docs/superpowers/`;
  - `HANDOVER.md` (untracked, from before).

The back end is untouched, so its 260 tests and the E2E collection don't need rerunning.

- [ ] **Step 6: Give the user a commit message**

Don't commit. Report:
- the test counts;
- which polyfills (if any) were needed;
- the results of the mutation checks;
- any departures from this plan.

Then give this commit message (add a polyfill line if one was needed):

```
Set up React Router with placeholder pages and navigation

- Add react-router v7 (v8 is ESM-only and won't load in CRA's Jest)
- Shared route table (routes.js) used by the browser router in App.js
  and by memory-router tests
- Layout with header, main nav (NavLink, active link) and Outlet
- Placeholder pages: products, product, register, log in, account,
  cart, checkout, orders, order, and page not found
- 29 front-end tests (Jest + React Testing Library)
- Replace the CRA demo app, styles and test
- README: front-end structure, how to run it and its tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
