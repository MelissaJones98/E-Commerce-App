# Handover: E-Commerce App

For a new Claude Code session picking up this project. Read this first, then the README.
Written 2026-10-15. All work below is committed to `main` (latest: `0dacb45 Document the API
with Swagger (OpenAPI 3.0)`); the working tree was clean.

## The project
A **PERN e-commerce REST API** (PostgreSQL, Express 5, React later, Node.js 24) built ticket by
ticket as a **learning project**. The user is learning. The README's **Features** list is the
scope; its **Future Work** list is explicitly out of scope.

Only the back end exists so far, in `back-end/`. There is no front end yet.

## How the user wants to work (important)
- **TDD for every feature ticket.** Write the tests first, run them, and confirm each fails *for
  the right reason* (summarise the failure reasons, e.g. `actual: 404`). Then implement in stages
  until green, then refactor. Look out for tests that pass before the code exists (often because
  a missing route's 404 satisfies the assertion), and strengthen them, e.g. by also asserting the
  app's JSON `{ error }` body. Do mutation checks on important tests (break the code briefly and
  confirm the test fails).
- **Fully annotate all code**, including tests, SQL, YAML and Postman scripts. Comment every
  block, and explain JavaScript and SQL syntax the first time it appears in a file (`async`/
  `await`, destructuring, `??`, `?.`, spread, regex, `$1` placeholders, `RETURNING`, transactions,
  `FOR UPDATE`...).
- **The user commits themselves.** Give a commit message at the end; don't commit. They commit
  straight to `main`, with no branches.
- **Ignore everything under "Future Work"** in the README (admin panel and roles, reviews, guest
  checkout, emails, refunds). If a Feature seems to need one, say so briefly and let the user
  decide.
- **After each feature:** update the README (structure, routes table, a usage subsection with
  Postman steps, error-handling entries, test counts), `docs/api-endpoints.md`, `openapi.yaml`
  (Swagger), and the Newman E2E collection. Then run the E2E collection and report its counts.
  Recently the user has said "yes do both" whenever README and E2E updates were offered; just
  include them.
- **Explain decisions** in the final summary, and ask (AskUserQuestion) only for genuine
  decisions, e.g. "the E2E tests can't clean up orders, so which database?".
- The user may ask conceptual questions ("what are migrations for?"). Answer plainly, tied to
  their project.

## Environment quirks (Windows 11)
- **The working directory is the repo root**, not `back-end/`. Run npm with
  `--prefix back-end`, e.g. `npm test --prefix back-end`.
- **The PowerShell tool is Windows PowerShell 5.1:**
  - no `&&`;
  - backticks are its escape character, so they break inline `node -e` code;
  - inline JSON passed to native programs loses its double quotes.

  Write a script file instead, or use the Bash tool.
- **A hook blocks reading `.env` files** (`.env`, `.env.test`) and blocks *Bash* commands that
  mention them. PowerShell commands such as `node --env-file-if-exists=back-end/.env script.mjs`
  work. To check settings, print only "set / not set", never values. To append to `.env.test`,
  use PowerShell `Add-Content` (it contains only `PGDATABASE=ecommerce_test` and a test-only
  `SESSION_SECRET`).
- **One-off scripts** go in the scratchpad. To use the project's packages from there:
  `createRequire('<repo>/back-end/package.json')`.
- **The full `npm test` run takes 2–3 minutes** (bcrypt hashing). Run it in the background, or
  with a long timeout. Pipe output to a file, then show `✖` lines, `ℹ tests/pass/fail` and
  "unexpected output" (lines that aren't pass markers).
- **Starting the server for checks:** run `npm run start:test --prefix back-end` in the
  background, poll `http://localhost:3000/health` until it answers, confirm it says
  `ecommerce_test`, then run `npm run test:e2e --prefix back-end`. Stop the server with TaskStop
  afterwards.
- **The Postman CLI (v1.73) is installed,** but `-d @file` sends a form upload and its exit code
  is 1 for any 4xx. Newman (a dev dependency) is what the project uses.

## Running things (from `back-end/`)
| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | The server on the **real** `ecommerce` database (port 3000) |
| `npm run start:test` | The server on **`ecommerce_test`** (`.env.test` loaded on top of `.env`) |
| `npm test` | 260 unit/integration tests (`node:test` + supertest) on `ecommerce_test` |
| `npm run test:e2e` | Newman E2E collection, against a running server (use `start:test`) |
| `npm run db:test:reset` | Drop and rebuild `ecommerce_test` from `schema.sql`. Run after schema changes |

`.env` needs `PORT`, `PGHOST`, `PGPORT`, `PGDATABASE=ecommerce`, `PGUSER`, `PGPASSWORD` and
`SESSION_SECRET`. All are set, as of the last check.

## Code map (`back-end/`)
- **`server.js`** starts the app. **`app.js`** builds it: JSON body parsing, express-session
  (in-memory store), Passport, the routers, Swagger, and a JSON error handler (400 for bad JSON,
  500 otherwise). `SESSION_SECRET` is required.
- **`routes/`:**
  - `auth.js`: register, login, logout
  - `products.js`: product CRUD and `?category=`
  - `account.js`: `/account` GET, PUT, DELETE
  - `cart.js`: `/cart` and `/cart/items`
  - `checkout.js`: `POST /cart/checkout`, mounted *before* the cart router
  - `orders.js`: GET `/orders` and `/orders/:orderId`
- **`services/`:**
  - `payment-processor.js`: the FAKE processor, using Stripe test cards. `4000…0002` is
    declined (402), `4000…0119` throws `PaymentProcessorError` (502), and anything else succeeds.
  - `orders.js`: `getOrderDetails(db, customerId, orderId)`, shared by checkout and order
    details.
- **`utils/`:** `normalize-email`, `parse-id` (and `MAX_INTEGER`), `validate-customer` (names,
  email, phone), `validate-checkout` (address, card: Luhn, expiry, CVC).
- **`middleware/require-auth.js`** returns 401 if not logged in. **`config/passport.js`** holds
  the local strategy (email as the username) and serialize/deserialize (id only).
- **`db/`:**
  - `index.js`: the pool and `query()`
  - `schema.sql`: the latest full schema
  - `migrations/001-add-categories.sql` and `002-add-cart-items.sql`
  - `reset-test-db.js`
- **`openapi.yaml`** is the Swagger spec, served at `/api-docs` and `/api-docs/openapi.json`.
- **`tests/`:** `auth.register`, `auth.login`, `products`, `account`, `cart`, `checkout`,
  `orders` and `docs` (`.test.js`), plus `helpers.js` (`resetTables`, `loggedInAgent(details)`,
  `insertProduct`, `insertCategory`, `validCheckout`, `placeOrder`) and
  `e2e/ecommerce-api.e2e.postman_collection.json`.
- **`docs/` (repo root):** `database-design.md` (Mermaid ERD, with a crow's foot key SVG in
  `docs/images/`) and `api-endpoints.md` (the original plan plus design notes).

## Database
Seven tables: `customers`, `addresses`, `categories`, `products`, `cart_items`, `orders` and
`order_items`.

- **Money** is `numeric(10,2)`. pg returns it as a string (`"8.50"`), and totals are calculated
  in SQL.
- **Products** are never deleted. Retiring sets `is_active = false`; retired products are hidden
  from the shop and the cart, but still appear in past orders.
- **Orders are permanent:** `ON DELETE RESTRICT` on the customer, address and product. That
  raises **error 23001**, not 23503 (23503 is a foreign key error on insert, e.g. an unknown
  `category_id`).
- **Carts** have one row per (customer, product), store no price, and use `ON DELETE CASCADE`.
- **Checkout** runs in one transaction: lock the products (`FOR UPDATE OF p`, ordered by id),
  check stock, pay, insert the address and order (status `paid`), copy prices into `order_items`,
  reduce stock, empty the cart.

**Migrations workflow:** every schema change updates `schema.sql` *and* adds a numbered file in
`db/migrations/`. The real `ecommerce` database needs each new migration run once. The user can
do it in pgAdmin, or I can run it with a scratchpad script; I ran 001 and 002 on 2026-10-15. The
test database is just rebuilt with `npm run db:test:reset`.

## Testing conventions
- Each test file runs `beforeEach(resetTables)` and `after(() => pool.end())`. `resetTables`
  refuses to run on any database not ending in `_test`.
- Expected values are hand-worked literals, with `deepEqual` on whole response bodies (pull
  `created_at` out first).
- Invalid inputs use table-driven `for...of` loops. Customer-isolation tests use two customers
  (Ada and Grace).
- The checkout race test **forces** the race: it holds a row lock, polls `pg_stat_activity`
  until 2 queries are waiting on a lock, then releases.
- **The E2E collection** (Postman v2.1 JSON, annotated in descriptions and script comments) has
  6 folders: register/login, account, cart, delete account, checkout and orders, API docs.
  - A collection-level check asserts no `"password"`/`password_hash` in any response, skipping
    `/api-docs`.
  - Logged-out requests use `protocolProfileBehavior.disableCookies`.
  - It runs on `ecommerce_test` (the user's choice) because orders can't be cleaned up.
  - Last run: **42 requests, 84 test-scripts, 115 assertions, 0 failures.**

## Status
**Tickets done:** Express setup → database design and ERD → PostgreSQL schema → connecting the
database → API plan → registration → local login (Passport) → products with categories →
account → Newman E2E → cart → checkout (fake payments) → order history → Swagger docs.

**Remaining Features (not Future Work)** that the user's tickets will likely cover:
- **Third-party login** (Google, etc.), e.g. `passport-google-oauth20`. It needs a schema change
  (`password_hash` is currently NOT NULL, plus an OAuth provider id), so add a migration.
- **Stripe payments:** replace `services/payment-processor.js`. In production, card details
  shouldn't reach our server (use Stripe Elements or PaymentIntents and tokens).
- **Deploy to Render.** Needs:
  - a persistent **session store** (e.g. `connect-pg-simple`; the in-memory store loses sessions
    on restart and warns in production);
  - `cookie.secure` with `app.set('trust proxy', 1)`;
  - production env vars;
  - a migration runner (the user declined one for now; suggest `node-pg-migrate` or a small
    tracked runner at deploy time).
- **A React front end.**

**Known gaps and ideas:**
- No saved-address endpoints (checkout takes the address inline).
- No password change, and no category endpoints (categories are added with SQL).
- No search or paging on `/products`.
- Any logged-in customer can create, edit or retire products, because admin roles are Future
  Work. The user knows this.
- The docs test can't detect a route that exists but isn't documented in `openapi.yaml`.
- `npm audit` shows about 19 vulnerabilities, all in Newman's dev dependencies (production: 0).
  The only fix offered downgrades Newman, so ignore it.

## Memory
Preferences are also saved in Claude's project memory (`MEMORY.md`): commit to main, TDD for
tickets, fully annotate code, ignore Future Work.
