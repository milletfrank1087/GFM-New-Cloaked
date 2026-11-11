/**
 * Browser-Side Tracking Module
 * Handles pixel events and server-side proxy for CAPI
 */

const Tracking = (function() {
  let config = null;
  let initialized = false;
  let clientLocation = null;
  let serverFbp = null;

  let cachedEmailHash = null;
  let completedReturn = null;

  // ---- Meta-safe content_name -------------------------------------------------
  // Mirrors campaign/lib/tracking/contentName.js. Meta Business Tools Terms forbid
  // health data in event parameters; a slug like "glioblastoma-grace" gets flagged.
  // content_name must be an opaque per-campaign code instead.
  const OPAQUE_CONTENT_IDS = {
    'glioblastoma-grace': 'UK01',
    'glioblastoma-mariana': 'PT01',
    'glioblastoma-serafina': 'IT01',
    'glioblastoma-lucia': 'ES01',
    'glioblastoma-olivia': 'CA01',
    'glioblastoma-mia': 'AU01',
    'glioblastoma-sofia': 'GR01',
    'glioblastoma-emily': 'US01',
    'glioblastome-chloe': 'FR01',
    'glejak-natalia': 'PL01',
    'leucemia-carmen': 'SA01',
    'dipg-willow': 'UK02'
  };

  const HEALTH_TOKENS = [
    'glioblastom', 'glioblastome', 'glejak', 'leucemi', 'leukemi', 'dipg',
    'tumour', 'tumor', 'cancer', 'brain', 'carcinom', 'sarkom', 'lymphom',
    'melanom', 'metasta', 'oncolog', 'chemo'
  ];

  const GENERIC_VALUES = ['One-time Donation', 'Monthly Donation', 'Donation'];

  function looksHealthRelated(value) {
    const s = String(value).toLowerCase();
    return HEALTH_TOKENS.some(function (token) { return s.indexOf(token) !== -1; });
  }

  function sanitizeContentName(value) {
    if (!value) return 'Donation';
    const raw = String(value).trim();
    if (!raw) return 'Donation';
    const code = OPAQUE_CONTENT_IDS[raw.toLowerCase()];
    if (code) return code;
    if (GENERIC_VALUES.indexOf(raw) !== -1) return raw;
    if (!looksHealthRelated(raw)) return raw;
    const scrubbed = raw.split(/[-_\s]+/).filter(function (part) {
      return part && !looksHealthRelated(part);
    }).join('-');
    return scrubbed ? 'C-' + scrubbed : 'Donation';
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      const raw = parts.pop().split(';').shift();
      try { return decodeURIComponent(raw); } catch (_) { return raw; }
    }
    return null;
  }

  function setCookie(name, value, days) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  /**
   * Generate unique event ID for deduplication
   */
  function generateEventId(eventName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `${eventName}_${timestamp}_${random}`;
  }

  /**
   * Hash email with SHA-256 for Meta Pixel Advanced Matching
   */
  async function hashEmail(email) {
    if (!email || !window.crypto || !window.crypto.subtle) {
      return null;
    }
    try {
      const normalized = email.toLowerCase().trim();
      const msgBuffer = new TextEncoder().encode(normalized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (e) {
      console.warn('Email hashing failed:', e);
      return null;
    }
  }

  async function setUserEmail(email) {
    if (!email) return null;
    const hash = await hashEmail(email);
    if (hash) {
      cachedEmailHash = hash;
      try { sessionStorage.setItem('_user_email_hash', hash); } catch (_) {}
    }
    return hash;
  }

  function getUserEmailHash() {
    if (cachedEmailHash) return cachedEmailHash;
    try {
      const stored = sessionStorage.getItem('_user_email_hash');
      if (stored) { cachedEmailHash = stored; return stored; }
    } catch (_) {}
    return null;
  }

  /**
   * Capture click IDs, UTM parameters, and referral codes from URL
   */
  function captureClickIds() {
    const params = new URLSearchParams(window.location.search);

    const fbclid = params.get('fbclid');
    if (fbclid) {
      let existingFbc = getCookie('_fbc');
      if (!existingFbc || !existingFbc.includes(fbclid)) {
        const timestamp = Date.now();
        const fbc = `fb.1.${timestamp}.${fbclid}`;
        setCookie('_fbc', fbc, 90);
        setCookie('_fbclid', fbclid, 90);
      }
    }

    const ttclid = params.get('ttclid');
    if (ttclid) {
      setCookie('_ttclid', ttclid, 90);
    }

    const ref = params.get('ref');
    if (ref) {
      sessionStorage.setItem('_hr_ref', ref);
      setCookie('_hr_ref', ref, 7);
    }

    const utmParams = {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      utm_term: params.get('utm_term')
    };
    
    if (Object.values(utmParams).some(v => v !== null)) {
      const existing = sessionStorage.getItem('utm_data');
      if (!existing) {
        sessionStorage.setItem('utm_data', JSON.stringify(utmParams));
        setCookie('_utm_data', JSON.stringify(utmParams), 90);
      }
    }
  }

  function scrubCompletionQuery() {
    const url = new URL(window.location.href);
    if (url.searchParams.get('status') !== 'complete') return;

    completedReturn = {
      eventId: url.searchParams.get('eid'),
      amount: parseFloat(url.searchParams.get('amt') || '0'),
      currency: url.searchParams.get('cur')
    };

    ['status', 'eid', 'amt', 'cur'].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  let locationPromise = null;
  
  /**
   * Location is resolved server-side from the connection IP (geoip-lite).
   * The old ipapi.co call was rate-limited (HTTP 429) for many visitors, so the
   * browser no longer looks it up; clientLocation stays null and the server fills it.
   */
  async function fetchClientLocation() {
    if (!locationPromise) locationPromise = Promise.resolve(clientLocation);
    return locationPromise;
  }

  /**
   * Get client location (cached)
   */
  function getClientLocation() {
    return clientLocation;
  }
  
  /**
   * Wait for location to be ready (with timeout)
   */
  async function waitForLocation(timeoutMs = 2000) {
    if (clientLocation) return clientLocation;
    
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs));
    return Promise.race([locationPromise || fetchClientLocation(), timeout]);
  }

  /**
   * Get all tracking cookies and attribution data
   */
  function getTrackingData() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlUtms = {
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_content: urlParams.get('utm_content'),
      utm_term: urlParams.get('utm_term')
    };
    
    const hasUrlUtms = Object.values(urlUtms).some(v => v !== null);
    
    let storedUtmData = {};
    if (!hasUrlUtms) {
      try {
        storedUtmData = JSON.parse(sessionStorage.getItem('utm_data') || '{}');
      } catch (e) {}
      
      if (Object.keys(storedUtmData).length === 0) {
        try {
          const cookieData = getCookie('_utm_data');
          if (cookieData) {
            storedUtmData = JSON.parse(cookieData);
          }
        } catch (e) {}
      }
    }
    
    const utmData = hasUrlUtms ? urlUtms : storedUtmData;
    
    // _fbc can be missing (cookie blocked, or checkout before init finished) even though
    // fbclid is in the URL. Build it the way the pixel does, keeping the first-seen time.
    let fbc = getCookie('_fbc');
    const fbclid = urlParams.get('fbclid') || getCookie('_fbclid');
    if (!fbc && fbclid) {
      let ts = null;
      try { ts = sessionStorage.getItem('_fbclid_ts'); } catch (_) {}
      if (!ts) {
        ts = String(Date.now());
        try { sessionStorage.setItem('_fbclid_ts', ts); } catch (_) {}
      }
      fbc = `fb.1.${ts}.${fbclid}`;
    }

    let fbp = getCookie('_fbp');
    if (!fbp && typeof config !== 'undefined' && config && config.fbp) {
      fbp = config.fbp;
    }
    
    return {
      fbp: fbp || null,
      fbc: fbc || null,
      fbclid: fbclid || null,
      ttp: getCookie('_ttp') || null,
      ttclid: urlParams.get('ttclid') || getCookie('_ttclid') || null,
      sourceUrl: window.location.href,
      utm_source: utmData.utm_source || null,
      utm_medium: utmData.utm_medium || null,
      utm_campaign: utmData.utm_campaign || null,
      utm_content: utmData.utm_content || null,
      utm_term: utmData.utm_term || null,
      referrer: document.referrer || null,
      ref_code: sessionStorage.getItem('_hr_ref') || getCookie('_hr_ref') || null
    };
  }

  /**
   * Send event to server for CAPI processing
   */
  async function sendToServer(eventName, eventData) {
    try {
      const trackingData = getTrackingData();
      const emailHash = getUserEmailHash();
      const payload = {
        event: eventName,
        eventId: eventData.eventId,
        sourceUrl: trackingData.sourceUrl,
        cookies: {
          fbp: trackingData.fbp,
          fbc: trackingData.fbc,
          ttp: trackingData.ttp,
          ttclid: trackingData.ttclid
        },
        clientLocation: clientLocation,
        data: {
          ...(eventData.data || {}),
          emailHash: emailHash || undefined
        }
      };

      const response = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn('Tracking server error:', response.status);
      }
    } catch (error) {
      console.warn('Tracking send failed:', error.message);
    }
  }

  /**
   * Fire browser pixel event (Meta)
   */
  function fireMetaPixel(eventName, params, eventId) {
    if (typeof fbq !== 'undefined') {
      try {
        if (params && Object.keys(params).length > 0) {
          fbq('track', eventName, params, { eventID: eventId });
        } else {
          fbq('track', eventName, {}, { eventID: eventId });
        }
      } catch (e) {
        console.warn('Meta pixel error:', e.message);
      }
    }
  }

  /**
   * Fire browser pixel event (TikTok)
   */
  function fireTikTokPixel(eventName, params, eventId) {
    if (typeof ttq !== 'undefined') {
      try {
        if (eventName === 'Pageview') {
          return;
        }
        const ttParams = params ? { ...params, event_id: eventId } : { event_id: eventId };
        ttq.track(eventName, ttParams);
      } catch (e) {
        console.warn('TikTok pixel error:', e.message);
      }
    }
  }

  /**
   * Track event to all platforms (browser + server)
   */
  function track(eventName, data) {
    const eventId = generateEventId(eventName);
    const eventMapping = {
      PageView: { meta: 'PageView', tiktok: 'Pageview' },
      ViewContent: { meta: 'ViewContent', tiktok: 'ViewContent' },
      AddToCart: { meta: 'AddToCart', tiktok: 'AddToCart' },
      InitiateCheckout: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout' },
      AddPaymentInfo: { meta: 'AddPaymentInfo', tiktok: 'AddPaymentInfo' },
      Purchase: { meta: 'Purchase', tiktok: 'CompletePayment' }
    };

    const mapping = eventMapping[eventName];
    if (!mapping) {
      console.warn('Unknown tracking event:', eventName);
      return eventId;
    }

    const metaParams = {};
    const tiktokParams = {
      content_type: 'product',
      content_id: 'donation',
      contents: [{
        content_id: 'donation',
        content_type: 'product',
        content_name: 'Donation',
        quantity: 1,
        price: data?.value || 0
      }]
    };
    
    if (data) {
      if (data.value !== undefined) {
        metaParams.value = data.value;
        metaParams.currency = data.currency || 'EUR';
        tiktokParams.value = data.value;
        tiktokParams.currency = data.currency || 'EUR';
        tiktokParams.contents[0].price = data.value;
      }
      if (data.contentName || window.__CAMPAIGN_DATA?.id) {
        const safeName = sanitizeContentName(data.contentName || window.__CAMPAIGN_DATA.id);
        metaParams.content_name = safeName;
        metaParams.content_ids = [safeName];
        tiktokParams.contents[0].content_name = safeName;
      }
      if (data.contentType) {
        metaParams.content_type = 'product';
      }
    }

    fireMetaPixel(mapping.meta, metaParams, eventId);
    fireTikTokPixel(mapping.tiktok, tiktokParams, eventId);

    // The server sanitizes again; forward the resolved slug so it can also match.
    sendToServer(eventName, {
      eventId: eventId,
      data: {
        ...(data || {}),
        contentName: metaParams.content_name || (data && data.contentName) || null
      }
    });

    return eventId;
  }

  /**
   * Track PageView event - fires browser pixels immediately, server call waits for location
   */
  function trackPageView() {
    const eventId = generateEventId('PageView');
    fireMetaPixel('PageView', {}, eventId);
    sendToServer('PageView', { eventId, data: {} });
    return eventId;
  }

  /**
   * Track ViewContent event - this is the main "new visitor" event for server logs
   * Waits for location before sending to server
   */
  async function trackViewContent(data) {
    const eventId = generateEventId('ViewContent');

    // Fall back to the active campaign id so the generic template can't collapse
    // every campaign into a single "Donation" bucket.
    const requested = (data && data.contentName) ||
      (window.__CAMPAIGN_DATA && window.__CAMPAIGN_DATA.id) || null;
    const safeName = sanitizeContentName(requested);
    fireMetaPixel('ViewContent', {
      content_name: safeName,
      content_ids: [safeName],
      content_type: 'product'
    }, eventId);
    fireTikTokPixel('ViewContent', {
      content_type: 'product',
      content_id: 'donation',
      contents: [{ content_id: 'donation', content_type: 'product', content_name: safeName, quantity: 1, price: 0 }]
    }, eventId);
    
    await waitForLocation(2000);
    
    sendToServer('ViewContent', {
      eventId: eventId,
      data: { ...(data || {}), contentName: safeName }
    });
    
    return eventId;
  }

  /**
   * Track AddToCart event (modal open)
   */
  function trackAddToCart(data) {
    return track('AddToCart', data);
  }

  /**
   * Track InitiateCheckout event (continue to payment)
   */
  function trackInitiateCheckout(data) {
    return track('InitiateCheckout', data);
  }

  /**
   * Track AddPaymentInfo event (payment method interaction)
   */
  function trackAddPaymentInfo(data) {
    return track('AddPaymentInfo', data);
  }

  /**
   * Track Purchase event (payment complete)
   */
  async function trackPurchase(data, eventId) {
    const finalEventId = eventId || generateEventId('Purchase');
    const eventMapping = { meta: 'Purchase', tiktok: 'CompletePayment' };

    const metaParams = {
      value: data.value,
      currency: data.currency || 'EUR',
      content_name: sanitizeContentName(data.contentName || window.__CAMPAIGN_DATA?.id),
      content_type: 'product'
    };
    metaParams.content_ids = [metaParams.content_name];

    const tiktokParams = {
      value: data.value,
      currency: data.currency || 'EUR',
      content_type: 'product',
      content_id: 'donation',
      contents: [{
        content_id: 'donation',
        content_type: 'product',
        content_name: metaParams.content_name,
        quantity: 1,
        price: data.value
      }]
    };

    let hashedEmail = null;
    if (data.email) {
      hashedEmail = await setUserEmail(data.email);
    } else {
      hashedEmail = getUserEmailHash();
    }
    if (hashedEmail) {
      // Advanced matching: re-init with user data. As an event param Meta treats it as custom data.
      if (typeof fbq !== 'undefined' && config && config.fbPixelId) {
        try { fbq('init', config.fbPixelId, { em: hashedEmail }); } catch (_) {}
      }
      tiktokParams.email = hashedEmail;
    }

    fireMetaPixel(eventMapping.meta, metaParams, finalEventId);
    fireTikTokPixel(eventMapping.tiktok, tiktokParams, finalEventId);

    return finalEventId;
  }

  /**
   * Track payment-related events (cancellations, errors, abandonment)
   * @param {string} eventType - Event type (paypal_cancel, card_error, etc.)
   * @param {object} data - Optional data (amount, paymentMethod, details)
   */
  function trackPaymentEvent(eventType, data = {}) {
    try {
      fetch('/api/track/payment-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: eventType,
          details: data.details || null,
          amount: data.amount || null,
          paymentMethod: data.paymentMethod || null,
          clientLocation: clientLocation
        })
      }).catch(() => {});
    } catch (e) {
      // Silent fail
    }
  }

  /**
   * Initialize tracking module
   */
  async function init() {
    if (initialized) return;

    scrubCompletionQuery();
    captureClickIds();

    try {
      const response = await fetch('/api/tracking/config');
      if (response.ok) {
        config = await response.json();
      }
    } catch (e) {
      console.warn('Failed to load tracking config');
    }

    fetchClientLocation();
    initialized = true;
    console.log('📊 Tracking initialized');
  }

  return {
    init: init,
    getCookie: getCookie,
    setCookie: setCookie,
    generateEventId: generateEventId,
    getTrackingData: getTrackingData,
    getCompletedReturn: () => completedReturn,
    getClientLocation: getClientLocation,
    track: track,
    trackPageView: trackPageView,
    trackViewContent: trackViewContent,
    trackAddToCart: trackAddToCart,
    trackInitiateCheckout: trackInitiateCheckout,
    trackAddPaymentInfo: trackAddPaymentInfo,
    trackPurchase: trackPurchase,
    trackPaymentEvent: trackPaymentEvent,
    setUserEmail: setUserEmail,
    getUserEmailHash: getUserEmailHash
  };
})();

if (typeof window !== 'undefined') {
  window.Tracking = Tracking;
}
