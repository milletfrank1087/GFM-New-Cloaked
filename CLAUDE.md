# Rules for AI agents working in this repo

## Live Stripe: never call it

**Never send any request to a live Stripe account** — no reads, no writes, no "just listing" — from scripts, the Stripe CLI, `node -e`, curl, or the Stripe dashboard API. This covers every `sk_live_…` / `rk_live_…` key (the stores' Railway variables hold them).

- Do not fetch `STRIPE_SECRET_KEY` from Railway to use it locally.
- Do not create/modify webhook endpoints, customers, subscriptions, refunds or anything else on a live account.
- If a task seems to need live Stripe data, stop and ask the user to do it in the Stripe dashboard.

Allowed data sources for investigation:
- **Supabase** (payments, subscriptions, customers, checkout_sessions, funnel_events, payment_failures, ad_spend)
- **Railway** logs, deployments and variables (except using Stripe secrets from them)
- **Meta / Facebook** Graph API (ads, insights, pixel stats)
- **Stripe test mode** (`sk_test_…` in `store/.env`) for local testing only

Local test runs write to the production Supabase: mark/clean up test rows afterwards.
