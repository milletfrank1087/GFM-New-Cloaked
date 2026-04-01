/**
 * Browser-Side Tracking Module
 * Handles pixel events and server-side proxy for CAPI
 */

const Tracking = (function() {
  let config = null;
  let initialized = false;
  let clientLocation = null;
  let serverFbp = null;

  /**
   * Get cookie value by name
   */
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop().split(';').shift();
    }
    return null;
  }

  /**
   * Set cookie with expiration
   */
  function setCookie(name, value, days) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value}; max-age=${maxAge}; path=/; SameSite=Lax`;
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

  let locationPromise = null;
  
  /**
   * Fetch client IP and location from ipapi.co
   */
  async function fetchClientLocation() {
    if (locationPromise) return locationPromise;
    
    locationPromise = (async () => {
      try {
        const response = await fetch('https://ipapi.co/json/', {
          signal: AbortSignal.timeout(3000)
        });
        const data = await response.json();
        if (data && data.ip) {
          clientLocation = {
            ip: data.ip,
            city: data.city || null,
            region: data.region || null,
            country: data.country_name || null,
            countryCode: data.country_code || null
          };
        }
      } catch (error) {
        // Silent fail - location is optional
      }
      return clientLocation;
    })();
    
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
    
    let fbp = getCookie('_fbp');
    if (!fbp && typeof config !== 'undefined' && config && config.fbp) {
      fbp = config.fbp;
    }
    
    return {
      fbp: fbp || null,
      fbc: getCookie('_fbc') || null,
      fbclid: urlParams.get('fbclid') || getCookie('_fbclid') || null,
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
        data: eventData.data || {}
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
      if (data.contentName) {
        metaParams.content_name = data.contentName;
        tiktokParams.contents[0].content_name = data.contentName;
      }
      if (data.contentType) {
        metaParams.content_type = data.contentType;
      }
    }

    fireMetaPixel(mapping.meta, metaParams, eventId);
    fireTikTokPixel(mapping.tiktok, tiktokParams, eventId);

    sendToServer(eventName, {
      eventId: eventId,
      data: data || {}
    });

    return eventId;
  }

  /**
   * Track PageView event - fires browser pixels immediately, server call waits for location
   */
  function trackPageView() {
    const eventId = generateEventId('PageView');
    fireMetaPixel('PageView', {}, eventId);
    return eventId;
  }

  /**
   * Track ViewContent event - this is the main "new visitor" event for server logs
   * Waits for location before sending to server
   */
  async function trackViewContent(data) {
    const eventId = generateEventId('ViewContent');
    
    fireMetaPixel('ViewContent', data ? { content_type: data.contentType } : {}, eventId);
    fireTikTokPixel('ViewContent', {
      content_type: 'product',
      content_id: 'donation',
      contents: [{ content_id: 'donation', content_type: 'product', content_name: 'Donation', quantity: 1, price: 0 }]
    }, eventId);
    
    await waitForLocation(2000);
    
    sendToServer('ViewContent', {
      eventId: eventId,
      data: data || {}
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
      content_name: data.contentName || 'Donation',
      content_type: 'product'
    };

    const tiktokParams = {
      value: data.value,
      currency: data.currency || 'EUR',
      content_type: 'product',
      content_id: 'donation',
      contents: [{
        content_id: 'donation',
        content_type: 'product',
        content_name: data.contentName || 'Donation',
        quantity: 1,
        price: data.value
      }]
    };

    if (data.email) {
      const hashedEmail = await hashEmail(data.email);
      if (hashedEmail) {
        metaParams.em = hashedEmail;
        tiktokParams.email = hashedEmail;
      }
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

    try {
      const response = await fetch('/api/tracking/config');
      if (response.ok) {
        config = await response.json();
      }
    } catch (e) {
      console.warn('Failed to load tracking config');
    }

    captureClickIds();
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
    getClientLocation: getClientLocation,
    track: track,
    trackPageView: trackPageView,
    trackViewContent: trackViewContent,
    trackAddToCart: trackAddToCart,
    trackInitiateCheckout: trackInitiateCheckout,
    trackAddPaymentInfo: trackAddPaymentInfo,
    trackPurchase: trackPurchase,
    trackPaymentEvent: trackPaymentEvent
  };
})();

if (typeof window !== 'undefined') {
  window.Tracking = Tracking;
}
