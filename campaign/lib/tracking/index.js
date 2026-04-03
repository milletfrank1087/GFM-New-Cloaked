const crypto = require('crypto');
const { sendMetaEvent } = require('./meta');
const { sendTikTokEvent } = require('./tiktok');

function getConfig() {
  return {
    TRACKING_ENABLED: process.env.TRACKING_ENABLED === 'true',
    FB_PIXEL_ID: process.env.FB_PIXEL_ID,
    FB_ACCESS_TOKEN: process.env.FB_ACCESS_TOKEN,
    TIKTOK_PIXEL_ID: process.env.TIKTOK_PIXEL_ID,
    TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN
  };
}

function hashSHA256(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

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

const helpers = { getConfig, hashSHA256 };

const EVENT_MAP = {
  PageView: { meta: 'PageView', tiktok: 'Pageview' },
  ViewContent: { meta: 'ViewContent', tiktok: 'ViewContent' },
  AddToCart: { meta: 'AddToCart', tiktok: 'AddToCart' },
  InitiateCheckout: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout' },
  AddPaymentInfo: { meta: 'AddPaymentInfo', tiktok: 'AddPaymentInfo' },
  Purchase: { meta: 'Purchase', tiktok: 'CompletePayment' }
};

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
    : sendTikTokEvent(mapping.tiktok, tiktokEventData, userData, clientInfo, helpers);

  const [metaResult, tiktokResult] = await Promise.all([
    sendMetaEvent(mapping.meta, metaEventData, userData, clientInfo, helpers),
    tiktokPromise
  ]);

  return { 
    meta: metaResult?.events_received ? '✓' : '✗',
    tiktok: eventName === 'PageView' ? '-' : (tiktokResult?.code === 0 ? '✓' : '✗'),
    rawMeta: metaResult,
    rawTiktok: tiktokResult
  };
}

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

function getTrackingConfig() {
  const { TRACKING_ENABLED, FB_PIXEL_ID, TIKTOK_PIXEL_ID } = getConfig();
  return {
    fbPixelId: TRACKING_ENABLED ? (FB_PIXEL_ID || null) : null,
    tiktokPixelId: TRACKING_ENABLED ? (TIKTOK_PIXEL_ID || null) : null,
    enabled: TRACKING_ENABLED && !!(FB_PIXEL_ID || TIKTOK_PIXEL_ID)
  };
}

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
