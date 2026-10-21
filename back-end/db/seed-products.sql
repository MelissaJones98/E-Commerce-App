-- Sample health and beauty products, so the shop has something to show while it's being built.
--
-- Run it on your `ecommerce` database the same way as schema.sql (pgAdmin: select the database,
-- Tools → Query Tool, open this file, Execute). It only ADDS rows; it never changes or deletes
-- existing ones. Running it a second time adds nothing, because every category name and
-- product SKU must be unique (see ON CONFLICT below).
--
-- The products include a few deliberate edge cases, to check the pages handle them:
--   - one sold out (stock 0), to see "Out of stock";
--   - one with no description (NULL), to check the card keeps its height;
--   - one with a very long description, to see it cut to 2 lines on the card;
--   - one with a price over £1,000, to see the thousands separator.

-- BEGIN ... COMMIT runs everything as one transaction: if any statement fails, none of the
-- changes are kept, so the database is never left half-seeded.
BEGIN;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
-- Several rows in one INSERT: each ( ... ) after VALUES is one row.
-- ON CONFLICT (name) DO NOTHING: if a category with that name already exists (names are
-- UNIQUE), skip it instead of failing.
INSERT INTO categories (name)
VALUES
  ('Skincare'),
  ('Haircare'),
  ('Bath & Body'),
  ('Makeup'),
  ('Wellness')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
-- Each product needs its category's id, which the database chose when the category was
-- created. Rather than guess the ids, this looks them up by name:
--   (VALUES (...), (...)) AS v(category, sku, ...)
--       a temporary table, written inline. `AS v(...)` names it `v` and names its columns.
--   JOIN categories c ON c.name = v.category
--       pairs each row with the category whose name matches, so c.id is its id.
--   INSERT INTO products (...) SELECT ...
--       inserts the result of the SELECT instead of a fixed list of values.
-- ON CONFLICT (sku) DO NOTHING: skip any product whose SKU is already in the shop.
-- Prices are written as plain numbers (e.g. 18.50); the price column is numeric(10,2), so
-- they're stored exactly.
INSERT INTO products (category_id, sku, name, description, price, stock_quantity)
SELECT c.id, v.sku, v.name, v.description, v.price, v.stock_quantity
FROM (
  VALUES
    -- Skincare
    ('Skincare', 'SKN-001', 'Hydrating Face Serum',
     'A lightweight hyaluronic acid serum that draws moisture into the skin for a plump, dewy finish. Suitable for all skin types.',
     18.50, 40),
    ('Skincare', 'SKN-002', 'Vitamin C Brightening Drops',
     'Fifteen percent vitamin C in a fast-absorbing base, to even out skin tone and add a healthy glow.',
     24.00, 25),
    ('Skincare', 'SKN-003', 'Gentle Cream Cleanser',
     'A soft, non-foaming cleanser with oat extract that removes make-up without stripping the skin.',
     12.00, 60),
    ('Skincare', 'SKN-004', 'Overnight Repair Moisturiser',
     -- A deliberately long description, to check the card cuts it to two lines.
     'A rich night cream with ceramides, squalane and peptides that works while you sleep to restore the skin barrier, soften fine lines and leave your face feeling calm, comfortable and deeply nourished by morning. Fragrance-free and suitable for sensitive skin.',
     29.95, 18),
    ('Skincare', 'SKN-005', 'Mineral Sunscreen SPF 50',
     'A sheer, zinc-based sunscreen that protects against UVA and UVB without leaving a white cast.',
     16.00, 0), -- sold out, to check "Out of stock"

    -- Haircare
    ('Haircare', 'HAI-001', 'Argan Oil Hair Mask',
     'A weekly treatment mask with Moroccan argan oil to smooth frizz and restore shine to dry hair.',
     14.50, 30),
    ('Haircare', 'HAI-002', 'Scalp Care Shampoo',
     'A sulphate-free shampoo with tea tree and peppermint to refresh and soothe the scalp.',
     9.99, 45),

    -- Bath & Body
    ('Bath & Body', 'BAT-001', 'Lavender Bath Salts',
     'Dead Sea salts blended with lavender essential oil for a slow, relaxing soak.',
     11.00, 35),
    ('Bath & Body', 'BAT-002', 'Shea Body Butter',
     -- NULL: no description, to check the card and the product page cope without one.
     NULL,
     15.00, 22),
    ('Bath & Body', 'BAT-003', 'Rose Hand Cream',
     'A quick-absorbing hand cream scented with damask rose, in a handbag-sized tube.',
     7.50, 80),

    -- Makeup
    ('Makeup', 'MAK-001', 'Tinted Lip Balm',
     'A nourishing balm with a sheer wash of warm peach colour.',
     8.00, 50),
    ('Makeup', 'MAK-002', 'Cream Blush Stick',
     'A blendable cream blush in a soft terracotta shade, for cheeks and lips.',
     13.50, 12),

    -- Wellness
    ('Wellness', 'WEL-001', 'Calming Pillow Mist',
     'A spray of lavender, chamomile and vetiver for your pillow, to help you wind down at night.',
     10.00, 28),
    ('Wellness', 'WEL-002', 'Luxury Spa Hamper',
     -- A price over £1,000, to check the thousands separator ("£1,250.00").
     'Our complete collection, beautifully boxed: every serum, cream and bath treat in the shop, with a hand-thrown ceramic dish and a silk eye mask.',
     1250.00, 3)
) AS v(category, sku, name, description, price, stock_quantity)
JOIN categories c ON c.name = v.category
ON CONFLICT (sku) DO NOTHING;

COMMIT;
