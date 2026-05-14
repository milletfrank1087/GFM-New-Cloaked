-- 005 — Atomic multi-store rebalance RPC
--
-- Why: The admin UI previously had to issue one PUT per store to change
-- weights, which meant brief intermediate states where the sum of active
-- weights could be 90% or 150% (and where the rotation trigger fired
-- multiple times bumping rotation_baseline_at on each one). The trigger
-- now resets baseline once per rebalance (because now() is constant within
-- a transaction), but the wire-level interleaving still looked ugly.
--
-- This RPC takes an array of {id, weight_pct, status} and applies them in
-- one DB transaction. PLpgsql functions run in a single transaction by
-- default, so:
--   - Sum-of-active-weights is never observable as anything other than the
--     pre-rebalance or post-rebalance value.
--   - The rotation trigger fires once per row, but every firing sees the
--     same transaction_timestamp() so rotation_baseline_at ends up at one
--     consistent value matching the rebalance time.
--   - If any single UPDATE fails (e.g. constraint violation), the whole
--     rebalance rolls back — partial application is impossible.
--
-- The function validates that the sum of active weights equals 100 before
-- applying changes, so the DB is the authoritative invariant enforcer (the
-- admin UI also pre-validates, but defence-in-depth).

CREATE OR REPLACE FUNCTION rebalance_stores(updates jsonb)
RETURNS TABLE(id uuid, slug text, status text, weight_pct integer)
LANGUAGE plpgsql AS $$
DECLARE
  upd          jsonb;
  upd_id       uuid;
  upd_weight   integer;
  upd_status   text;
  active_sum   integer;
BEGIN
  IF jsonb_typeof(updates) <> 'array' THEN
    RAISE EXCEPTION 'updates must be a JSON array, got %', jsonb_typeof(updates);
  END IF;

  -- 1. Apply each update, validating per-row constraints inline.
  FOR upd IN SELECT * FROM jsonb_array_elements(updates) LOOP
    upd_id     := (upd->>'id')::uuid;
    upd_weight := (upd->>'weight_pct')::integer;
    upd_status := upd->>'status';

    IF upd_id IS NULL THEN
      RAISE EXCEPTION 'each update must include an id, got %', upd;
    END IF;
    IF upd_status IS NULL OR upd_status NOT IN ('active', 'paused') THEN
      RAISE EXCEPTION 'status must be active or paused, got % for id %', upd_status, upd_id;
    END IF;
    IF upd_weight IS NULL OR upd_weight < 0 OR upd_weight > 100 THEN
      RAISE EXCEPTION 'weight_pct must be 0-100, got % for id %', upd_weight, upd_id;
    END IF;
    -- Operator invariant: paused stores must have weight 0.
    IF upd_status = 'paused' AND upd_weight <> 0 THEN
      upd_weight := 0;
    END IF;

    UPDATE stores
       SET status     = upd_status,
           weight_pct = upd_weight
     WHERE stores.id = upd_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'store id % not found', upd_id;
    END IF;
  END LOOP;

  -- 2. Enforce the post-rebalance invariant: sum of active weights = 100,
  --    UNLESS no store ended up active (e.g. operator paused everything,
  --    which is a valid "stop the rotation entirely" state).
  SELECT COALESCE(SUM(s.weight_pct), 0) INTO active_sum
    FROM stores s WHERE s.status = 'active';

  IF active_sum <> 100 AND active_sum <> 0 THEN
    RAISE EXCEPTION 'sum of active store weights must equal 100, got %', active_sum;
  END IF;

  -- 3. Return the post-rebalance state so the caller can confirm.
  RETURN QUERY
  SELECT s.id, s.slug, s.status, s.weight_pct
    FROM stores s
   ORDER BY s.status DESC, s.weight_pct DESC, s.slug;
END;
$$;

COMMENT ON FUNCTION rebalance_stores(jsonb) IS
'Atomic multi-store weight/status rebalance. Takes a JSON array of '
'{id, weight_pct, status} objects, applies them all in a single transaction, '
'and enforces that the sum of active weights equals 100 (or 0 if everything '
'is paused). The rotation_baseline_at trigger fires inside the transaction '
'and resolves to a single consistent timestamp post-commit.';
