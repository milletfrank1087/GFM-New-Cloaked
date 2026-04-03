const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const isPayPalLive = PAYPAL_MODE === 'live' || PAYPAL_MODE === 'production';

const PAYPAL_CLIENT_ID = isPayPalLive
  ? process.env.PAYPAL_LIVE_CLIENT_ID || process.env.PAYPAL_CLIENT_ID
  : process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;

const PAYPAL_SECRET = isPayPalLive
  ? process.env.PAYPAL_LIVE_SECRET || process.env.PAYPAL_SECRET
  : process.env.PAYPAL_SANDBOX_SECRET || process.env.PAYPAL_SECRET;

const PAYPAL_API_BASE = isPayPalLive
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedPayPalToken = null;
let paypalTokenExpiry = 0;
let paypalTokenPromise = null;

async function getPayPalAccessToken() {
  if (cachedPayPalToken && Date.now() < paypalTokenExpiry) {
    return cachedPayPalToken;
  }
  if (paypalTokenPromise) {
    return paypalTokenPromise;
  }
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
    throw new Error('PayPal credentials not configured');
  }
  paypalTokenPromise = (async () => {
    try {
      const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
      const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      const data = await response.json();
      if (data.access_token) {
        cachedPayPalToken = data.access_token;
        paypalTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        return cachedPayPalToken;
      }
      throw new Error('Failed to get PayPal access token');
    } finally {
      paypalTokenPromise = null;
    }
  })();
  return paypalTokenPromise;
}

module.exports = {
  PAYPAL_MODE,
  isPayPalLive,
  PAYPAL_CLIENT_ID,
  PAYPAL_SECRET,
  PAYPAL_API_BASE,
  getPayPalAccessToken,
};
