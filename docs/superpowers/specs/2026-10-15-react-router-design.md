# Design: React Router page navigation

Date: 2026-10-15
Ticket: "Set up React Router to be able to navigate between the different pages of your app."

## Goal
Give the React front end (`front-end/`, Create React App) a working set of pages that you can move
between with a nav bar and by typing URLs. This is the **routing skeleton only**: every page is a
placeholder (a heading and a short line of text). Later tickets fill each page in and connect it to
the back end, one page at a time.

### Done when
- A nav bar on every page links to the main pages, and the current page's link is marked active.
- Each URL in the route table shows its page, and the two `:id` pages show the id from the URL.
- Any other URL shows a "Page not found" page, which keeps the nav and links back home.
- `npm test` in `front-end/` passes, and the tests were written (and seen failing) first.

### Out of scope
- **Real page content and API calls.** Each later page ticket connects its page as it's built.
- **Protected routes** (redirecting logged-out visitors). These come with the login page ticket,
  which also adds a "who is logged in?" endpoint.
- **The port clash.** CRA and the back end both default to port 3000; CRA offers another port when
  3000 is busy. A proper fix (a proxy) comes with the first ticket that calls the API.
- **Hiding Log in / Register when logged in.** This comes with the login ticket.

## Decisions
- **React Router v7, pinned (`react-router@^7.18.4`).** v8 (the latest) is ESM-only (`"type":
  "module"`, `exports` map only), and CRA's Jest 27 can't load it without fragile config overrides.
  v7 ships a CommonJS `main` file. The APIs used here are the same in v8, so upgrading later is
  small (or comes free with a future move from CRA to Vite).
- **Package name is `react-router`**, not `react-router-dom`. In v7 the DOM pieces were merged into
  `react-router`.
- **The data router style.** The routes are one array, exported from `src/routes.js`. `App`
  passes it to `createBrowserRouter`, which uses the real URL bar, and renders `<RouterProvider>`.
  The tests pass the **same array** to `createMemoryRouter` with `initialEntries`, so they check
  the real route table, starting at any URL, without a browser. This style also allows
  `loader`s and `errorElement`s, which later tickets will use.
- **Keep Create React App** for now, even though it's deprecated. Moving to Vite is a separate
  decision.
- **Possible `TextEncoder` polyfill.** React Router v7 can need `TextEncoder`, which CRA's jsdom
  test environment lacks. Only if the failing-test stage shows this error, add a polyfill in
  `src/setupTests.js` (from Node's `util` module).

## Route table
A layout route wraps every page so the header and nav show everywhere, including "not found".

| Path | Component | Placeholder shows |
|---|---|---|
| `/` (index) | `ProductsPage` | heading "Products" |
| `/products/:productId` | `ProductDetailPage` | heading "Product", text "Product id: {productId}" |
| `/register` | `RegisterPage` | heading "Register" |
| `/login` | `LoginPage` | heading "Log in" |
| `/account` | `AccountPage` | heading "Your account" |
| `/cart` | `CartPage` | heading "Your cart", plus a link "Go to checkout" to `/checkout` |
| `/checkout` | `CheckoutPage` | heading "Checkout" |
| `/orders` | `OrdersPage` | heading "Your orders" |
| `/orders/:orderId` | `OrderDetailPage` | heading "Order", text "Order id: {orderId}" |
| `*` | `NotFoundPage` | heading "Page not found", plus a link "Back to the shop" to `/` |

Each page's main heading is an `<h1>`. The site name in the header is not a heading, so tests can
find each page by its single `<h1>`.

## Components and files (`front-end/src/`)
- **`routes.js`** exports the `routes` array: one parent route, `{ path: '/', element: <Layout />,
  children: [...] }`, with the pages above as children (`index: true` for Products).
- **`App.js`** builds the browser router from `routes`, once at module level, and renders
  `<RouterProvider router={router} />`. It replaces the CRA demo and its broken `logo.svg` import.
- **`components/Layout.js`** renders a `<header>` holding the site name (a link home) and a
  `<nav>` of `NavLink`s: Products (`/`), Cart, Orders, Account, Log in, Register. (React Router
  v7 treats a `NavLink` to `/` as active only on exactly `/`, so it needs no `end` prop; found
  during implementation.) Then `<main>` with an `<Outlet />`, where the current page
  appears.
- **`pages/*.js`**: one file per page in the table above. The two detail pages read their id
  with `useParams()`.
- **CSS:** minimal styles in `App.css` for the header and nav, plus an `.active` style (the class
  `NavLink` adds to the current page's link). `App.css` is imported by `Layout.js`.
- **`index.js`** stays as it is (it renders `<App />`).
- Every file is fully annotated: imports and exports, JSX, props, hooks, arrow functions and so on.

## Testing (written first)
- **Delete `App.test.js`** (the CRA demo test) and add **`routes.test.js`**. A helper renders
  `createMemoryRouter(routes, { initialEntries: [url] })` inside `<RouterProvider>`.
- **Tests (React Testing Library, querying by role/name):**
  - **Table-driven** (`test.each` or a `for...of` loop): each path in the table shows its `<h1>`.
  - `/products/42` shows "Product id: 42", and `/orders/7` shows "Order id: 7".
  - An unknown URL (`/no-such-page`) shows "Page not found", still shows the nav, and its link
    goes back to Products.
  - **Nav (table-driven):** clicking each nav link shows that page's heading (`user-event`).
  - **Active link:** on `/cart`, the Cart link has `aria-current="page"` (which `NavLink` sets) and
    Products does not, so the `/` link isn't highlighted on every page.
  - **Cart to checkout:** clicking "Go to checkout" on `/cart` shows the Checkout page.
- **Confirm each test fails for the right reason** before implementing, e.g. "Cannot find module
  './routes'", then a missing heading. Make sure no test passes before its code exists.
- Mutation checks on important tests, e.g. swap `NavLink` for a plain `Link` and confirm the
  active-link tests fail.
- Run with `npm test --prefix front-end -- --watchAll=false` (CRA's test runner is in watch mode by
  default).

## Docs
- **README:**
  - add `front-end/` to the project structure;
  - add a "Front end" section: how to run it (`npm start`, the port 3000 prompt) and its tests,
    plus the page list;
  - add the front-end test count.
- **No changes needed** to `docs/api-endpoints.md`, `openapi.yaml` or the Newman collection,
  because no API changes.
