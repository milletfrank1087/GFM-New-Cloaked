-- 003 — Simplify store status to active/paused + introduce weight_pct revenue split
--
-- Why: replaces the legacy 5-value status enum (warming/active/paused/burned/removed)
-- with a binary active/paused gate plus an integer weight_pct (0–100) that drives
-- a deficit-fill revenue-split inside get_next_store().
--
-- Operator invariant (enforced at the application layer, not DB): the sum of
-- weight_pct across stores where status='active' should equal 100. The RPC will
-- still function if it doesn't (deficit-fill self-corrects), but admin UI guards
-- against drift on every save.

BEGIN;

-- 1. Add weight_pct column
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS weight_pct integer NOT NULL DEFAULT 0
CHECK (weight_pct BETWEEN 0 AND 100);

COMMENT ON COLUMN stores.weight_pct IS
'Target revenue share for active stores (0-100). Sum of active stores'' weights should equal 100.';

-- 2. Collapse legacy statuses to active/paused
--    'active'  stays as-is
--    'warming' -> 'paused' (was a pre-live state)
--    'burned'  -> 'paused' (was a post-live retirement state)
--    'removed' -> 'paused' (was a soft-delete state)
UPDATE stores SET status = 'paused' WHERE status NOT IN ('active', 'paused');

-- 3. Seed weight_pct for the only currently-active store so rotation keeps working
UPDATE stores SET weight_pct = 100 WHERE status = 'active' AND weight_pct = 0;

-- 4. Replace status default
ALTER TABLE stores ALTER COLUMN status SET DEFAULT 'paused';

-- 5. Lock the vocabulary down with a CHECK constraint
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_status_check;
ALTER TABLE stores ADD CONSTRAINT stores_status_check
  CHECK (status IN ('active', 'paused'));

-- 6. Rewrite get_next_store to use weighted deficit-fill
--    Algorithm: for each eligible store, compute deficit = weight_pct - current_share.
--    Eligible = status='active' AND weight_pct > 0 AND month_vol < max_monthly_volume.
--    Pick the largest positive deficit; ties broken by lower transaction_count.
DROP FUNCTION IF EXISTS get_next_store();

CREATE OR REPLACE FUNCTION get_next_store()
RETURNS TABLE(id uuid, slug text, domain text)
LANGUAGE plpgsql AS $$
DECLARE
  total_vol numeric;
BEGIN
  SELECT COALESCE(SUM(p.total_amount), 0) INTO total_vol
  FROM payments p
  JOIN stores s ON s.id = p.store_id
  WHERE s.status = 'active'
    AND s.weight_pct > 0
    AND p.status = 'completed'
    AND p.created_at >= date_trunc('month', now());

  RETURN QUERY
  SELECT s.id, s.slug, s.domain
  FROM stores s
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.total_amount), 0) AS vol
    FROM payments p
    WHERE p.store_id = s.id
      AND p.status = 'completed'
      AND p.created_at >= date_trunc('month', now())
  ) mv ON true
  WHERE s.status = 'active'
    AND s.weight_pct > 0
    AND mv.vol < s.max_monthly_volume
  ORDER BY
    (s.weight_pct::numeric -
      CASE WHEN total_vol > 0
           THEN (mv.vol / total_vol) * 100
           ELSE 0
      END
    ) DESC,
    s.transaction_count ASC
  LIMIT 1;
END;
$$;

-- 7. Extend get_store_analytics output with weight_pct
DROP FUNCTION IF EXISTS get_store_analytics();

CREATE OR REPLACE FUNCTION get_store_analytics()
RETURNS TABLE(
  store_id uuid,
  slug text,
  domain text,
  name text,
  status text,
  payment_processor text,
  weight_pct integer,
  total_processed numeric,
  transaction_count integer,
  max_monthly_volume numeric,
  last_used_at timestamptz,
  created_at timestamptz,
  month_volume numeric,
  month_txn_count bigint,
  month_gross numeric,
  month_fees numeric,
  month_net numeric,
  volume_pct numeric,
  last_payment_at timestamptz
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
    SELECT
      s.id AS store_id,
      s.slug,
      s.domain,
      s.name,
      s.status,
      s.payment_processor,
      s.weight_pct,
      s.total_processed,
      s.transaction_count,
      s.max_monthly_volume,
      s.last_used_at,
      s.created_at,
      COALESCE(mv.vol, 0) AS month_volume,
      COALESCE(mv.cnt, 0) AS month_txn_count,
      COALESCE(mv.gross, 0) AS month_gross,
      COALESCE(mv.fees, 0) AS month_fees,
      COALESCE(mv.net, 0) AS month_net,
      CASE WHEN s.max_monthly_volume > 0
        THEN ROUND((COALESCE(mv.vol, 0) / s.max_monthly_volume) * 100, 1)
        ELSE 0
      END AS volume_pct,
      mv.last_pay AS last_payment_at
    FROM stores s
    LEFT JOIN LATERAL (
      SELECT
        SUM(p.total_amount) AS vol,
        COUNT(*) AS cnt,
        SUM(p.total_amount) AS gross,
        SUM(p.stripe_fee) AS fees,
        SUM(p.net_amount) AS net,
        MAX(p.created_at) AS last_pay
      FROM payments p
      WHERE p.store_id = s.id
        AND p.created_at >= date_trunc('month', now())
        AND p.status = 'completed'
    ) mv ON true
    ORDER BY s.created_at DESC;
END;
$$;

COMMIT;
