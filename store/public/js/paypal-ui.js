(function(PP) {

  PP.showError = function(msg) {
    var el = document.getElementById('payment-error');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  };

  PP.clearError = function() {
    var el = document.getElementById('payment-error');
    if (el) el.classList.add('hidden');
  };

  PP.handlePaymentSuccess = function(data) {
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  };

  PP.handlePaymentError = function(error) {
    var message = 'Payment failed. Please try again.';
    if (error && error.details && error.details[0]) {
      var issue = error.details[0].issue;
      if (issue === 'INSTRUMENT_DECLINED') {
        message = 'Your card was declined. Please try another payment method.';
      } else if (issue === 'PAYER_ACTION_REQUIRED') {
        message = 'Additional verification required. Please try again.';
      }
    } else if (error && error.message) {
      message = error.message;
    }
    PP.showError(message);
  };

  PP.setButtonLoading = function(loading) {
    var btn = document.getElementById('submit-payment');
    var spinner = document.getElementById('payment-spinner');
    var btnText = document.getElementById('btn-text');
    if (!btn) return;

    btn.disabled = loading;
    if (spinner) spinner.classList.toggle('hidden', !loading);
    if (btnText) {
      btnText.textContent = loading
        ? (btn.dataset.processing || 'Processing...')
        : (btn.dataset.paytext || 'Pay');
    }
  };

  PP.updateFieldValidation = function(container, fieldState) {
    if (!container) return;
    container.classList.remove('pp-valid', 'pp-invalid');
    if (fieldState.isValid) {
      container.classList.add('pp-valid');
    } else if (fieldState.isTouched && !fieldState.isPotentiallyValid) {
      container.classList.add('pp-invalid');
    }
  };

})(window.PayPalCheckout = window.PayPalCheckout || {});
