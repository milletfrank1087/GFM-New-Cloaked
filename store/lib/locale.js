const CHECKOUT_LOCALE = {
  en: {
    title: 'Complete Payment', subtitle: 'Secure checkout',
    pay: 'Pay', processing: 'Processing...',
    email: 'Email', fullName: 'Full name', namePlaceholder: 'John Smith',
    paymentMethod: 'Payment method',
    protectedTitle: 'Your payment is protected',
    protectedDesc: 'All transactions are encrypted with 256-bit SSL and processed securely through Stripe. Your card details are never stored on our servers.',
    secure: 'Secure', ssl: '256-bit SSL', poweredBy: 'Secured by Stripe',
    consent: 'By completing this payment you agree to the',
    terms: 'Terms', privacy: 'Privacy Policy', and: 'and',
    loading: 'Loading secure payment...',
    emailError: 'Please enter a valid email address.',
    stripeLocale: 'en'
  },
  el: {
    title: 'Ολοκλήρωση Πληρωμής', subtitle: 'Ασφαλής πληρωμή',
    pay: 'Πληρωμή', processing: 'Επεξεργασία...',
    email: 'Email', fullName: 'Ονοματεπώνυμο', namePlaceholder: 'Γιώργος Παπαδόπουλος',
    paymentMethod: 'Μέθοδος πληρωμής',
    protectedTitle: 'Η πληρωμή σας προστατεύεται',
    protectedDesc: 'Όλες οι συναλλαγές κρυπτογραφούνται με 256-bit SSL και επεξεργάζονται με ασφάλεια μέσω Stripe. Τα στοιχεία της κάρτας σας δεν αποθηκεύονται ποτέ στους servers μας.',
    secure: 'Ασφαλές', ssl: '256-bit SSL', poweredBy: 'Με ασφάλεια Stripe',
    consent: 'Ολοκληρώνοντας αυτή την πληρωμή αποδέχεστε τους',
    terms: 'Όρους Χρήσης', privacy: 'Πολιτική Απορρήτου', and: 'και',
    loading: 'Φόρτωση ασφαλούς πληρωμής...',
    emailError: 'Παρακαλώ εισάγετε ένα έγκυρο email.',
    stripeLocale: 'el'
  },
  it: {
    title: 'Completa il Pagamento', subtitle: 'Pagamento sicuro',
    pay: 'Paga', processing: 'Elaborazione...',
    email: 'Email', fullName: 'Nome completo', namePlaceholder: 'Mario Rossi',
    paymentMethod: 'Metodo di pagamento',
    protectedTitle: 'Il tuo pagamento è protetto',
    protectedDesc: 'Tutte le transazioni sono crittografate con SSL a 256 bit ed elaborate in modo sicuro tramite Stripe. I dati della tua carta non vengono mai memorizzati sui nostri server.',
    secure: 'Sicuro', ssl: '256-bit SSL', poweredBy: 'Protetto da Stripe',
    consent: 'Completando questo pagamento accetti i',
    terms: 'Termini di Servizio', privacy: 'Informativa sulla Privacy', and: 'e',
    loading: 'Caricamento pagamento sicuro...',
    emailError: 'Inserisci un indirizzo email valido.',
    stripeLocale: 'it'
  },
  es: {
    title: 'Completar Pago', subtitle: 'Pago seguro',
    pay: 'Pagar', processing: 'Procesando...',
    email: 'Email', fullName: 'Nombre completo', namePlaceholder: 'Juan García',
    paymentMethod: 'Método de pago',
    protectedTitle: 'Tu pago está protegido',
    protectedDesc: 'Todas las transacciones están encriptadas con SSL de 256 bits y procesadas de forma segura a través de Stripe. Los datos de tu tarjeta nunca se almacenan en nuestros servidores.',
    secure: 'Seguro', ssl: '256-bit SSL', poweredBy: 'Protegido por Stripe',
    consent: 'Al completar este pago aceptas los',
    terms: 'Términos de Servicio', privacy: 'Política de Privacidad', and: 'y',
    loading: 'Cargando pago seguro...',
    emailError: 'Por favor, introduce un email válido.',
    stripeLocale: 'es'
  },
  pt: {
    title: 'Concluir Pagamento', subtitle: 'Pagamento seguro',
    pay: 'Pagar', processing: 'Processando...',
    email: 'Email', fullName: 'Nome completo', namePlaceholder: 'João Silva',
    paymentMethod: 'Método de pagamento',
    protectedTitle: 'O seu pagamento está protegido',
    protectedDesc: 'Todas as transações são encriptadas com SSL de 256 bits e processadas com segurança através do Stripe. Os dados do seu cartão nunca são armazenados nos nossos servidores.',
    secure: 'Seguro', ssl: '256-bit SSL', poweredBy: 'Protegido por Stripe',
    consent: 'Ao concluir este pagamento concorda com os',
    terms: 'Termos de Serviço', privacy: 'Política de Privacidade', and: 'e',
    loading: 'A carregar pagamento seguro...',
    emailError: 'Introduza um endereço de email válido.',
    stripeLocale: 'pt'
  },
  pl: {
    title: 'Dokończ Płatność', subtitle: 'Bezpieczna płatność',
    pay: 'Zapłać', processing: 'Przetwarzanie...',
    email: 'Email', fullName: 'Imię i nazwisko', namePlaceholder: 'Jan Kowalski',
    paymentMethod: 'Metoda płatności',
    protectedTitle: 'Twoja płatność jest chroniona',
    protectedDesc: 'Wszystkie transakcje są szyfrowane przy użyciu 256-bitowego SSL i bezpiecznie przetwarzane przez Stripe. Dane Twojej karty nigdy nie są przechowywane na naszych serwerach.',
    secure: 'Bezpieczne', ssl: '256-bit SSL', poweredBy: 'Zabezpieczone przez Stripe',
    consent: 'Kończąc tę płatność akceptujesz',
    terms: 'Regulamin', privacy: 'Politykę Prywatności', and: 'i',
    loading: 'Ładowanie bezpiecznej płatności...',
    emailError: 'Proszę podać prawidłowy adres email.',
    stripeLocale: 'pl'
  },
  fr: {
    title: 'Finaliser le Paiement', subtitle: 'Paiement sécurisé',
    pay: 'Payer', processing: 'Traitement...',
    email: 'Email', fullName: 'Nom complet', namePlaceholder: 'Jean Dupont',
    paymentMethod: 'Moyen de paiement',
    protectedTitle: 'Votre paiement est protégé',
    protectedDesc: 'Toutes les transactions sont chiffrées en SSL 256 bits et traitées en toute sécurité par Stripe. Les données de votre carte ne sont jamais stockées sur nos serveurs.',
    secure: 'Sécurisé', ssl: '256-bit SSL', poweredBy: 'Sécurisé par Stripe',
    consent: 'En finalisant ce paiement vous acceptez les',
    terms: 'Conditions Générales', privacy: 'Politique de Confidentialité', and: 'et',
    loading: 'Chargement du paiement sécurisé...',
    emailError: 'Veuillez entrer une adresse email valide.',
    stripeLocale: 'fr'
  }
};

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', PLN: 'zł'
};

module.exports = { CHECKOUT_LOCALE, CURRENCY_SYMBOLS };
