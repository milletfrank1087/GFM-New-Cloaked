-- Multi-Processor Payment Support: Stripe + PayPal
-- Run this migration in Supabase SQL Editor

-- 1. Add payment_processor column to stores table
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS payment_processor text NOT NULL DEFAULT 'stripe'
CHECK (payment_processor IN ('stripe', 'paypal'));

COMMENT ON COLUMN stores.payment_processor IS 'Which payment processor this store uses (stripe or paypal)';

-- 2. Add payment_method column to payments table to distinguish processor
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'stripe'
CHECK (payment_method IN ('stripe', 'paypal'));

COMMENT ON COLUMN payments.payment_method IS 'Which payment processor handled this payment';

-- 3. Add PayPal-specific columns to payments (reuse stripe columns where possible)
-- stripe_payment_intent_id -> also stores PayPal order ID
-- stripe_charge_id -> also stores PayPal capture ID
-- stripe_fee -> also stores PayPal fee
-- No new columns needed; existing columns are processor-agnostic in practice

-- 4. Add PayPal-specific columns to payment_failures
ALTER TABLE payment_failures
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'stripe';

-- 5. Update get_next_store() - no changes needed since it already picks
-- the next active store by last_used regardless of processor type.
-- If processor-aware selection is needed later, add WHERE clause:
--   WHERE status = 'active' AND payment_processor = $1
