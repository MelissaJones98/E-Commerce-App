-- Database schema for the e-commerce app.
-- Implements the design in docs/database-design.md.
--
-- Run against an empty database, either in pgAdmin's Query Tool or with:
--   psql -U postgres -d ecommerce -f back-end/db/schema.sql
-- (An existing database is updated with the files in db/migrations/ instead.)
--
-- In SQL, `--` starts a comment, like `//` in JavaScript.
--
-- Quick guide to the column syntax used below. Each column is written as:
--   column_name   type   constraints
-- Types:
--   integer        a whole number
--   varchar(n)     text of up to n characters
--   char(2)        text of exactly 2 characters
--   text           text of any length
--   numeric(10,2)  an exact decimal: up to 10 digits, 2 after the decimal point
--   boolean        true or false
--   timestamptz    a date and time, including the time zone
-- Constraints (rules the database enforces on every insert and update):
--   PRIMARY KEY    uniquely identifies each row
--   NOT NULL       the column must have a value
--   UNIQUE         no two rows can have the same value
--   DEFAULT x      the value used when an insert doesn't give one
--   CHECK (...)    the condition must be true, or the row is rejected
--   REFERENCES t (id)  a foreign key: the value must be an id that exists in table t

-- Run everything in one transaction: either every table is created, or none are.
-- If any statement fails, the rest are skipped and nothing is saved.
-- BEGIN starts the transaction; COMMIT at the end saves it.
BEGIN;

-- ---------------------------------------------------------------------------
-- Shared: keep updated_at current
-- ---------------------------------------------------------------------------

-- A trigger function that sets updated_at to the current time whenever a row
-- is updated. Attached to each table with an updated_at column further down.
--   RETURNS trigger   marks it as a function for use by triggers
--   $$ ... $$         quotes the function's body, so it can contain semicolons
--   NEW               the row as it will be saved; we change its updated_at
--   now()             the current date and time
--   RETURN NEW        save the (changed) row
--   plpgsql           the language the body is written in (PostgreSQL's own)
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  -- GENERATED ALWAYS AS IDENTITY: Postgres assigns 1, 2, 3... automatically,
  -- so ids are never chosen (or faked) by the client.
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name    varchar(100) NOT NULL,
  last_name     varchar(100) NOT NULL,
  -- UNIQUE: two customers can't register with the same email.
  email         varchar(255) NOT NULL UNIQUE,
  -- A bcrypt hash of the password, never the password itself.
  -- NULL means the customer has no password: they only sign in with Google or
  -- Facebook (see federated_credentials below).
  password_hash varchar(255),
  -- No NOT NULL, so phone is optional (it can be NULL, meaning "no value").
  phone         varchar(30),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- A trigger runs a function automatically when something happens to a table.
-- This one runs set_updated_at() just BEFORE each row in customers is
-- UPDATEd, so updated_at always shows when the row last changed.
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- federated_credentials
-- ---------------------------------------------------------------------------
-- Links a Google or Facebook account to a customer ("federated" login means
-- another service vouches for who you are). Each row says "this person at
-- this provider is this customer". A customer can have several rows, e.g.
-- one for Google and one for Facebook.

CREATE TABLE federated_credentials (
  -- ON DELETE CASCADE: deleting a customer deletes their links too.
  customer_id integer      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  -- CHECK (...): the database rejects any provider not in this list.
  provider    varchar(20)  NOT NULL CHECK (provider IN ('google', 'facebook')),
  -- The provider's own id for this person. It never changes, even if they
  -- change their email, so it's what we look them up by.
  subject     varchar(255) NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  -- A primary key made of two columns: each provider account can be linked
  -- to only one customer.
  PRIMARY KEY (provider, subject)
);

-- Postgres doesn't index foreign keys automatically; this speeds up finding a
-- customer's links (and the cascade when a customer is deleted).
CREATE INDEX federated_credentials_customer_id_idx ON federated_credentials (customer_id);

-- ---------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------

CREATE TABLE addresses (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- REFERENCES customers (id): must be the id of an existing customer.
  -- ON DELETE CASCADE: deleting a customer deletes their saved addresses too
  -- (unless an order uses one, in which case orders' RESTRICT rule blocks the delete).
  customer_id  integer      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  line_1       varchar(255) NOT NULL,
  line_2       varchar(255),
  city         varchar(100) NOT NULL,
  region       varchar(100),
  postal_code  varchar(20)  NOT NULL,
  -- A 2-letter ISO country code, e.g. GB.
  country_code char(2)      NOT NULL,
  is_default   boolean      NOT NULL DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- An index is like the index at the back of a book: it lets the database find
-- matching rows without reading the whole table.
-- Postgres doesn't index foreign key columns automatically. Without this,
-- "find all addresses for customer 5" would scan the whole table.
CREATE INDEX addresses_customer_id_idx ON addresses (customer_id);

-- Partial unique index: each customer can have at most one default address.
-- Only rows where is_default is true are included in the uniqueness check,
-- so a customer can have any number of non-default addresses.
CREATE UNIQUE INDEX addresses_one_default_per_customer
  ON addresses (customer_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- UNIQUE: no two categories can share a name.
  name varchar(100) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Optional (no NOT NULL): a product can be uncategorised. If its category
  -- is deleted, the product stays and becomes uncategorised (SET NULL).
  category_id    integer       REFERENCES categories (id) ON DELETE SET NULL,
  -- SKU ("stock keeping unit"): each product's unique code.
  sku            varchar(50)   NOT NULL UNIQUE,
  name           varchar(255)  NOT NULL,
  description    text,
  -- numeric, not a floating-point type, so prices are stored exactly.
  -- CHECK: the database itself refuses negative prices.
  price          numeric(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity integer       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  -- false means "retired": hidden from the shop but kept for order history.
  is_active      boolean       NOT NULL DEFAULT true,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

-- Speeds up GET /products?category=... (Postgres doesn't index foreign keys automatically).
CREATE INDEX products_category_id_idx ON products (category_id);

-- Keep products.updated_at current (see set_updated_at above).
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- cart_items (each customer's shopping cart)
-- ---------------------------------------------------------------------------
-- Each row means "this customer wants this many of this product".
-- There's no separate carts table: every customer has exactly one cart, so
-- the customer's id is all that's needed to identify it.
-- There's deliberately no price column. The cart always shows the product's
-- CURRENT price; the price is only copied and frozen (into
-- order_items.unit_price) when the customer checks out.

CREATE TABLE cart_items (
  -- ON DELETE CASCADE on both: a cart is temporary, so if the customer or
  -- product is deleted, their cart rows simply go too (unlike orders, which
  -- are protected with RESTRICT).
  customer_id integer     NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  product_id  integer     NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  -- CHECK (quantity > 0): an item with 0 is removed from the cart instead.
  quantity    integer     NOT NULL CHECK (quantity > 0),
  -- When the product was first added, so the cart lists items in that order.
  added_at    timestamptz NOT NULL DEFAULT now(),
  -- Composite primary key: each product appears at most once per cart.
  -- Adding it again increases the quantity rather than adding a second row.
  PRIMARY KEY (customer_id, product_id)
);

-- The primary key already indexes lookups by customer_id (its first column),
-- which is how carts are read. This index speeds up the reverse: "which carts
-- contain product 7?", which is also used by ON DELETE CASCADE.
CREATE INDEX cart_items_product_id_idx ON cart_items (product_id);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

-- An enum type: a custom type whose value can only ever be one of this list.
-- A typo like 'shiped' is rejected by the database.
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ON DELETE RESTRICT: a customer or address that appears on an order can't
  -- be deleted, so order history is never broken. (Trying raises error 23001.)
  customer_id         integer       NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  shipping_address_id integer       NOT NULL REFERENCES addresses (id) ON DELETE RESTRICT,
  status              order_status  NOT NULL DEFAULT 'pending',
  total_amount        numeric(10,2) NOT NULL CHECK (total_amount >= 0),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- Speed up "all orders for customer X" and "orders shipped to address Y".
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
CREATE INDEX orders_shipping_address_id_idx ON orders (shipping_address_id);

-- Keep orders.updated_at current (see set_updated_at above).
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items (join table between orders and products)
-- ---------------------------------------------------------------------------
-- Each row is one line of an order: which product, how many, at what price.
-- This is how one order holds many products, and one product appears in many orders.

CREATE TABLE order_items (
  -- ON DELETE CASCADE: deleting an order deletes its line items.
  order_id   integer       NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  -- ON DELETE RESTRICT: a product that has been ordered can't be deleted;
  -- set is_active = false instead.
  product_id integer       NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity   integer       NOT NULL CHECK (quantity > 0),
  -- Price at the time of purchase, copied from products.price at checkout,
  -- so later price changes don't alter past orders.
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  -- Composite primary key (made of two columns): the same product can only
  -- appear once per order; buying more raises the quantity instead.
  PRIMARY KEY (order_id, product_id)
);

-- The primary key already indexes lookups by order_id (its first column),
-- but "which orders contain product 7?" needs its own index.
CREATE INDEX order_items_product_id_idx ON order_items (product_id);

-- Save everything created since BEGIN.
COMMIT;
