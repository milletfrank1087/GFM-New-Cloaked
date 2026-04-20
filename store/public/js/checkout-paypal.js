(function() {
  var PP = window.PayPalCheckout;

  async function initCheckout() {
    var loadingEl = document.getElementById('payment-loading');
    var submitBtn = document.getElementById('submit-payment');

    try {
      await PP.loadPayPalSDK();

      await PP.initApplePay('apple-pay-container');
      await PP.initGooglePay('google-pay-container');
      await PP.initPayPalButtons('paypal-button-container');
      await PP.initVenmoButton('venmo-button-container');
      await PP.initCardFields();

      if (loadingEl) loadingEl.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
    } catch (err) {
      if (loadingEl) loadingEl.classList.add('hidden');
      PP.showError(err.message || 'Failed to load payment methods');
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (submitBtn.disabled) return;
        PP.submitCardPayment();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckout);
  } else {
    initCheckout();
  }
})();
