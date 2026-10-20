# Design: Sessions that last, knowing who's logged in, and logging out

Date: 2026-10-20
Ticket: "Use the express-session module to enable session support for the application in order
to maintain login state." Plus the user's own addition: "I also need to implement the logout
function."

## Why
express-session and `passport.session()` already run in `back-end/app.js`, so the ticket's
literal wording was met when the API's login was built. The user chose to make this ticket close
three real gaps, plus logging out in the app:
1. **Sessions live in the server's memory.** Every API restart, including each `npm run dev`
   reload, logs everyone out. express-session's own docs say the default MemoryStore isn't for
   production: it leaks memory and doesn't work across more than one server process.
2. **The cookie has no expiry.** It ends when the browser closes.
3. **The React app doesn't know who's logged in.** The nav always shows "Log in" and "Register",
   there's no Log out button, and protected pages are reachable while logged out.

This is a learning and portfolio project; it runs locally (deployment is a later ticket).

## Goal
- Sessions are stored in PostgreSQL and survive API restarts.
- A login lasts 7 days.
- The React app knows who's logged in, and the nav follows layout **B**: show only what you can
  use.
- Protected pages send logged-out visitors to the login page.
- A Log out button in the nav ends the session.

### Done when
- Restarting the API doesn't log anyone out, which is tested with a real store.
- The session cookie expires 7 days ahead (an `Expires` date), which is refreshed on each visit.
- Logged out, the nav shows **Products, Log in, Register**. Logged in, it shows **Products,
  Cart, Orders, Account, "Hi, Ada", Log out**.
- Opening `/cart`, `/checkout`, `/orders`, `/orders/:id` or `/account` while logged out goes to
  `/login`. After logging in, the customer goes back to that page.
- Logging out removes the session from the database. Replaying the old cookie is then logged
  out, and the nav switches back.
- Back-end, front-end and E2E tests pass. The new tests were written first and seen failing.
- The README explains all of it.

### Non-goals
- Deploying, secure (HTTPS-only) cookies, or `trust proxy`. These belong to the Render ticket.
  The design notes what changes then.
- "Log out of all devices", or listing active sessions.
- Real content on the protected pages. They stay placeholders and only get the login gate.
- Reacting to a session expiring while the page is open. There are no data-loading pages yet
  that would notice.
- Remembering the "return to" page across Google or Facebook sign-in (see Decisions).
- Admin or other roles.

### Anti-goals (a failure even if it works)
- **The old session still works after logging out**, for example the cookie replayed, or the
  row left in the database.
- **The nav says you're logged in when you aren't, or the other way round.**
- **A protected page flashes, or redirects to login, while the app is still checking who's
  logged in.** A logged-in customer opening `/cart` directly must not be bounced to `/login`.
- **The "return to" page can send the browser to another website** (an open redirect).
- **A logged-out visitor sees red 401 errors in the browser console** on every page load.
- **Tests become flaky, or hang,** because of the store's background timers or open database
  connections.

## Decisions (the user's)
- **All three gaps plus logging out, as one ticket.**
- **Stay logged in for 7 days.**
- **Nav layout B.**
  - Logged out: Products · Log in · Register.
  - Logged in: Products · Cart · Orders · Account · "Hi, {first name}" · Log out.
- **Logged-out visitors who open a protected page go to the login page.**

## Decisions (my calls; the user can overrule)
- **Store:** `connect-pg-simple`, using the app's existing `pg` pool (`pool` from `db/index.js`).
  - The table is created by `schema.sql` and migration `004-add-session-table.sql`, not by the
    library's `createTableIfMissing`. That way the database's shape stays in one place,
    alongside every other table.
  - The table follows the library's own schema: a `session` table with `sid varchar` primary
    key, `sess json NOT NULL` and `expire timestamp(6) NOT NULL`, plus an index on `expire`.
- **Expiry is 7 days since the last visit.** The cookie's `maxAge` is 7 days and the session
  uses `rolling: true`, so every request pushes the expiry back. An active customer is never
  logged out mid-shop; one who stays away for 7 days is.
  - express-session turns `maxAge` into an **`Expires` date** in `Set-Cookie`. It never sends a
    `Max-Age` attribute; the reviewer checked `express-session/session/cookie.js`. That's fine,
    because browsers treat the two the same.
  - So tests and docs check for an `Expires` about 7 days ahead, within a few seconds, and
    check that a later request moves it later.
- **Cookie settings:** `httpOnly: true` (as now), `sameSite: 'lax'` written out explicitly (it's
  the browsers' default anyway, and it lets the Google and Facebook callbacks work), and
  `secure` left off for localhost. The README notes that deployment needs `secure: true` and
  `trust proxy`.
- **Pruning:** the store deletes expired sessions on a timer. In tests, pruning is off
  (`pruneSessionInterval: false`), so no timer keeps the test process alive or queries after
  `pool.end()`. The builder chooses how tests switch it off, for example an env var in
  `.env.test`.
- **Logging out:**
  - `POST /auth/logout` keeps its current contract: `requireAuth`, then `204` with no body.
  - On top of that, it destroys the session (deleting the row) and clears the `connect.sid`
    cookie.
  - The result must be that the old cookie no longer logs anyone in, and the row is gone.
- **`GET /auth/me`** (new) tells the app who's logged in:
  - it always returns `200`;
  - the body is `{ "customer": { id, first_name, last_name, email } }`, or
    `{ "customer": null }` when nobody is logged in;
  - it never returns `401`, so logged-out visitors get no console errors;
  - it never returns `password_hash`.
- **Front-end auth state:** a React context holds `{ customer, checking }` and the functions
  that change it.
  - `checking` is `true` until the first `/auth/me` answer arrives.
  - Login, register and logout update `customer` directly, so the nav changes straight away
    with no extra request.
  - A Google or Facebook sign-in returns to `/` with a full page load, which runs `/auth/me`
    again, so that path needs nothing extra.
  - If the `/auth/me` request fails (the API is down), the app treats it as logged out.
- **While `checking`:**
  - the nav shows only Products;
  - protected pages show "Loading…" instead of redirecting.
  This prevents the wrong-state flash and the false bounce listed in the anti-goals.
- **Protected routes:**
  - A wrapper route in `routes.js` covers `account`, `cart`, `checkout`, `orders` and
    `orders/:orderId`.
  - Logged out, it redirects to `/login`, passing the page they wanted in React Router's
    navigation **state**, not in the URL.
  - Because it's state rather than a query string, nobody can craft a link that sends the
    browser off-site after login. Only paths inside the app can be stored.
- **After logging in:** go to the saved page if there is one, otherwise Products.
  - Registering always goes to Products, as it does now.
  - A Google or Facebook sign-in always returns to Products, because the round trip to the
    provider loses React's state. (It's listed under non-goals.)
- **Logged in and opening `/login` or `/register`:** redirect to Products.
- **The Log out button:**
  - It's a `<button>` in the nav, not a link, because it changes something.
  - It calls `POST /auth/logout`, then sets `customer` to `null` and goes to Products.
  - If the request fails, the customer stays logged in in the app, and a message appears in the
    header: "Could not log out. Please try again." The app never pretends to be logged out while
    the server still has the session.
  - **A `401` from logout counts as success** (from the review). It means the server already has
    no session, e.g. it expired after 7 days with the tab open. So the app logs out as normal.
    Only a network failure or another error status shows the message.
  - The header always shows that fixed message, never the server's text.
- **"Hi, {first_name}":** a Google-only customer may have an empty first name. Then it shows
  "Hi there".
- **Learn by Doing:** the user writes the part of `LoginPage`'s `handleSubmit` that records the
  customer and goes to the saved page or Products. The rest is wired up for them.

## Back end
- **`package.json`:** add `connect-pg-simple`.
- **`db/schema.sql`:** add the `session` table and index, fully commented.
- **`db/migrations/004-add-session-table.sql`:** the same changes, in the existing migrations'
  style.
- **`app.js`:**
  - use the store;
  - set `cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 days }` and `rolling: true`;
  - keep `resave: false` and `saveUninitialized: false`;
  - comment each setting.
- **`routes/auth.js`:** add `GET /auth/me`, and make logout destroy the session and clear the
  cookie.
- **`tests/helpers.js`:** `resetTables` also empties `session`.
- **Tests:**
  - **Persistence:** after login, the session row exists in the `session` table. A brand-new
    app instance, or a new request with the same cookie against the same store, still finds
    the customer. That stands in for "survives a restart".
  - **The cookie:** `Set-Cookie` has an `Expires` about 7 days ahead (within a few seconds),
    `HttpOnly` and `SameSite=Lax`. A later request moves `Expires` later.
  - **`GET /auth/me`:** with no session it returns `200 { customer: null }`. Logged in, it
    returns the customer with exactly those four fields. Straight after register, login, or a
    Google or Facebook sign-in, it returns the new customer.
  - **Logout:**
    - the row is deleted, and `Set-Cookie` clears `connect.sid`;
    - replaying the **old** cookie value afterwards gets `/auth/me` → `customer: null` and
      `/account` → `401`;
    - logged out, it still returns `401` (the existing contract).
  - **Expiry:** a session whose `expire` is in the past (updated directly in the database) is
    treated as logged out.

## Front end
- **An auth context** (e.g. `src/auth/AuthContext.js`):
  - a provider that calls `GET /auth/me` once on mount;
  - a `useAuth()` hook that returns `{ customer, checking, setCustomer, logout }`.
  - The provider sits where every route can reach it. Because `Layout` is the root route's
    element, the provider can wrap `<Outlet />` inside `Layout`, or the root route itself. The
    builder decides, as long as tests using `renderAt` get it too.
- **`src/api/auth.js`:** add `getMe()` and `logout()`.
  - `getMe()` never throws; on failure it returns `null`.
  - `logout()` resolves on `204` or `401`, and throws on a network failure or any other status.
- **`Layout.js`:** the nav follows layout B and the `checking` rule. It adds the "Hi, …" text
  and the Log out button, and shows the logout error message.
- **`routes.js`:**
  - a `RequireAuth` wrapper route around the five protected pages;
  - a `GuestOnly` wrapper, or the same idea, around `login` and `register`;
  - "Loading…" while checking.
- **`LoginPage.js`:** after a successful `login()`, call `setCustomer(customer)`, then navigate
  to `location.state?.from?.pathname` (plus its `search`) if there is one, otherwise `/`.
  `navigate` uses `replace: true`, so Back doesn't return to the login form.
- **`RegisterPage.js`:** after a successful `register()`, call `setCustomer(customer)`, then go
  to Products.
- **`App.css`:** styles for the "Hi, …" text and the Log out button (make it look like the
  links), and for the header error message.
- **Tests (Jest + React Testing Library):**
  - **Shared helpers:**
    - `renderAt(url, { customer })` mocks `/auth/me` to return that customer;
    - with no customer, it mocks a logged-out visitor;
    - a fetch that's still pending is used to test `checking`.
  - **Existing tests:** `routes.test.js` and the page tests are updated to render logged in
    where they open protected pages.
  - **New tests:**
    - the nav in each state: logged out, logged in, and while checking;
    - each protected page redirecting to `/login` when logged out, and showing when logged in;
    - no redirect while checking;
    - logging in after a redirect returns to the wanted page (e.g. `/orders/7`), and with no
      wanted page goes to Products;
    - a logged-in visitor at `/login` or `/register` going to Products;
    - Log out calling the API, then showing the logged-out nav on Products;
    - a failed logout (network error or 500) showing the message and keeping the logged-in nav;
    - a logout that gets 401 logging out normally, with no message;
    - registering showing the logged-in nav;
    - a failed `/auth/me` meaning logged out, with no crash;
    - "Hi there" for an empty first name.

## E2E (Newman)
- After registering: `GET /auth/me` returns the customer.
- After the existing Log out request: `GET /auth/me` returns `customer: null`, and an existing
  logged-in-only request gets 401.
- The cookie test checks for an `Expires` date.

## Docs
- **README:**
  - replace the "sessions are stored in memory" note with how sessions work now: the PostgreSQL
    store, 7 days rolling, and the cookie flags;
  - migration 004;
  - `GET /auth/me`, and the logout behaviour;
  - the nav and protected pages in the front-end section;
  - a deployment note (`secure`, `trust proxy`);
  - test counts;
  - Technologies: `connect-pg-simple`.
- **`openapi.yaml`, `docs/api-endpoints.md`:** `GET /auth/me`; the logout description; the
  cookie's 7-day `Expires`.
- **`docs/database-design.md`:** the `session` table. It's library-managed, so it isn't linked to
  `customers` by a foreign key; the customer id lives inside `sess`.

## Left to the builder
- File names and placement of the context and wrapper routes, and how the provider is mounted,
  within the constraints above.
- How tests turn off pruning, and how they stand in for an API restart.
- Exact wording of the "Loading…" text and the README prose.
