const path = require('path');

function loadStoreConfig() {
  const storeId = process.env.STORE_ID;
  if (!storeId) {
    throw new Error('STORE_ID environment variable is required');
  }

  const configPath = path.join(__dirname, '..', 'stores', storeId, 'config.js');

  try {
    const config = require(configPath);
    config.domain = process.env.STORE_DOMAIN || 'localhost';
    config.id = null;
    config.paymentProcessor = process.env.PAYMENT_PROCESSOR || config.paymentProcessor || 'stripe';
    if (process.env.STATEMENT_DESCRIPTOR) {
      config.statementDescriptor = process.env.STATEMENT_DESCRIPTOR;
    }
    if (process.env.CONTACT_EMAIL) {
      config.contact_email = process.env.CONTACT_EMAIL;
    }
    return config;
  } catch (err) {
    throw new Error(`Failed to load store config from ${configPath}: ${err.message}`);
  }
}

module.exports = { loadStoreConfig };
