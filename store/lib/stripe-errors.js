const OPERATOR_CODES = new Set([
  'api_key_expired',
  'api_key_invalid',
  'authentication_required',
  'account_inactive',
  'account_invalid',
  'platform_account_required',
  'permissions_error',
  'platform_api_key_expired'
]);

const OPERATOR_TYPES = new Set([
  'StripeAuthenticationError',
  'StripePermissionError',
  'StripeInvalidRequestError'
]);

const DONOR_CARD_CODES = new Set([
  'card_declined',
  'expired_card',
  'incorrect_cvc',
  'invalid_cvc',
  'incorrect_number',
  'invalid_number',
  'incorrect_zip',
  'invalid_expiry_month',
  'invalid_expiry_year',
  'insufficient_funds',
  'processing_error'
]);

function classifyStripeError(error) {
  if (!error) {
    return { class: 'unknown', code: 'unknown', type: 'Unknown', operatorActionable: false, retryable: false };
  }

  const code = error.code || error.decline_code || 'unknown';
  const type = error.type || error.constructor?.name || 'Unknown';
  const isOperator =
    OPERATOR_CODES.has(code) ||
    (type === 'StripeAuthenticationError') ||
    (type === 'StripeInvalidRequestError' && /api key/i.test(error.message || '')) ||
    (type === 'StripePermissionError');

  if (isOperator) {
    return { class: 'operator', code, type, operatorActionable: true, retryable: false };
  }
  if (DONOR_CARD_CODES.has(code) || type === 'StripeCardError') {
    return { class: 'donor_card', code, type, operatorActionable: false, retryable: true };
  }
  if (type === 'StripeRateLimitError' || code === 'rate_limit') {
    return { class: 'rate_limit', code, type, operatorActionable: false, retryable: true };
  }
  if (type === 'StripeConnectionError' || type === 'StripeAPIError') {
    return { class: 'transient', code, type, operatorActionable: false, retryable: true };
  }
  return { class: 'unknown', code, type, operatorActionable: false, retryable: true };
}

const DONOR_MESSAGES = {
  en: {
    operator: 'Donations are temporarily unavailable. We have been notified and are working on it. Please try again in a few minutes.',
    donor_card: 'Your card was declined. Please try a different card or payment method.',
    rate_limit: 'Too many attempts in a short time. Please wait a moment and try again.',
    transient: 'A temporary network error occurred. Please try again.',
    unknown: 'Payment could not be completed. Please try again or contact support.'
  },
  el: {
    operator: 'Οι δωρεές δεν είναι προσωρινά διαθέσιμες. Έχουμε ειδοποιηθεί και εργαζόμαστε για την επίλυση. Δοκιμάστε ξανά σε λίγα λεπτά.',
    donor_card: 'Η κάρτα σας απορρίφθηκε. Δοκιμάστε διαφορετική κάρτα ή τρόπο πληρωμής.',
    rate_limit: 'Πολλές προσπάθειες σε σύντομο διάστημα. Παρακαλώ περιμένετε λίγο και προσπαθήστε ξανά.',
    transient: 'Παρουσιάστηκε προσωρινό σφάλμα δικτύου. Δοκιμάστε ξανά.',
    unknown: 'Η πληρωμή δεν ολοκληρώθηκε. Δοκιμάστε ξανά ή επικοινωνήστε με την υποστήριξη.'
  },
  it: {
    operator: 'Le donazioni non sono temporaneamente disponibili. Siamo stati avvisati e stiamo lavorando per risolvere. Riprova tra qualche minuto.',
    donor_card: 'La tua carta è stata rifiutata. Prova con una carta o metodo di pagamento diverso.',
    rate_limit: 'Troppi tentativi in poco tempo. Attendi un momento e riprova.',
    transient: 'Si è verificato un errore di rete temporaneo. Riprova.',
    unknown: 'Il pagamento non può essere completato. Riprova o contatta il supporto.'
  },
  es: {
    operator: 'Las donaciones no están disponibles temporalmente. Hemos sido notificados y estamos trabajando en ello. Por favor, inténtelo de nuevo en unos minutos.',
    donor_card: 'Su tarjeta fue rechazada. Por favor, pruebe con otra tarjeta o método de pago.',
    rate_limit: 'Demasiados intentos en poco tiempo. Por favor, espere un momento e inténtelo de nuevo.',
    transient: 'Se ha producido un error de red temporal. Por favor, inténtelo de nuevo.',
    unknown: 'El pago no se pudo completar. Por favor, inténtelo de nuevo o contacte con soporte.'
  },
  pt: {
    operator: 'As doações estão temporariamente indisponíveis. Fomos notificados e estamos a resolver. Por favor, tente novamente dentro de alguns minutos.',
    donor_card: 'O seu cartão foi recusado. Por favor, tente outro cartão ou método de pagamento.',
    rate_limit: 'Demasiadas tentativas em pouco tempo. Por favor, aguarde um momento e tente novamente.',
    transient: 'Ocorreu um erro temporário de rede. Por favor, tente novamente.',
    unknown: 'O pagamento não pôde ser concluído. Por favor, tente novamente ou contacte o suporte.'
  },
  pl: {
    operator: 'Darowizny są tymczasowo niedostępne. Zostaliśmy powiadomieni i pracujemy nad rozwiązaniem. Spróbuj ponownie za kilka minut.',
    donor_card: 'Twoja karta została odrzucona. Spróbuj innej karty lub metody płatności.',
    rate_limit: 'Zbyt wiele prób w krótkim czasie. Poczekaj chwilę i spróbuj ponownie.',
    transient: 'Wystąpił tymczasowy błąd sieci. Spróbuj ponownie.',
    unknown: 'Nie udało się zrealizować płatności. Spróbuj ponownie lub skontaktuj się z pomocą techniczną.'
  },
  fr: {
    operator: 'Les dons sont temporairement indisponibles. Nous avons été notifiés et travaillons à résoudre le problème. Veuillez réessayer dans quelques minutes.',
    donor_card: 'Votre carte a été refusée. Veuillez essayer une autre carte ou méthode de paiement.',
    rate_limit: 'Trop de tentatives en peu de temps. Veuillez patienter un instant et réessayer.',
    transient: 'Une erreur réseau temporaire est survenue. Veuillez réessayer.',
    unknown: 'Le paiement n\'a pas pu être effectué. Veuillez réessayer ou contacter le support.'
  }
};

function getDonorMessage(errClass, lang = 'en') {
  const dict = DONOR_MESSAGES[lang] || DONOR_MESSAGES.en;
  return dict[errClass] || dict.unknown;
}

module.exports = { classifyStripeError, getDonorMessage, OPERATOR_CODES };
