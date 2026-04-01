/**
 * Server-Side Tracking Module
 * Handles Meta Conversions API and TikTok Events API
 */

const crypto = require('crypto');

const META_API_VERSION = 'v20.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

function getConfig() {
  return {
    TRACKING_ENABLED: process.env.TRACKING_ENABLED === 'true',
    FB_PIXEL_ID: process.env.FB_PIXEL_ID,
    FB_ACCESS_TOKEN: process.env.FB_ACCESS_TOKEN,
    TIKTOK_PIXEL_ID: process.env.TIKTOK_PIXEL_ID,
    TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN
  };
}

/**
 * Hash a value using SHA256 (required for PII in CAPI)
 */
function hashSHA256(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Parse full name into first and last name
 */
function parseName(fullName) {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1]
  };
}

/**
 * Build Meta user_data object from available data
 */
function buildMetaUserData(userData, clientInfo) {
  const result = {};

  if (userData.email) {
    result.em = [hashSHA256(userData.email)];
  }

  if (userData.firstName) {
    result.fn = [hashSHA256(userData.firstName)];
  }

  if (userData.lastName) {
    result.ln = [hashSHA256(userData.lastName)];
  }

  if (userData.externalId) {
    result.external_id = [hashSHA256(userData.externalId)];
  }

  if (clientInfo.ipAddress && clientInfo.ipAddress !== 'unknown') {
    result.client_ip_address = clientInfo.ipAddress;
  }

  if (clientInfo.userAgent && clientInfo.userAgent !== 'unknown') {
    result.client_user_agent = clientInfo.userAgent;
  }

  if (userData.fbp) {
    result.fbp = userData.fbp;
  }

  if (userData.fbc) {
    result.fbc = userData.fbc;
  }

  if (!result.external_id && userData.email) {
    result.external_id = [hashSHA256(userData.email)];
  }

  if (clientInfo.clientLocation) {
    if (clientInfo.clientLocation.city) {
      result.ct = [hashSHA256(clientInfo.clientLocation.city.toLowerCase().replace(/\s+/g, ''))];
    }
    if (clientInfo.clientLocation.countryCode) {
      result.country = [hashSHA256(clientInfo.clientLocation.countryCode.toLowerCase())];
    }
  }

  return result;
}

/**
 * Build TikTok user object from available data
 */
function buildTikTokUser(userData, clientInfo) {
  const result = {};

  if (userData.email) {
    result.email = hashSHA256(userData.email);
  }

  if (userData.firstName) {
    result.first_name = hashSHA256(userData.firstName);
  }

  if (userData.lastName) {
    result.last_name = hashSHA256(userData.lastName);
  }

  if (userData.externalId) {
    result.external_id = hashSHA256(userData.externalId);
  }

  if (userData.ttp) {
    result.ttp = userData.ttp;
  }

  if (userData.ttclid) {
    result.ttclid = userData.ttclid;
  }

  if (clientInfo.ipAddress && clientInfo.ipAddress !== 'unknown') {
    result.ip = clientInfo.ipAddress;
  }

  if (clientInfo.userAgent && clientInfo.userAgent !== 'unknown') {
    result.user_agent = clientInfo.userAgent;
  }

  if (clientInfo.clientLocation) {
    if (clientInfo.clientLocation.city) {
      result.city = clientInfo.clientLocation.city.toLowerCase().trim();
    }
    if (clientInfo.clientLocation.countryCode) {
      result.country = clientInfo.clientLocation.countryCode.toLowerCase();
    }
  }

  return result;
}

/**
 * Send event to Meta Conversions API
 */
async function sendMetaEvent(eventName, eventData, userData, clientInfo) {
  const { FB_PIXEL_ID, FB_ACCESS_TOKEN } = getConfig();
  
  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
    console.log('⚠️ Meta CAPI not configured, skipping');
    return null;
  }

  try {
    const eventTime = Math.floor(Date.now() / 1000);
    const metaUserData = buildMetaUserData(userData, clientInfo);

    const payload = {
      data: [{
        event_name: eventName,
        event_time: eventTime,
        event_id: eventData.eventId,
        event_source_url: eventData.sourceUrl || 'https://hoperise.online/',
        action_source: 'website',
        user_data: metaUserData
      }]
    };

    if (eventData.customData) {
      payload.data[0].custom_data = eventData.customData;
    }

    const url = `${META_API_BASE}/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.events_received) {
      return result;
    } else {
      console.error(`❌ Meta CAPI: ${eventName} REJECTED`);
      console.error(`   Response:`, JSON.stringify(result));
      return null;
    }
  } catch (error) {
    console.error(`❌ Meta CAPI: ${eventName} FAILED with exception:`, error.message);
    return null;
  }
}

/**
 * Send event to TikTok Events API
 */
async function sendTikTokEvent(eventName, eventData, userData, clientInfo) {
  const { TIKTOK_PIXEL_ID, TIKTOK_ACCESS_TOKEN } = getConfig();
  
  if (!TIKTOK_PIXEL_ID || !TIKTOK_ACCESS_TOKEN) {
    return null;
  }

  try {
    const tikTokUser = buildTikTokUser(userData, clientInfo);
    const eventTime = Math.floor(Date.now() / 1000);

    const eventPayload = {
      event: eventName,
      event_time: eventTime,
      event_id: eventData.eventId,
      user: tikTokUser,
      page: {
        url: eventData.sourceUrl || 'https://hoperise.online/'
      }
    };

    if (eventData.properties) {
      eventPayload.properties = eventData.properties;
    }

    const payload = {
      event_source: 'web',
      event_source_id: TIKTOK_PIXEL_ID,
      data: [eventPayload]
    };

    const response = await fetch(`${TIKTOK_API_BASE}/event/track/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': TIKTOK_ACCESS_TOKEN
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.code === 0) {
      return result;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Map event names between platforms
 */
const EVENT_MAP = {
  PageView: { meta: 'PageView', tiktok: 'Pageview' },
  ViewContent: { meta: 'ViewContent', tiktok: 'ViewContent' },
  AddToCart: { meta: 'AddToCart', tiktok: 'AddToCart' },
  InitiateCheckout: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout' },
  AddPaymentInfo: { meta: 'AddPaymentInfo', tiktok: 'AddPaymentInfo' },
  Purchase: { meta: 'Purchase', tiktok: 'CompletePayment' }
};

/**
 * Track any event to both platforms
 */
async function trackEvent(eventName, eventData, userData, clientInfo) {
  const mapping = EVENT_MAP[eventName];
  if (!mapping) {
    console.warn(`Unknown event: ${eventName}`);
    return { meta: null, tiktok: null };
  }

  const metaCustomData = {};
  const tiktokProperties = {};

  if (eventData.value !== undefined) {
    metaCustomData.value = eventData.value;
    metaCustomData.currency = eventData.currency || 'EUR';
    tiktokProperties.value = eventData.value;
    tiktokProperties.currency = eventData.currency || 'EUR';
  }

  if (eventData.contentName) {
    metaCustomData.content_name = eventData.contentName;
  }

  if (eventData.contentType) {
    metaCustomData.content_type = eventData.contentType;
  }

  tiktokProperties.content_type = 'product';
  tiktokProperties.content_id = eventData.contentId || 'donation';
  tiktokProperties.contents = [{
    content_id: eventData.contentId || 'donation',
    content_type: 'product',
    content_name: eventData.contentName || 'Donation',
    quantity: 1,
    price: eventData.value || 0
  }];

  if (eventData.orderId) {
    metaCustomData.order_id = eventData.orderId;
  }

  const metaEventData = {
    eventId: eventData.eventId,
    sourceUrl: eventData.sourceUrl,
    customData: Object.keys(metaCustomData).length > 0 ? metaCustomData : undefined
  };

  const tiktokEventData = {
    eventId: eventData.eventId,
    sourceUrl: eventData.sourceUrl,
    properties: Object.keys(tiktokProperties).length > 0 ? tiktokProperties : undefined
  };

  const tiktokPromise = eventName === 'PageView' 
    ? Promise.resolve(null)
    : sendTikTokEvent(mapping.tiktok, tiktokEventData, userData, clientInfo);

  const [metaResult, tiktokResult] = await Promise.all([
    sendMetaEvent(mapping.meta, metaEventData, userData, clientInfo),
    tiktokPromise
  ]);

  return { 
    meta: metaResult?.events_received ? '✓' : '✗',
    tiktok: eventName === 'PageView' ? '-' : (tiktokResult?.code === 0 ? '✓' : '✗'),
    rawMeta: metaResult,
    rawTiktok: tiktokResult
  };
}

/**
 * Track Purchase event with full payment data
 */
async function trackPurchase(paymentData, trackingData, clientInfo) {
  const { firstName, lastName } = parseName(paymentData.cardHolderName || paymentData.donorNameReal);

  const userData = {
    email: paymentData.donorEmail || paymentData.payerEmail || null,
    firstName: firstName,
    lastName: lastName,
    externalId: paymentData.customerId || null,
    fbp: trackingData.fbp || null,
    fbc: trackingData.fbc || null,
    ttp: trackingData.ttp || null,
    ttclid: trackingData.ttclid || null
  };

  const eventData = {
    eventId: trackingData.eventId || paymentData.captureId,
    sourceUrl: trackingData.sourceUrl || 'https://hoperise.online/',
    value: paymentData.amount,
    currency: paymentData.currency || 'EUR',
    contentName: `${paymentData.donationType === 'monthly' ? 'Monthly' : 'One-time'} Donation`,
    contentType: 'product',
    orderId: paymentData.captureId
  };

  return trackEvent('Purchase', eventData, userData, clientInfo);
}

/**
 * Get tracking configuration for client
 */
function getTrackingConfig() {
  const { TRACKING_ENABLED, FB_PIXEL_ID, TIKTOK_PIXEL_ID } = getConfig();
  return {
    fbPixelId: TRACKING_ENABLED ? (FB_PIXEL_ID || null) : null,
    tiktokPixelId: TRACKING_ENABLED ? (TIKTOK_PIXEL_ID || null) : null,
    enabled: TRACKING_ENABLED && !!(FB_PIXEL_ID || TIKTOK_PIXEL_ID)
  };
}

/**
 * Check if tracking is configured and enabled
 */
function isTrackingEnabled() {
  const { TRACKING_ENABLED, FB_PIXEL_ID, TIKTOK_PIXEL_ID } = getConfig();
  return TRACKING_ENABLED && !!(FB_PIXEL_ID || TIKTOK_PIXEL_ID);
}

module.exports = {
  trackEvent,
  trackPurchase,
  getTrackingConfig,
  isTrackingEnabled
};
