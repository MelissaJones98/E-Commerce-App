# E-Commerce App

## Description
A fully functioning e-commerce application REST API using PostgreSQL, Express, React, Node.js (PERN). The application allows users to perform various CRUD operations such as registering an account, 
browsing products, and completing a purchase. 

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
│   │   ├── api/
│   │   │   └── auth.js     # Calls the API's /auth endpoints (register, login, logout, who's logged in, providers)
│   │   ├── auth/
│   │   │   ├── AuthContext.js  # Who's logged in, shared with every page (useAuth())
│   │   │   ├── RequireAuth.js  # Guard: pages that need you logged in (else go to Log in)
│   │   │   ├── GuestOnly.js    # Guard: Log in and Register (logged in? go back to the page you wanted)
│   │   │   ├── AuthContext.test.js # Tests for the login record and logging out
│   │   │   └── access.test.js  # Tests for the nav, the guards, and logging in/out in the app
│   │   ├── components/
│   │   │   └── Layout.js   # Header, main nav (changes when you log in) and the page area
│   │   ├── pages/          # One component per page (Register and Log in work; the rest are placeholders)
│   │   │   ├── RegisterPage.test.js # Tests for the registration form
│   │   │   └── LoginPage.test.js    # Tests for the login form, provider links and sign-in errors
│   │   ├── setupProxy.js   # Dev only: sends Google/Facebook sign-in page visits on to the API
│   │   ├── routes.test.js  # Tests for every page URL and the navigation
│   │   ├── App.test.js     # Tests that App shows the home page
│   │   ├── test-utils.js   # Shared test helper: renders the app at any URL, logged in or out
│   │   └── setupTests.js   # Test setup: jest-dom matchers and a TextEncoder polyfill
│   ├── .env.development    # Dev server settings: runs React on port 3001
│   └── package.json        # Also holds "proxy": passes API requests on to port 3000
└── docs/
    ├── database-design.md  # Database design and ERD
    ├── api-endpoints.md    # REST API endpoints: built and planned
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

#### Updating an existing database
`schema.sql` always describes the latest database, so a new database built from it needs nothing
else. If you created your database **before** a schema change, run each file in
`back-end/db/migrations/` that you haven't run yet, in number order, the same way as `schema.sql`
above (pgAdmin Query Tool → open file → Execute):

| Migration | What it changes |
|---|---|
| `001-add-categories.sql` | Adds the `categories` table and `products.category_id` |
| `002-add-cart-items.sql` | Adds the `cart_items` table (shopping carts) |
| `003-add-federated-credentials.sql` | Adds the `federated_credentials` table (Google and Facebook sign-in) and lets `customers.password_hash` be empty |
| `004-add-session-table.sql` | Adds the `session` table (login sessions that survive restarts) |

To check which migrations a database already has, refresh it in pgAdmin and look under
**Schemas → public → Tables**: `categories` means 001 has run, `cart_items` means 002 has run,
`federated_credentials` means 003 has run, and `session` means 004 has run.

Run 004 **before** starting the API with this version. Without the `session` table, the API
can't read or save sessions: logging in fails, and any request from a browser that already has
a session cookie (even browsing products) gets a `500 Internal Server Error`. The React app then
just looks logged out. If that happens, run 004 and restart the API.

Each migration runs once. Running one again fails with an error (e.g. "relation already exists")
and changes nothing, because each runs inside a transaction.

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

### 5. Check it's working
| Route | Description |
|---|---|
| `GET /` | Returns `Hello World!` |
| `GET /health` | Confirms the database connection. Returns `{"status":"ok","database":"ecommerce",...}`, or a `503` error if the database can't be reached |
| `POST /auth/register` | Creates a customer account (see below) |
| `POST /auth/login` | Logs in with email and password (see below) |
| `POST /auth/logout` | Logs out (must be logged in) |
| `GET /auth/me` | Who's logged in (the customer, or `null`) |
| `GET /auth/providers` | Which of Google and Facebook sign-in are switched on |
| `GET /auth/google`, `GET /auth/facebook` | Sign in with Google or Facebook (visited by the browser; see below) |
| `GET /products` | Lists products; add `?category=1` to filter by category |
| `GET /products/:productId` | Gets one product |
| `POST /products` | Creates a product (must be logged in) |
| `PUT /products/:productId` | Replaces a product's details (must be logged in) |
| `DELETE /products/:productId` | Retires a product (must be logged in) |
| `GET /account` | Gets your own account details (must be logged in) |
| `PUT /account` | Replaces your name, email and phone (must be logged in) |
| `DELETE /account` | Deletes your account and logs you out (must be logged in) |
| `GET /cart` | Gets your cart: items, line totals and the cart total (must be logged in) |
| `POST /cart/items` | Adds a product to your cart (must be logged in) |
| `PUT /cart/items/:productId` | Changes how many of a product are in your cart (must be logged in) |
| `DELETE /cart/items/:productId` | Removes a product from your cart (must be logged in) |
| `DELETE /cart` | Empties your cart (must be logged in) |
| `POST /cart/checkout` | Pays for your cart and turns it into an order (must be logged in) |
| `GET /orders` | Gets your order history, newest first (must be logged in) |
| `GET /orders/:orderId` | Gets one of your orders in full (must be logged in) |
| `GET /api-docs` | Interactive API documentation (Swagger UI); see "API documentation" below |
| `GET /api-docs/openapi.json` | The raw OpenAPI spec, for tools such as Postman |

Visit http://localhost:3000/health in your browser to test it.

#### Register
To try registration in Postman, send a **POST** request to `http://localhost:3000/auth/register`
with **Body → raw → JSON**:
```json
{
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "password": "correct-horse-battery"
}
```
| Response | When |
|---|---|
| `201 Created` | The account was created **and you're logged in** (the response sets the session cookie). Returns the new customer (never the password) |
| `400 Bad Request` | A field is missing or invalid: e.g. a malformed email, or a password under 8 characters or over 72 bytes |
| `409 Conflict` | An account with that email already exists (emails are case-insensitive) |

You don't need to call `/auth/login` after registering. A failed registration (`400` or `409`)
logs no one in. This creates a real account in your `ecommerce` database.

#### Log in
Send a **POST** request to `http://localhost:3000/auth/login` with **Body → raw → JSON**:
```json
{
  "email": "ada@example.com",
  "password": "correct-horse-battery"
}
```
| Response | When |
|---|---|
| `200 OK` | Logged in. Returns the customer and sets a session cookie |
| `400 Bad Request` | `email` or `password` is missing |
| `401 Unauthorized` | The email or password is wrong (the same message for both). Accounts with no password, made by signing in with Google or Facebook, also get this |

Postman stores the session cookie automatically and sends it with your following requests, just
like a browser, so you stay logged in.

The password check uses bcrypt (`bcryptjs`): it hashes the password you send with the salt
stored inside the saved hash, and compares the results. Passwords are never stored or compared
as plain text.

#### Sign in with Google or Facebook
These routes are visited by the **browser** (the customer clicks "Sign in with Google" on the
Log in page), not called from Postman or code. Each one only works once its keys are set; see
[Set up Google and Facebook sign-in](#set-up-google-and-facebook-sign-in-optional).

1. `GET /auth/google` (or `/auth/facebook`) sends the browser to Google's sign-in page.
2. The customer signs in at Google and agrees to share their name and email.
3. Google sends the browser back to `/auth/google/callback`. Passport checks the response with
   Google, and the customer is logged in (the session cookie is set) as:
   - the customer already linked to this Google account, if there is one;
   - otherwise, the customer with the same email, if Google has verified that email (the
     accounts are linked from now on);
   - otherwise, a brand-new customer with no password.
4. The browser goes to the shop's home page.

Two safety details:
- **Verified emails only.** An account is only joined by email if the provider confirms the
  person owns that email; otherwise someone could claim another person's address and get into
  their account. Google says so with a "verified" flag. Facebook sends no flag, but it only
  shares email addresses its users have confirmed, so its emails are trusted.
- **`state`.** Before sending the browser to Google or Facebook, Passport stores a random value
  in the session and includes it in the request; the provider must send the same value back.
  That stops another website from pushing a forged sign-in response onto the customer.

If sign-in doesn't work, the browser goes back to the Log in page with a message instead (see
"Google and Facebook sign-in problems" under Error Handling).

`GET /auth/providers` returns e.g. `{ "google": true, "facebook": false }`, so the Log in page
knows which buttons to show. When a provider isn't set up, its routes reply
`404 { "error": "Google sign-in is not set up" }`.

#### Log out
Send a **POST** request to `http://localhost:3000/auth/logout` with no body.

| Response | When |
|---|---|
| `204 No Content` | Logged out: the session is deleted, and the response tells the browser to delete the cookie |
| `401 Unauthorized` | You weren't logged in |

Once you've logged out, the old session cookie can never log anyone in again, even if someone
had copied it.

#### Who's logged in
Send a **GET** request to `http://localhost:3000/auth/me`. It always returns `200`:
`{ "customer": { "id": 1, "first_name": "Ada", ... } }` when you're logged in, or
`{ "customer": null }` when you're not. The React app asks this when it loads, to decide what
the nav shows and which pages you can open.

#### How login sessions work
Logging in (or registering, or signing in with Google or Facebook) creates a **session**: a row
in the `session` table that says which customer is logged in. Your browser gets a cookie,
`connect.sid`, holding only the session's id.
- **Sessions are stored in PostgreSQL**, using
  [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple), not in the server's
  memory. Restarting the API (including `npm run dev` restarting after you save a file) doesn't
  log anyone out.
- **A login lasts 7 days from your last visit.** Every request renews the cookie and the stored
  session, so someone shopping regularly is never logged out mid-shop; someone who stays away
  for 7 days is.
- **The cookie is `HttpOnly`** (page scripts can't read it, so a malicious script can't steal
  it) **and `SameSite=Lax`** (it's sent when you visit the site, including coming back from
  Google or Facebook, but not with requests other websites make in the background).
- **Expired sessions are deleted** from the table every 15 minutes.
- **When the app is deployed** (the Render ticket), it must also set `secure: true` on the
  cookie (HTTPS only) and `app.set('trust proxy', 1)`, because Render runs the app behind a proxy.

#### Browse products
These routes are public; no login needed. Try them in Postman or your browser:
- `GET http://localhost:3000/products` lists every product in the shop
- `GET http://localhost:3000/products?category=1` lists only products in category `1`
- `GET http://localhost:3000/products/1` gets product `1`

```json
{
  "id": 1,
  "category_id": 1,
  "sku": "MUG-001",
  "name": "Coffee Mug",
  "description": "A 350ml ceramic mug",
  "price": "8.50",
  "stock_quantity": 42
}
```
`price` comes back as a string (`"8.50"`) so its exact value is kept; converting to a JavaScript
number could introduce rounding errors.

| Response | When |
|---|---|
| `200 OK` | Success. A category with no products returns an empty list `[]` |
| `400 Bad Request` | The category or product id isn't a whole number |
| `404 Not Found` | No product with that id, or it has been retired |

There are no category routes yet, so add categories in pgAdmin's Query Tool:
```sql
INSERT INTO categories (name) VALUES ('Kitchen') RETURNING id;
```

#### Create, update and retire products
Log in first (see above). Then:

- **Create:** send a **POST** to `http://localhost:3000/products`.
- **Update:** send a **PUT** to `http://localhost:3000/products/1`. `PUT` replaces the whole
  product, so send every field, not only the ones that changed.

Both take **Body → raw → JSON**:
```json
{
  "sku": "MUG-001",
  "name": "Coffee Mug",
  "description": "A 350ml ceramic mug",
  "price": 8.5,
  "stock_quantity": 42,
  "category_id": 1
}
```
`description` and `category_id` are optional. `price` must be a number (not a string) with at most
2 decimal places.

**Retire:** send a **DELETE** to `http://localhost:3000/products/1`. The product disappears from
the shop but stays in the database, so past orders can still refer to it.

| Response | When |
|---|---|
| `201 Created` | Product created (POST). Returns the new product |
| `200 OK` | Product updated (PUT). Returns the updated product |
| `204 No Content` | Product retired (DELETE) |
| `400 Bad Request` | A field is missing or invalid, or `category_id` doesn't match a category |
| `401 Unauthorized` | You aren't logged in |
| `404 Not Found` | No product with that id, or it has already been retired |
| `409 Conflict` | Another product already has that `sku` |

#### Your account
Log in first (see above). These routes only ever work on the logged-in customer's own account:
there's no customer id in the URL, so you can't reach anyone else's.

- **View:** send a **GET** to `http://localhost:3000/account`.
- **Update:** send a **PUT** to `http://localhost:3000/account` with **Body → raw → JSON**:
  ```json
  {
    "first_name": "Ada",
    "last_name": "Lovelace",
    "email": "ada@example.com",
    "phone": "+44 20 7946 0000"
  }
  ```
  `PUT` replaces your details, so send `first_name`, `last_name` and `email` every time. `phone`
  is optional; leaving it out clears it. Any other fields (such as `id` or `password_hash`) are
  ignored. Changing your password isn't supported yet.
- **Delete:** send a **DELETE** to `http://localhost:3000/account`. This also deletes your saved
  addresses and logs you out.

| Response | When |
|---|---|
| `200 OK` | Details returned (GET) or updated (PUT) |
| `204 No Content` | Account deleted (DELETE) |
| `400 Bad Request` | A field is missing or invalid, e.g. a malformed email or a phone number containing letters |
| `401 Unauthorized` | You aren't logged in |
| `409 Conflict` | The new email belongs to another account (PUT), or the account has orders and can't be deleted (DELETE) |

#### Your cart
Log in first (see above). Each customer has one cart, and these routes only ever work on your
own. The cart is saved in the database, so it's still there after logging out and back in.

- **View:** send a **GET** to `http://localhost:3000/cart`:
  ```json
  {
    "items": [
      { "product_id": 1, "sku": "MUG-001", "name": "Coffee Mug", "price": "8.50", "quantity": 2, "line_total": "17.00" }
    ],
    "total": "17.00"
  }
  ```
  Items are listed in the order you added them. `price` is always the product's **current**
  price: the cart doesn't store prices, so a price change shows up straight away. (Prices are
  only fixed when an order is placed.) Retired products are hidden and left out of `total`.
  An empty cart is `{ "items": [], "total": "0.00" }`.
- **Add a product:** send a **POST** to `http://localhost:3000/cart/items` with
  **Body → raw → JSON**:
  ```json
  { "product_id": 1, "quantity": 2 }
  ```
  If the product is already in your cart, the quantities are **added together** (2 + 2 = 4).
- **Change a quantity:** send a **PUT** to `http://localhost:3000/cart/items/1` (the product's id)
  with `{ "quantity": 5 }`. This **replaces** the quantity rather than adding to it.
- **Remove a product:** send a **DELETE** to `http://localhost:3000/cart/items/1`.
- **Empty the cart:** send a **DELETE** to `http://localhost:3000/cart`.

Adding and changing both return the whole updated cart, so you can see the new total straight away.

| Response | When |
|---|---|
| `200 OK` | Cart returned (GET) or quantity changed (PUT) |
| `201 Created` | Product added (POST) |
| `204 No Content` | Product removed, or cart emptied (DELETE) |
| `400 Bad Request` | `product_id` or `quantity` isn't a whole number of at least 1, or the id in the URL is invalid (to remove an item, use DELETE rather than a quantity of 0) |
| `401 Unauthorized` | You aren't logged in |
| `404 Not Found` | The product doesn't exist or is retired (POST), or isn't in your cart (PUT, DELETE) |
| `409 Conflict` | Not enough stock. When adding, the quantity already in your cart counts too |

#### Check out
Log in and add products to your cart first (see above). Then send a **POST** to
`http://localhost:3000/cart/checkout` with **Body → raw → JSON**:
```json
{
  "shipping_address": {
    "line_1": "10 Downing Street",
    "line_2": null,
    "city": "London",
    "region": null,
    "postal_code": "SW1A 2AA",
    "country_code": "GB"
  },
  "payment": {
    "cardholder_name": "Ada Lovelace",
    "card_number": "4242 4242 4242 4242",
    "expiry_month": 12,
    "expiry_year": 2030,
    "cvc": "123"
  }
}
```
- **`shipping_address`**: where the order is sent. `line_2` and `region` are optional. It's saved
  as one of your addresses. (There are no routes for managing saved addresses yet, so you send it
  with each order.)
- **`payment`**: the card to charge. `card_number` and `cvc` are strings; the card number can
  include spaces or hyphens.

**No real money moves.** Payments go through a **fake payment processor**
(`services/payment-processor.js`) that copies [Stripe's test cards](https://docs.stripe.com/testing),
so you can try every outcome:

| Card number | What happens |
|---|---|
| `4242 4242 4242 4242` | The payment succeeds (as does any other valid card number) |
| `4000 0000 0000 0002` | The card is declined: `402` |
| `4000 0000 0000 0119` | The payment processor fails: `502` |

When real payments (Stripe) are added in a later ticket, only that one file should need replacing.

**What a successful checkout does**, all in one database transaction:
1. Saves the shipping address.
2. Creates the order with status `paid`.
3. Copies each cart item into the order with its current price. That **freezes** the price, so
   later price changes don't alter the order.
4. Reduces each product's stock.
5. Empties your cart.

If anything fails part-way, none of it happens: a declined card leaves your cart, the stock and
your orders exactly as they were, so you can try another card. Card details are never stored or
sent back.

The response is the new order:
```json
{
  "id": 1,
  "status": "paid",
  "total_amount": "17.00",
  "created_at": "2026-10-15T09:36:52.487Z",
  "shipping_address": { "id": 1, "line_1": "10 Downing Street", "line_2": null, "city": "London", "region": null, "postal_code": "SW1A 2AA", "country_code": "GB" },
  "items": [
    { "product_id": 1, "sku": "MUG-001", "name": "Coffee Mug", "quantity": 2, "unit_price": "8.50", "line_total": "17.00" }
  ]
}
```

| Response | When |
|---|---|
| `201 Created` | Payment succeeded; returns the new order |
| `400 Bad Request` | The address or payment details are invalid (e.g. a mistyped card number or an expired card), or your cart is empty |
| `401 Unauthorized` | You aren't logged in |
| `402 Payment Required` | The card was declined |
| `409 Conflict` | A product in your cart no longer has enough stock |
| `502 Bad Gateway` | The payment processor failed; nothing was charged |

#### Your orders
Log in first (see above). You can only ever see your own orders.

- **Order history:** send a **GET** to `http://localhost:3000/orders`. It returns a summary of
  every order you've placed, newest first, or `[]` if you haven't ordered anything yet:
  ```json
  [
    { "id": 2, "status": "paid", "total_amount": "8.50", "item_count": 1, "created_at": "2026-10-15T10:12:04.511Z" },
    { "id": 1, "status": "paid", "total_amount": "41.00", "item_count": 3, "created_at": "2026-10-15T09:36:52.487Z" }
  ]
  ```
  `item_count` adds up the quantities (2 mugs + 1 teapot = 3 items).
- **One order in full:** send a **GET** to `http://localhost:3000/orders/1` (the order's id). It
  returns the order with its shipping address and every item, in exactly the same shape checkout
  returns (see the example above). Each item's `unit_price` is the price you **paid**: it was
  frozen at checkout, so later price changes don't affect your history, and products that have
  since been retired still appear.

Orders can't be changed or deleted through the API: they're a permanent record of what was
bought. They're created only by checking out.

| Response | When |
|---|---|
| `200 OK` | Order history or order details returned |
| `400 Bad Request` | The order id in the URL isn't a valid whole number |
| `401 Unauthorized` | You aren't logged in |
| `404 Not Found` | No order with that id, **or** it belongs to another customer |

### API documentation (Swagger)
With the server running, open **http://localhost:3000/api-docs** in your browser. This is
**Swagger UI**: interactive documentation for every endpoint, grouped into sections (Health,
Auth, Products, Account, Cart, Checkout, Orders). Click an endpoint to see:
- what it does, and whether it needs a login (shown by a padlock);
- the request body it expects, with an example and every rule (required fields, lengths,
  formats);
- every response it can return, with the status code, an explanation and an example body.

**Trying endpoints from the page:** open an endpoint, click **Try it out**, edit the example
body if you like, then click **Execute**. Swagger UI sends a real request to the server and
shows the response. To use endpoints that need a login:
1. Open **Auth → POST /auth/login**, click **Try it out**, enter an email and password you've
   registered (or register first with **POST /auth/register**), and click **Execute**.
2. The server replies with a session cookie, which your browser keeps and sends with every
   later request from the page, so the padlocked endpoints now work. There's nothing to paste
   into the **Authorize** button.

These are real requests. On `npm run dev` they change your real `ecommerce` database, while on
`npm run start:test` they change the test database.

**How it's built:**
- **The documentation is written in `back-end/openapi.yaml`.** It uses
  [OpenAPI 3.0](https://swagger.io/specification/v3/), the standard, machine-readable format for
  describing REST APIs. The file is commented throughout, explaining both the YAML format and
  each part of OpenAPI (paths, parameters, request bodies, responses, schemas and `$ref`s).
- **`app.js` loads it when the server starts** and serves it with
  [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) at `/api-docs`.
- **The same spec is available as JSON** at `/api-docs/openapi.json`. The Postman app can import
  it: **File → Import**, paste `http://localhost:3000/api-docs/openapi.json`, and every endpoint
  becomes a request.

**Keeping it accurate:** when you add or change a route, update `openapi.yaml` too.
`tests/docs.test.js` (part of `npm test`) checks that:
- the spec is **valid OpenAPI**, using the validator library `@apidevtools/swagger-parser`;
- every documented endpoint **really exists** in the app, so the docs can never describe a
  route that isn't there;
- every endpoint has a summary, a section, and a documented success response (or, for the
  Google and Facebook sign-in routes, a redirect).

The tests can't spot an endpoint that exists but **isn't** documented, so remember to document
new routes.

### Front end (React)
The front end is a React app in the `front-end` folder, made with Create React App. It uses
[React Router](https://reactrouter.com/) (v7) to move between pages without reloading the site.
The Register and Log in pages are connected to the API; the other pages are still placeholders
that later tickets will connect.

Start the API first (`npm run dev` in the `back-end` folder), then start the front end from the
`front-end` folder:
```bash
npm start
```
This opens **http://localhost:3001** (the port is set in `front-end/.env.development`, because
the API uses 3000).

**How the front end reaches the API:** the `"proxy"` setting in `front-end/package.json` makes
the React dev server pass any request it can't answer itself (e.g. `POST /auth/register`) on to
`http://localhost:3000`. So the browser only ever talks to one address, and the API's session
cookie works with no extra setup. Page addresses typed into the browser ask for HTML, and those
are always answered by React, never passed to the API. That's why `/account` can be both a page
and an API endpoint.

The one exception is Google and Facebook sign-in. The "Sign in with..." buttons are ordinary
links, so clicking one asks for a page, which the `"proxy"` setting would answer with React.
`front-end/src/setupProxy.js` (which Create React App runs automatically, in development only)
always passes `/auth/google…` and `/auth/facebook…` on to the API, so the API can redirect the
browser to Google or Facebook and back.

`.env.development` also sets `DANGEROUSLY_DISABLE_HOST_CHECK=true`. Without it, Create React
App crashes on start (`options.allowedHosts[0] should be a non-empty string`) on computers
whose network address isn't a typical home or office one (e.g. on a VPN such as Tailscale).
It only affects `npm start`, never the production build. The trade-off: the dev server's host
check guards against "DNS rebinding" (a malicious website tricking your browser into sending
requests to `localhost`), and with the proxy on, those requests could reach the API through
port 3001. The risk is low for local development (such a page can't use your `localhost`
session cookie), but if your computer has a normal home or office address you can delete this
line to keep the check on.

| URL | Page |
|---|---|
| `/` | Products (the home page) |
| `/products/:productId` | A single product |
| `/register` | Register: create an account (signs you in, then goes to Products) |
| `/login` | Log in: with email and password, or "Sign in with Google / Facebook" (when set up); links to Register |
| `/account` | Your account (log in needed) |
| `/cart` | Your cart, linking to checkout (log in needed) |
| `/checkout` | Checkout (log in needed) |
| `/orders` | Your orders (log in needed) |
| `/orders/:orderId` | A single order (log in needed) |
| anything else | Page not found |

The nav bar at the top links to the main pages and highlights the one you're on.

**Logged in or not:** when the app loads, it asks the API who's logged in (`GET /auth/me`), and
the nav only shows what you can use:

| | Nav shows |
|---|---|
| Logged out | Products · Log in · Register |
| Logged in | Products · Cart · Orders · Account · "Hi, Ada" · **Log out** button |
| Still checking (a split second on load) | Products only |

- **Pages that need you logged in** (Account, Cart, Checkout, Orders and a single order) send a
  logged-out visitor to the Log in page. After logging in, you go back to the page you wanted,
  including any `?query` part. While the app is still checking who's logged in, those pages
  show "Loading…" instead, so a logged-in customer is never sent to Log in by mistake.
- **Log in and Register** send a customer who's already logged in to Products.
- **Logging in, registering and Google/Facebook sign-in** update the nav straight away.
- **Log out** ends the session on the server, then shows Products with the logged-out nav. If
  the server can't be reached, you stay logged in and see "Could not log out. Please try again."

The "page you wanted" is passed along inside the app (React Router's navigation *state*), not
in the address bar, so nobody can make a link that sends a customer to another website after
they log in. It isn't remembered across Google or Facebook sign-in, which leaves the app and
comes back: those always return to Products.

**Why React Router v7, not the newest v8?** v8 is only published as ES modules, which the
test runner built into Create React App (Jest 27) can't load. v7 works the same way for
everything used here, so upgrading later is a small change.

### Set up Google and Facebook sign-in (optional)
Everything else works without this: the "Sign in with..." buttons only appear once a provider's
keys are in `back-end/.env`. Both providers are free to set up. This setup is for running the
app on your own computer. Your apps stay in "testing" or "development" mode, so only you (and
people you add as testers) can sign in with them.

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
Leave the app in **development mode**. Only you, and people you add under **App roles**, can
sign in with it. Going "Live" for the public needs Meta's app review, which this project doesn't
need.

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
  registration (send a code or link to the address), which needs the email system listed under
  Future Work.
- **No password for Google/Facebook-only accounts.** Customers who only ever sign in with Google
  or Facebook have no password, and there's no way to add one yet (or to unlink a provider).
- **Local only.** The callback addresses are `localhost`. Deploying needs new redirect URIs
  (and `OAUTH_CALLBACK_BASE_URL`) for the live address.

### 6. Run the tests
The back end has two kinds of automated test. Both are run from the `back-end` folder:

| | Unit and integration tests | End-to-end (E2E) tests |
|---|---|---|
| **Command** | `npm test` | `npm run test:e2e` |
| **Tool** | Node's test runner + Supertest | Newman (Postman's command-line runner) |
| **Files** | `tests/*.test.js` | `tests/e2e/ecommerce-api.e2e.postman_collection.json` |
| **Server** | Not needed: the tests load the app directly | Must be running, started with `npm run start:test` |
| **Database** | `ecommerce_test`, emptied before every test | `ecommerce_test` too (via `npm run start:test`) |
| **Checks** | Each route's behaviour in detail, including edge cases | One complete customer journey through the real running server |

The front end has its own tests, run from the `front-end` folder:
```bash
npm test -- --watchAll=false
```
They use Jest and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/),
which come with Create React App. They draw each page in a fake browser (no server needed) and
click links the way a person would. Without `--watchAll=false`, `npm test` stays open and
reruns the tests whenever you save a file.

#### Unit and integration tests
These tests use a separate `ecommerce_test` database, so they never touch your real data.
`.env.test` switches the database name and provides a test-only `SESSION_SECRET`; all other
connection details come from your `.env`. It also sets the Google and Facebook keys to empty
values, so the tests always run with both providers switched off, even after you've put real
keys in `.env`. (The tests that need a provider switched on set fake keys themselves, so they
never contact Google or Facebook.) Finally, `SESSION_PRUNE=off` stops the session store's
15-minute clean-up timer during tests, because a running timer would stop the test process from
exiting when the tests finish.

Create the test database once, from the `back-end` folder:
```bash
npm run db:test:reset
```
This drops `ecommerce_test` if it exists, recreates it, and runs `schema.sql`. Run it again
whenever `schema.sql` changes (e.g. after pulling a new migration), so the test database stays in
sync. The test database never needs migrations; it's rebuilt from scratch instead.

Then run the tests:
```bash
npm test
```
Tests are written with Node's built-in test runner (`node:test`) and
[Supertest](https://github.com/ladjs/supertest), which sends HTTP requests to the app without
starting a server. Every table is emptied before each test, and the helper refuses to run on
any database whose name doesn't end in `_test`.

#### End-to-end tests with Newman
End-to-end tests check the app the way a real client uses it. Requests go over the network to
the **running server**, which reads and writes a **real PostgreSQL database**. They're written as a
Postman collection: a saved list of requests, each with JavaScript checks (`pm.test`) that run
on its response. [Newman](https://github.com/postmanlabs/newman) is Postman's command-line tool
for running a collection, so the same tests run from the terminal without opening the Postman
app.

Newman is installed as a dev dependency (in `devDependencies` in `package.json`), so
`npm install` sets it up. There's nothing to install globally.

**1. Start the server on the test database** in one terminal, from the `back-end` folder:
```bash
npm run start:test
```
`npm run start:test` starts the server exactly like `npm start`, except it also loads
`.env.test`. That's the same file `npm test` uses: it switches the database to
`ecommerce_test`, leaving your real `ecommerce` database untouched. (The script is
`node --env-file-if-exists=.env --env-file=.env.test server.js`. Settings in the second file
replace matching ones from the first.)

**Why not your real database?** The checkout tests place an order, and orders are permanent
history: the customer and product on an order can never be deleted (see the database design).
So a run can't fully clean up after itself. The test database is wiped by `npm test` and
`npm run db:test:reset`, so anything left there doesn't matter. If the test database doesn't
exist yet, create it first with `npm run db:test:reset`.

To check the server is on the right database, visit http://localhost:3000/health: it should say
`"database":"ecommerce_test"`.

**2. Run the E2E tests** in a second terminal, also from the `back-end` folder:
```bash
npm run test:e2e
```
`npm run test:e2e` is a shortcut (defined in `"scripts"` in `package.json`) for:
```bash
newman run tests/e2e/ecommerce-api.e2e.postman_collection.json
```
`newman run <file>` sends every request in the collection, in order, and runs each one's
checks. You can type the full command yourself with `npx newman run ...`. `npx` runs a tool
installed in the project's `node_modules`.

**What the collection does:** it walks through a shop's whole journey, in six folders:

| Folder | Requests | Checks |
|---|---|---|
| 1. Register and log in | Register a new test customer; view the account straight away; ask who's logged in; log in; ask which sign-in providers are on | `201` and a session cookie; `200` (registering logged us in); `200` with that customer; `200` and a session cookie with an expiry date; `200` with `google` and `facebook` as true/false |
| 2. Account | View, update, view again, an invalid update, a logged-out view | `200`, `200`, the update was saved, `400`, `401` |
| 3. Cart | Create a test product (8.50, 5 in stock); view the empty cart; add 2; add 1 more; try to add 3 more; change the quantity to 1; remove it; remove it again; add it back; empty the cart; view it; view it logged out; retire the product | `201`; empty cart; total `17.00`; quantities added together to 3, total `25.50`; `409` (6 > 5 in stock); total `8.50`; `204`; `404`; `201`; `204`; empty cart; `401`; `204` |
| 4. Log out, then delete the account (clean-up) | Log out; ask who's logged in; log in again; delete the account, then try to use it again | `204` and the cookie cleared; `customer: null`; `200`; `204`, then `401` and `401` |
| 5. Checkout and orders | Register and log in a second customer; create a product (8.50, 5 in stock); add 2 to the cart; check out with a mistyped card, then a declined card; view the cart; check out successfully; view the cart and the product's stock; view the order history and the order's details; view an order that doesn't exist; view the history logged out; check out the empty cart; check out logged out; try to delete the account | `201`, `200`, `201`, total `17.00`; `400`, `402`; cart still holds 2; `201` paid order for `17.00` with the card number never sent back; empty cart, stock down to 3; exactly one order (paid, `17.00`, 2 items), with details matching what checkout returned; `404`; `401`; `400`; `401`; `409` (order history is protected) |
| 6. API documentation | Open the Swagger UI page; get the OpenAPI spec | `200` HTML page that loads Swagger UI; `200` OpenAPI 3.0 spec documenting the main endpoints |

After **every** request, a collection-level check also confirms the response never contains
a `password` or `password_hash`. The exception is the API documentation, which *describes* the
password field without containing anyone's password, so it's skipped there.

**What a passing run looks like:** Newman prints each request with a ✓ (`√` in Windows
terminals) beside each passing check, then a summary table. A passing run has `0` in every row
of the **failed** column:
```
┌─────────────────────────┬───────────────────┬──────────────────┐
│                         │          executed │           failed │
├─────────────────────────┼───────────────────┼──────────────────┤
│                requests │                48 │                0 │
│            test-scripts │                96 │                0 │
│              assertions │               134 │                0 │
└─────────────────────────┴───────────────────┴──────────────────┘
```
Newman exits with code `0` when everything passes and `1` when anything fails, so it can be
used in automated pipelines (CI) later. If every request shows `connect ECONNREFUSED`, the
server isn't running; start it with step 1.

**Things to know:**
- **What a run leaves in the test database:** the first customer is deleted and their test
  product retired. The checkout customer, their order and address, and the product they bought
  stay, because orders are permanent. That's harmless: `npm test` empties every table before
  each test, and every E2E run uses unique emails and SKUs made from the current time, so
  leftovers never clash with the next run.
- **Order matters.** Later requests rely on the session cookie from the latest login, and the
  cart and checkout requests rely on the product created at the start of their folder. Newman
  keeps cookies for the whole run, just like a browser; logging in as the second customer in
  folder 5 replaces the first customer's cookie. The five requests that must be sent logged out
  switch cookies off for themselves.
- **Don't run `npm test` at the same time.** Both use `ecommerce_test`, and `npm test` empties
  its tables before every test, which would pull the data out from under a running E2E run.
- **A different server address** can be used with `--env-var`, which overrides the collection's
  `baseUrl` variable:
  ```bash
  npm run test:e2e -- --env-var baseUrl=http://localhost:4000
  ```
  The `--` tells npm to pass everything after it to Newman.
- **In the Postman app:** choose **File → Import**, pick the collection file, then use **Run
  collection**. Every request, folder and the collection itself has a description explaining
  what it does, and every check is commented.
- **Warnings you can ignore:**
  - Newman prints `DeprecationWarning: fs.F_OK is deprecated` when it starts. This comes from
    Newman's own code on newer Node.js versions and doesn't affect the results.
  - `npm audit` reports vulnerabilities in packages Newman depends on. They affect only this
    development tool, never the app itself (`npm audit --omit=dev` shows `0 vulnerabilities`),
    and Newman only ever sends requests to your local server.

**Adding more E2E tests:** add requests to the collection, either in the Postman app (then
export it as **Collection v2.1** over the same file) or by editing the JSON. Keep them in
journey order.

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
HTTP status code that describes the type of error.

Implemented error handling for:
- Invalid registration details (`400`)
- Duplicate accounts (`409`)
- Invalid product details or ids (`400`)
- Products not found (`404`)
- Duplicate product SKUs (`409`)
- Invalid account details (`400`)
- Account email already taken, or account has orders (`409`)
- Invalid cart details (`400`)
- Product not found or not in the cart (`404`)
- Not enough stock (`409`)
- Invalid checkout details or an empty cart (`400`)
- Declined payments (`402`)
- Payment processor failures (`502`)
- Orders not found, or belonging to another customer (`404`)
- Failed logins (`400` / `401`)
- Google and Facebook sign-in problems (redirect back to the Log in page with a message), or a
  provider that isn't set up (`404`)
- Not logged in (`401`)
- Malformed or missing request bodies (`400`)
- Unexpected server errors (`500`)
- Database unavailable (`503`)

### Invalid registration details: `400 Bad Request`
`POST /auth/register` checks every field before anything reaches the database, and returns a
message describing the first problem it finds. A request is rejected if:
- `first_name`, `last_name`, `email` or `password` is missing, empty, or only spaces
- `first_name` or `last_name` is over 100 characters, or `email` is over 255 (the column sizes in `schema.sql`)
- `email` isn't in the form `name@domain.tld`
- `password` is not a string, or is under 8 characters
- `password` is over 72 **bytes**. bcrypt silently ignores anything past 72 bytes, so a longer
  password would appear to work while only part of it was checked. The limit is measured in bytes,
  not characters, because characters such as `é` take up more than one byte.

### Duplicate accounts: `409 Conflict`
Registering with an email that already has an account returns `409`. Emails are trimmed and
lower-cased before saving, so `Ada@Example.com` and `ada@example.com` count as the same account.

Duplicates are caught by the database's `UNIQUE` constraint on `customers.email`, not by checking
for the email first. A check-then-insert approach has a race condition: two identical requests
arriving at the same moment could both pass the check and both create an account. The constraint
guarantees only one succeeds, and the route turns PostgreSQL's unique-violation error (code
`23505`) into a `409`.

### Invalid product details or ids: `400 Bad Request`
`POST /products` and `PUT /products/:productId` share one set of rules, checked before anything
reaches the database. A request is rejected if:
- `sku` or `name` is missing or only spaces, or longer than its column (50 and 255 characters)
- `description` is given but isn't a string
- `price` isn't a JSON number, is negative, has more than 2 decimal places, or is over 99999999.99
  (the most a `numeric(10,2)` column can hold)
- `stock_quantity` isn't a whole number, is negative, or is too large for an `integer` column
- `category_id` is given but isn't a whole number, or doesn't match an existing category

Ids in the URL (`/products/abc`) and the `?category=` filter must be whole numbers from 1 up to
the largest value PostgreSQL's `integer` type can hold. Anything else returns `400` before a query
runs, instead of causing a database error.

A `category_id` that doesn't exist is caught by the database's foreign key constraint (error code
`23503`), which the route turns into a `400`.

### Products not found: `404 Not Found`
`GET`, `PUT` and `DELETE /products/:productId` return `404` when no product has that id, or when
the product has been retired. Retired products are kept in the database for order history but are
treated as gone everywhere in the API.

### Duplicate product SKUs: `409 Conflict`
Every product needs a unique `sku` (stock-keeping unit). Creating or updating a product with an
`sku` another product already uses returns `409`. Like duplicate emails, this is caught by the
database's `UNIQUE` constraint so simultaneous requests can't both succeed.

### Invalid account details: `400 Bad Request`
`PUT /account` uses the same name and email rules as registration (shared in
`utils/validate-customer.js`), plus a rule for the optional `phone`: if given, it must be a string
of up to 30 characters containing only digits, spaces, `+`, `-` and brackets.

### Account email already taken, or account has orders: `409 Conflict`
- **`PUT /account`** returns `409` if the new email belongs to another customer, caught by the
  same `UNIQUE` constraint as registration. Keeping your own email is fine.
- **`DELETE /account`** returns `409` if the customer has placed orders. `orders.customer_id` is
  `ON DELETE RESTRICT`, so the database refuses the delete to keep order history intact. PostgreSQL
  reports this as error code `23001` (`restrict_violation`), which the route turns into a `409`.

### Invalid cart details: `400 Bad Request`
`POST /cart/items` needs a `product_id` and a `quantity`, and `PUT /cart/items/:productId` needs
a `quantity`. Each must be a JSON whole number from 1 up to the largest PostgreSQL `integer`, so
strings (`"2"`), decimals (`1.5`), `0` and negatives are all rejected. A quantity of `0` isn't
used to remove an item; `DELETE /cart/items/:productId` does that. Ids in the URL are checked the
same way as product ids.

### Product not found or not in the cart: `404 Not Found`
- **`POST /cart/items`** returns `404` if the product doesn't exist or has been retired: only
  products currently in the shop can be added.
- **`PUT` and `DELETE /cart/items/:productId`** return `404` if that product isn't in your cart.
  Retired products are hidden from the cart, so they count as not in it.

### Not enough stock: `409 Conflict`
Asking for more of a product than is in stock returns `409`. When **adding**, the quantity
already in your cart counts too: with 3 in the cart and 5 in stock, adding 3 more is refused
(3 + 3 = 6). When **changing** a quantity with `PUT`, the new quantity replaces the old one, so
it's compared with the stock directly. Asking for exactly the amount in stock is allowed.

This check gives early feedback while shopping. Stock can change between adding to the cart
and checking out, so it will be checked again when the order is placed.

### Invalid checkout details or an empty cart: `400 Bad Request`
`POST /cart/checkout` checks everything it can before touching the database or the payment
processor, so obvious mistakes get a clear message straight away.

**Shipping address:** `line_1`, `city`, `postal_code` and `country_code` are required, and
`line_2` and `region` are optional text. Lengths match the `addresses` columns in
`schema.sql`. `country_code` must be 2 letters (stored in capitals).

**Payment details**, checked the way a real checkout would before charging:
- **`cardholder_name`** is required.
- **`card_number`** must be a **string**: as a JSON number, a 16-digit card number can lose
  digits. Spaces and hyphens are allowed, it must be 12–19 digits, and it must pass the **Luhn
  check**. That's a checksum every real card number passes: double every second digit from the
  right (subtracting 9 from anything over 9), add up all the digits, and the total must be a
  multiple of 10. It catches most typos, such as one wrong digit or two digits swapped.
- **`expiry_month`** must be 1–12, and **`expiry_year`** a 4-digit year. The card mustn't have
  expired. Cards are valid until the end of their expiry month, so one expiring this month is fine.
- **`cvc`** must be a string of 3 or 4 digits. It's a string because codes can start with `0`,
  which a JSON number would drop.

**The cart** must hold at least one product currently in the shop. A cart that's empty, or holds
only retired products, returns `400`.

### Declined payments: `402 Payment Required`
The request was fine, but the payment didn't go through: the fake processor declines the test
card `4000 0000 0000 0002`. Because the payment happens inside the checkout's database
transaction, the transaction is rolled back: no order is created, the stock isn't touched, and
the cart is kept, so the customer can try a different card.

### Payment processor failures: `502 Bad Gateway`
`502` means a service this API relies on failed: here, the payment processor (the test card
`4000 0000 0000 0119` simulates an outage). It's not the customer's fault and not a bug in this
API, which is why it isn't a `500`. The fake processor throws its own `PaymentProcessorError` type
so the route can tell this apart from unexpected bugs. As with a decline, everything is rolled
back and nothing is charged.

### Stock at checkout: `409 Conflict`
Stock can change between adding to the cart and checking out, so checkout checks it again. It
first **locks** the cart's product rows (`SELECT ... FOR UPDATE`), so if two customers try to buy
the last item at the same moment, one waits until the other has finished. The first gets the
item; the second gets `409`, never a negative stock count or a crash.

### Orders not found, or belonging to another customer: `404 Not Found`
`GET /orders/:orderId` returns `404` when no order has that id **and** when the order belongs to
another customer, with exactly the same response for both. A `403 Forbidden` would be more
literal for someone else's order, but it would confirm that the order exists, letting anyone
work out how many orders the shop has by guessing ids. The ownership check is part of the
database query itself (`WHERE id = $1 AND customer_id = $2`), so another customer's order is
simply never found. An id that isn't a valid whole number (e.g. `/orders/abc`) returns `400`, as
with products.

### Failed logins: `400 Bad Request` / `401 Unauthorized`
`POST /auth/login` returns `400` if `email` or `password` is missing, and `401` if they don't
match an account. A wrong password and an unknown email return exactly the same `401` message.
Different messages would let anyone check whether an email address has an account. An account
with no password (made by signing in with Google or Facebook) gets the same `401`, never a crash.

### Google and Facebook sign-in problems
The sign-in routes are visited by the browser, so instead of a JSON error they send the browser
back to the Log in page as `/login?error=<code>&provider=<google|facebook>`, which shows a
message:

| Code | When | Message |
|---|---|---|
| `cancelled` | The customer clicked "Cancel" at Google or Facebook | "Sign-in was cancelled." |
| `no_email` | They didn't let Facebook share their email | "Facebook didn't share your email address, so we couldn't sign you in. Please allow email access or use another way to log in." |
| `email_unverified` | Google hasn't confirmed they own the email | "Your Google email address isn't verified, so we couldn't sign you in." |
| `failed` | Anything else (e.g. a forged or expired response); the details are logged on the server | "Something went wrong signing you in. Please try again." |

The page only ever shows these fixed messages, never the code itself, so typing a made-up
`?error=` into the address bar can't put your own text on the page. A provider that isn't set
up returns `404 { "error": "Google sign-in is not set up" }` from its routes.

### Not logged in: `401 Unauthorized`
Routes that need a logged-in customer use the `requireAuth` middleware, which returns `401`
before the route runs if there's no active session. `POST /auth/logout`, the product create,
update and retire routes, and every `/account`, `/cart` (including checkout) and `/orders`
route use it.

### Malformed or missing request bodies: `400 Bad Request`
A body that isn't valid JSON, or a request with no body at all, returns `400` instead of
crashing the route.

### Unexpected server errors: `500 Internal Server Error`
Any other error reaches a central error handler in `app.js`. It logs the full details on the server
but sends the client only `{ "error": "Internal server error" }`, because stack traces and database
errors can reveal how the app works internally.

### Database unavailable: `503 Service Unavailable`
`GET /health` returns `503` if the app is running but can't reach PostgreSQL. This separates
"the app is down" from "the database is down".

### Testing
The API is built using test-driven development (TDD): each test is written first and run to
confirm it fails, then just enough code is added to make it pass. There are 296 tests:
- **Registration (31):** successful registration, being logged in straight away (and not after
  a failed registration), duplicate accounts (including simultaneous requests), and each type of
  invalid input above
- **Login and logout (18):** successful login, staying logged in across requests, the `HttpOnly`
  session cookie, identical errors for a wrong password and an unknown email, accounts with no
  password, missing details, and logging out
- **Sessions (9):** sessions stored in the database (deleting the stored row logs you out, which
  is what makes restarts harmless), the 7-day `HttpOnly`, `SameSite=Lax` cookie, each visit
  renewing it, expired sessions counting as logged out, `GET /auth/me` logged in and out, and
  logging out deleting the stored session, clearing the cookie and making the old cookie useless
- **Google and Facebook sign-in (22):** the sign-in rules (a new customer with no password,
  linking to an existing customer by verified email, emails in any letter case, signing in
  twice without duplicates, still finding a customer who changed their email, linking both
  providers, and refusing a missing or unverified email without changing anything); the
  redirects to Google and Facebook with the right client id, callback address, scopes and
  `state` value; cancelling; going back to the Log in page (not an error page) even if the
  login itself fails; and the providers being hidden (`404`) when their keys aren't set
- **Products (62):** listing and filtering by category, getting a single product, retired products
  staying hidden, creating, updating and retiring products, login being required to make changes,
  duplicate SKUs, unknown categories, and each type of invalid product detail or id above
- **Account (31):** viewing, updating and deleting your own account, login being required,
  customers never seeing or changing each other's accounts, ignoring fields like `password_hash`,
  taken emails, accounts with orders, and each type of invalid account detail above
- **Cart (46):** line and cart totals checked against hand-worked values, items in the order
  added, current prices, retired products hidden and excluded from the total, quantities adding
  together, stock limits (including exactly the stock available), login being required,
  customers never seeing or changing each other's carts, and each type of invalid cart detail above
- **Checkout (55):** the full paid order checked against hand-worked totals, the address saved,
  prices frozen, stock reduced and the cart emptied, retired products left out, declined
  payments and processor failures changing nothing, stock running out, two customers racing
  for the last item, card details never sent back, and each type of invalid payment or address
  detail above
- **Orders (16):** order history newest first with hand-checked totals and item counts, full
  order details, details matching exactly what checkout returned, prices paid staying the same
  after price changes and retirements, login being required, other customers' orders being
  invisible and giving the same `404` as an order that doesn't exist, and invalid ids
- **API documentation (6):** Swagger UI and the raw spec being served, the spec being valid
  OpenAPI, every documented endpoint existing in the app, and every endpoint having a summary,
  a section and a documented success (or redirect) response

Every test runs against a real PostgreSQL test database, not mocks.

On top of these, an **end-to-end test collection** run by Newman (48 requests, 134 checks) takes
customers through registering (and being logged in straight away), checking who's logged in,
logging in, checking which sign-in providers are on, viewing and updating their account, filling,
changing and emptying their cart, logging out, deleting their account, checking out (including a
mistyped card and a declined payment), and viewing their order history, then checks the API
documentation is served, using the real running server and the test
database. It also checks that no response ever contains
a password. It has been confirmed to fail (exit code `1`) when the server isn't running, so a
broken server can't produce a passing run.

The **front end** has 86 tests (Jest and React Testing Library). The registration form's 12
tests check its fields, the link to log in, the exact request sent (never the confirm
password), mismatched passwords, API and network errors (including the dev proxy's own error
page), the button while sending, double-clicks, and retrying after a password mismatch or an
API error. The login page's 14 tests check its fields, the link to Register, the exact request
sent, wrong details and network errors, the button while sending, a "Sign in with..." link for
each provider that's switched on (and none if that can't be checked), and the message for each
sign-in error code, including that a made-up code is never shown. The login record's 8 tests
check it waits for the API, ignores a slow answer that arrives after logging in, uses the
logged-in customer (or nobody, if the API can't be reached), updates everywhere at once, and
logs out (a `401` counting as already logged out, and
a failed logout keeping you logged in). The 23 access tests check the nav when logged out,
logged in and still checking, "Hi there" without a first name, every protected page sending a
logged-out visitor to Log in (but never while still checking), Log in and Register sending a
logged-in customer to Products, logging in returning to the page you wanted (`?query`
included), registering updating the nav, and logging out from Cart landing on Products, plus
a failed logout. The API is
replaced by a fake `fetch`, so no server is needed. The other 29 check every page URL showing the
right page (one `<h1>` each), product and order ids read from the URL, unknown URLs (including
extra segments after a real page) showing "Page not found" with the nav still there, every nav
link opening its page, the current page's link marked active, links from the cart to checkout
and from "not found" back to the shop, trailing slashes, query strings, going back in history, and
the real `App` showing the home page.

See [Run the tests](#6-run-the-tests) for how to run both.

## Future Work
- Enable users to rate and review products
- Add functionality to allow for "guest" checkout (not requiring an account to place an order)
- Add admin management panel
  - Set up protected API endpoints for admin-level management access of products, customer orders, etc.
  - Create admin client UI with React to easily manage data.
- Add email notification system
  - Set up automated email service on the server to send emails to customers on completion of a purchase.
  - Set up an automated cron job to send email reminders to customers when products have been in their carts for a certain duration of time. 
- Add ability to refund customer orders
  - Set up webhook(s) that interfaces with the payment processor (Stripe) and deals with actions such as refunds.
  - When a refund is processed in Stripe, update order.
