(function(PP) {
  let addPaymentInfoFired = false;

  function getPaymentAmount() {
    const units = parseInt(document.getElementById('payment-amount')?.value || '0', 10);
    const decimals = parseInt(document.getElementById('payment-decimals')?.value || '2', 10);
    return units / Math.pow(10, decimals);
  }

  function getPaymentCurrency() {
    return (document.getElementById('payment-currency')?.value || 'eur').toUpperCase();
  }

  function generateEventId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
  }

  function updateAdvancedMatching() {
    if (typeof fbq === 'undefined') return;
    var pixelId = document.getElementById('payment-pixel-id')?.value;
    if (!pixelId) return;
    var typedEmail = document.getElementById('billing-email')?.value?.trim() || '';
    var donorEmail = document.getElementById('payment-donor-email')?.value || '';
    var email = (typedEmail && typedEmail.indexOf('@') !== -1) ? typedEmail : donorEmail;
    var externalId = document.getElementById('payment-external-id')?.value || '';
    var country = (document.getElementById('payment-country')?.value || '').toLowerCase();
    var am = {};
    if (email) am.em = email.toLowerCase();
    if (externalId) am.external_id = externalId;
    if (country) am.country = country;
    if (Object.keys(am).length === 0) return;
    try { fbq('init', pixelId, am); } catch (_) {}
  }

  PP.fireAddPaymentInfo = function() {
    if (addPaymentInfoFired) return;
    addPaymentInfoFired = true;
    updateAdvancedMatching();

    const eventId = generateEventId('AddPaymentInfo');
    const payload = { value: getPaymentAmount(), currency: getPaymentCurrency() };

    if (typeof fbq !== 'undefined') {
      try {
        fbq('track', 'AddPaymentInfo', payload, { eventID: eventId });
      } catch (_) {}
    }

    fetch('/api/track-interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'AddPaymentInfo', eventId, data: payload, sourceUrl: window.location.href })
    }).catch(function() {});
  };

  PP.firePurchaseBrowser = function() {
    var purchaseEventId = document.getElementById('payment-event-id')?.value;
    if (!purchaseEventId) return;
    updateAdvancedMatching();
    var payload = { value: getPaymentAmount(), currency: getPaymentCurrency() };
    if (typeof fbq !== 'undefined') {
      try {
        fbq('track', 'Purchase', payload, { eventID: purchaseEventId });
      } catch (_) {}
    }
    if (typeof ttq !== 'undefined') {
      try {
        ttq.track('CompletePayment', Object.assign({}, payload, { event_id: purchaseEventId }));
      } catch (_) {}
    }
  };
})(window.PayPalCheckout = window.PayPalCheckout || {});
