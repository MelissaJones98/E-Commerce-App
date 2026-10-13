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
The database has five tables: `customers`, `addresses`, `products`, `orders`, and `order_items`
(a join table linking orders to the products they contain).

The full design, including the Entity Relationship Diagram, column types, relationships, and the
reasoning behind each design decision, is in [docs/database-design.md](docs/database-design.md).

## Project Structure
```
e-commerce-app/
├── back-end/
│   ├── app.js              # Express app: middleware, routes and error handling
│   ├── server.js           # Starts the server (entry point for npm start / npm run dev)
│   ├── routes/
│   │   └── auth.js         # /auth routes (register, login, logout)
│   ├── config/
│   │   └── passport.js     # Passport.js setup: checks logins, remembers who's logged in
│   ├── middleware/
│   │   └── require-auth.js # Blocks routes from customers who aren't logged in (401)
│   ├── utils/
│   │   └── normalize-email.js # Trims and lower-cases emails (shared by register and login)
│   ├── db/
│   │   ├── index.js        # PostgreSQL connection pool and query helper
│   │   ├── schema.sql      # Creates the database tables
│   │   └── reset-test-db.js # Rebuilds the test database from schema.sql
│   ├── tests/
│   │   ├── auth.register.test.js # Tests for POST /auth/register
│   │   ├── auth.login.test.js    # Tests for POST /auth/login and /auth/logout
│   │   └── helpers.js      # Shared test helpers (e.g. emptying tables between tests)
│   ├── .env                # Your local settings (not committed, see below)
│   ├── .env.test           # Test settings: test database name and a test-only session secret
│   └── package.json
└── docs/
    ├── database-design.md  # Database design and ERD
    └── api-endpoints.md    # Planned REST API endpoints
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
4. Refresh the database: `customers`, `addresses`, `products`, `orders`, and `order_items` appear under **Schemas → public → Tables**.

Or using **psql** from the project root:
```bash
createdb -U postgres ecommerce
psql -U postgres -d ecommerce -f back-end/db/schema.sql
```

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

### 6. Run the tests
The tests use a separate `ecommerce_test` database, so they never touch your real data.
`.env.test` switches the database name and provides a test-only `SESSION_SECRET`; all other
connection details come from your `.env`.

Create the test database once, from the `back-end` folder:
```bash
npm run db:test:reset
```
This drops `ecommerce_test` if it exists, recreates it, and runs `schema.sql`. Run it again
whenever you change `schema.sql`, so the test database stays in sync.

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

### Failed logins: `400 Bad Request` / `401 Unauthorized`
`POST /auth/login` returns `400` if `email` or `password` is missing, and `401` if they don't
match an account. A wrong password and an unknown email return exactly the same `401` message.
Different messages would let anyone check whether an email address has an account.

### Not logged in: `401 Unauthorized`
Routes that need a logged-in customer use the `requireAuth` middleware, which returns `401`
before the route runs if there's no active session. `POST /auth/logout` uses it now, and the cart,
account and order routes will too.

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
confirm it fails, then just enough code is added to make it pass. There are 44 tests:
- **Registration (27):** successful registration, duplicate accounts (including simultaneous
  requests), and each type of invalid input above
- **Login and logout (17):** successful login, staying logged in across requests, the `HttpOnly`
  session cookie, identical errors for a wrong password and an unknown email, missing details,
  and logging out

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
