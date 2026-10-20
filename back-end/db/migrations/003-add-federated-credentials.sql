-- Migration 003: let customers sign in with Google or Facebook.
--
-- A migration updates an EXISTING database to match a change in schema.sql,
-- without deleting the data already in it. New databases don't need this:
-- schema.sql already includes these changes.
-- Run once against the ecommerce database (e.g. in pgAdmin's Query Tool),
-- after 002-add-cart-items.sql. In SQL, `--` starts a comment.

-- Run as one transaction: if any step fails, nothing is saved, so the
-- database is never left half-migrated. COMMIT at the end saves the changes.
BEGIN;

-- Customers who only sign in with Google or Facebook have no password, so
-- password_hash may now be NULL. Existing customers keep their hashes.
ALTER TABLE customers ALTER COLUMN password_hash DROP NOT NULL;

-- The same definition as in schema.sql (see the comments there for detail).
-- Each row: "this person at this provider is this customer".
--   ON DELETE CASCADE: deleting the customer deletes their links too
--   CHECK (...): only 'google' and 'facebook' are allowed
--   PRIMARY KEY (provider, subject): each provider account links to one customer
CREATE TABLE federated_credentials (
  customer_id integer      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  provider    varchar(20)  NOT NULL CHECK (provider IN ('google', 'facebook')),
  subject     varchar(255) NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);

-- Index for finding a customer's links (see schema.sql).
CREATE INDEX federated_credentials_customer_id_idx ON federated_credentials (customer_id);

COMMIT;
