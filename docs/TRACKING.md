# CAPI Tracking Architecture

## Overview

The system uses a **dual-fire architecture** for Meta Conversions API (CAPI) and TikTok Events API. Every conversion event fires both as a **browser pixel event** (client-side) and a **server-side CAPI event**. Both platforms deduplicate using a shared `event_id` — the same ID is sent from the browser pixel and the server API call. This ensures:

- **No double-counting**: If both fires succeed, the platform counts it once
- **No missed conversions**: If the browser pixel is blocked (ad blockers, cookie consent), the server event still arrives
- **Accurate attribution**: Enhanced matching parameters (hashed email, IP, user agent) improve match rates

All tracking runs on the **campaign server** only. The store server has NO tracking code — it is a clean e-commerce storefront that must not leak any campaign context.

---

## Event Lifecycle

Events fire in this order during the donation journey:

```
1. PageView        → Page loads
2. ViewContent     → Donor scrolls or interacts with campaign content
3. AddToCart        → Donor opens the donation modal
4. InitiateCheckout → Donor confirms amount and begins payment flow
                       ↓
                  Generate Purchase event_id → sessionStorage
                  Redirect to store
                       ↓
5. Purchase        → Two fires:
                     a) Server CAPI via /api/payment-callback (store callback)
                     b) Browser pixel on donor return (?status=complete)
```

Events 1-4 fire synchronously (browser pixel + server CAPI in parallel). Event 5 (Purchase) fires asynchronously across the two-domain flow.

---

## Data Flow Diagram

```
CAMPAIGN BROWSER                    CAMPAIGN SERVER                    STORE SERVER
─────────────────────               ───────────────────               ──────────────
                                    
tracking.js init()                  GET /api/tracking/config
  ├─ captureClickIds()              Returns: pixel IDs, fbp cookie
  ├─ fetchClientLocation()          
  │   └─ ipapi.co → {ip, city...}  
  └─ get tracking config ────────→  

track('PageView') ─────────────→   POST /api/track {event, eventId}
  ├─ fbq('track', 'PageView')      └─ trackEvent() 
  └─ ttq.track('Pageview')              ├─ sendMetaEvent()
                                         └─ sendTikTokEvent()

track('AddToCart') ─────────────→   POST /api/track ...
track('InitiateCheckout') ──────→   POST /api/track ...

initDonationRedirect()
  ├─ generateEventId('Purchase')
  ├─ sessionStorage.set(event_id)
  ├─ tracking.eventId = event_id
  └─ POST /api/init-donation ───→   Save tracking in checkout_session
                                    Redirect URL → store
                                                          /s/:token
                                                          Read checkout_session
                                                          Set __session cookie
                                                          Payment flow
                                                          
                                                          POST callback ─→
                                    POST /api/payment-callback
                                      ├─ tracking.eventId from callback
                                      ├─ capiResult = trackPurchase({eventId})
                                      │   ├─ sendMetaEvent('Purchase')
                                      │   └─ sendTikTokEvent('CompletePayment')
                                      ├─ JourneyLog.purchase(visitor, amount, store, capiResult)
                                      └─ redirect donor with ?status=complete

handleDonatedReturn()
  ├─ sessionStorage.get(event_id)
  ├─ Tracking.trackPurchase(
  │     {value, currency}, eventId)
  │   ├─ fbq('track', 'Purchase')
  │   └─ sendToServer() with eventId
  └─ sessionStorage.clear()
```

---

## Purchase Deduplication Flow

The Purchase event is the critical conversion. It spans two domains and must be properly deduplicated.

### Step-by-step:

1. **Campaign client** (`donation.js`): Before redirecting to the store, generates a unique event_id using `Tracking.generateEventId('Purchase')` and stores it in three sessionStorage keys:
   - `_purchase_event_id` — the deduplication ID
   - `_purchase_amount` — the donation amount
   - `_purchase_currency` — the currency code

2. **Campaign client** includes `tracking.eventId` in the POST body to `/api/init-donation`

3. **Campaign server** saves the entire tracking object (including eventId) in the Supabase `checkout_sessions` table

4. **Store server** reads the checkout session and puts the tracking data into the `__session` httpOnly cookie as `donor.utm`

5. **Store server** completes the payment and POSTs back to the campaign server with `paymentData.tracking` which includes the original `eventId`

6. **Campaign server** (`/api/payment-callback`): Fires the server-side CAPI Purchase using `tracking.eventId` as the `event_id`

7. **Campaign client** (`handleDonatedReturn()`): When the donor returns with `?status=complete`, retrieves `_purchase_event_id` from sessionStorage and fires `Tracking.trackPurchase()` with that same event_id

8. **Meta**: Receives two Purchase events with the same `event_id` — counts as ONE conversion

### Why sessionStorage?

- Survives the cross-domain redirect (the browser navigates away to the store and back, but sessionStorage persists for the tab)
- More reliable than cookies for this use case (no domain scope issues)
- Automatically cleared when the tab closes

---

## Browser-Side Tracking Module

**File**: `campaign/public/js/tracking.js`

### Initialization
The module self-initializes on page load:
1. Fetches tracking config from `GET /api/tracking/config` (pixel IDs, enabled flag)
2. Captures click IDs from URL parameters (`fbclid` → `_fbc` cookie, `ttclid` → `_ttclid` cookie)
3. Fetches client IP/location from `ipapi.co/json/` (3s timeout, silent fail)
4. Loads Meta Pixel (`fbq`) and TikTok Pixel (`ttq`) scripts dynamically
5. Fires initial PageView event

### Cookie Management
| Cookie | Purpose | Duration | Set By |
|--------|---------|----------|--------|
| `_fbp` | Meta browser ID | 90 days | Meta Pixel script |
| `_fbc` | Meta click ID (from `fbclid` URL param) | 90 days | tracking.js |
| `_fbclid` | Raw fbclid value | 90 days | tracking.js |
| `_ttp` | TikTok browser ID | 90 days | TikTok Pixel script |
| `_ttclid` | TikTok click ID (from `ttclid` URL param) | 90 days | tracking.js |
| `_utm_data` | UTM parameters (JSON) | 90 days | tracking.js |
| `_hr_ref` | Referral code | 7 days | tracking.js |

### Event ID Generation
```
Format: {EventName}_{timestamp}_{random9chars}
Example: Purchase_1711929600000_a3b8f2k9x
```

### Public API
| Method | Description |
|--------|-------------|
| `Tracking.init()` | Initialize tracking (auto-called on page load) |
| `Tracking.track(eventName, data)` | Fire event to all platforms |
| `Tracking.trackPurchase(data, eventId)` | Fire Purchase with specific event_id (for dedup) |
| `Tracking.getCookies()` | Get all tracking cookies |
| `Tracking.getTrackingData()` | Get full tracking data (cookies + UTMs + click IDs) |
| `Tracking.generateEventId(name)` | Generate a deduplication event ID |
| `Tracking.getClientLocation()` | Get cached IP/location data |
| `Tracking.hashEmail(email)` | SHA-256 hash email for advanced matching |

---

## Server-Side Tracking Module

**File**: `campaign/lib/tracking.js`

### Meta Conversions API
- API version: `v20.0`
- Endpoint: `https://graph.facebook.com/v20.0/{PIXEL_ID}/events`
- Authentication: access_token as query parameter

### TikTok Events API
- Endpoint: `https://business-api.tiktok.com/open_api/v1.3/event/track/`
- Authentication: `Access-Token` header

### PII Hashing
All PII fields are hashed with SHA-256 before sending to either platform:
- Email → `em` (Meta) / `email` (TikTok)
- First name → `fn` (Meta) / `first_name` (TikTok)
- Last name → `ln` (Meta) / `last_name` (TikTok)
- External ID → `external_id` (both)
- City → `ct` (Meta) / `city` (TikTok)
- Country → `country` (both)

IP address and user agent are sent unhashed (required for server events).

### Exported Functions
| Function | Description |
|----------|-------------|
| `trackEvent(name, eventData, userData, clientInfo)` | Fire to both Meta + TikTok |
| `getTrackingConfig()` | Get pixel IDs for browser config endpoint |
| `isTrackingEnabled()` | Check master tracking switch |

---

## Campaign Server Tracking Endpoints

### `GET /api/tracking/config`
Returns pixel IDs and tracking state to the browser module.

Response:
```json
{
  "enabled": true,
  "fbPixelId": "123456789",
  "tiktokPixelId": "ABCDEF123",
  "fbp": "fb.1.1711929600000.abc123"
}
```

### `POST /api/track`
Receives browser events and fires server-side CAPI for deduplication.

Request body:
```json
{
  "event": "ViewContent",
  "eventId": "ViewContent_1711929600000_a3b8f2k9x",
  "sourceUrl": "https://campaign-domain.com/",
  "cookies": {
    "fbp": "fb.1.xxx.yyy",
    "fbc": "fb.1.xxx.zzz",
    "ttp": "...",
    "ttclid": "..."
  },
  "clientLocation": {
    "ip": "1.2.3.4",
    "city": "London",
    "country": "United Kingdom",
    "countryCode": "GB"
  },
  "data": {
    "value": 25.00,
    "currency": "EUR",
    "contentName": "Campaign Name"
  }
}
```

### `POST /api/track/payment-event`
Dedicated endpoint for Purchase tracking fired from the callback handler.

### `POST /api/payment-callback`
Receives the store callback after successful payment. Extracts `tracking.eventId` and fires the server-side CAPI Purchase event using it. Also fires TikTok CompletePayment with the same event_id. The CAPI result (`meta: ✓/✗`, `tiktok: ✓/✗`) is captured and passed to `JourneyLog.purchase()` for accurate logging.

---

## Event-to-Platform Mapping

| Internal Event | Meta Pixel/CAPI | TikTok Pixel/Events API |
|---------------|-----------------|------------------------|
| `PageView` | `PageView` | `Pageview` |
| `ViewContent` | `ViewContent` | `ViewContent` |
| `AddToCart` | `AddToCart` | `AddToCart` |
| `InitiateCheckout` | `InitiateCheckout` | `InitiateCheckout` |
| `AddPaymentInfo` | `AddPaymentInfo` | `AddPaymentInfo` |
| `Purchase` | `Purchase` | `CompletePayment` |

Note: TikTok uses `Pageview` (lowercase 'v') for page views and `CompletePayment` for purchases. All other event names match.

---

## Deduplication Rules

### Same event_id, same event_name
Meta and TikTok both use the `event_id` field to deduplicate:
- If two events arrive with the same `event_id` and same `event_name`, only one is counted
- The deduplication window is 48 hours (Meta) / configurable (TikTok)
- Events MUST arrive within the window to be deduplicated

### Event ordering
For events 1-4 (PageView through InitiateCheckout), browser and server fire nearly simultaneously (browser fires pixel, then POSTs to server). Order doesn't matter — deduplication is based on event_id, not timing.

For Purchase (event 5), the server-side event typically fires first (from the callback) and the browser event fires when the donor returns. This delay (seconds to minutes) is within the 48-hour window.

### What happens if deduplication fails
- **Both fires arrive, no matching event_id**: Meta counts TWO conversions (inflated ROAS)
- **Only server fire arrives** (browser blocked): Meta counts ONE conversion correctly (this is the expected ad-blocker scenario)
- **Only browser fire arrives** (callback failed): Meta counts ONE conversion, but with less accurate matching data (no server-side IP/UA)
- **Neither fires**: Conversion is lost

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRACKING_ENABLED` | Yes | Master switch (`true`/`false`). If false, all tracking is skipped |
| `FB_PIXEL_ID` | For Meta | Meta Pixel ID (numeric string) |
| `FB_ACCESS_TOKEN` | For Meta | Meta CAPI access token (from Events Manager > Settings > Generate Access Token) |
| `TIKTOK_PIXEL_ID` | For TikTok | TikTok Pixel ID |
| `TIKTOK_ACCESS_TOKEN` | For TikTok | TikTok Events API access token |

All variables are set in the **campaign** `.env` only. The store has no tracking variables.

---

## Debugging

### Meta Events Manager
1. Go to Events Manager > Data Sources > Select your Pixel
2. Click "Test Events" tab
3. Enter the campaign URL and open it in a new tab
4. Perform the donation flow
5. Events should appear in real-time with:
   - "Browser" label for pixel events
   - "Server" label for CAPI events
   - Matching `event_id` for both (visible in event details)

### TikTok Events Manager
1. Go to Events Manager > Web Events > Select your pixel
2. Click "Diagnostics" or "Event Activity" tab
3. Look for `CompletePayment` events with matching event_ids

### Common Issues

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Browser events missing | Ad blocker, consent manager blocking | Expected — server events still fire |
| Server events missing | `TRACKING_ENABLED=false` or invalid tokens | Check campaign `.env` |
| Purchase counted twice | event_id mismatch between browser and server | Verify `_purchase_event_id` flows through sessionStorage correctly |
| Purchase not counted | Both fires failed | Check callback delivery (campaign server logs) and sessionStorage persistence |
| No events at all | Tracking not initialized | Check `GET /api/tracking/config` returns `enabled: true` |
| Meta CAPI rejected | Bad access token or expired | Regenerate token in Events Manager |
| TikTok events fail | Wrong pixel ID or expired token | Check TikTok Business Center |
| Location data missing | ipapi.co rate limited or blocked | Non-critical — events fire without it, but enhanced matching quality drops |
| Click IDs not captured | fbclid/ttclid not in URL | Only present when users arrive from ad clicks — organic traffic won't have them |

### Server-Side Logging
The campaign server logs CAPI results:
- `Meta CAPI: Purchase → sent` — event accepted
- `Meta CAPI: Purchase REJECTED` — event rejected (check response body)
- `Meta CAPI: Purchase FAILED with exception` — network error

### Verifying the Full Purchase Dedup Chain
1. Set a breakpoint in `initDonationRedirect()` — confirm `_purchase_event_id` is set in sessionStorage
2. Check the Supabase `checkout_sessions` table — confirm `tracking.eventId` matches
3. Check campaign server logs on callback — confirm the server CAPI fires with the same event_id
4. Check browser console on return — confirm `Tracking.trackPurchase()` fires with the same event_id
5. Check Meta Events Manager — confirm one Purchase with "Browser" and one with "Server" labels, same event_id
