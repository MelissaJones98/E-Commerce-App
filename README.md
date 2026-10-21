# E-Commerce App

## Description
A full-stack e-commerce application built with PostgreSQL, Express, React and Node.js (PERN). It
has a REST API and a React front end, and lets customers register an account, browse products
and complete a purchase.

## Features
- Allow users to register and log in via the API
    - Enable users to create a personal account
    - Enable users to create an account with a third-party service (Google, Facebook, etc)
- Allow CRUD operations on:
    - products
    - user accounts
    - user carts
    - orders
- Enable users to browse products
- Allow users to place an order
    - Enable users to complete a purchase using Stripe, the payment processor
- Documented API using Swagger
- Enable users to view order history
- Deploy the application using Render

## Database
The database has nine tables: `customers`, `federated_credentials`, `addresses`, `categories`,
`products`, `cart_items`, `orders`, `order_items` and `session`. `cart_items` holds each
customer's shopping cart (one row per product in it), and `order_items` links each order to the
products it contains. `federated_credentials` links a Google or Facebook account to a customer,
so they can sign in with it. Customers who only sign in that way have no password
(`password_hash` is `NULL`). `session` holds login sessions, so restarting the API doesn't log
anyone out.

The full design, including the Entity Relationship Diagram, column types, relationships, and the
reasoning behind each design decision, is in [docs/database-design.md](docs/database-design.md).

## Project Structure
```
e-commerce-app/
├── back-end/
│   ├── app.js              # Express app: middleware, routes and error handling
│   ├── server.js           # Starts the server (entry point for npm start / npm run dev)
│   ├── openapi.yaml        # OpenAPI spec: the API documentation Swagger UI displays
│   ├── routes/
│   │   ├── auth.js         # /auth routes (register, login, logout, Google and Facebook sign-in)
│   │   ├── products.js     # /products routes (browse, create, update, retire)
│   │   ├── account.js      # /account routes (view, update, delete your own account)
│   │   ├── cart.js         # /cart routes (view, add to, change, remove from, empty your cart)
│   │   ├── checkout.js     # POST /cart/checkout (turn the cart into a paid order)
│   │   └── orders.js       # /orders routes (your order history and order details)
│   ├── services/
│   │   ├── payment-processor.js # FAKE payment processor (stands in for Stripe)
│   │   ├── orders.js       # Builds a full order (address and items); shared by checkout and /orders
│   │   └── federated-login.js # Google/Facebook sign-in rules: find the linked customer, link by email, or create one
│   ├── config/
│   │   └── passport.js     # Passport.js setup: email/password, Google and Facebook logins; remembers who's logged in
│   ├── middleware/
│   │   └── require-auth.js # Blocks routes from customers who aren't logged in (401)
│   ├── utils/
│   │   ├── normalize-email.js # Trims and lower-cases emails (shared by register, login and account)
│   │   ├── parse-id.js     # Checks an id from a URL is a valid whole number
│   │   ├── validate-customer.js # Name, email and phone rules (shared by register and account)
│   │   └── validate-checkout.js # Shipping address and payment card rules (incl. the Luhn check)
│   ├── db/
│   │   ├── index.js        # PostgreSQL connection pool and query helper
│   │   ├── schema.sql      # Creates the database tables (for a new database)
│   │   ├── migrations/     # Updates an existing database to match schema.sql
│   │   │   ├── 001-add-categories.sql
│   │   │   ├── 002-add-cart-items.sql
│   │   │   ├── 003-add-federated-credentials.sql
│   │   │   └── 004-add-session-table.sql
│   │   └── reset-test-db.js # Rebuilds the test database from schema.sql
│   ├── tests/
│   │   ├── auth.register.test.js # Tests for POST /auth/register
│   │   ├── auth.login.test.js    # Tests for POST /auth/login and /auth/logout
│   │   ├── auth.providers.test.js    # Google/Facebook routes when they're switched off
│   │   ├── auth.providers-on.test.js # Google/Facebook routes and verify functions, with fake keys
│   │   ├── federated-login.test.js   # Tests for the Google/Facebook sign-in rules
│   │   ├── sessions.test.js      # Sessions: stored in PostgreSQL, 7-day cookie, GET /auth/me, logging out
│   │   ├── products.test.js      # Tests for the /products routes
│   │   ├── account.test.js       # Tests for the /account routes
│   │   ├── cart.test.js          # Tests for the /cart routes
│   │   ├── checkout.test.js      # Tests for POST /cart/checkout
│   │   ├── orders.test.js        # Tests for the /orders routes
│   │   ├── docs.test.js          # Tests that the Swagger docs are served, valid and accurate
│   │   ├── helpers.js      # Shared test helpers (e.g. emptying tables, logging in, adding test data)
│   │   └── e2e/            # End-to-end tests, run by Newman against the running server
│   │       └── ecommerce-api.e2e.postman_collection.json
│   ├── .env                # Your local settings (not committed, see below)
│   ├── .env.test           # Test settings: test database, test-only secret, providers and session clean-up off
│   └── package.json
├── front-end/              # React app (Create React App)
│   ├── public/
│   │   └── index.html      # The one HTML page; React draws everything inside it
│   ├── src/
│   │   ├── index.js        # Entry point: draws <App /> into index.html
│   │   ├── App.js          # Builds the browser router from the route table
│   │   ├── App.css         # Styles for the header, nav, page area and forms
│   │   ├── routes.js       # Route table: which page to show for each URL
│   │   ├── format.js       # formatPrice(): "8.50" → "£8.50" (tested in format.test.js)
│   │   ├── api/
│   │   │   ├── request.js  # requestJson(): sends a request; errors carry the HTTP status
│   │   │   ├── auth.js     # Calls the API's /auth endpoints (register, login, logout, who's logged in, providers)
│   │   │   ├── products.js # Calls GET /products and GET /products/:id
│   │   │   ├── products.test.js # Tests for the products API calls and their errors
│   │   │   └── cart.js     # Calls GET /cart and POST /cart/items
│   │   ├── cart/
│   │   │   ├── CartContext.js # The cart's item count (the nav badge) and addToCart(), shared with every page (useCart())
│   │   │   └── CartContext.test.js # Tests for loading, updating and clearing the count
│   │   ├── auth/
│   │   │   ├── AuthContext.js  # Who's logged in, shared with every page (useAuth())
│   │   │   ├── RequireAuth.js  # Guard: pages that need you logged in (else go to Log in)
│   │   │   ├── GuestOnly.js    # Guard: Log in and Register (logged in? go back to the page you wanted)
│   │   │   ├── AuthContext.test.js # Tests for the login record and logging out
│   │   │   └── access.test.js  # Tests for the nav, the guards, and logging in/out in the app
│   │   ├── components/
│   │   │   ├── Layout.js   # Header, main nav (changes when you log in) and the page area
│   │   │   ├── CartLink.js # The cart icon in the nav, with its item-count badge
│   │   │   ├── CartLink.test.js # Tests for the badge and the icon's screen-reader name
│   │   │   ├── ProductList.js # The grid of product cards
│   │   │   ├── ProductCard.js # One product: name, 2-line description, price; links to its page
│   │   │   ├── AddToCart.js # Quantity box and Add to cart button on a product's page
│   │   │   └── AddToCart.test.js # Tests for adding, its messages, and being logged out
│   │   ├── pages/          # One component per page (Products, a product, Register and Log in work; the rest are placeholders)
│   │   │   ├── ProductsPage.test.js # Tests for the Products grid
│   │   │   ├── ProductDetailPage.test.js # Tests for a product's page: details, not found, errors
│   │   │   ├── RegisterPage.test.js # Tests for the registration form
│   │   │   └── LoginPage.test.js    # Tests for the login form, provider links and sign-in errors
│   │   ├── setupProxy.js   # Dev only: sends Google/Facebook sign-in page visits on to the API
│   │   ├── routes.test.js  # Tests for every page URL and the navigation
│   │   ├── App.test.js     # Tests that App shows the home page
│   │   ├── test-utils.js   # Shared test helper: renders the app at any URL, logged in or out, with fake products and cart
│   │   └── setupTests.js   # Test setup: jest-dom matchers and a TextEncoder polyfill
│   ├── .env.development    # Dev server settings: runs React on port 3001
│   └── package.json        # Also holds "proxy": passes API requests on to port 3000
└── docs/
    ├── database-design.md  # Database design and ERD
    └── images/             # Images used in the docs (e.g. the ERD key)
```

## How to Use

### Prerequisites
- [Node.js](https://nodejs.org/) v22.9 or later
- [PostgreSQL](https://www.postgresql.org/download/) (developed with v18), plus pgAdmin 4 or `psql`

### 1. Clone the repository and install dependencies
```bash
git clone <repository-url>
cd e-commerce-app/back-end
npm install
cd ../front-end
npm install
```

### 2. Create the database
Using **pgAdmin 4**:
1. Right-click **Databases → Create → Database…**, name it `ecommerce`, and click **Save**.
2. Select the `ecommerce` database, open **Tools → Query Tool**, and check the tab title starts with `ecommerce/`.
3. Open `back-end/db/schema.sql`, then click **Execute** (or press F5).
4. Refresh the database: `addresses`, `cart_items`, `categories`, `customers`, `federated_credentials`, `order_items`, `orders`, `products`, and `session` appear under **Schemas → public → Tables**.

Or using **psql** from the project root:
```bash
createdb -U postgres ecommerce
psql -U postgres -d ecommerce -f back-end/db/schema.sql
```

There are no category routes yet, so add categories in pgAdmin's Query Tool:
```sql
INSERT INTO categories (name) VALUES ('Kitchen') RETURNING id;
```

#### Updating an existing database
`schema.sql` always describes the latest database, so a new database built from it needs nothing
else. If you created your database **before** a schema change, run each file in
`back-end/db/migrations/` that you haven't run yet, in number order, the same way as `schema.sql`
above. Each one adds a table, so a table's presence shows its migration has run:

| Migration | What it changes | Has run if you can see |
|---|---|---|
| `001-add-categories.sql` | Adds the `categories` table and `products.category_id` | `categories` |
| `002-add-cart-items.sql` | Adds the `cart_items` table (shopping carts) | `cart_items` |
| `003-add-federated-credentials.sql` | Adds the `federated_credentials` table (Google and Facebook sign-in) and lets `customers.password_hash` be empty | `federated_credentials` |
| `004-add-session-table.sql` | Adds the `session` table (login sessions that survive restarts) | `session` |

Run 004 **before** starting the API with this version: without the `session` table, logging in
fails and any browser with a session cookie gets `500` errors. Each migration runs inside a
transaction, so running one twice fails (e.g. "relation already exists") and changes nothing.

### 3. Configure environment variables
Create a file called `.env` in the `back-end` folder:
```
PORT=3000

PGHOST=localhost
PGPORT=5432
PGDATABASE=ecommerce
PGUSER=postgres
PGPASSWORD=your-postgres-password

SESSION_SECRET=a-long-random-string

# Optional: "Sign in with Google" and "Sign in with Facebook".
# Leave these out (or empty) and those buttons are simply hidden.
# See "Set up Google and Facebook sign-in" below for where to get them.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
# Where Google and Facebook send the browser back to. The default is the React app:
# OAUTH_CALLBACK_BASE_URL=http://localhost:3001
```
`SESSION_SECRET` signs the login session cookie so it can't be forged. The server won't start
without it. Generate a random value from the `back-end` folder with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
`.env` is listed in `.gitignore`, so your password and secrets are never committed.

### 4. Start the server
All `npm` commands must be run from the `back-end` folder, where `package.json` is:
```bash
npm run dev    # restarts automatically when you save a file
npm start      # runs without auto-restart
```
Visit http://localhost:3000/health to check it's working. It returns
`{"status":"ok","database":"ecommerce",...}`, or a `503` error if the database can't be reached.

### 5. Explore the API (Swagger)
With the server running, open **http://localhost:3000/api-docs**. This is **Swagger UI**: the
complete reference for every endpoint, grouped into sections (Health, Auth, Products, Account,
Cart, Checkout, Orders). For each endpoint it shows whether a login is needed (a padlock), the
request body with an example and every validation rule, and every response it can return.

**Trying endpoints:** open an endpoint, click **Try it out**, then **Execute**. To use the
padlocked endpoints, first register or log in with **POST /auth/register** or
**POST /auth/login**. The server replies with a session cookie, which your browser sends with
every later request, so there's nothing to paste into **Authorize**. These are real requests:
they change whichever database the server is using.

**In Postman:** **File → Import** and paste `http://localhost:3000/api-docs/openapi.json`; every
endpoint becomes a request. Postman keeps the session cookie like a browser does.

**How it's built:** the spec is written by hand in `back-end/openapi.yaml`
([OpenAPI 3.0](https://swagger.io/specification/v3/), commented throughout) and served by
[swagger-ui-express](https://github.com/scottie1984/swagger-ui-express). `tests/docs.test.js`
checks that the spec is valid OpenAPI, that every documented endpoint really exists in the app,
and that each one has a summary, a section and a success response. It can't spot an endpoint
that exists but **isn't** documented, so document new routes when you add them.

**Payments are fake.** Checkout uses a fake payment processor
(`services/payment-processor.js`) that copies [Stripe's test cards](https://docs.stripe.com/testing):
`4242 4242 4242 4242` (or any other valid card number) succeeds, `4000 0000 0000 0002` is
declined (`402`), and `4000 0000 0000 0119` simulates a processor outage (`502`). When real
Stripe payments are added, only that one file should need replacing.

### How login works
- **Email and password:** registering logs you in straight away. Passwords are hashed with
  bcrypt (`bcryptjs`), never stored or compared as plain text.
- **Google and Facebook:** the browser visits `/auth/google` (or `/auth/facebook`), signs in at
  the provider, and comes back to the callback route. Passport then logs in the customer already
  linked to that account; otherwise the customer with the same **verified** email (linking the
  accounts); otherwise a brand-new customer with no password. Passport's `state` check stops
  another website from pushing a forged sign-in response. If sign-in fails, the browser goes back
  to the Log in page with a message.
- **Sessions** are stored in PostgreSQL by
  [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple), so restarting the API
  doesn't log anyone out. The browser's `connect.sid` cookie holds only the session's id.
- **A login lasts 7 days from your last visit:** every request renews it. Expired sessions are
  deleted every 15 minutes.
- **The cookie is `HttpOnly`** (page scripts can't read it) **and `SameSite=Lax`** (sent when you
  visit the site, including coming back from Google or Facebook, but not with other websites'
  background requests).
- **Logging out deletes the stored session**, so the old cookie can never log anyone in again.
- **When the app is deployed** (Render), it must also set `secure: true` on the cookie (HTTPS
  only) and `app.set('trust proxy', 1)`, because Render runs the app behind a proxy.

### Front end (React)
The front end is a React app in the `front-end` folder, made with Create React App. It uses
[React Router](https://reactrouter.com/) (v7) to move between pages without reloading the site.
The Products, product, Register and Log in pages are connected to the API; the other pages are
still placeholders that later tickets will connect.

**Products (the home page)** shows every product in the shop as a grid of cards. Each card shows
the name, the description cut to two lines, and the price (in pounds, e.g. "£8.50"). Sold-out
products are labelled "Out of stock". The whole card links to the product's own page. Anyone
can browse; no login is needed. There are no product images yet (see Future Work).

**A product's page** shows its full description, price and how many are in stock, with a
**Quantity** box and an **Add to cart** button:
- **Adding** keeps you on the page, shows "✓ Added 2 to your cart." and updates the cart icon.
- **The quantity** must be a whole number from 1 to the number in stock; anything else just
  disables the button. If your cart already holds some, the API's message says how many more
  you can add (e.g. "Not enough stock: 5 available, 3 already in your cart").
- **Sold out:** a disabled "Out of stock" button instead.
- **Logged out:** Add to cart takes you to Log in (or on to Register), then back to the product,
  where you click Add to cart again. If your login has expired without the app knowing, the
  same happens. While the app is still checking whether you're logged in (a split second on
  load), the button waits rather than guessing.
- **Not found:** a retired product, an unknown id or an invalid one (e.g. `/products/abc`)
  shows "Product not found" with a link back to Products.

**The cart icon** in the nav (logged in only) shows a red badge with the number of items in your
cart: 2 mugs and 1 teapot count as 3. It's loaded when you log in, updated from the API's reply
each time you add something, and cleared when you log out. Screen readers hear the link as
"Cart, 3 items". Clicking it opens the Cart page.

Start the API first (`npm run dev` in the `back-end` folder), then start the front end from the
`front-end` folder:
```bash
npm start
```
This opens **http://localhost:3001** (the port is set in `front-end/.env.development`, because
the API uses 3000).

**How the front end reaches the API:** the `"proxy"` setting in `front-end/package.json` makes
the React dev server pass any request it can't answer itself (e.g. `POST /auth/register`) on to
`http://localhost:3000`. So the browser only ever talks to one address: the session cookie works
with no extra setup, and no CORS is needed. Page addresses typed into the browser ask for HTML,
and those are always answered by React, never passed to the API. That's why `/account` can be
both a page and an API endpoint.

The one exception is Google and Facebook sign-in. The "Sign in with..." buttons are ordinary
links, so clicking one asks for a page, which the `"proxy"` setting would answer with React.
`front-end/src/setupProxy.js` (which Create React App runs automatically, in development only)
always passes `/auth/google…` and `/auth/facebook…` on to the API.

`.env.development` also sets `DANGEROUSLY_DISABLE_HOST_CHECK=true`. Without it, Create React
App crashes on start (`options.allowedHosts[0] should be a non-empty string`) on computers whose
network address isn't a typical home or office one (e.g. on a VPN such as Tailscale). It only
affects `npm start`, never the production build. It turns off a guard against "DNS rebinding";
the risk is low for local development, but if your computer has a normal home or office address
you can delete this line to keep the check on.

| URL | Page |
|---|---|
| `/` | Products (the home page): a grid of every product |
| `/products/:productId` | A single product, with Add to cart |
| `/register` | Register: create an account (signs you in, then goes to Products) |
| `/login` | Log in: with email and password, or "Sign in with Google / Facebook" (when set up); links to Register |
| `/account` | Your account (log in needed) |
| `/cart` | Your cart, linking to checkout (log in needed) |
| `/checkout` | Checkout (log in needed) |
| `/orders` | Your orders (log in needed) |
| `/orders/:orderId` | A single order (log in needed) |
| anything else | Page not found |

**Logged in or not:** when the app loads, it asks the API who's logged in (`GET /auth/me`), and
the nav only shows what you can use:

| | Nav shows |
|---|---|
| Logged out | Products · Log in · Register |
| Logged in | Products · cart icon (with its item count) · Orders · Account · "Hi, Ada" · **Log out** button |
| Still checking (a split second on load) | Products only |

- **Pages that need you logged in** send a logged-out visitor to the Log in page. After logging
  in, you go back to the page you wanted, including any `?query` part. While the app is still
  checking who's logged in, those pages show "Loading…", so a logged-in customer is never sent
  to Log in by mistake.
- **Log in and Register** send a customer who's already logged in to Products. Switching
  between them (the "Register" and "Log in" links on each page) keeps the page you wanted, so
  registering instead of logging in still takes you back there.
- **Log out** ends the session on the server, then shows Products with the logged-out nav. If
  the server can't be reached, you stay logged in and see "Could not log out. Please try again."

The "page you wanted" is passed inside the app (React Router's navigation *state*), not in the
address bar, so nobody can make a link that sends a customer to another website after they log
in. Google and Facebook sign-in leave the app and come back, so they always return to Products.

**Why React Router v7, not the newest v8?** v8 is only published as ES modules, which the
test runner built into Create React App (Jest 27) can't load. v7 works the same way for
everything used here, so upgrading later is a small change.

### Set up Google and Facebook sign-in (optional)
Everything else works without this: the "Sign in with..." buttons only appear once a provider's
keys are in `back-end/.env`. Both providers are free to set up. Your apps stay in "testing" or
"development" mode, so only you (and people you add as testers) can sign in with them.

The address Google and Facebook send the browser back to is on the **React app (port 3001)**,
not the API. `setupProxy.js` passes it on to the API, so the session cookie ends up on the same
address as the shop.

#### Google
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and sign in with your
   Google account.
2. Create a project: click the project picker at the top → **New Project**, name it (e.g.
   `e-commerce-app`) → **Create**, then make sure it's selected.
3. Set up the consent screen (the page that asks "Allow e-commerce-app to see your email?"):
   go to **APIs & Services → OAuth consent screen** (Google may call it **Google Auth
   Platform**) → **Get started**.
   - App name: anything, e.g. `E-Commerce App`. User support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree to the policy, then **Create**.
   - Under **Audience → Test users**, add your own Gmail address. While the app is in
     "Testing", only test users can sign in.
4. Create the keys: go to **Clients** (or **APIs & Services → Credentials → Create Credentials →
   OAuth client ID**).
   - Application type: **Web application**. Name: anything.
   - **Authorised redirect URIs → Add URI**:
     `http://localhost:3001/auth/google/callback` (exactly this, with no slash at the end).
   - **Create**. Copy the **Client ID** and **Client secret**.
5. Put them in `back-end/.env`:
   ```
   GOOGLE_CLIENT_ID=the-client-id
   GOOGLE_CLIENT_SECRET=the-client-secret
   ```

#### Facebook
1. Go to [Meta for Developers](https://developers.facebook.com/), log in with Facebook, and
   register as a developer if asked. Meta may ask you to verify your account, e.g. with a phone
   number.
2. **My Apps → Create App**. Name it (e.g. `E-Commerce App`), and choose the use case
   **Authenticate and request data from users with Facebook Login**. Skip connecting a business
   if asked.
3. In the app's dashboard, open the Facebook Login use case → **Customize** (or **Permissions**)
   and make sure the **email** permission is added.
4. Open Facebook Login's **Settings** and, under **Valid OAuth Redirect URIs**, add
   `http://localhost:3001/auth/facebook/callback`. Save. (Facebook allows `http://localhost`
   addresses while the app is in development mode.)
5. Go to **App settings → Basic** and copy the **App ID** and **App secret** (click **Show**).
6. Put them in `back-end/.env`:
   ```
   FACEBOOK_APP_ID=the-app-id
   FACEBOOK_APP_SECRET=the-app-secret
   ```
Leave the app in **development mode**. Going "Live" for the public needs Meta's app review,
which this project doesn't need.

#### Try it
Restart the API (`npm run dev` in `back-end`), then open http://localhost:3001/login. The
"Sign in with Google" and "Sign in with Facebook" buttons now appear. `GET /auth/providers`
shows which providers the API has picked up.

#### Known limitations
- **Account pre-hijacking.** Signing in with Google or Facebook joins you to the existing
  account with the same email. But registering with an email and password doesn't check that
  you own that email. So someone could register `ada@gmail.com` with their own password
  *before* Ada does. When the real Ada later signs in with Google, she's linked to that account,
  and the other person can still log in with their password. The fix is to confirm emails at
  registration, which needs the email system listed under Future Work.
- **No password for Google/Facebook-only accounts.** Customers who only ever sign in with Google
  or Facebook have no password, and there's no way to add one yet (or to unlink a provider).
- **Local only.** The callback addresses are `localhost`. Deploying needs new redirect URIs
  (and `OAUTH_CALLBACK_BASE_URL`) for the live address.

### 6. Run the tests

| | Back end: unit and integration | Back end: end-to-end (E2E) | Front end |
|---|---|---|---|
| **Command** | `npm test` (in `back-end`) | `npm run test:e2e` (in `back-end`) | `npm test -- --watchAll=false` (in `front-end`) |
| **Tool** | Node's test runner + Supertest | Newman (Postman's command-line runner) | Jest + React Testing Library |
| **Server** | Not needed: the tests load the app directly | Must be running: `npm run start:test` | Not needed: the API is a fake `fetch` |
| **Database** | `ecommerce_test`, emptied before every test | `ecommerce_test` | None |

**The test database.** Back-end tests never touch your real data. Create `ecommerce_test` once,
and again whenever `schema.sql` changes, with `npm run db:test:reset` (in `back-end`). It drops,
recreates and rebuilds the database from `schema.sql`, so it never needs migrations. The test
helper refuses to empty any database whose name doesn't end in `_test`. `.env.test` switches
the database name, provides a test-only `SESSION_SECRET`, turns the Google and Facebook
providers off (tests that need them set fake keys, and never contact Google or Facebook), and
sets `SESSION_PRUNE=off` (a running clean-up timer would stop the test process exiting).

**E2E tests** send real requests to the running server. Start it on the test database in one
terminal, then run the collection in another:
```bash
npm run start:test   # like npm start, but also loads .env.test
npm run test:e2e     # newman run tests/e2e/ecommerce-api.e2e.postman_collection.json
```
http://localhost:3000/health should say `"database":"ecommerce_test"`. The test database is used
because checkout creates orders, which are permanent and can't be cleaned up afterwards. A
passing run ends with `0` in every row of Newman's **failed** column, and Newman exits with code
`0` (or `1` on any failure, so it can gate CI). `connect ECONNREFUSED` means the server isn't
running.
- **Don't run `npm test` at the same time:** it empties the tables the E2E run is using.
- **A different server address:** `npm run test:e2e -- --env-var baseUrl=http://localhost:4000`.
- **In the Postman app:** **File → Import** the collection file, then **Run collection**. Every
  request has a description, and every check is commented.
- **Warnings you can ignore:** Newman's `DeprecationWarning: fs.F_OK is deprecated`, and
  `npm audit` findings in Newman's dependencies (dev-only; `npm audit --omit=dev` shows `0`).

## Technologies
- JavaScript
- Git and GitHub
- Command Line
- Express
- PostgreSQL
- HTML
- CSS
- React
- React Router: moving between pages in the React app
- bcryptjs: password hashing (pure-JavaScript bcrypt)
- Passport.js: logging in, with `passport-local` (email and password),
  `passport-google-oauth20` (Sign in with Google) and `passport-facebook` (Sign in with Facebook)
- express-session and connect-pg-simple: login sessions, stored in PostgreSQL
- React context: shares who's logged in with every page of the React app
- http-proxy-middleware: sends the Google and Facebook sign-in visits from the React dev server
  to the API
- Node.js test runner (`node:test`) and Supertest: unit and integration tests
- Jest and React Testing Library: front-end tests
- Postman and Newman: end-to-end API tests
- Swagger UI and OpenAPI 3.0: interactive API documentation

## Error Handling and Testing
All errors are returned as JSON in the form `{ "error": "description of the problem" }`, with an
HTTP status code that describes the type of error. Every status code each endpoint can return,
and every validation rule, is listed in the [Swagger documentation](#5-explore-the-api-swagger).
Unexpected errors reach a central handler in `app.js`, which logs the details on the server but
sends only `{ "error": "Internal server error" }` (`500`), because stack traces and database
errors can reveal how the app works. `GET /health` returns `503` when the database can't be
reached, separating "the app is down" from "the database is down".

### Design decisions
- **Duplicates are caught by `UNIQUE` constraints, not by checking first.** Checking for an
  existing email or SKU and then inserting has a race condition: two identical requests could
  both pass the check. The constraint guarantees only one succeeds, and the route turns
  PostgreSQL's error `23505` into a `409`. Foreign key (`23503`) and `ON DELETE RESTRICT`
  (`23001`) errors are turned into `400` and `409` the same way.
- **Passwords are limited to 72 bytes**, not characters: bcrypt silently ignores anything past
  72 bytes, so a longer password would appear to work while only part of it was checked.
- **Ids are checked before any query runs.** Ids in the URL must be whole numbers within
  PostgreSQL's `integer` range, so `/products/abc` returns `400` instead of a database error.
- **Prices are exact.** They're stored as `numeric(10,2)` and returned as strings (`"8.50"`),
  because a JavaScript number could introduce rounding errors.
- **Card numbers and CVCs are strings:** a 16-digit JSON number can lose digits, and a CVC can
  start with `0`. Card numbers must pass the Luhn checksum, which catches most typos.
- **Checkout is one transaction.** It saves the address, creates the order, freezes each item's
  price, reduces stock and empties the cart, or, if anything fails (including a declined card),
  does none of it. It **locks** the cart's product rows (`SELECT ... FOR UPDATE`), so two
  customers buying the last item at the same moment get one success and one `409`, never
  negative stock.
- **A processor outage is `502`, not `500`.** It's a failure of a service the API relies on, not
  a bug in the API. The fake processor throws its own `PaymentProcessorError` so the route can
  tell the two apart.
- **Someone else's order is `404`, not `403`.** A `403` would confirm the order exists, letting
  anyone count the shop's orders by guessing ids. The ownership check is part of the query
  (`WHERE id = $1 AND customer_id = $2`), so another customer's order is simply never found.
- **One message for a wrong password and an unknown email.** Different messages would let anyone
  check whether an email address has an account.
- **Google and Facebook only link by verified email.** Otherwise someone could claim another
  person's address and get into their account. Sign-in errors are shown as fixed messages chosen
  by a code in the URL, never the code itself, so a made-up `?error=` can't put text on the page.
- **Retired products are kept, not deleted**, so past orders can still refer to them. They're
  hidden everywhere else in the API, including carts and cart totals.

### Testing
Everything is built test-first: each test is written and seen to fail before the code that makes
it pass. Back-end tests run against a real PostgreSQL test database, not mocks.

| Area | Tests | Covers |
|---|---|---|
| Registration | 31 | Logging in straight away, duplicates (including simultaneous requests), every invalid input |
| Login and logout | 18 | Staying logged in, the `HttpOnly` cookie, identical errors for wrong password and unknown email, accounts with no password |
| Sessions | 9 | Sessions stored in the database, the 7-day rolling cookie, expiry, `GET /auth/me`, logout making the old cookie useless |
| Google and Facebook | 22 | New, linked and verified-email customers, redirects with the right `state` and scopes, cancelling, providers switched off |
| Products | 62 | Listing and filtering, retired products hidden, creating, updating and retiring, duplicate SKUs, every invalid detail |
| Account | 31 | Viewing, updating and deleting your own account only, taken emails, accounts with orders |
| Cart | 46 | Totals checked against hand-worked values, quantities adding together, stock limits, other customers' carts invisible |
| Checkout | 55 | The full paid order, frozen prices, stock and cart updated, declines and outages changing nothing, two customers racing for the last item |
| Orders | 16 | History newest first, full details matching checkout, prices paid surviving price changes, other customers' orders giving `404` |
| API documentation | 6 | Swagger served, the spec valid, every documented endpoint existing |
| **Back end total** | **296** | |

The **end-to-end collection** (48 requests, 134 checks) takes customers through registering,
logging in, updating their account, filling and emptying their cart, logging out, deleting their
account, checking out (including a mistyped card and a declined payment) and viewing their
orders, against the real running server. After every request it also checks that no response
contains a password.

The **front end** has 147 tests:

| Area | Tests | Covers |
|---|---|---|
| Products page | 8 | The grid, links, "Out of stock", empty and error states |
| Product page | 8 | Details, "Product not found" (including invalid ids), errors, moving between products |
| Add to cart | 17 | Adding and the badge, invalid quantities, double clicks, not enough stock, errors, logged out, an expired login, waiting while the login is checked |
| Cart count | 10 | Loading on login, clearing on logout, the server's count after adding, late answers ignored |
| Cart icon | 8 | The badge, its screen-reader name ("Cart, 1 item"), no icon when logged out |
| Products API and prices | 8 | Requests, error statuses, "£8.50" |
| Registration form | 12 | Fields, the exact request, mismatched passwords, errors, double clicks |
| Login page | 14 | Fields, the exact request, errors, provider links, sign-in error codes |
| Login record | 8 | Waiting for the API, slow answers, logging out |
| Access control | 25 | The nav, the guards, returning to the page you wanted (also via Register), logging out |
| Routing | 29 | Every URL, the nav links, "Page not found" |

The API is replaced by a fake `fetch`, so no server is needed.

## Future Work
- Show an image for each product
- Enable users to rate and review products
- Add functionality to allow for "guest" checkout (not requiring an account to place an order)
- Add admin management panel
  - Set up protected API endpoints for admin-level management access of products, customer orders, etc.
  - Create admin client UI with React to easily manage data.
- Add email notification system
  - Set up automated email service on the server to send emails to customers on completion of a purchase.
  - Set up an automated cron job to send email reminders to customers when products have been in their carts for a certain duration of time. 
  - Back-in-stock alerts: let customers ask to be emailed when a sold-out product returns.
- Add ability to refund customer orders
  - Set up webhook(s) that interfaces with the payment processor (Stripe) and deals with actions such as refunds.
  - When a refund is processed in Stripe, update order.
