# Sessions and Logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions survive API restarts and last 7 days (rolling). The React app knows who's
logged in, gates protected pages, and has a working Log out.

**Architecture:**
- **Back end:**
  - express-session moves from its in-memory store to `connect-pg-simple` (a `session` table in
    PostgreSQL), with a 7-day rolling cookie;
  - `GET /auth/me` reports who's logged in;
  - logout also clears the cookie.
- **Front end:**
  - An `AuthProvider` context wraps the root route. It calls `/auth/me` once and exposes
    `{ customer, checking, setCustomer, logout }`.
  - `Layout` draws nav layout B.
  - `RequireAuth` and `GuestOnly` wrapper routes guard pages. `GuestOnly` also does the
    "after login, go back" redirect. **The user writes that target logic** (Learn by Doing).

**Tech Stack:**
- **Back end:** Express 5, express-session 1.19, Passport 0.7, `connect-pg-simple` (new), `pg`,
  `node:test` + supertest, Newman.
- **Front end:** React 19 (CRA 5), React Router 7, Jest 27 + RTL 16, user-event 13.

**Spec:** `docs/superpowers/specs/2026-10-20-sessions-and-logout-design.md`

## Global Constraints
- **Where to run commands:** the repo root. Run npm with `--prefix back-end|front-end`.
  PowerShell 5.1 has no `&&`.
- **`.env` files:**
  - Never read or print `.env*` files.
  - Append to `back-end/.env.test` only with PowerShell `Add-Content`, then check with
    `Select-String -Quiet`.
- **Back-end tests:**
  - The full run is `npm test --prefix back-end`, in the background with its output redirected
    to a file (2–3 minutes).
  - One file: `npm test --prefix back-end -- tests/<file>.test.js`.
  - Don't run two DB-using test runs at once.
- **Front-end tests:** use Bash:
  `cd front-end && CI=true npx react-scripts test --watchAll=false [file]`.
  The required result is 0 "not wrapped in act" warnings.
- **Exact values:**
  - The cookie's `maxAge` is `7 * 24 * 60 * 60 * 1000` ms. `rolling: true`, `httpOnly: true`,
    `sameSite: 'lax'`; `secure` isn't set.
  - The store's table is `session`.
  - The prune switch: `.env.test` sets `SESSION_PRUNE=off`, which becomes
    `pruneSessionInterval: false`. Anything else keeps the library's default.
- **`GET /auth/me`:**
  - it always returns `200` with `{ customer: {id, first_name, last_name, email} | null }`;
  - it uses the same 4 columns as `deserializeUser`.
- **Front-end text:**
  - Nav logged out: links "Products", "Log in", "Register".
  - Nav logged in: links "Products", "Cart", "Orders", "Account", the text "Hi, {first_name}"
    ("Hi there" if `first_name` is empty), and a **button** "Log out".
  - Nav while checking: only "Products".
  - Protected pages while checking: "Loading…".
  - Logout failure, in a `role="alert"` in the header: "Could not log out. Please try again."
- **Protected paths:** `account`, `cart`, `checkout`, `orders`, `orders/:orderId`.
  **Guest-only paths:** `login`, `register`.
- **Fully annotate** every file you write (JS, JSX, SQL, YAML, CSS, tests, Postman scripts).
- **The user commits.** Exactly one `TODO(human)` at a time. Stop after the Learn by Doing
  request.
- **E2E collection edits:** text edits only, keeping LF. Never round-trip the file through
  `JSON.parse`/`stringify`.
- **At the end:** check that the README covers the spec, then delete this spec, this plan and
  `.superpowers/` (the user's standing request).

## Review Focus
Each line has a test in the task named:
- **Logging out while on a protected page** (e.g. `/cart`) must land on Products, not bounce to
  `/login` because `RequireAuth` reacts to `customer` becoming `null` first. (Task 4)
- **A logged-in customer opening a protected URL directly** must see the page after `/auth/me`
  answers. It must never redirect to `/login` while `checking`. (Task 3)
- **Logging in from a redirect** must land on the wanted page, including its query string, and
  must not be overridden by a separate `navigate('/')`. The login form's `handleSubmit` must no
  longer navigate itself. (Task 4)
- **The old cookie replayed after logout** must be logged out, and its session row must be gone.
  (Task 1)
- **Front-end tests whose fetch mock doesn't know `/auth/me`** (the existing Register and Login
  tests) must keep passing without accidentally logging the user in. `renderAt` must answer
  `/auth/me` itself. (Task 3)

---

### Task 1: PostgreSQL session store, 7-day rolling cookie, `GET /auth/me`, logout clears the cookie

**Files:**
- Modify: `back-end/package.json` (`npm install connect-pg-simple --prefix back-end`)
- Modify: `back-end/db/schema.sql`
- Create: `back-end/db/migrations/004-add-session-table.sql`
- Modify: `back-end/app.js` (the session block, lines 58–75)
- Modify: `back-end/routes/auth.js` (the logout route; add `/me`)
- Modify: `back-end/tests/helpers.js` (`resetTables` TRUNCATE list: add `session`)
- Modify: `back-end/.env.test` (append `SESSION_PRUNE=off`)
- Test: `back-end/tests/sessions.test.js` (new)

**Interfaces:**
- Produces:
  - a `session(sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL)`
    table, with index `session_expire_idx` on `expire`;
  - `GET /auth/me` returns `200 { customer }`;
  - `POST /auth/logout` returns `204`, and additionally sends a `Set-Cookie` that clears
    `connect.sid`. Its `401` when logged out is unchanged.

- [ ] **Step 1: Write the failing tests** (`sessions.test.js`).
  - Set-up: `beforeEach(resetTables)`, `after(() => pool.end())`.
  - A helper registers Ada through `request.agent(app)`; registering logs her in.
  - Tests:
    1. **`'GET /auth/me says nobody is logged in, with 200'`:** `{ customer: null }`.
    2. **`'GET /auth/me returns the logged-in customer, and only these four fields'`:**
       `deepEqual` with `{ id, first_name: 'Ada', last_name: 'Lovelace', email:
       'ada@example.com' }`.
    3. **`'the session is stored in the session table'`:**
       - after registering, `SELECT sess FROM session` has 1 row;
       - its `sess.passport.user` is Ada's id.
    4. **`'deleting the stored session logs the customer out'`:**
       - `DELETE FROM session`;
       - the same agent's `/auth/me` then gives `customer: null`.
       - Comment: this proves the login lives in the database, not the server's memory. It's
         what makes a restart harmless.
    5. **`'the cookie lasts 7 days, and is HttpOnly and SameSite=Lax'`:**
       - parse the `Expires` from `Set-Cookie`;
       - it must be within ±60 s of `Date.now() + 7 days`;
       - it matches `/HttpOnly/i` and `/SameSite=Lax/i`.
    6. **`'each visit pushes the expiry back (rolling)'`:**
       - `UPDATE session SET expire = now() + interval '1 day'`;
       - then `GET /auth/me` with the agent;
       - its `Set-Cookie` `Expires` is about 7 days ahead;
       - the row's `expire` is more than 6 days ahead.
    7. **`'an expired session counts as logged out'`:**
       - `UPDATE session SET expire = now() - interval '1 minute'`;
       - `/auth/me` gives `null`, and `/account` gives `401`.
    8. **`'logging out deletes the stored session and clears the cookie'`:**
       - the `session` count goes from 1 to 0;
       - the logout `Set-Cookie` has `connect.sid=;` and an `Expires` in 1970.
    9. **`'the old cookie no longer works after logging out'`:**
       - save the `Cookie` header value before logout;
       - after logout, `request(app).get('/auth/me').set('Cookie', saved)` gives `null`;
       - `/account` with it gives `401`.

- [ ] **Step 2: Run them and see them fail.**
  - Run `npm test --prefix back-end -- tests/sessions.test.js`.
  - Expected: `/auth/me` gives an Express HTML 404, the `session` relation doesn't exist, and
    the cookie has no `Expires`.

- [ ] **Step 3: Schema, migration, reset.**
  - Add the `session` table and index to `schema.sql`, with comments explaining that the
    connect-pg-simple library manages it, and why it has no foreign key: the customer id lives
    inside `sess`.
  - Write `004-add-session-table.sql` in the style of `003`.
  - Add `session` to the `TRUNCATE` in `helpers.js`.
  - Run `npm run db:test:reset --prefix back-end`.

- [ ] **Step 4: Add `SESSION_PRUNE=off` to `.env.test`.**
  - Append it, with a comment line explaining that no background timer may run in tests, by
    `Add-Content -Encoding utf8`.
  - Verify with `Select-String -Pattern '^SESSION_PRUNE=off$' -Quiet` → `True`.
  - Check there's no BOM in the middle of the file, as last ticket.

- [ ] **Step 5: Install `connect-pg-simple`, then change `app.js`.**
  - `import connectPgSimple from 'connect-pg-simple'`, then
    `const PgStore = connectPgSimple(session)`.
  - The store options:
    - `pool` (the default export of `db/index.js`);
    - `tableName: 'session'`;
    - `pruneSessionInterval: process.env.SESSION_PRUNE === 'off' ? false : undefined`. Omit the
      key when it's undefined, so the library default applies.
  - Add `rolling: true`, and
    `cookie: { httpOnly: true, sameSite: 'lax', maxAge: SEVEN_DAYS_MS }`.

- [ ] **Step 6: Add `GET /auth/me` and the logout cookie clearing in `routes/auth.js`.**
  - `/me` returns `res.json({ customer: req.user ?? null })`.
  - Logout: after `req.logout` succeeds, `res.clearCookie('connect.sid', { path: '/' })`, then
    `204`.
  - Comment that Passport 0.7's `logout` already regenerates the session, which deletes the old
    row through the store.

- [ ] **Step 7: Run the tests and see them pass.** Expected: 9/9 pass.
  - If test 8's row count stays 1, use `systematic-debugging`. Don't add a second destroy
    blindly.

- [ ] **Step 8: Mutation checks.** Make each change, check a test fails, then undo it.
  - Remove `rolling: true`: test 6 must fail.
  - Remove the `store`: tests 3 and 4 must fail.

- [ ] **Step 9: Docs and E2E.**
  - **`openapi.yaml`:**
    - add `GET /auth/me` (tag Auth, 200 schema `{ customer: Customer | null }` with
      `nullable`);
    - the logout description: it deletes the stored session and clears the cookie;
    - the login, register and callback `Set-Cookie` examples now include `Expires` and
      `SameSite=Lax`.
  - **`docs/api-endpoints.md`:** the same additions.
  - **`docs/database-design.md`:** the `session` table section, with no ERD line (it's
    library-managed, with no foreign key; explain why).
  - **The E2E collection:**
    - In folder 1, after "View account straight after registering", add "Who's logged in (after
      registering)": `GET /auth/me`, 200, and `customer.id` equals `customerId`.
    - In the existing "Log in" request's cookie test, also check that the cookie has an expiry.
      In Postman, `pm.cookies.get` gives no attributes, so use the response header
      `pm.response.headers.get('Set-Cookie')` and match `/Expires=/i`.
    - In folder 4, after the account is deleted: does the collection already log out anywhere?
      Find the existing logout request with Grep. If there is one, add "Who's logged in (after
      logging out)", expecting `customer: null`. If none exists, add one to folder 4 before
      "Delete the account": `POST /auth/logout` → 204, then `/auth/me` → `null`, then
      "Log in" again so the folder continues. Record the choice as a ruling.
  - Run the docs test, then E2E (`db:test:reset` → `start:test` → `test:e2e`). Expected:
    0 failures. Stop the server by PID.

- [ ] **Step 10: Run the full back-end suite** in the background. Expected: all pass. Record the
  count.

---

### Task 2: Front-end auth API and the `AuthProvider` context

**Files:**
- Modify: `front-end/src/api/auth.js`
- Create: `front-end/src/auth/AuthContext.js`
- Modify: `front-end/src/routes.js` (the root element is `<AuthProvider><Layout /></AuthProvider>`)
- Modify: `front-end/src/test-utils.js`
- Modify: `front-end/src/pages/RegisterPage.test.js`, `front-end/src/pages/LoginPage.test.js`
  (fetch-call assertions; see Step 4)
- Test: `front-end/src/auth/AuthContext.test.js` (new)

**Interfaces:**
- **Produces, in `api/auth.js`:**
  - `getMe(): Promise<Customer | null>`. It never throws: any failure gives `null`.
  - `logout(): Promise<void>`. It `POST`s `/auth/logout` and resolves on `204` or `401`. It
    throws `Error('Could not log out. Please try again.')` on a network failure or any other
    status.
- **Produces, in `auth/AuthContext.js`:**
  - `export function AuthProvider({ children })`;
  - `export function useAuth()`, which returns `{ customer, checking, setCustomer, logout }`.
    - `logout()` awaits the API `logout()`, then calls `setCustomer(null)`. It rethrows on
      failure.
    - `checking` starts `true`, and becomes `false` when `getMe()` settles.
- **Produces, in `test-utils.js`:** `renderAt(url, { customer } = {})`.
  - It replaces `global.fetch` with a `jest.fn` that answers `'/auth/me'` itself, and passes
    every other URL to whatever `global.fetch` was before (or rejects with
    `TypeError('Failed to fetch')` if there was none).
  - `customer` can be:
    - a customer object;
    - `null`, the default, for logged out;
    - `AUTH_PENDING`, an exported constant: `/auth/me` never answers;
    - `AUTH_FAILS`, an exported constant: `/auth/me` rejects.
  - `setupTests.js` adds `afterEach(() => { delete global.fetch; })`.

- [ ] **Step 1: Write the failing tests** (`AuthContext.test.js`). Each renders a tiny test
  component that shows `useAuth()` values, inside `AuthProvider`. Tests:
  - **`'checking is true until /auth/me answers'`:** with a pending fetch, it shows
    "checking".
  - **`'gives the logged-in customer from /auth/me'`.**
  - **`'treats a failed /auth/me as logged out'`:** fetch rejects → customer `null`, checking
    `false`, and no crash.
  - **`'setCustomer updates everyone at once'`:** clicking a test button that calls
    `setCustomer(ada)` shows Ada.
  - **`'logout calls POST /auth/logout and clears the customer'`.**
  - **`'logout treats 401 as already logged out'`.**
  - **`'logout keeps the customer and throws when the request fails'`:** 500 → customer still
    Ada, and the thrown message is "Could not log out. Please try again."

- [ ] **Step 2: Run and see them fail.** Expected: "Cannot find module './AuthContext'".

- [ ] **Step 3: Implement `getMe`, `logout`, and `AuthContext.js`.** Wrap the root route
  element in `routes.js`. Then update `test-utils.js` and `setupTests.js` as described in
  Interfaces.

- [ ] **Step 4: Update the existing page tests for the extra `/auth/me` call.**
  - In `RegisterPage.test.js`:
    - `toHaveBeenCalledTimes(1)` becomes "exactly one call to `/auth/register`";
    - `mock.calls[0]` becomes "the call whose url is `/auth/register`";
    - `fetch` `not.toHaveBeenCalled()` becomes "no call to `/auth/register`".
  - `LoginPage.test.js`'s `loginCall()` already finds by URL; check that it still works.
  - The page tests' own `beforeEach` mocks stay as they are, because `renderAt` wraps them.

- [ ] **Step 5: Run all front-end tests.** Expected: the new 7 pass, the old 55 pass, and
  0 act warnings.

---

### Task 3: Nav layout B and the protected pages

**Files:**
- Modify: `front-end/src/components/Layout.js`
- Create: `front-end/src/auth/RequireAuth.js`, `front-end/src/auth/GuestOnly.js`
- Modify: `front-end/src/routes.js` (wrap the protected and guest-only children)
- Modify: `front-end/src/App.css`
- Modify: `front-end/src/routes.test.js`
- Test: `front-end/src/auth/access.test.js` (new: the nav and the route gates)

**Interfaces:**
- Consumes: `useAuth()` from Task 2.
- **Produces `RequireAuth`:** a layout-route element that renders `<Outlet />`.
  - While `checking`, it shows `<p>Loading…</p>`.
  - With no customer, it shows `<Navigate to="/login" replace state={{ from: location }} />`.
- **Produces `GuestOnly`:** a layout-route element that renders `<Outlet />` when logged out
  or checking.
  - When logged in, it redirects to a **target**. In this task the target is always `'/'`; the
    user's Learn by Doing in Task 4 replaces it.

- [ ] **Step 1: Write the failing tests** (`access.test.js`, using `renderAt` with its
  `customer` option):
  - **The nav, logged out, at `/`:** within the nav there are exactly the links Products,
    Log in, Register. Cart, Orders and Account are absent.
  - **The nav, logged in as Ada:** links Products, Cart, Orders, Account; the text "Hi, Ada";
    a button "Log out"; no links Log in or Register.
  - **The nav while checking (`AUTH_PENDING`):** only the Products link.
  - **"Hi there" for `first_name: ''`.**
  - **`test.each` over `/account`, `/cart`, `/checkout`, `/orders`, `/orders/7`, logged out:**
    the "Log in" `h1` appears.
  - **The same five, logged in:** each one's own `h1`, from routes.test's `pages` table.
  - **`'does not redirect while still checking'`:** `/cart` with `AUTH_PENDING` shows
    "Loading…", and no "Log in" heading.
  - **`'a logged-in customer is sent from /login and /register to Products'`:** a `test.each`.

- [ ] **Step 2: Run and see them fail.**

- [ ] **Step 3: Implement** `RequireAuth`, `GuestOnly` (target `'/'`), the routes wrapping, the
  Layout nav (layout B, the checking rule, "Hi, …", and a Log out `<button>` that calls
  `logout()` then `navigate('/')`, showing the alert on failure), and CSS.
  - The button should look like the nav links: `.nav-button` with no border or background,
    the link colour, `cursor: pointer`, `font: inherit`.

- [ ] **Step 4: Update `routes.test.js`.**
  - The page and nav-click tables render **logged in** (`renderAt(url, { customer: ada })`).
    The `/login` and `/register` rows render logged out.
  - The nav-click test: logged-in rows for Cart, Orders, Account; logged-out rows for Log in
    and Register.
  - Keep every existing scenario.

- [ ] **Step 5: Run all front-end tests.** Expected: everything passes, with 0 act warnings.

---

### Task 4: Logging in, registering and logging out update the app; return to the wanted page

**Files:**
- Modify: `front-end/src/pages/LoginPage.js` (`handleSubmit`: `setCustomer(await login(form))`;
  remove its `navigate('/')`, `useNavigate` and its comment, because `GuestOnly` now redirects)
- Modify: `front-end/src/pages/RegisterPage.js` (`handleSubmit`: `setCustomer(await
  register(details))`; remove its `navigate`, for the same reason)
- Modify: `front-end/src/auth/GuestOnly.js` (**the `TODO(human)`**)
- Test: `front-end/src/auth/access.test.js` (add the tests below)

**Interfaces:**
- Consumes: `useAuth().setCustomer`, and `GuestOnly` from Task 3.
- The user's part: in `GuestOnly`, compute the redirect target from `useLocation().state?.from`.
  - It's `from.pathname + from.search` when `from` exists, otherwise `'/'`.
  - It's used as `<Navigate to={target} replace />`.

- [ ] **Step 1: Write the failing tests** (in `access.test.js`). Use a fetch mock answering
  `/auth/login` with Ada, and `/auth/register` with Ada (201).
  - **`'logging in after being sent from /orders/7?tab=items returns there'`:**
    - start logged out at `/orders/7?tab=items`;
    - this gets redirected to Log in;
    - fill in the form and submit;
    - the heading "Order" and "Order id: 7" appear;
    - `router.state.location.search === '?tab=items'`.
  - **`'logging in with no wanted page goes to Products'`.**
  - **`'registering shows the logged-in nav on Products'`.**
  - **`'Log out from /cart lands on Products with the logged-out nav'`:**
    - renders logged in at `/cart`;
    - `/auth/logout` gives 204;
    - the "Products" `h1` appears, `router.state.location.pathname === '/'`, and no "Log in"
      heading.
  - **`'a failed logout shows the message and keeps the logged-in nav'`:** a 500 gives the
    alert text; the "Log out" button is still there.
  - **`'a 401 logout logs out normally'`:** the logged-out nav, and no alert.

- [ ] **Step 2: Run and see them fail.** The return-to test fails because the target is
  always `'/'`. The register test fails because `setCustomer` isn't called yet.

- [ ] **Step 3: Update the two `handleSubmit`s.** Keep the user's comments, and update any that
  mention `navigate`. Then run: everything except the return-to test passes. If the logout
  test bounces to `/login`, fix the order in Layout's handler, e.g. navigate first and then
  clear the customer.

- [ ] **Step 4: Learn by Doing.**
  - Put the single `TODO(human)` in `GuestOnly.js` where the target is computed. Grep confirms
    there's exactly 1.
  - Send the request.
  - **STOP and wait.**

---

### Task 5: Verify, document, review, hand over

- [ ] **Step 1: Run all front-end tests**, then the mutation checks on the user's target logic:
  - always `'/'`: the return-to test must fail;
  - drop `from.search`: the query-string assertion must fail.

- [ ] **Step 2: Build** with `cd front-end && CI=true npm run build`. Expected: "Compiled
  successfully."

- [ ] **Step 3: Real checks** (API `start:test` after `db:test:reset`; CRA on 3001). Through
  `:3001`:
  - log in, and `/auth/me` returns Ada;
  - **stop and restart the API**, and `/auth/me` with the same cookie still returns Ada;
  - log out, and the old cookie gives `null`.
  Stop the servers by PID.

- [ ] **Step 4: README.**
  - Replace the "sessions are stored in memory" note: the PostgreSQL store, 7 days since the
    last visit, the cookie flags, and expired sessions pruned every 15 minutes.
  - Migration 004 in the table and the "how to check" line.
  - The `/auth/me` row and section; the logout behaviour.
  - Front end: the nav states, protected pages ("Loading…", redirect, return-to), Log out.
  - A deployment note: `secure: true` and `app.set('trust proxy', 1)`.
  - `.env.test` now also has `SESSION_PRUNE=off`.
  - Project structure: `auth/` and the new tests.
  - Technologies: `connect-pg-simple`.
  - Test counts, from the actual runs.

- [ ] **Step 5: Final review.**
  - Make the review diff: intent-to-add the untracked files only, `git diff HEAD` excluding the
    lockfiles and `.superpowers`/`docs/superpowers`, then reset those paths.
  - Send one Opus reviewer the spec, the plan's Review Focus and the ledger rulings.
  - Re-grade by effect. Fix Critical and Important findings test-first; list the Minor ones.

- [ ] **Step 6: Hand over.**
  - Give the counts, the rulings and the deferred minors.
  - Tell the user to run migration 004 on `ecommerce` in pgAdmin.
  - Check that the README covers the spec, then delete this spec, this plan and `.superpowers/`.
  - Give the commit message, ending with
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
