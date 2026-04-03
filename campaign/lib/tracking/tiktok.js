const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

function buildTikTokUser(userData, clientInfo, { hashSHA256 }) {
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

async function sendTikTokEvent(eventName, eventData, userData, clientInfo, { getConfig, hashSHA256 }) {
  const { TIKTOK_PIXEL_ID, TIKTOK_ACCESS_TOKEN } = getConfig();
  
  if (!TIKTOK_PIXEL_ID || !TIKTOK_ACCESS_TOKEN) {
    return null;
  }

  try {
    const tikTokUser = buildTikTokUser(userData, clientInfo, { hashSHA256 });
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

module.exports = { buildTikTokUser, sendTikTokEvent };
