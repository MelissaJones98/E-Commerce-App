# API Endpoints Plan

The REST API endpoints the e-commerce app needs, based on the features in the
[README](../README.md) and the [database design](database-design.md).

## Resources

A **resource** is a type of data the API exposes. Each one maps to one or more
database tables:

| Resource | What it is | Table(s) |
|---|---|---|
| Auth | Registering, logging in and out | `customers` |
| Products | Items for sale, browsable by anyone | `products` |
| Account | The logged-in customer's own details | `customers` |
| Addresses | The logged-in customer's saved addresses | `addresses` |
| Cart | Products the customer intends to buy | `cart_items` *(new, see [Schema changes needed](#schema-changes-needed))* |
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
| `GET` | `/auth/google` | Public | Start "Sign in with Google" | redirect |
| `GET` | `/auth/google/callback` | Public | Google redirects back here after sign-in | redirect |

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
Errors: `400` missing fields or password too short, `409` email already registered.

`POST /auth/login` request: `{ "email": "...", "password": "..." }`.
Response `200` is the customer (as above). Errors: `401` wrong email or password.
Use the same message for both, so the response doesn't reveal which emails are registered.

### Products

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/products` | Public | List active products | `200` |
| `GET` | `/products/:productId` | Public | Get one product | `200` |
| `POST` | `/products` | Customer | Create a product | `201` |
| `PUT` | `/products/:productId` | Customer | Update a product (price, stock, etc.) | `200` |
| `DELETE` | `/products/:productId` | Customer | Retire a product | `204` |

`GET /products` supports optional query parameters:
- `?search=mug` matches product names
- `?page=2&limit=20` splits results into pages

Response `200`:
```json
[
  { "id": 7, "sku": "MUG-001", "name": "Coffee Mug", "description": "...", "price": "8.50", "stock_quantity": 42 }
]
```
`price` comes back as a string. `pg` returns `numeric` columns as strings to avoid
the rounding errors that converting to a JavaScript number could cause.

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

`POST /cart/items` request: `{ "product_id": 7, "quantity": 2 }`.
If the product is already in the cart, the quantities are added together.
Errors: `400` quantity under 1, `404` product doesn't exist or is inactive.

`GET /cart` response:
```json
{
  "items": [
    { "product_id": 7, "name": "Coffee Mug", "price": "8.50", "quantity": 2, "line_total": "17.00" }
  ],
  "total": "17.00"
}
```

`POST /cart/checkout` request: `{ "shipping_address_id": 3 }`.
In a single database transaction, it:
1. Checks the cart isn't empty (`400`) and the address belongs to the customer (`404`)
2. Checks every product has enough stock (`409` if not)
3. Creates the `orders` row and copies each cart item into `order_items` with its current price
4. Reduces each product's `stock_quantity`
5. Empties the cart

Response `201` is the new order, in the same shape as `GET /orders/:orderId`.
Stripe payment is added in a later ticket. Until then, orders are created with status `pending`.

### Orders

| Method | Path | Access | Description | Success |
|---|---|---|---|---|
| `GET` | `/orders` | Customer | Your order history, newest first | `200` |
| `GET` | `/orders/:orderId` | Customer | One order with its items | `200` |

There's no `POST /orders`: orders are created only through `POST /cart/checkout`,
so every order goes through the stock and price checks.

`GET /orders/:orderId` response:
```json
{
  "id": 12,
  "status": "pending",
  "total_amount": "17.00",
  "created_at": "2026-10-13T09:36:52.487Z",
  "shipping_address": { "id": 3, "line_1": "10 Downing Street", "city": "London", "postal_code": "SW1A 2AA", "country_code": "GB" },
  "items": [
    { "product_id": 7, "name": "Coffee Mug", "quantity": 2, "unit_price": "8.50" }
  ]
}
```
An `:orderId` belonging to another customer returns `404`.

## Schema changes needed

The README lists **carts** as a feature, but the current schema has no table for
them. The simplest design is one cart per customer, stored as a single table:

```sql
CREATE TABLE cart_items (
  customer_id integer NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  product_id  integer NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity    integer NOT NULL CHECK (quantity > 0),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);
```

- **No separate `carts` table.** Each customer only ever has one cart, so the
  customer's ID identifies it.
- **No `price` column.** The cart always shows the current price; the price is only
  frozen into `order_items` at checkout.
- **`ON DELETE CASCADE` on both foreign keys.** Unlike orders, a cart is temporary,
  so it doesn't need protecting from deletes.

Add this to `schema.sql` and the ERD before building the cart endpoints.

## Suggested build order

1. **Products** (`GET` routes): public, so they can be built and tested in Postman before login exists
2. **Auth**: register, log in, log out (with sessions and password hashing)
3. **Account and Addresses**
4. **Cart**: after adding the `cart_items` table
5. **Checkout and Orders**
6. **Product create/update/delete, Google sign-in, Stripe**: in their own later tickets
