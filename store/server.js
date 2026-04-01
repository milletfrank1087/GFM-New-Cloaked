require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const Stripe = require('stripe');
const supabase = require('./lib/supabase');
const { loadStoreConfig } = require('./lib/store-config');
const { decomposeAmount } = require('./lib/decompose');

const app = express();
const PORT = process.env.PORT || 4000;
const CALLBACK_SECRET = process.env.CALLBACK_SECRET || 'change-me';
const STORE_DOMAIN = process.env.STORE_DOMAIN || 'localhost';

const storeConfig = loadStoreConfig();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil'
});

let storeDbId = null;

async function resolveStoreId() {
  if (!supabase) return;
  try {
    const { data } = await supabase
      .from('stores')
      .select('id')
      .eq('slug', process.env.STORE_ID)
      .single();
    if (data) storeDbId = data.id;
  } catch (err) {
    console.error('Could not resolve store ID from Supabase:', err.message);
  }
}

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

const storeDir = path.join(__dirname, 'stores', process.env.STORE_ID || 'zenflow-tools');
app.set('view engine', 'ejs');
app.set('views', path.join(storeDir, 'views'));

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    return res.status(200).json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      console.log(`Payment succeeded: ${pi.id} - ${pi.amount / 100} ${pi.currency}`);
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      console.error(`Payment failed: ${pi.id} - ${pi.last_payment_error?.message || 'unknown'}`);
      if (supabase) {
        await supabase.from('payment_failures').insert({
          store_id: storeDbId,
          endpoint: 'webhook',
          stripe_payment_intent_id: pi.id,
          error_type: 'PAYMENT_FAILED',
          error_code: pi.last_payment_error?.code || 'UNKNOWN',
          error_message: pi.last_payment_error?.message || 'Payment failed',
          request_amount: pi.amount / 100
        }).catch(() => {});
      }
      break;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      console.error(`DISPUTE CREATED: ${dispute.id} - ${dispute.amount / 100} ${dispute.currency} - Reason: ${dispute.reason}`);
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      console.log(`Charge refunded: ${charge.id} - ${charge.amount_refunded / 100} ${charge.currency}`);
      break;
    }
  }

  res.status(200).json({ received: true });
});

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  req.store = storeConfig;
  next();
});

function getTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`[${getTimestamp()}] ${color}${status}\x1b[0m ${req.method} ${req.originalUrl} ${ms}ms`);
  });
  next();
});

app.use(express.static(path.join(storeDir, 'public'), { index: false }));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});

app.get('/s/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: tokenData, error } = await supabase
      .from('checkout_sessions')
      .select('*')
      .eq('token', token)
      .eq('claimed', false)
      .single();

    if (error || !tokenData) {
      return res.redirect('/');
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return res.redirect('/');
    }

    await supabase
      .from('checkout_sessions')
      .update({ claimed: true, claimed_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    const cookieData = {
      sid: tokenData.id,
      amount: tokenData.amount,
      currency: tokenData.currency,
      lang: tokenData.language,
      ref: tokenData.source_ref,
      fee: tokenData.service_fee,
      guest: tokenData.guest_checkout,
      email: tokenData.customer_email,
      utm: tokenData.tracking,
      ip: tokenData.ip_address,
      ua: tokenData.user_agent,
      storeId: storeDbId || tokenData.store_id
    };

    res.cookie('__session', JSON.stringify(cookieData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 10 * 60 * 1000,
      path: '/'
    });

    res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/checkout"><meta name="referrer" content="no-referrer"></head><body></body></html>`);
  } catch (err) {
    console.error('Token claim error:', err);
    res.redirect('/');
  }
});

app.get('/checkout', (req, res) => {
  const sessionCookie = req.cookies.__session;

  if (sessionCookie) {
    try {
      const donor = JSON.parse(sessionCookie);
      const lang = donor.lang || 'en';
      const locale = CHECKOUT_LOCALE[lang] || CHECKOUT_LOCALE.en;
      const symbol = CURRENCY_SYMBOLS[donor.currency] || donor.currency;
      const totalAmount = parseFloat(donor.amount) + parseFloat(donor.fee || 0);

      const orderItems = decomposeAmount(totalAmount, storeConfig.products);

      return res.render('pages/checkout-donor', {
        store: req.store,
        donor,
        locale,
        symbol,
        totalAmount: totalAmount.toFixed(2),
        orderItems,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      });
    } catch (e) {
      console.error('Donor cookie parse error:', e);
    }
  }

  const products = storeConfig.products || [];
  res.render('pages/checkout-store', {
    store: req.store,
    products,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

app.post('/api/create-payment', async (req, res) => {
  try {
    const sessionCookie = req.cookies.__session;
    if (!sessionCookie) {
      return res.status(400).json({ error: 'No session found' });
    }

    const donor = JSON.parse(sessionCookie);

    const totalAmount = parseFloat(donor.amount) + parseFloat(donor.fee || 0);
    const amountInCents = Math.round(totalAmount * 100);

    const lineItems = decomposeAmount(totalAmount, storeConfig.products);

    const refCode = (donor.sid || '').substring(0, 4).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const mk = storeConfig.metadataKeys || {};

    const metadata = {
      [mk.storeId || 'storeId']: storeDbId || '',
      [mk.storeDomain || 'storeDomain']: STORE_DOMAIN,
      [mk.referenceCode || 'referenceCode']: refCode,
      [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12),
      [mk.subtotal || 'subtotal']: String(donor.amount),
      [mk.serviceFee || 'serviceFee']: String(donor.fee || 0),
      [mk.guestCheckout || 'guestCheckout']: String(donor.guest || false),
      [mk.orderSummary || 'orderSummary']: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', ')
    };

    const stripeLineItems = lineItems.map((item, idx) => ({
      product_name: item.name.substring(0, 26),
      product_code: (item.slug || 'item').substring(0, 12).toUpperCase().replace(/-/g, ''),
      quantity: item.quantity,
      unit_cost: Math.round(item.price * 100),
      unit_of_measure: 'ACT',
      tax: { total_tax_amount: 0 }
    }));

    const intentParams = {
      amount: amountInCents,
      currency: donor.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata,
      description: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
      statement_descriptor_suffix: storeConfig.statementDescriptor.substring(0, 22),
      payment_details: {
        order_reference: refCode
      },
      amount_details: {
        line_items: stripeLineItems
      }
    };

    const paymentIntent = await stripe.paymentIntents.create(intentParams);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: totalAmount.toFixed(2),
      lineItems
    });
  } catch (error) {
    console.error('Create payment error:', error.message);

    try {
      const sessionCookie = req.cookies.__session;
      const donor = sessionCookie ? JSON.parse(sessionCookie) : {};
      await supabase.from('payment_failures').insert({
        store_id: storeDbId,
        source_ref: donor.ref,
        endpoint: '/api/create-payment',
        error_type: 'STRIPE_ERROR',
        error_code: error.code || 'UNKNOWN',
        error_message: error.message,
        request_amount: donor.amount,
        ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
      });
    } catch (logErr) {
      console.error('Failure logging error:', logErr.message);
    }

    res.status(500).json({ error: 'Failed to create payment' });
  }
});

app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const sessionCookie = req.cookies.__session;
    if (!sessionCookie || !paymentIntentId) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const donor = JSON.parse(sessionCookie);

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method', 'latest_charge.balance_transaction']
    });

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment ${paymentIntent.status}` });
    }

    const charge = paymentIntent.latest_charge;
    const pm = paymentIntent.payment_method;

    let stripeFee = 0;
    const bt = charge?.balance_transaction;
    if (bt && typeof bt === 'object') {
      const feeInSettlement = bt.fee / 100;
      stripeFee = bt.exchange_rate ? feeInSettlement / bt.exchange_rate : feeInSettlement;
    }

    let cardHolderName = pm?.billing_details?.name || '';
    let cardLastDigits = pm?.card?.last4 || null;
    let cardBrand = pm?.card?.brand || null;
    let cardExpiry = pm?.card ? `${String(pm.card.exp_month).padStart(2, '0')}/${pm.card.exp_year}` : null;
    let cardType = pm?.card?.funding || null;
    let paymentSource = 'card';
    if (pm?.card?.wallet?.type === 'apple_pay') paymentSource = 'apple_pay';
    if (pm?.card?.wallet?.type === 'google_pay') paymentSource = 'google_pay';
    if (pm?.type === 'link') paymentSource = 'link';

    let donorName = cardHolderName || 'Anonymous';
    if (donor.guest) donorName = 'Anonymous';

    const donorNameReal = cardHolderName || 'Unknown';
    if (!donor.guest && donorNameReal !== 'Unknown') {
      const parts = donorNameReal.trim().split(/\s+/);
      donorName = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : donorNameReal;
    }

    const lineItems = decomposeAmount(parseFloat(donor.amount) + parseFloat(donor.fee || 0), storeConfig.products);

    const totalAmount = paymentIntent.amount / 100;

    let customerId = null;
    const email = donor.email || charge?.billing_details?.email || null;

    let stripeCustomerId = null;
    if (email) {
      try {
        const existingCustomers = await stripe.customers.list({ email, limit: 1 });
        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id;
        } else {
          const newStripeCustomer = await stripe.customers.create({
            email,
            name: cardHolderName || undefined
          });
          stripeCustomerId = newStripeCustomer.id;
        }

        await stripe.paymentIntents.update(paymentIntentId, {
          customer: stripeCustomerId,
          receipt_email: email
        });
      } catch (custErr) {
        console.error('Stripe customer attach error (non-critical):', custErr.message);
      }
    }

    if (email) {
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const initials = donorNameReal !== 'Unknown'
          ? donorNameReal.trim().split(/\s+/).map(p => p[0]).join('').substring(0, 2).toUpperCase()
          : '?';

        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            name: donorName,
            initials,
            email,
            card_holder_name: cardHolderName || null,
            first_purchase_at: new Date().toISOString(),
            country: charge?.billing_details?.address?.country || null,
            color_gradient: ['from-blue-400 to-blue-500', 'from-violet-400 to-violet-500', 'from-rose-400 to-rose-500', 'from-emerald-400 to-emerald-500'][Math.floor(Math.random() * 4)],
            utm_source: donor.utm?.utm_source || null,
            utm_medium: donor.utm?.utm_medium || null,
            utm_campaign: donor.utm?.utm_campaign || null,
            referrer_url: donor.utm?.referrer || null
          })
          .select()
          .single();

        customerId = newCustomer?.id || null;
      }
    }

    await supabase
      .from('payments')
      .insert({
        customer_id: customerId,
        store_id: storeDbId,
        store_domain: STORE_DOMAIN,
        source_ref: donor.ref,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: charge?.id,
        amount: parseFloat(donor.amount),
        service_fee: parseFloat(donor.fee || 0),
        total_amount: totalAmount,
        stripe_fee: stripeFee,
        net_amount: totalAmount - stripeFee,
        currency: donor.currency,
        payment_source: paymentSource,
        status: 'completed',
        line_items: lineItems,
        customer_name: donorName,
        billing_name: donorNameReal,
        guest_checkout: donor.guest || false,
        card_holder_name: cardHolderName || null,
        card_last_digits: cardLastDigits,
        card_brand: cardBrand,
        card_expiry: cardExpiry,
        card_type: cardType,
        customer_email: email,
        ip_address: donor.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
        user_agent: donor.ua || req.headers['user-agent'],
        fbp: donor.utm?.fbp || null,
        fbc: donor.utm?.fbc || null,
        fbclid: donor.utm?.fbclid || null,
        ttp: donor.utm?.ttp || null,
        ttclid: donor.utm?.ttclid || null,
        utm_source: donor.utm?.utm_source || null,
        utm_medium: donor.utm?.utm_medium || null,
        utm_campaign: donor.utm?.utm_campaign || null,
        utm_content: donor.utm?.utm_content || null,
        utm_term: donor.utm?.utm_term || null,
        referrer_url: donor.utm?.referrer || null,
        landing_url: donor.utm?.sourceUrl || null,
        stripe_response: {
          paymentIntentId: paymentIntent.id,
          chargeId: charge?.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          cardBrand,
          cardLast4: cardLastDigits,
          walletType: pm?.card?.wallet?.type || null
        }
      });

    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        ...paymentIntent.metadata,
        fulfillment_status: 'delivered',
        fulfilled_at: new Date().toISOString(),
        delivery_method: 'digital_download'
      }
    });

    const campaignCallbackUrls = (process.env.CAMPAIGN_CALLBACK_URLS || '').split(',').filter(Boolean);
    for (const baseUrl of campaignCallbackUrls) {
      try {
        await fetch(`${baseUrl.trim()}/api/payment-callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: CALLBACK_SECRET,
            tokenId: donor.sid,
            paymentData: {
              amount: parseFloat(donor.amount),
              currency: donor.currency,
              storeDomain: STORE_DOMAIN,
              stripeChargeId: charge?.id,
              cardHolderName,
              donorNameReal,
              donorEmail: email,
              customerId,
              ipAddress: donor.ip,
              userAgent: donor.ua,
              tracking: donor.utm || {}
            }
          })
        });
      } catch (callbackErr) {
        console.error(`Callback to ${baseUrl} failed:`, callbackErr.message);
      }
    }

    res.clearCookie('__session', { path: '/' });

    const campaignOrigin = campaignCallbackUrls[0]?.trim() || '';
    const redirectUrl = campaignOrigin ? `${campaignOrigin}?status=complete` : '/';

    res.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('Confirm payment error:', error.message);

    try {
      const sessionCookie = req.cookies.__session;
      const donor = sessionCookie ? JSON.parse(sessionCookie) : {};
      await supabase.from('payment_failures').insert({
        store_id: storeDbId,
        source_ref: donor.ref,
        endpoint: '/api/confirm-payment',
        stripe_payment_intent_id: req.body?.paymentIntentId,
        error_type: 'CONFIRM_ERROR',
        error_code: error.code || 'UNKNOWN',
        error_message: error.message,
        ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
      });
    } catch (logErr) {
      console.error('Failure logging error:', logErr.message);
    }

    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

app.get('/', (req, res) => {
  res.render('pages/home', { store: req.store, products: storeConfig.products || [] });
});

app.get('/products', (req, res) => {
  res.render('pages/catalog', { store: req.store, products: storeConfig.products || [] });
});

app.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const products = storeConfig.products || [];
  const results = q ? products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.category || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  ) : products;
  res.render('pages/catalog', { store: req.store, products: results, searchQuery: q });
});

app.get('/products/:slug', (req, res) => {
  const products = storeConfig.products || [];
  const product = products.find(p => p.slug === req.params.slug);
  if (!product) return res.redirect('/products');
  const related = products.filter(p => p.slug !== product.slug).slice(0, 4);
  res.render('pages/product', { store: req.store, product, related });
});

app.get('/about', (req, res) => {
  res.render('pages/about', { store: req.store });
});

app.get('/contact', (req, res) => {
  res.render('pages/contact', { store: req.store });
});

app.get('/terms', (req, res) => {
  res.render('pages/terms', { store: req.store });
});

app.get('/privacy', (req, res) => {
  res.render('pages/privacy', { store: req.store });
});

app.get('/faq', (req, res) => {
  res.render('pages/faq', { store: req.store });
});

app.get('/cart', (req, res) => {
  res.render('pages/cart', { store: req.store });
});

resolveStoreId().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('\x1b[33m╔═══════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[33m║\x1b[0m  🏪 \x1b[1mStore Server\x1b[0m                                       \x1b[33m║\x1b[0m');
    console.log('\x1b[33m╠═══════════════════════════════════════════════════════╣\x1b[0m');
    console.log(`\x1b[33m║\x1b[0m  🌐 Port:   ${String(PORT).padEnd(41)}\x1b[33m║\x1b[0m`);
    console.log(`\x1b[33m║\x1b[0m  🏷️  Store:  ${storeConfig.name.padEnd(41)}\x1b[33m║\x1b[0m`);
    console.log(`\x1b[33m║\x1b[0m  🌍 Domain: ${STORE_DOMAIN.padEnd(41)}\x1b[33m║\x1b[0m`);
    console.log(`\x1b[33m║\x1b[0m  🆔 DB ID:  ${(storeDbId || 'not resolved').padEnd(41)}\x1b[33m║\x1b[0m`);
    console.log(`\x1b[33m║\x1b[0m  🔒 Referrer-Policy: strict-origin-when-cross-origin   \x1b[33m║\x1b[0m`);
    console.log('\x1b[33m╚═══════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');
  });
});
