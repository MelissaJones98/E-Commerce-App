-- Migration 005: add a delivery charge and a Stripe payment reference to orders.
--
-- A migration updates an EXISTING database to match a change in schema.sql,
-- without deleting the data already in it. New databases don't need this:
-- schema.sql already includes these changes.
-- Run once against the ecommerce database (e.g. in pgAdmin's Query Tool),
-- after 004-add-session-table.sql. In SQL, `--` starts a comment.

-- Run as one transaction: if any step fails, nothing is saved, so the
-- database is never left half-migrated. COMMIT at the end saves the changes.
BEGIN;

-- ALTER TABLE changes an existing table; ADD COLUMN adds a new column to it.
-- delivery_charge: what the customer paid for delivery (£3.95, or 0 when free).
--   NOT NULL DEFAULT 0  every existing order gets 0.00, because delivery didn't
--                       exist when they were placed, so their totals stay right
--   CHECK (...)         the database refuses a negative charge
-- From now on, total_amount means items + delivery: what was actually paid.
ALTER TABLE orders
  ADD COLUMN delivery_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0);

-- payment_reference: Stripe's id for the order's payment (a PaymentIntent id,
-- e.g. 'pi_3Mtw...'). It links an order to its payment in the Stripe
-- dashboard. NULL (empty) for orders placed before Stripe. It never holds
-- card details.
ALTER TABLE orders
  ADD COLUMN payment_reference varchar(255);

COMMIT;
