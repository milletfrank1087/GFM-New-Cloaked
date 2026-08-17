-- Migration 005: Normalize multi-currency amounts to EUR in get_next_store()
-- Ensures deficit-fill revenue routing accurately measures volume across EUR, USD, GBP, PLN, CHF, etc.

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

  SELECT COALESCE(SUM(
    CASE UPPER(COALESCE(p.currency, 'EUR'))
      WHEN 'EUR' THEN p.total_amount
      WHEN 'USD' THEN p.total_amount / 1.08
      WHEN 'GBP' THEN p.total_amount / 0.86
      WHEN 'PLN' THEN p.total_amount / 4.30
      WHEN 'CHF' THEN p.total_amount / 0.95
      WHEN 'CAD' THEN p.total_amount / 1.48
      WHEN 'AUD' THEN p.total_amount / 1.65
      WHEN 'CZK' THEN p.total_amount / 25.0
      WHEN 'HUF' THEN p.total_amount / 400.0
      WHEN 'SEK' THEN p.total_amount / 11.2
      WHEN 'NOK' THEN p.total_amount / 11.5
      WHEN 'DKK' THEN p.total_amount / 7.46
      ELSE p.total_amount
    END
  ), 0) INTO total_vol
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
        COALESCE(SUM(
          CASE UPPER(COALESCE(p.currency, 'EUR'))
            WHEN 'EUR' THEN p.total_amount
            WHEN 'USD' THEN p.total_amount / 1.08
            WHEN 'GBP' THEN p.total_amount / 0.86
            WHEN 'PLN' THEN p.total_amount / 4.30
            WHEN 'CHF' THEN p.total_amount / 0.95
            WHEN 'CAD' THEN p.total_amount / 1.48
            WHEN 'AUD' THEN p.total_amount / 1.65
            WHEN 'CZK' THEN p.total_amount / 25.0
            WHEN 'HUF' THEN p.total_amount / 400.0
            WHEN 'SEK' THEN p.total_amount / 11.2
            WHEN 'NOK' THEN p.total_amount / 11.5
            WHEN 'DKK' THEN p.total_amount / 7.46
            ELSE p.total_amount
          END
        ) FILTER (WHERE p.created_at >= baseline_at), 0) AS vol_baseline,
        COALESCE(SUM(
          CASE UPPER(COALESCE(p.currency, 'EUR'))
            WHEN 'EUR' THEN p.total_amount
            WHEN 'USD' THEN p.total_amount / 1.08
            WHEN 'GBP' THEN p.total_amount / 0.86
            WHEN 'PLN' THEN p.total_amount / 4.30
            WHEN 'CHF' THEN p.total_amount / 0.95
            WHEN 'CAD' THEN p.total_amount / 1.48
            WHEN 'AUD' THEN p.total_amount / 1.65
            WHEN 'CZK' THEN p.total_amount / 25.0
            WHEN 'HUF' THEN p.total_amount / 400.0
            WHEN 'SEK' THEN p.total_amount / 11.2
            WHEN 'NOK' THEN p.total_amount / 11.5
            WHEN 'DKK' THEN p.total_amount / 7.46
            ELSE p.total_amount
          END
        ) FILTER (WHERE p.created_at >= month_start), 0) AS vol_month
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
