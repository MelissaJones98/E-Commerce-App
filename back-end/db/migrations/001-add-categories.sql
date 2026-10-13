-- Migration 001: add product categories.
--
-- Brings a database created from the original schema.sql up to date.
-- New databases don't need this: schema.sql already includes these changes.
-- Run once against the ecommerce database (e.g. in pgAdmin's Query Tool).

BEGIN;

CREATE TABLE categories (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE
);

ALTER TABLE products
  ADD COLUMN category_id integer REFERENCES categories (id) ON DELETE SET NULL;

CREATE INDEX products_category_id_idx ON products (category_id);

COMMIT;
