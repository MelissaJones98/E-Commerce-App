-- Database schema for the e-commerce app.
-- Implements the design in docs/database-design.md.
--
-- Run against an empty database, either in pgAdmin's Query Tool or with:
--   psql -U postgres -d ecommerce -f back-end/db/schema.sql

-- Run everything in one transaction: either every table is created, or none are.
-- If any statement fails, the rest are skipped and nothing is saved.
BEGIN;

-- ---------------------------------------------------------------------------
-- Shared: keep updated_at current
-- ---------------------------------------------------------------------------

-- A trigger function that sets updated_at to the current time whenever a row
-- is updated. Attached to each table with an updated_at column further down.
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
  -- GENERATED ALWAYS AS IDENTITY: Postgres assigns 1, 2, 3... automatically.
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name    varchar(100) NOT NULL,
  last_name     varchar(100) NOT NULL,
  email         varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  phone         varchar(30),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------

CREATE TABLE addresses (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Deleting a customer deletes their saved addresses too (unless an order
  -- uses one, in which case orders' RESTRICT rule blocks the delete).
  customer_id  integer      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  line_1       varchar(255) NOT NULL,
  line_2       varchar(255),
  city         varchar(100) NOT NULL,
  region       varchar(100),
  postal_code  varchar(20)  NOT NULL,
  country_code char(2)      NOT NULL,
  is_default   boolean      NOT NULL DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- Postgres doesn't index foreign key columns automatically. Without this,
-- "find all addresses for customer 5" would scan the whole table.
CREATE INDEX addresses_customer_id_idx ON addresses (customer_id);

-- Partial unique index: each customer can have at most one default address.
-- Only rows where is_default is true are included in the uniqueness check.
CREATE UNIQUE INDEX addresses_one_default_per_customer
  ON addresses (customer_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku            varchar(50)   NOT NULL UNIQUE,
  name           varchar(255)  NOT NULL,
  description    text,
  price          numeric(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity integer       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active      boolean       NOT NULL DEFAULT true,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

-- An enum type: status can only ever be one of these five values.
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- RESTRICT: a customer or address that appears on an order can't be deleted.
  customer_id         integer       NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  shipping_address_id integer       NOT NULL REFERENCES addresses (id) ON DELETE RESTRICT,
  status              order_status  NOT NULL DEFAULT 'pending',
  total_amount        numeric(10,2) NOT NULL CHECK (total_amount >= 0),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX orders_customer_id_idx ON orders (customer_id);
CREATE INDEX orders_shipping_address_id_idx ON orders (shipping_address_id);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items (join table between orders and products)
-- ---------------------------------------------------------------------------

CREATE TABLE order_items (
  -- Deleting an order deletes its line items.
  order_id   integer       NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  -- A product that has been ordered can't be deleted; set is_active = false instead.
  product_id integer       NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity   integer       NOT NULL CHECK (quantity > 0),
  -- Price at the time of purchase, copied from products.price at checkout.
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  -- Composite primary key: the same product can only appear once per order.
  PRIMARY KEY (order_id, product_id)
);

-- The primary key already indexes lookups by order_id (its first column),
-- but "which orders contain product 7?" needs its own index.
CREATE INDEX order_items_product_id_idx ON order_items (product_id);

COMMIT;
