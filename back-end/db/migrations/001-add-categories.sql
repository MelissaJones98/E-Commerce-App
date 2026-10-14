-- Migration 001: add product categories.
--
-- A migration updates an EXISTING database to match a change in schema.sql,
-- without deleting the data already in it. New databases don't need this:
-- schema.sql already includes these changes.
-- Run once against the ecommerce database (e.g. in pgAdmin's Query Tool).
-- In SQL, `--` starts a comment.

-- Run as one transaction: if any step fails, none of the changes are saved,
-- so the database is never left half-migrated. COMMIT at the end saves them.
BEGIN;

-- Create the new categories table (the same definition as in schema.sql).
--   GENERATED ALWAYS AS IDENTITY PRIMARY KEY: ids 1, 2, 3... assigned automatically
--   NOT NULL UNIQUE: every category needs a name, and no two can share one
CREATE TABLE categories (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE
);

-- ALTER TABLE changes an existing table. ADD COLUMN adds category_id to
-- products. Existing products get NULL (no category), since there's no NOT NULL.
--   REFERENCES categories (id): must be the id of an existing category
--   ON DELETE SET NULL: deleting a category makes its products uncategorised
ALTER TABLE products
  ADD COLUMN category_id integer REFERENCES categories (id) ON DELETE SET NULL;

-- An index so GET /products?category=... can find products quickly,
-- instead of reading the whole products table.
CREATE INDEX products_category_id_idx ON products (category_id);

COMMIT;
