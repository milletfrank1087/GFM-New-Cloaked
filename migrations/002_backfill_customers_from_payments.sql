-- Backfill customers table from existing payments where customer_id is NULL.
--
-- Root cause: store/routes/stripe.js and store/routes/paypal.js were inserting
-- into customers using a non-existent column `first_purchase_at`. The PostgREST
-- response contained an error that was silently dropped (no error handling on
-- the insert), so customer_id remained NULL on every payment, customers table
-- stayed empty, and the admin "customers" view + "unique donors" stat were
-- broken.
--
-- This migration:
--   1. Creates one customer row per unique email already present in payments.
--   2. Aggregates totals (total_donated, donation_count, first/last_donation_at).
--   3. Backfills payments.customer_id so the customers UI links work.
--
-- Run AFTER deploying the code fix (002 must follow the code change so the
-- trigger trg_update_customer_totals does not double-count newer transactions).
-- The trigger only fires on INSERT, so backfill aggregates here and we set the
-- columns directly. A safety guard avoids inflating totals for any future runs.

BEGIN;

-- 1. Insert one customer per email currently missing a link.
INSERT INTO customers (
  name,
  initials,
  email,
  card_holder_name,
  total_donated,
  donation_count,
  first_donation_at,
  last_donation_at,
  country,
  status,
  color_gradient,
  utm_source,
  utm_medium,
  utm_campaign,
  referrer_url,
  created_at
)
SELECT
  COALESCE(NULLIF(MAX(p.billing_name), ''), MAX(p.customer_name), 'Anonymous')      AS name,
  COALESCE(
    UPPER(LEFT(REGEXP_REPLACE(MAX(p.billing_name), '\s.*', '') , 1) ||
          LEFT(REGEXP_REPLACE(MAX(p.billing_name), '^\S+\s+|\s+\S+$', ''), 0)),
    UPPER(LEFT(MAX(p.customer_name), 2)),
    '?'
  )                                                                                 AS initials,
  p.customer_email                                                                  AS email,
  MAX(p.card_holder_name)                                                           AS card_holder_name,
  COALESCE(SUM(p.amount), 0)                                                        AS total_donated,
  COUNT(*)                                                                          AS donation_count,
  MIN(p.created_at)                                                                 AS first_donation_at,
  MAX(p.created_at)                                                                 AS last_donation_at,
  NULL                                                                              AS country,
  'active'                                                                          AS status,
  (ARRAY[
    'from-blue-400 to-blue-500',
    'from-violet-400 to-violet-500',
    'from-rose-400 to-rose-500',
    'from-emerald-400 to-emerald-500',
    'from-amber-400 to-amber-500',
    'from-cyan-400 to-cyan-500'
  ])[1 + (ABS(HASHTEXT(p.customer_email)) % 6)]                                     AS color_gradient,
  MAX(p.utm_source)                                                                 AS utm_source,
  MAX(p.utm_medium)                                                                 AS utm_medium,
  MAX(p.utm_campaign)                                                               AS utm_campaign,
  MAX(p.referrer_url)                                                               AS referrer_url,
  MIN(p.created_at)                                                                 AS created_at
FROM payments p
WHERE p.customer_id IS NULL
  AND p.customer_email IS NOT NULL
  AND p.customer_email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.email = p.customer_email
  )
GROUP BY p.customer_email;

-- 2. Link existing payments to the customers we just created (or that already
--    existed for that email). Uses a temporary disable of the totals trigger
--    so we don't double-count rows that we already aggregated above.
ALTER TABLE payments DISABLE TRIGGER trg_update_customer_totals;

UPDATE payments p
SET    customer_id = c.id
FROM   customers c
WHERE  p.customer_id IS NULL
  AND  p.customer_email = c.email;

ALTER TABLE payments ENABLE TRIGGER trg_update_customer_totals;

COMMIT;
