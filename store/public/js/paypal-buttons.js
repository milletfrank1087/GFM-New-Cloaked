(function(PP) {

  PP.initPayPalButtons = async function(containerId) {
    if (!window.paypal || !window.paypal.Buttons) return;
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    try {
      await paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 44 },
        fundingSource: paypal.FUNDING.PAYPAL,
        createOrder: PP.createPayPalOrder,
        onApprove: async function(data) {
          try {
            var result = await PP.capturePayPalOrder(data.orderID);
            if (result.success) { PP.handlePaymentSuccess(result); }
            else { PP.handlePaymentError(result); }
          } catch (error) { PP.handlePaymentError(error); }
        },
        onError: PP.handlePaymentError,
        onCancel: function() { PP.showError('Payment cancelled.'); }
      }).render('#' + containerId);
    } catch (error) {
      console.error('PayPal button error:', error);
    }
  };

  PP.initVenmoButton = async function(containerId) {
    if (!window.paypal || !window.paypal.Buttons) return;
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    try {
      var venmoButton = paypal.Buttons({
        fundingSource: paypal.FUNDING.VENMO,
        style: { layout: 'vertical', color: 'blue', shape: 'rect', height: 44 },
        createOrder: PP.createPayPalOrder,
        onApprove: async function(data) {
          try {
            var result = await PP.capturePayPalOrder(data.orderID);
            if (result.success) { PP.handlePaymentSuccess(result); }
            else { PP.handlePaymentError(result); }
          } catch (error) { PP.handlePaymentError(error); }
        },
        onError: PP.handlePaymentError,
        onCancel: function() { PP.showError('Venmo payment cancelled.'); }
      });

      if (await venmoButton.isEligible()) {
        await venmoButton.render('#' + containerId);
      } else {
        container.style.display = 'none';
      }
    } catch (error) {
      container.style.display = 'none';
    }
  };

})(window.PayPalCheckout = window.PayPalCheckout || {});
