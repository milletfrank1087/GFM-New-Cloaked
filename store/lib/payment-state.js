const FAIL_FAST_TTL_MS = 60 * 1000;

const state = {
  stripeBootHealthy: null,
  stripeBootError: null,
  failFastUntil: 0,
  failFastClass: null,
  failFastCode: null,
  failFastMessage: null,
  paypalBootHealthy: null,
  paypalBootError: null
};

function setStripeBootHealth(healthy, error) {
  state.stripeBootHealthy = !!healthy;
  state.stripeBootError = error ? String(error.message || error).slice(0, 200) : null;
}

function setPayPalBootHealth(healthy, error) {
  state.paypalBootHealthy = !!healthy;
  state.paypalBootError = error ? String(error.message || error).slice(0, 200) : null;
}

function tripFailFast({ errClass, code, message, ttlMs = FAIL_FAST_TTL_MS } = {}) {
  state.failFastUntil = Date.now() + ttlMs;
  state.failFastClass = errClass || 'unknown';
  state.failFastCode = code || 'unknown';
  state.failFastMessage = message ? String(message).slice(0, 200) : null;
}

function clearFailFast() {
  state.failFastUntil = 0;
  state.failFastClass = null;
  state.failFastCode = null;
  state.failFastMessage = null;
}

function getFailFast() {
  if (!state.failFastUntil || Date.now() > state.failFastUntil) {
    if (state.failFastUntil) clearFailFast();
    return null;
  }
  return {
    untilEpochMs: state.failFastUntil,
    secondsRemaining: Math.ceil((state.failFastUntil - Date.now()) / 1000),
    class: state.failFastClass,
    code: state.failFastCode,
    message: state.failFastMessage
  };
}

function snapshot() {
  return {
    stripeBootHealthy: state.stripeBootHealthy,
    stripeBootError: state.stripeBootError,
    paypalBootHealthy: state.paypalBootHealthy,
    paypalBootError: state.paypalBootError,
    failFast: getFailFast()
  };
}

module.exports = {
  setStripeBootHealth,
  setPayPalBootHealth,
  tripFailFast,
  clearFailFast,
  getFailFast,
  snapshot,
  FAIL_FAST_TTL_MS
};
