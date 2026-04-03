window.PayPalCheckout = window.PayPalCheckout || {};

(function(PP) {
  var paypalSDKLoaded = false;

  var cardFieldStyles = {
    input: {
      'font-size': '15px',
      'font-family': "'Inter', system-ui, -apple-system, sans-serif",
      'font-weight': '400',
      'color': '#1f2937',
      'line-height': '42px',
      'height': '42px',
      'padding': '0 12px',
      'background': '#ffffff',
      'border': '1px solid #e5e7eb',
      'border-radius': '8px',
      '-webkit-font-smoothing': 'antialiased',
    },
    ':focus': {
      'border': '1px solid #00b964',
      'box-shadow': '0 0 0 3px rgba(0, 185, 100, 0.1)',
    },
    '.valid': {
      'color': '#1f2937',
      'border': '1px solid #00b964',
    },
    '.invalid': {
      'color': '#ef4444',
      'border': '1px solid #ef4444',
      'box-shadow': '0 0 0 3px rgba(239, 68, 68, 0.1)',
    },
    '::placeholder': {
      'color': '#9ca3af',
    },
  };

  PP.cardFieldStyles = cardFieldStyles;

  PP.loadPayPalSDK = async function() {
    if (paypalSDKLoaded) return true;

    try {
      var response = await fetch('/api/paypal/client-id');
      var data = await response.json();
      var clientId = data.clientId;

      var currencyCode = (document.getElementById('payment-currency')?.value || 'eur').toUpperCase();

      return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://www.paypal.com/sdk/js?client-id=' + clientId + '&components=buttons,card-fields,applepay,googlepay&enable-funding=venmo&currency=' + currencyCode;
        script.setAttribute('data-sdk-integration-source', 'developer-studio');

        script.onload = function() {
          paypalSDKLoaded = true;
          resolve(true);
        };
        script.onerror = function() { reject(new Error('Failed to load PayPal SDK')); };
        document.head.appendChild(script);
      });
    } catch (error) {
      console.error('Error loading PayPal SDK:', error);
      return false;
    }
  };

  PP.createPayPalOrder = async function() {
    var response = await fetch('/api/paypal/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    var order = await response.json();
    if (order.orderId) return order.orderId;
    throw new Error(order.error || 'Failed to create order');
  };

  PP.capturePayPalOrder = async function(orderID) {
    var response = await fetch('/api/paypal/orders/' + orderID + '/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    var data = await response.json();
    if (!response.ok && !data.success) {
      throw new Error(data.error || 'Payment capture failed');
    }
    return data;
  };

})(window.PayPalCheckout);
