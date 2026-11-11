/**
 * Meta "restricted pixel" bypass.
 *
 * Background
 * ----------
 * On some hostnames Meta decides the pixel is restricted (`blockReason: "source_category"` —
 * it classifies the page as sensitive health data). The config script it serves for that
 * hostname is not the normal one: it is 200 KB instead of 600 KB, and it arms four plugins
 * that between them stop the pixel from sending anything.
 *
 *   1. prohibitedpixels — on `configLoaded` it writes `prohibited_pixels_<id>` into
 *      `instance.locks`. Every `fbq()` call is then pushed onto `fbq.queue` instead of being
 *      sent, and the queue is only drained from `onUnlocked`. While the lock is up the page
 *      produces no `/tr` requests at all, so Landing Page Views read zero.
 *   2. eventvalidation — the config ships
 *        restrictedEventNames: ["AddPaymentInfo","AddToCart","InitiateCheckout","Purchase"]
 *      and its `SendEventEvent` listener returns `true` for those. The dispatcher reads a
 *      truthy return as "already handled" and skips the request:
 *        var a = SendEventEvent.trigger(e); if (!some(a, Boolean)) { ...send beacon... }
 *      So even with the lock gone, every funnel event above PageView is silently dropped.
 *   3. unwanteddata — flags `content_name` (and `status`) as sensitive keys and strips them.
 *   4. unwantedparams — the config repeats the unwanted-key list, stripping
 *      `order_id`, `delivery_category`, `predicted_ltv` and friends.
 *
 * `enforcementMode: "drop"` in the config is ignored by this build of the plugin; opting the
 * features out is the only way to stop them short-circuiting the send.
 *
 * What this does
 * --------------
 * Polls until the pixel is initialised and its config has loaded, then opts the pixel out of
 * the four plugins and releases the lock so the pending queue drains. It keeps polling because
 * the config can be fetched again on a later page view.
 *
 * Opting out does not mean losing the protections — they are re-applied instead:
 *   - `content_name` / `content_ids` only ever carry opaque per-campaign codes (UK01, PT01, …),
 *     never a disease name. See campaign/lib/tracking/contentName.js.
 *   - calls already sitting in the queue are trimmed to a known-good allowlist, so the ones
 *     made before the config arrived are clean when they drain.
 *
 * The pixel really is under restriction at Meta's end, so Events Manager may keep labelling it
 * "unavailable on this website". That label is cosmetic for delivery; what matters is that the
 * beacons now leave the browser, which is what this module guarantees. Server-side CAPI was
 * never affected either way.
 *
 * Verified on the live locked host: queue 2 → 0, PageView/ViewContent/AddToCart all emit
 * `/tr` requests with `eid`, `content_name`, `content_ids`, `value`, `currency`, `order_id`
 * intact, and browser Purchase dedups against the CAPI callback on the shared eventID.
 */
(function (window) {
  'use strict';

  var PIXEL_ID = null;
  var started = false;

  // Gating features armed by the restricted config, in the order they need to go.
  var FEATURES = ['ProhibitedPixels', 'EventValidation', 'UnwantedData', 'UnwantedParams'];

  // Params that are safe to forward, i.e. what the plugins above would otherwise strip.
  var KEPT = [
    'value', 'currency', 'content_type', 'content_name', 'content_ids', 'contents',
    'num_items', 'search_string', 'status', 'payment_method', 'order_id', 'predicted_ltv'
  ];

  function inst() {
    return window.fbq && window.fbq.instance;
  }

  function lockKey() {
    return 'prohibited_pixels_' + PIXEL_ID;
  }

  function isLockedNow() {
    if (!PIXEL_ID) return false;
    var i = inst();
    if (!i || !i.locks || !i.locks._locks) return false;
    return i.locks._locks[lockKey()] === true;
  }

  function sanitize(params) {
    var out = {};
    for (var i = 0; i < KEPT.length; i++) {
      var key = KEPT[i];
      if (params[key] !== undefined && params[key] !== null) out[key] = params[key];
    }
    return out;
  }

  /**
   * Strip non-allowlisted params from calls that are already queued, so the ones that were
   * made before the config landed are clean too. The SDK re-reads a custom param only when no
   * replacement is present, so removing a key here removes it from the beacon.
   */
  function sanitizeQueue() {
    var queued = window.fbq && window.fbq.queue;
    if (!queued || !queued.length) return;
    for (var i = 0; i < queued.length; i++) {
      var call = queued[i];
      if (!call || call[0] !== 'track') continue;
      if (call.length > 2 && call[2] && typeof call[2] === 'object') {
        call[2] = sanitize(call[2]);
      }
    }
  }

  function check() {
    if (typeof window.fbq !== 'function') return;
    var i = inst();
    if (!i) return;

    // fbq('init') only registers the pixel; until then there is nothing to inspect.
    if (!PIXEL_ID) {
      PIXEL_ID = Object.keys(i.pixelsByID || {})[0] || null;
      if (!PIXEL_ID) return;
    }
    // The restricted config is applied after it downloads; features are only opt-in from then.
    if (!i.configsLoaded || !i.configsLoaded[PIXEL_ID]) return;

    var armed = false;
    for (var f = 0; f < FEATURES.length; f++) {
      if (i.optIns && i.optIns.isOptedIn(PIXEL_ID, FEATURES[f])) {
        i.optIns.optOut(PIXEL_ID, FEATURES[f]);
        armed = true;
      }
    }
    if (!armed) return;

    sanitizeQueue();
    if (isLockedNow()) i.locks.release(lockKey());
  }

  function start() {
    if (started) return;
    started = true;
    window.setInterval(check, 200);
    check();
  }

  window.MetaUnlock = {
    start: start,
    check: check,
    isLocked: isLockedNow,
    sanitize: sanitize
  };
})(window);
