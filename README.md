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
The database has six tables: `customers`, `addresses`, `categories`, `products`, `orders`, and
`order_items` (a join table linking orders to the products they contain).

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
│   │   └── account.js      # /account routes (view, update, delete your own account)
│   ├── config/
│   │   └── passport.js     # Passport.js setup: checks logins, remembers who's logged in
│   ├── middleware/
│   │   └── require-auth.js # Blocks routes from customers who aren't logged in (401)
│   ├── utils/
│   │   ├── normalize-email.js # Trims and lower-cases emails (shared by register, login and account)
│   │   ├── parse-id.js     # Checks an id from a URL is a valid whole number
│   │   └── validate-customer.js # Name, email and phone rules (shared by register and account)
│   ├── db/
│   │   ├── index.js        # PostgreSQL connection pool and query helper
│   │   ├── schema.sql      # Creates the database tables (for a new database)
│   │   ├── migrations/     # Updates an existing database to match schema.sql
│   │   │   └── 001-add-categories.sql
│   │   └── reset-test-db.js # Rebuilds the test database from schema.sql
│   ├── tests/
│   │   ├── auth.register.test.js # Tests for POST /auth/register
│   │   ├── auth.login.test.js    # Tests for POST /auth/login and /auth/logout
│   │   ├── products.test.js      # Tests for the /products routes
│   │   ├── account.test.js       # Tests for the /account routes
│   │   └── helpers.js      # Shared test helpers (e.g. emptying tables, logging in, adding test data)
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
4. Refresh the database: `addresses`, `categories`, `customers`, `order_items`, `orders`, and `products` appear under **Schemas → public → Tables**.

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

### 6. Run the tests
The tests use a separate `ecommerce_test` database, so they never touch your real data.
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

## Technologies
- JavaScript
- Git and GitHub
- Command Line
- Express
- PostgreSQL
- HTML
- CSS
- React

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

### Failed logins: `400 Bad Request` / `401 Unauthorized`
`POST /auth/login` returns `400` if `email` or `password` is missing, and `401` if they don't
match an account. A wrong password and an unknown email return exactly the same `401` message.
Different messages would let anyone check whether an email address has an account.

### Not logged in: `401 Unauthorized`
Routes that need a logged-in customer use the `requireAuth` middleware, which returns `401`
before the route runs if there's no active session. `POST /auth/logout`, the product create,
update and retire routes, and every `/account` route use it now, and the cart and order routes
will too.

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
confirm it fails, then just enough code is added to make it pass. There are 137 tests:
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

Every test runs against a real PostgreSQL test database, not mocks. See [Run the tests](#6-run-the-tests) for how to run them.

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
