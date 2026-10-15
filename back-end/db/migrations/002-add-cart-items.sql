-- Migration 002: add shopping carts.
--
-- A migration updates an EXISTING database to match a change in schema.sql,
-- without deleting the data already in it. New databases don't need this:
-- schema.sql already includes these changes.
-- Run once against the ecommerce database (e.g. in pgAdmin's Query Tool),
-- after 001-add-categories.sql. In SQL, `--` starts a comment.

-- Run as one transaction: if any step fails, nothing is saved, so the
-- database is never left half-migrated. COMMIT at the end saves the changes.
BEGIN;

-- The same definition as in schema.sql (see the comments there for detail).
-- Each row: "this customer wants this many of this product".
--   REFERENCES ... ON DELETE CASCADE: deleting the customer or product
--     deletes the matching cart rows too
--   CHECK (quantity > 0): quantities must be at least 1
--   PRIMARY KEY (customer_id, product_id): each product at most once per cart
CREATE TABLE cart_items (
  customer_id integer     NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  product_id  integer     NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity    integer     NOT NULL CHECK (quantity > 0),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

-- Index for looking up cart rows by product (see schema.sql).
CREATE INDEX cart_items_product_id_idx ON cart_items (product_id);

COMMIT;
