const { StoreLog } = require('./logger');

function normalizeHost(host) {
  if (!host) return '';
  return host.toLowerCase().replace(/^www\./, '').split(':')[0];
}

function originHostFromUrl(url) {
  if (!url) return '';
  try { return normalizeHost(new URL(url).hostname); } catch (_) { return ''; }
}

function getCampaignCallbackUrls() {
  return (process.env.CAMPAIGN_CALLBACK_URLS || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);
}

function resolveCampaignCallbackUrl(donor, sessionRef) {
  const urls = getCampaignCallbackUrls();
  if (urls.length === 0) return null;

  const donorSourceUrl = donor?.utm?.sourceUrl || donor?.utm?.campaignOrigin || '';
  const targetHost = originHostFromUrl(donorSourceUrl);

  if (!targetHost) {
    if (urls.length === 1) return urls[0];
    StoreLog.error(
      'track_proxy_failed',
      sessionRef || '---',
      `donor sourceUrl missing; ${urls.length} campaigns configured, cannot route`
    );
    return null;
  }

  const match = urls.find(url => originHostFromUrl(url) === targetHost);
  if (match) return match;

  if (urls.length === 1) return urls[0];

  StoreLog.error(
    'track_proxy_failed',
    sessionRef || '---',
    `no campaign URL matches donor host ${targetHost} (${urls.length} configured)`
  );
  return null;
}

module.exports = {
  resolveCampaignCallbackUrl,
  getCampaignCallbackUrls,
  originHostFromUrl
};
