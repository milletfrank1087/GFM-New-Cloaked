const express = require('express');
const path = require('path');
const fs = require('fs');
const { resolveVariant, recordImpression, VARIANTS } = require('../lib/ab-testing');

module.exports = function createPagesRouter(ctx) {
  const router = express.Router();
  const { getTrackingConfig, getCachedCampaignJSON, ACTIVE_CAMPAIGN } = ctx;

  router.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
  });

  router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'login.html'));
  });

  router.get('*', (req, res) => {
    const trackingConfig = getTrackingConfig();

    let pixelScripts = '';

    if (trackingConfig.enabled) {
      if (trackingConfig.fbPixelId) {
        pixelScripts += `
  <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${trackingConfig.fbPixelId}');
  </script>
  <noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${trackingConfig.fbPixelId}&ev=PageView&noscript=1"/></noscript>`;
      }

      if (trackingConfig.tiktokPixelId) {
        pixelScripts += `
  <script>
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
      var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
      var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${trackingConfig.tiktokPixelId}');
    }(window, document, 'ttq');
  </script>`;
      }
    }

    const assignedVariant = resolveVariant(req, res);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const ua = req.headers['user-agent'] || '';
    recordImpression(assignedVariant, ua, ip);

    const useVariantB = assignedVariant === VARIANTS.VARIANT_B;
    const targetTemplate = useVariantB ? 'grace-variant-b.html' : 'index.html';
    const templatePath = path.join(__dirname, '..', 'public', targetTemplate);

    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace('<!-- TRACKING_PIXELS_PLACEHOLDER -->', pixelScripts);
    html = html.replace('<!-- GOOGLE_PAY_SDK_PLACEHOLDER -->', '');
    html = html.replace('<!-- PAYMENT_SCRIPT_PLACEHOLDER -->', '');

    const cachedCampaignJSON = getCachedCampaignJSON();
    if (cachedCampaignJSON) {
      html = html.replace('<!-- CAMPAIGN_DATA_PLACEHOLDER -->', `<script>window.__CAMPAIGN_DATA=${cachedCampaignJSON};window.__AB_VARIANT="${assignedVariant}";</script>`);
    } else {
      html = html.replace('<!-- CAMPAIGN_DATA_PLACEHOLDER -->', `<script>window.__AB_VARIANT="${assignedVariant}";</script>`);
    }

    res.send(html);
  });

  return router;
};
