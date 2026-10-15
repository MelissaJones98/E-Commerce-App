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
The database has seven tables: `customers`, `addresses`, `categories`, `products`, `cart_items`,
`orders`, and `order_items`. `cart_items` holds each customer's shopping cart (one row per
product in it), and `order_items` links each order to the products it contains.

The full design, including the Entity Relationship Diagram, column types, relationships, and the
reasoning behind each design decision, is in [docs/database-design.md](docs/database-design.md).

## Project Structure
```
e-commerce-app/
├── back-end/
│   ├── app.js              # Express app: middleware, routes and error handling
│   ├── server.js           # Starts the server (entry point for npm start / npm run dev)
│   ├── routes/
│   │   ├── auth.js         # /auth routes (register, login, logout)
│   │   ├── products.js     # /products routes (browse, create, update, retire)
│   │   ├── account.js      # /account routes (view, update, delete your own account)
│   │   ├── cart.js         # /cart routes (view, add to, change, remove from, empty your cart)
│   │   └── checkout.js     # POST /cart/checkout (turn the cart into a paid order)
│   ├── services/
│   │   └── payment-processor.js # FAKE payment processor (stands in for Stripe)
│   ├── config/
│   │   └── passport.js     # Passport.js setup: checks logins, remembers who's logged in
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
│   │   │   └── 002-add-cart-items.sql
│   │   └── reset-test-db.js # Rebuilds the test database from schema.sql
│   ├── tests/
│   │   ├── auth.register.test.js # Tests for POST /auth/register
│   │   ├── auth.login.test.js    # Tests for POST /auth/login and /auth/logout
│   │   ├── products.test.js      # Tests for the /products routes
│   │   ├── account.test.js       # Tests for the /account routes
│   │   ├── cart.test.js          # Tests for the /cart routes
│   │   ├── checkout.test.js      # Tests for POST /cart/checkout
│   │   ├── helpers.js      # Shared test helpers (e.g. emptying tables, logging in, adding test data)
│   │   └── e2e/            # End-to-end tests, run by Newman against the running server
│   │       └── ecommerce-api.e2e.postman_collection.json
│   ├── .env                # Your local settings (not committed, see below)
│   ├── .env.test           # Test settings: test database name and a test-only session secret
│   └── package.json
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
```

### 2. Create the database
Using **pgAdmin 4**:
1. Right-click **Databases → Create → Database…**, name it `ecommerce`, and click **Save**.
2. Select the `ecommerce` database, open **Tools → Query Tool**, and check the tab title starts with `ecommerce/`.
3. Open `back-end/db/schema.sql`, then click **Execute** (or press F5).
4. Refresh the database: `addresses`, `cart_items`, `categories`, `customers`, `order_items`, `orders`, and `products` appear under **Schemas → public → Tables**.

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

To check which migrations a database already has, refresh it in pgAdmin and look under
**Schemas → public → Tables**: `categories` means 001 has run, and `cart_items` means 002 has run.

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
```
`SESSION_SECRET` signs the login session cookie so it can't be forged. The server won't start
without it. Generate a random value from the `back-end` folder with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
`.env` is listed in `.gitignore`, so your password and secret are never committed.

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
| `201 Created` | The account was created. Returns the new customer (never the password) |
| `400 Bad Request` | A field is missing or invalid: e.g. a malformed email, or a password under 8 characters or over 72 bytes |
| `409 Conflict` | An account with that email already exists (emails are case-insensitive) |

This creates a real account in your `ecommerce` database.

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
| `401 Unauthorized` | The email or password is wrong (the same message for both) |

Postman stores the session cookie automatically and sends it with your following requests, just
like a browser, so you stay logged in.

#### Log out
Send a **POST** request to `http://localhost:3000/auth/logout` with no body.

| Response | When |
|---|---|
| `204 No Content` | Logged out |
| `401 Unauthorized` | You weren't logged in |

Sessions are currently stored in the server's memory, so restarting the server (including
`npm run dev` restarting after you save a file) logs everyone out.

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

### 6. Run the tests
There are two kinds of automated test. Both are run from the `back-end` folder:

| | Unit and integration tests | End-to-end (E2E) tests |
|---|---|---|
| **Command** | `npm test` | `npm run test:e2e` |
| **Tool** | Node's test runner + Supertest | Newman (Postman's command-line runner) |
| **Files** | `tests/*.test.js` | `tests/e2e/ecommerce-api.e2e.postman_collection.json` |
| **Server** | Not needed: the tests load the app directly | Must be running, started with `npm run start:test` |
| **Database** | `ecommerce_test`, emptied before every test | `ecommerce_test` too (via `npm run start:test`) |
| **Checks** | Each route's behaviour in detail, including edge cases | One complete customer journey through the real running server |

#### Unit and integration tests
These tests use a separate `ecommerce_test` database, so they never touch your real data.
`.env.test` switches the database name and provides a test-only `SESSION_SECRET`; all other
connection details come from your `.env`.

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

**What the collection does:** it walks through a shop's whole journey, in five folders:

| Folder | Requests | Checks |
|---|---|---|
| 1. Register and log in | Register a new test customer, then log in | `201`, then `200` and a session cookie |
| 2. Account | View, update, view again, an invalid update, a logged-out view | `200`, `200`, the update was saved, `400`, `401` |
| 3. Cart | Create a test product (8.50, 5 in stock); view the empty cart; add 2; add 1 more; try to add 3 more; change the quantity to 1; remove it; remove it again; add it back; empty the cart; view it; view it logged out; retire the product | `201`; empty cart; total `17.00`; quantities added together to 3, total `25.50`; `409` (6 > 5 in stock); total `8.50`; `204`; `404`; `201`; `204`; empty cart; `401`; `204` |
| 4. Delete account (clean-up) | Delete the account, then try to use it again | `204`, then `401` and `401` |
| 5. Checkout | Register and log in a second customer; create a product (8.50, 5 in stock); add 2 to the cart; check out with a mistyped card, then a declined card; view the cart; check out successfully; view the cart and the product's stock; check out the empty cart; check out logged out; try to delete the account | `201`, `200`, `201`, total `17.00`; `400`, `402`; cart still holds 2; `201` paid order for `17.00` with the card number never sent back; empty cart, stock down to 3; `400`; `401`; `409` (order history is protected) |

After **every** request, a collection-level check also confirms the response never contains
a `password` or `password_hash`.

**What a passing run looks like:** Newman prints each request with a ✓ (`√` in Windows
terminals) beside each passing check, then a summary table. A passing run has `0` in every row
of the **failed** column:
```
┌─────────────────────────┬───────────────────┬──────────────────┐
│                         │          executed │           failed │
├─────────────────────────┼───────────────────┼──────────────────┤
│                requests │                36 │                0 │
│            test-scripts │                72 │                0 │
│              assertions │                98 │                0 │
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
  folder 5 replaces the first customer's cookie. The four requests that must be sent logged out
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
- Node.js test runner (`node:test`) and Supertest: unit and integration tests
- Postman and Newman: end-to-end API tests

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
- Failed logins (`400` / `401`)
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

### Failed logins: `400 Bad Request` / `401 Unauthorized`
`POST /auth/login` returns `400` if `email` or `password` is missing, and `401` if they don't
match an account. A wrong password and an unknown email return exactly the same `401` message.
Different messages would let anyone check whether an email address has an account.

### Not logged in: `401 Unauthorized`
Routes that need a logged-in customer use the `requireAuth` middleware, which returns `401`
before the route runs if there's no active session. `POST /auth/logout`, the product create,
update and retire routes, and every `/account` and `/cart` route (including checkout) use it
now, and the order routes will too.

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
confirm it fails, then just enough code is added to make it pass. There are 238 tests:
- **Registration (27):** successful registration, duplicate accounts (including simultaneous
  requests), and each type of invalid input above
- **Login and logout (17):** successful login, staying logged in across requests, the `HttpOnly`
  session cookie, identical errors for a wrong password and an unknown email, missing details,
  and logging out
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

Every test runs against a real PostgreSQL test database, not mocks.

On top of these, an **end-to-end test collection** run by Newman (36 requests, 98 checks) takes
customers through registering, logging in, viewing and updating their account, filling,
changing and emptying their cart, deleting their account, and checking out (including a
mistyped card and a declined payment), using the real running server and the test
database. It also checks that no response ever contains
a password. It has been confirmed to fail (exit code `1`) when the server isn't running, so a
broken server can't produce a passing run.

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
