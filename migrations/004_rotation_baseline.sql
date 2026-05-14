-- 004 — Forward-only rotation baseline (fixes cold-start spike on mid-rotation adds)
--
-- Problem this fixes:
--   The previous get_next_store() (migration 003) measured each store's deficit
--   against the current calendar-month volume. When a new store is added
--   mid-month with a target weight (e.g. existing 50/50 rebalanced to 40/40/20),
--   the new store reports 0% share vs 20% target -> +20 deficit -> it wins
--   every routing decision until its cumulative this-month share catches up to
--   20%. With existing stores at €1000 each, that means ~€500 of consecutive
--   traffic dumped on a freshly-warmed Stripe account before any rotation
--   happens. That is exactly the behaviour Stripe risk models flag as a
--   suspected fraud takeover.
--
-- What this migration changes:
--   - Introduces a global `rotation_baseline_at` timestamp stored in a new
--     `system_config` table.
--   - A trigger bumps that timestamp to now() whenever any store's `weight_pct`
--     or `status` actually changes (UPDATE) or a new active+weighted store is
--     inserted. Inserts of paused/zero-weight stores do not bump (they cannot
--     affect rotation until they go active).
--   - Rewrites get_next_store() to compute deficit against `volume_since_baseline`
--     instead of `volume_since_month_start`. The max_monthly_volume cap still
--     uses calendar-month volume because that limit reflects per-Stripe-account
--     monthly caps, not rotation fairness.
--   - Tie-break changes from `transaction_count ASC` (lifetime, biased toward
--     newest stores) to `random()` for smooth, audit-tolerable distribution
--     when deficits are equal.
--
-- Operator-facing semantics:
--   Weights are now FORWARD-ONLY. Setting 40/40/20 means "from this moment on,
--   20% of new traffic goes to C". Whatever happened before the rebalance is
--   ignored for routing purposes. To reset the baseline manually:
--     UPDATE system_config SET value = now()::text
--       WHERE key = 'rotation_baseline_at';

BEGIN;

-- 1. Generic key/value config table (small, append-rarely)
CREATE TABLE IF NOT EXISTS system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE system_config IS
'Singleton-style key/value store for cross-cutting runtime configuration. '
'Use for values that must be cluster-wide (e.g. rotation baselines) and that '
'do not warrant their own table.';

-- 2. Seed the rotation baseline at deploy time. Setting to now() means the
--    first get_next_store() call after this migration treats all stores as
--    fresh from this point onward — the only currently-active store
--    (digitelon at 100%) still wins every call because it is the only one
--    eligible, so this is a no-op for current traffic.
INSERT INTO system_config (key, value)
VALUES ('rotation_baseline_at', now()::text)
ON CONFLICT (key) DO NOTHING;

-- 3. Trigger that bumps the baseline whenever a store's rotation-relevant
--    fields actually change. Uses IS DISTINCT FROM to ignore no-op writes
--    (e.g. admin saves a form where weight was already 40, not a real change).
CREATE OR REPLACE FUNCTION bump_rotation_baseline()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' AND NEW.weight_pct > 0 THEN
      UPDATE system_config
         SET value = now()::text, updated_at = now()
       WHERE key = 'rotation_baseline_at';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.weight_pct IS DISTINCT FROM OLD.weight_pct
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      UPDATE system_config
         SET value = now()::text, updated_at = now()
       WHERE key = 'rotation_baseline_at';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_rotation_baseline_update ON stores;
CREATE TRIGGER stores_rotation_baseline_update
AFTER UPDATE OF weight_pct, status ON stores
FOR EACH ROW EXECUTE FUNCTION bump_rotation_baseline();

DROP TRIGGER IF EXISTS stores_rotation_baseline_insert ON stores;
CREATE TRIGGER stores_rotation_baseline_insert
AFTER INSERT ON stores
FOR EACH ROW EXECUTE FUNCTION bump_rotation_baseline();

-- 4. Rewrite get_next_store with baseline-relative deficit + random tie-break.
DROP FUNCTION IF EXISTS get_next_store();

CREATE OR REPLACE FUNCTION get_next_store()
RETURNS TABLE(id uuid, slug text, domain text)
LANGUAGE plpgsql AS $$
DECLARE
  baseline_at  timestamptz;
  total_vol    numeric;
  month_start  timestamptz := date_trunc('month', now());
BEGIN
  SELECT (value::timestamptz) INTO baseline_at
    FROM system_config
   WHERE key = 'rotation_baseline_at';
  IF baseline_at IS NULL THEN
    baseline_at := month_start;
  END IF;

  SELECT COALESCE(SUM(p.total_amount), 0) INTO total_vol
    FROM payments p
    JOIN stores s ON s.id = p.store_id
   WHERE s.status = 'active'
     AND s.weight_pct > 0
     AND p.status = 'completed'
     AND p.created_at >= baseline_at;

  RETURN QUERY
  SELECT s.id, s.slug, s.domain
    FROM stores s
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(p.total_amount)
          FILTER (WHERE p.created_at >= baseline_at), 0) AS vol_baseline,
        COALESCE(SUM(p.total_amount)
          FILTER (WHERE p.created_at >= month_start), 0) AS vol_month
      FROM payments p
      WHERE p.store_id = s.id
        AND p.status = 'completed'
        AND p.created_at >= LEAST(baseline_at, month_start)
    ) mv ON true
   WHERE s.status = 'active'
     AND s.weight_pct > 0
     AND mv.vol_month < s.max_monthly_volume
   ORDER BY
     (s.weight_pct::numeric -
       CASE WHEN total_vol > 0
            THEN (mv.vol_baseline / total_vol) * 100
            ELSE 0
       END
     ) DESC,
     random()
   LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_next_store() IS
'Picks the next store for an inbound donation. Deficit = weight_pct - share_since_baseline. '
'Baseline resets on any weight/status change. Stores at or above max_monthly_volume are '
'excluded. Ties broken randomly so equal-deficit stores spread evenly.';

COMMIT;
