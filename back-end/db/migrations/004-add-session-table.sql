-- Migration 004: store login sessions in the database.
--
-- A migration updates an EXISTING database to match a change in schema.sql,
-- without deleting the data already in it. New databases don't need this:
-- schema.sql already includes these changes.
-- Run once against the ecommerce database (e.g. in pgAdmin's Query Tool),
-- after 003-add-federated-credentials.sql. In SQL, `--` starts a comment.

-- Run as one transaction: if any step fails, nothing is saved, so the
-- database is never left half-migrated. COMMIT at the end saves the changes.
BEGIN;

-- The same definition as in schema.sql (see the comments there for detail).
-- The connect-pg-simple library uses this table to keep express-session's
-- sessions, so logins survive the API restarting.
--   sid     the session id from the connect.sid cookie
--   sess    the session's data as JSON (including the logged-in customer's id)
--   expire  when the session runs out
CREATE TABLE session (
  sid    varchar      NOT NULL PRIMARY KEY,
  sess   json         NOT NULL,
  expire timestamp(6) NOT NULL
);

-- Index for finding expired sessions to delete (see schema.sql).
CREATE INDEX session_expire_idx ON session (expire);

COMMIT;
