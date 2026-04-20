(function(PP) {

  var cardFieldsInstance = null;

  PP.initCardFields = async function() {
    if (!window.paypal || !window.paypal.CardFields) return null;

    try {
      var nameContainer = document.getElementById('card-name-field');
      var numberContainer = document.getElementById('card-number-field');
      var expiryContainer = document.getElementById('card-expiry-field');
      var cvvContainer = document.getElementById('card-cvv-field');

      cardFieldsInstance = paypal.CardFields({
        style: PP.cardFieldStyles,
        createOrder: PP.createPayPalOrder,
        onApprove: async function(data) {
          try {
            var result = await PP.capturePayPalOrder(data.orderID);
            if (result.success) { PP.handlePaymentSuccess(result); }
            else { PP.handlePaymentError(result); }
          } catch (error) {
            PP.handlePaymentError(error);
          } finally {
            PP.setButtonLoading(false);
          }
        },
        onError: function(err) {
          PP.handlePaymentError(err);
          PP.setButtonLoading(false);
        },
        inputEvents: {
          onFocus: function() {
            if (typeof PP.fireAddPaymentInfo === 'function') PP.fireAddPaymentInfo();
          },
          onChange: function(data) {
            if (typeof PP.fireAddPaymentInfo === 'function') PP.fireAddPaymentInfo();
            if (data.fields.cardNameField) PP.updateFieldValidation(nameContainer, data.fields.cardNameField);
            if (data.fields.cardNumberField) PP.updateFieldValidation(numberContainer, data.fields.cardNumberField);
            if (data.fields.cardExpiryField) PP.updateFieldValidation(expiryContainer, data.fields.cardExpiryField);
            if (data.fields.cardCvvField) PP.updateFieldValidation(cvvContainer, data.fields.cardCvvField);
          }
        }
      });

      if (cardFieldsInstance.isEligible()) {
        if (numberContainer) {
          await cardFieldsInstance.NumberField({ placeholder: '1234 5678 9012 3456' }).render('#card-number-field');
        }
        if (expiryContainer) {
          await cardFieldsInstance.ExpiryField({ placeholder: 'MM/YY' }).render('#card-expiry-field');
        }
        if (cvvContainer) {
          await cardFieldsInstance.CVVField({ placeholder: 'CVV' }).render('#card-cvv-field');
        }
        if (nameContainer) {
          await new Promise(function(r) { setTimeout(r, 100); });
          await cardFieldsInstance.NameField({ placeholder: 'Cardholder Name' }).render('#card-name-field');
        }
        return cardFieldsInstance;
      }
      return null;
    } catch (error) {
      console.error('Card fields init error:', error);
      return null;
    }
  };

  PP.submitCardPayment = async function() {
    if (!cardFieldsInstance) {
      PP.showError('Card payment not initialized. Please refresh and try again.');
      return;
    }

    var emailInput = document.getElementById('billing-email');
    var localizedEmailError = document.getElementById('locale-email-error')?.value || 'Please enter a valid email address.';
    var email = emailInput?.value?.trim() || '';
    if (!email || !email.includes('@')) {
      PP.showError(localizedEmailError);
      return;
    }

    PP.clearError();
    PP.setButtonLoading(true);

    try {
      await cardFieldsInstance.submit();
    } catch (error) {
      PP.handlePaymentError(error);
      PP.setButtonLoading(false);
    }
  };

})(window.PayPalCheckout = window.PayPalCheckout || {});
