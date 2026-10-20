# API Endpoints Plan

> **For the current, complete API reference, use the Swagger documentation:** run the server
> and open http://localhost:3000/api-docs. It's generated from `back-end/openapi.yaml`, which the
> tests check against the real app. This file is the original plan, kept for its explanations of
> the design decisions.

The REST API endpoints the e-commerce app needs, based on the features in the
[README](../README.md) and the [database design](database-design.md).

## Resources

A **resource** is a type of data the API exposes. Each one maps to one or more
database tables:

| Resource | What it is | Table(s) |
|---|---|---|
| Auth | Registering, logging in and out | `customers` |
| Products | Items for sale, browsable by anyone | `products`, `categories` |
| Account | The logged-in customer's own details | `customers` |
| Addresses | The logged-in customer's saved addresses | `addresses` |
| Cart | Products the customer intends to buy | `cart_items` |
| Orders | Completed purchases and order history | `orders`, `order_items` |

## Conventions

- **Base URL (local):** `http://localhost:3000`
- **Request and response bodies are JSON.** Field names match the database
  columns (e.g. `first_name`, `stock_quantity`).
- **The API never returns `password_hash`.**
- **Errors** return an appropriate status code and a body like
  `{ "error": "Product not found" }`.
- **"Logged-in" routes** work on the current customer's own data. The server knows
  who is logged in from their session, so customer IDs aren't put in the URL.
  This means nobody can view another customer's orders by changing an ID.

### HTTP methods

| Method | Used for | Example |
|---|---|---|
| `GET` | Read data. Never changes anything | Get a list of products |
| `POST` | Create something new, or trigger an action | Add an address; check out |
| `PUT` | Update something that already exists | Change the quantity of a cart item |
| `DELETE` | Remove something | Remove an item from the cart |

### Status codes

| Code | Meaning | When it's used |
|---|---|---|
| `200 OK` | Success | Successful `GET`, `PUT` |
| `201 Created` | Something new was created | Successful `POST` that creates a row |
| `204 No Content` | Success, nothing to return | Successful `DELETE` |
| `400 Bad Request` | The request body is invalid | Missing fields, negative quantity |
| `401 Unauthorized` | Not logged in | Accessing the cart without logging in |
| `404 Not Found` | The resource doesn't exist | `GET /products/999` |
| `409 Conflict` | Clashes with existing data | Registering with an email that's taken; buying more than is in stock |
| `402 Payment Required` | The payment didn't go through | A declined card at checkout |
| `502 Bad Gateway` | A service the API relies on failed | The payment processor is down at checkout |
| `503 Service Unavailable` | The database can't be reached | `GET /health` when PostgreSQL is down |

## Endpoints

**Access:** *Public* = anyone. *Customer* = must be logged in.

### Health

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/health` | Public | Check the API can reach the database | `200` *(already built)* |

### Auth

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `POST` | `/auth/register` | Public | Create a customer account | `201` |
| `POST` | `/auth/login` | Public | Log in with email and password | `200` |
| `POST` | `/auth/logout` | Customer | Log out | `204` |
| `GET` | `/auth/providers` | Public | Which of Google and Facebook sign-in are switched on | `200` |
| `GET` | `/auth/google` | Public | Start "Sign in with Google" | redirect |
| `GET` | `/auth/google/callback` | Public | Google redirects back here after sign-in | redirect |
| `GET` | `/auth/facebook` | Public | Start "Sign in with Facebook" | redirect |
| `GET` | `/auth/facebook/callback` | Public | Facebook redirects back here after sign-in | redirect |

`POST /auth/register` request:
```json
{
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "password": "a-strong-password"
}
```
Response `201`:
```json
{ "id": 1, "first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com" }
```
The `201` response also sets the session cookie: **registering logs you in**, so there's no need
to call `/auth/login` straight afterwards.

Errors: `400` missing fields or password too short, `409` email already registered.

`POST /auth/login` request: `{ "email": "...", "password": "..." }`.
Response `200` is the customer (as above). Errors: `401` wrong email or password.
Use the same message for both, so the response doesn't reveal which emails are registered.
Accounts with no password (made by signing in with Google or Facebook) also get that `401`.

`GET /auth/providers` response `200`: `{ "google": true, "facebook": false }`. A provider is on
when its keys are set in `back-end/.env`; when it's off, its four routes reply
`404 { "error": "Google sign-in is not set up" }` (or Facebook).

The Google and Facebook routes are visited by the **browser**, not called with `fetch`. The
callback logs the customer in and redirects to `/`. That customer is the one already linked to
this Google or Facebook account, or else the one with the same verified email, or else a new
customer with no password. If sign-in doesn't work, it redirects to
`/login?error=<code>&provider=<google|facebook>`, where `code` is `cancelled`, `no_email`,
`email_unverified` or `failed`.

### Products

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/products` | Public | List active products | `200` |
| `GET` | `/products?category=:categoryId` | Public | List active products in one category | `200` |
| `GET` | `/products/:productId` | Public | Get one product | `200` |
| `POST` | `/products` | Customer | Create a product | `201` |
| `PUT` | `/products/:productId` | Customer | Replace a product's details | `200` |
| `DELETE` | `/products/:productId` | Customer | Retire a product | `204` |

`GET /products` response `200` (products in `id` order):
```json
[
  {
    "id": 7,
    "category_id": 2,
    "sku": "MUG-001",
    "name": "Coffee Mug",
    "description": "A 350ml ceramic mug",
    "price": "8.50",
    "stock_quantity": 42
  }
]
```
- **`price` comes back as a string.** `pg` returns `numeric` columns as strings to avoid
  the rounding errors that converting to a JavaScript number could cause.
- **`?category=`** must be a whole number (`400` otherwise). A category with no products,
  or one that doesn't exist, returns an empty list.
- **Retired products** (`is_active = false`) never appear in either `GET` route; fetching
  one by id returns `404`.

`POST /products` and `PUT /products/:productId` take the same body:
```json
{
  "sku": "MUG-001",
  "name": "Coffee Mug",
  "description": "A 350ml ceramic mug",
  "price": 8.5,
  "stock_quantity": 42,
  "category_id": 2
}
```
- `description` and `category_id` are optional (leave them out or send `null`).
- `price` must be a JSON number (not a string) from 0 to 99999999.99, with at most 2 decimal places.
- `stock_quantity` must be a whole number, 0 or more.
- `PUT` replaces every field, so send the complete product, not just the fields that changed.

Errors: `400` invalid body or id, or a `category_id` that doesn't exist; `401` not logged in;
`404` product doesn't exist or is retired; `409` another product already has the SKU.

`DELETE /products/:productId` sets `is_active = false` and keeps the row. Products
that appear on past orders can't be deleted (see the database design).

### Account

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/account` | Customer | Get your account details | `200` |
| `PUT` | `/account` | Customer | Update your name, email or phone | `200` |
| `DELETE` | `/account` | Customer | Delete your account | `204` |

`DELETE /account` returns `409` if the customer has orders. The database blocks
this (`ON DELETE RESTRICT`) to keep order history intact.

### Addresses

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/account/addresses` | Customer | List your saved addresses | `200` |
| `POST` | `/account/addresses` | Customer | Add an address | `201` |
| `PUT` | `/account/addresses/:addressId` | Customer | Update an address | `200` |
| `DELETE` | `/account/addresses/:addressId` | Customer | Delete an address | `204` |

`POST /account/addresses` request:
```json
{
  "line_1": "10 Downing Street",
  "line_2": null,
  "city": "London",
  "region": null,
  "postal_code": "SW1A 2AA",
  "country_code": "GB",
  "is_default": true
}
```
- **Updating an address an order has used:** the API creates a new address row
  instead of editing it, so past orders keep their original address.
- **Deleting an address an order has used** returns `409`.
- **Setting `is_default: true`** clears the default flag on the customer's other addresses.
- **An `:addressId` belonging to another customer** returns `404`. That's safer than
  `403`, because `403` would confirm the address exists.

### Cart

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/cart` | Customer | View your cart with line totals and cart total | `200` |
| `POST` | `/cart/items` | Customer | Add a product to your cart | `201` |
| `PUT` | `/cart/items/:productId` | Customer | Change the quantity of a cart item | `200` |
| `DELETE` | `/cart/items/:productId` | Customer | Remove one item from your cart | `204` |
| `DELETE` | `/cart` | Customer | Empty your cart | `204` |
| `POST` | `/cart/checkout` | Customer | Place an order from your cart | `201` |

`GET /cart` response (items in the order they were added):
```json
{
  "items": [
    { "product_id": 7, "sku": "MUG-001", "name": "Coffee Mug", "price": "8.50", "quantity": 2, "line_total": "17.00" }
  ],
  "total": "17.00"
}
```
- An empty cart is `{ "items": [], "total": "0.00" }`.
- `price` is the product's **current** price. The cart stores no prices; they're frozen into
  `order_items` at checkout.
- Retired products are hidden from the cart and left out of `total`.

`POST /cart/items` request: `{ "product_id": 7, "quantity": 2 }`. If the product is already in
the cart, the quantities are added together. Returns `201` with the whole updated cart.

`PUT /cart/items/:productId` request: `{ "quantity": 5 }`. **Replaces** the quantity (it doesn't
add to it). Returns `200` with the whole updated cart.

`DELETE /cart/items/:productId` removes one product; `DELETE /cart` empties the cart (`204` even
if it was already empty).

Errors:
- `400`: `product_id` or `quantity` isn't a whole number of at least 1, or the id in the URL is
  invalid. To remove an item, use `DELETE` rather than a quantity of 0.
- `401`: not logged in.
- `404`: the product doesn't exist or is retired (`POST`), or isn't in your cart (`PUT`, `DELETE`).
- `409`: not enough stock. `POST` checks the quantity already in the cart plus the new quantity.

`POST /cart/checkout` request:
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
The shipping address is sent with the order (there are no saved-address endpoints yet) and is
saved to `addresses`. `line_2` and `region` are optional.

It works in this order:
1. **Checks the request**: the address and payment details (`400` if wrong). The card number
   must pass the Luhn checksum, the card mustn't have expired, and the CVC must be 3–4 digits.
2. **Checks the cart**: locks its products (`SELECT ... FOR UPDATE`), then checks it isn't empty
   (`400`) and that every product has enough stock (`409`).
3. **Takes the payment** with a fake processor that copies Stripe's test cards:
   `4000 0000 0000 0002` is declined (`402`), `4000 0000 0000 0119` makes the processor fail
   (`502`), and any other valid card succeeds.
4. **Creates the order** as `paid`: saves the address, copies each cart item into `order_items`
   with its current price, reduces each product's `stock_quantity`, and empties the cart.

Steps 2–4 run in one database transaction, so any failure leaves the cart, stock and orders
exactly as they were. Card details are never stored or returned.

Response `201`:
```json
{
  "id": 12,
  "status": "paid",
  "total_amount": "17.00",
  "created_at": "2026-10-15T09:36:52.487Z",
  "shipping_address": { "id": 3, "line_1": "10 Downing Street", "line_2": null, "city": "London", "region": null, "postal_code": "SW1A 2AA", "country_code": "GB" },
  "items": [
    { "product_id": 7, "sku": "MUG-001", "name": "Coffee Mug", "quantity": 2, "unit_price": "8.50", "line_total": "17.00" }
  ]
}
```
Real payments (Stripe) are added in a later ticket, replacing only the fake processor.

### Orders

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/orders` | Customer | Your order history, newest first | `200` |
| `GET` | `/orders/:orderId` | Customer | One order with its items | `200` |

There's no `POST /orders`: orders are created only through `POST /cart/checkout`,
so every order goes through the stock and payment checks. There's no `PUT` or `DELETE` either:
orders are a permanent record. (Cancelling a paid order would need a refund, which is Future Work.)

`GET /orders` response (newest first; `[]` if there are none):
```json
[
  { "id": 12, "status": "paid", "total_amount": "17.00", "item_count": 2, "created_at": "2026-10-15T09:36:52.487Z" }
]
```
`item_count` adds up the quantities, e.g. 2 mugs + 1 teapot = 3.

`GET /orders/:orderId` response: the same shape checkout returns (both use `services/orders.js`):
```json
{
  "id": 12,
  "status": "paid",
  "total_amount": "17.00",
  "created_at": "2026-10-15T09:36:52.487Z",
  "shipping_address": { "id": 3, "line_1": "10 Downing Street", "line_2": null, "city": "London", "region": null, "postal_code": "SW1A 2AA", "country_code": "GB" },
  "items": [
    { "product_id": 7, "sku": "MUG-001", "name": "Coffee Mug", "quantity": 2, "unit_price": "8.50", "line_total": "17.00" }
  ]
}
```
- `unit_price` is the price paid, frozen at checkout. Later price changes don't affect it, and
  retired products still appear.
- Errors: `400` invalid id, `401` not logged in, `404` the order doesn't exist **or belongs to
  another customer**. Both cases give the same response, so other customers' orders are never revealed.

## Suggested build order

1. **Products** (`GET` routes): public, so they can be built and tested in Postman before login exists
2. **Auth**: register, log in, log out (with sessions and password hashing)
3. **Account and Addresses**
4. **Cart**: built, using the `cart_items` table (see the database design)
5. **Checkout and Orders**: built
6. **Google sign-in, Stripe**: in their own later tickets
