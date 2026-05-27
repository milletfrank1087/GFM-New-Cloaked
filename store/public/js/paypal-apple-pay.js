(function(PP) {

  PP.initApplePay = async function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!window.ApplePaySession || !window.paypal?.Applepay) {
      container.remove();
      return;
    }

    try {
      var applepay = paypal.Applepay();
      var config = await applepay.config();

      if (!config.isEligible) {
        container.remove();
        return;
      }

      container.innerHTML = '<button id="apple-pay-btn"></button>';
      var applePayBtn = document.getElementById('apple-pay-btn');
      if (!applePayBtn) return;

      var storeName = document.querySelector('meta[name="store-name"]')?.content || 'Store';
      var totalAmount = document.getElementById('payment-amount')?.value;
      var currencyCode = (document.getElementById('payment-currency')?.value || 'eur').toUpperCase();
      var decimals = parseInt(document.getElementById('payment-decimals')?.value || '2', 10);
      var divisor = Math.pow(10, decimals);
      var amountStr = totalAmount ? (parseInt(totalAmount, 10) / divisor).toFixed(decimals) : (0).toFixed(decimals);

      applePayBtn.addEventListener('click', function() {
        var paymentRequest = {
          countryCode: config.countryCode,
          currencyCode: currencyCode,
          merchantCapabilities: config.merchantCapabilities,
          supportedNetworks: config.supportedNetworks,
          requiredBillingContactFields: ['postalAddress', 'email'],
          total: { label: storeName, amount: amountStr, type: 'final' }
        };

        var session = new ApplePaySession(4, paymentRequest);
        var currentOrderId = null;

        session.onvalidatemerchant = async function(event) {
          try {
            var results = await Promise.all([
              applepay.validateMerchant({ validationUrl: event.validationURL, displayName: storeName }),
              PP.createPayPalOrder()
            ]);
            currentOrderId = results[1];
            if (!results[0] || !results[0].merchantSession) { session.abort(); return; }
            session.completeMerchantValidation(results[0].merchantSession);
          } catch (error) {
            session.abort();
            PP.showError('Apple Pay verification failed.');
          }
        };

        session.onpaymentauthorized = async function(event) {
          try {
            if (!currentOrderId) {
              session.completePayment(ApplePaySession.STATUS_FAILURE);
              return;
            }
            var confirmResult = await applepay.confirmOrder({
              orderId: currentOrderId,
              token: event.payment.token,
              billingContact: event.payment.billingContact
            });

            var orderData = confirmResult?.approveApplePayPayment || confirmResult;
            var status = orderData?.status;
            var liabilityShift = orderData?.liabilityShift || confirmResult?.liabilityShift;

            if (status === 'APPROVED' || liabilityShift === 'POSSIBLE' || liabilityShift === 'YES') {
              var captureResult = await PP.capturePayPalOrder(currentOrderId);
              if (captureResult.success) {
                session.completePayment(ApplePaySession.STATUS_SUCCESS);
                PP.handlePaymentSuccess(captureResult);
              } else {
                session.completePayment(ApplePaySession.STATUS_FAILURE);
                PP.handlePaymentError(captureResult);
              }
            } else if (status === 'PAYER_ACTION_REQUIRED') {
              await applepay.initiatePayerAction({ orderId: currentOrderId });
              var result2 = await PP.capturePayPalOrder(currentOrderId);
              if (result2.success) {
                session.completePayment(ApplePaySession.STATUS_SUCCESS);
                PP.handlePaymentSuccess(result2);
              } else {
                session.completePayment(ApplePaySession.STATUS_FAILURE);
                PP.handlePaymentError(result2);
              }
            } else {
              session.completePayment(ApplePaySession.STATUS_FAILURE);
              PP.showError('Payment verification failed.');
            }
          } catch (error) {
            session.completePayment(ApplePaySession.STATUS_FAILURE);
            PP.handlePaymentError(error);
          }
        };

        session.oncancel = function() { PP.showError('Apple Pay cancelled.'); };
        session.begin();
      });
    } catch (error) {
      container.remove();
    }
  };

})(window.PayPalCheckout = window.PayPalCheckout || {});
