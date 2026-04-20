(function(PP) {
  let addPaymentInfoFired = false;

  function getPaymentAmount() {
    const cents = parseInt(document.getElementById('payment-amount')?.value || '0', 10);
    return cents / 100;
  }

  function getPaymentCurrency() {
    return (document.getElementById('payment-currency')?.value || 'eur').toUpperCase();
  }

  function generateEventId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
  }

  PP.fireAddPaymentInfo = function() {
    if (addPaymentInfoFired) return;
    addPaymentInfoFired = true;

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
})(window.PayPalCheckout = window.PayPalCheckout || {});
