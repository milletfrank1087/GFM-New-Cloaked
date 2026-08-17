-- 006_create_ab_visitors_table.sql
-- Persistent storage for A/B testing visitor impressions and engagement metrics.

CREATE TABLE IF NOT EXISTS public.ab_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text UNIQUE NOT NULL,
  session_id text NOT NULL,
  variant text NOT NULL,
  campaign_slug text NOT NULL DEFAULT 'glioblastoma-grace',
  ip_address text,
  user_agent text,
  device_type text DEFAULT 'desktop',
  is_mobile boolean DEFAULT false,
  device_label text,
  location_label text DEFAULT 'Unknown Location',
  city text,
  country text,
  country_code text,
  stay_time int DEFAULT 0,
  scroll_depth int DEFAULT 0,
  checkout_opened boolean DEFAULT false,
  checkout_initiated boolean DEFAULT false,
  donated boolean DEFAULT false,
  donation_amount decimal(10, 2) DEFAULT 0,
  donation_currency text DEFAULT 'GBP',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_visitors_created_at ON public.ab_visitors(created_at);
CREATE INDEX IF NOT EXISTS idx_ab_visitors_variant ON public.ab_visitors(variant);
CREATE INDEX IF NOT EXISTS idx_ab_visitors_campaign ON public.ab_visitors(campaign_slug);

ALTER TABLE public.ab_visitors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ab_visitors' AND policyname = 'Service role full access on ab_visitors'
  ) THEN
    CREATE POLICY "Service role full access on ab_visitors" ON public.ab_visitors
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
