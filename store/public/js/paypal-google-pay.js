(function(PP) {

  var googlePayClient = null;

  PP.initGooglePay = async function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    var environment = window.location.hostname === 'localhost' ? 'TEST' : 'PRODUCTION';

    if (!window.paypal?.Googlepay || isIOS || !window.google?.payments?.api?.PaymentsClient) {
      container.remove();
      return;
    }

    try {
      var googlepay = paypal.Googlepay();
      var config = await googlepay.config();

      if (!config.isEligible) { container.remove(); return; }

      googlePayClient = new google.payments.api.PaymentsClient({ environment: environment });

      var readyToPay = await googlePayClient.isReadyToPay({
        apiVersion: 2, apiVersionMinor: 0,
        allowedPaymentMethods: config.allowedPaymentMethods
      });

      if (!readyToPay.result) { container.remove(); return; }

      var totalAmount = document.getElementById('payment-amount')?.value;
      var currencyCode = (document.getElementById('payment-currency')?.value || 'eur').toUpperCase();
      var decimals = parseInt(document.getElementById('payment-decimals')?.value || '2', 10);
      var divisor = Math.pow(10, decimals);
      var amountStr = totalAmount ? (parseInt(totalAmount, 10) / divisor).toFixed(decimals) : (0).toFixed(decimals);

      var buttonContainer = googlePayClient.createButton({
        onClick: async function() {
          try {
            var paymentDataRequest = {
              apiVersion: 2, apiVersionMinor: 0,
              allowedPaymentMethods: config.allowedPaymentMethods,
              merchantInfo: config.merchantInfo,
              transactionInfo: {
                totalPriceStatus: 'FINAL',
                totalPrice: amountStr,
                currencyCode: currencyCode,
              }
            };

            var paymentData = await googlePayClient.loadPaymentData(paymentDataRequest);
            var orderId = await PP.createPayPalOrder();

            var confirmResult = await googlepay.confirmOrder({
              orderId: orderId,
              paymentMethodData: paymentData.paymentMethodData
            });

            if (confirmResult.status === 'APPROVED') {
              var captureResult = await PP.capturePayPalOrder(orderId);
              if (captureResult.success) { PP.handlePaymentSuccess(captureResult); }
              else { PP.handlePaymentError(captureResult); }
            } else if (confirmResult.status === 'PAYER_ACTION_REQUIRED') {
              await googlepay.initiatePayerAction({ orderId: orderId });
              var result2 = await PP.capturePayPalOrder(orderId);
              if (result2.success) { PP.handlePaymentSuccess(result2); }
              else { PP.handlePaymentError(result2); }
            } else {
              PP.showError('Google Pay authorization failed.');
            }
          } catch (error) {
            if (error.statusCode === 'CANCELED') {
              PP.showError('Google Pay cancelled.');
            } else {
              PP.handlePaymentError(error);
            }
          }
        },
        allowedPaymentMethods: config.allowedPaymentMethods,
        buttonColor: 'black', buttonType: 'buy', buttonRadius: 8, buttonSizeMode: 'fill'
      });

      container.innerHTML = '';
      container.appendChild(buttonContainer);
      container.style.height = '44px';
    } catch (error) {
      container.remove();
    }
  };

})(window.PayPalCheckout = window.PayPalCheckout || {});
