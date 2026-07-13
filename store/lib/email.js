const { Resend } = require('resend');
const { StoreLog } = require('./logger');
const { formatAmount } = require('./currency');

const BRAND_NAME = process.env.RESEND_BRAND || 'RiseHope';
const FROM_ADDRESS = process.env.RESEND_FROM || `${BRAND_NAME} <receipts@risehope.online>`;
const REPLY_TO = process.env.RESEND_REPLY_TO || '';

const apiKey = process.env.RESEND_API_KEY || '';
const resend = apiKey ? new Resend(apiKey) : null;

const WALLET_LABELS = {
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  paypal: 'PayPal',
  venmo: 'Venmo',
  link: 'Link'
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstNameOf(name) {
  const raw = String(name || '').trim();
  if (!raw || /^(anonymous|unknown)$/i.test(raw)) return '';
  return raw.split(/\s+/)[0];
}

function paymentMethodLabel(source, brand, last4) {
  if (source && WALLET_LABELS[source]) {
    const base = WALLET_LABELS[source];
    return last4 ? `${base} (•••• ${last4})` : base;
  }
  const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';
  return last4 ? `${b} ending in ${last4}` : b;
}

function buildRows({ donationFormatted, tipFormatted, totalFormatted, hasTip, method, reference, dateStr }) {
  const rows = [];
  if (hasTip) {
    rows.push(['Donation', donationFormatted, false]);
    rows.push(['Tip', tipFormatted, false]);
    rows.push(['Total', totalFormatted, true]);
  } else {
    rows.push(['Donation', totalFormatted, true]);
  }
  rows.push(['__divider__', '', false]);
  if (method) rows.push(['Payment method', method, false]);
  rows.push(['Reference', reference, false]);
  rows.push(['Date', dateStr, false]);
  return rows;
}

function rowsToHtml(rows) {
  return rows.map(([label, value, strong]) => {
    if (label === '__divider__') {
      return '<tr><td colspan="2" style="padding:8px 0;"><div style="height:1px;background:#e4efe9;"></div></td></tr>';
    }
    const valStyle = strong
      ? 'padding:6px 0;text-align:right;font-weight:700;color:#111827;font-size:15px;'
      : 'padding:6px 0;text-align:right;font-weight:600;color:#111827;';
    const labelStyle = strong
      ? 'padding:6px 0;color:#111827;font-weight:700;font-size:15px;'
      : 'padding:6px 0;color:#6b7280;';
    return `<tr><td style="${labelStyle}">${escapeHtml(label)}</td><td style="${valStyle}">${escapeHtml(value)}</td></tr>`;
  }).join('');
}

function rowsToText(rows) {
  return rows
    .filter(([label]) => label !== '__divider__')
    .map(([label, value]) => `${(label + ':').padEnd(16)}${value}`)
    .join('\n');
}

function buildDescriptorNotice(descriptor) {
  const label = descriptor || BRAND_NAME;
  if (!label) return { html: '', text: '' };
  const safe = escapeHtml(label);
  return {
    html: `<p style="margin:14px 28px 0 28px;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">
        On your bank statement, this payment will appear as <strong style="color:#374151;">${safe}</strong> &mdash; that&rsquo;s our secure payment processor.
      </p>`,
    text: `On your bank statement, this payment will appear as ${label} -- that's our secure payment processor.`
  };
}

function buildHtml({ greeting, rows, descriptor }) {
  const notice = buildDescriptorNotice(descriptor);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:540px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:22px;font-weight:700;color:#00a85a;letter-spacing:-0.3px;">${escapeHtml(BRAND_NAME)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Confirmation of your donation</div>
    </div>
    <div style="background:#ffffff;border:1px solid #e8ebee;border-radius:14px;overflow:hidden;">
      <div style="padding:28px 28px 6px 28px;">
        <h1 style="margin:0 0 14px 0;font-size:20px;font-weight:700;color:#111827;">Thank you${greeting ? ', ' + escapeHtml(greeting) : ''}.</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4b5563;">
          Your donation has arrived &mdash; and it truly moves us. Generosity like yours, often from people we may never get to meet, is what carries families through their hardest days.
        </p>
        <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#4b5563;">
          Every gift, no matter its size, becomes real comfort and hope for someone who needs it. Thank you for being part of that.
        </p>
      </div>
      <div style="margin:0 28px 22px 28px;background:#f7faf8;border:1px solid #e4efe9;border-radius:10px;padding:14px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">
          ${rowsToHtml(rows)}
        </table>
      </div>
      <div style="padding:0 28px 24px 28px;">
        <p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;">
          With heartfelt gratitude,<br>The ${escapeHtml(BRAND_NAME)} Team
        </p>
      </div>
      ${notice.html}
      <div style="height:24px;"></div>
    </div>
    <p style="margin:18px 0 0 0;text-align:center;font-size:11px;line-height:1.5;color:#9ca3af;">
      This is a confirmation of a payment you made. Please keep it for your records.
    </p>
  </div>
</body>
</html>`;
}

function buildText({ greeting, rows, descriptor }) {
  const notice = buildDescriptorNotice(descriptor);
  const lines = [
    `Thank you${greeting ? ', ' + greeting : ''}.`,
    '',
    'Your donation has arrived -- and it truly moves us. Generosity like yours, often from people we may never get to meet, is what carries families through their hardest days.',
    '',
    'Every gift, no matter its size, becomes real comfort and hope for someone who needs it. Thank you for being part of that.',
    '',
    rowsToText(rows),
    '',
    'With heartfelt gratitude,',
    `The ${BRAND_NAME} Team`
  ];
  if (notice.text) {
    lines.push('');
    lines.push(notice.text);
  }
  lines.push('');
  lines.push('This is a confirmation of a payment you made. Please keep it for your records.');
  return lines.join('\n');
}

function buildEmail(opts) {
  const {
    name, currency, reference,
    donationAmount, tip, total,
    cardBrand, cardLast4, paymentSource,
    descriptor
  } = opts || {};
  const ref = reference || '---';
  const cur = currency || 'EUR';
  const donationNum = Number(donationAmount);
  const tipNum = Number(tip) || 0;
  const totalNum = Number(total) || (Number.isFinite(donationNum) ? donationNum + tipNum : 0);
  const hasTip = tipNum > 0;

  const rows = buildRows({
    donationFormatted: formatAmount(Number.isFinite(donationNum) ? donationNum : totalNum, cur),
    tipFormatted: formatAmount(tipNum, cur),
    totalFormatted: formatAmount(totalNum, cur),
    hasTip,
    method: paymentMethodLabel(paymentSource, cardBrand, cardLast4),
    reference: ref,
    dateStr: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
  });

  const greeting = firstNameOf(name);
  return {
    subject: 'Thank you for your generous donation',
    html: buildHtml({ greeting, rows, descriptor }),
    text: buildText({ greeting, rows, descriptor })
  };
}

async function sendDonationConfirmation(opts) {
  const { to, reference, paymentIntentId } = opts || {};
  const ref = reference || '---';
  try {
    if (!resend) {
      StoreLog.error('email_failed', ref, 'RESEND_API_KEY not set; skipping confirmation email');
      return;
    }
    if (!to) {
      StoreLog.error('email_failed', ref, 'no recipient email; skipping confirmation email');
      return;
    }

    const { subject, html, text } = buildEmail(opts);
    const payload = { from: FROM_ADDRESS, to: [to], subject, html, text };
    if (REPLY_TO) payload.replyTo = REPLY_TO;
    const options = paymentIntentId ? { idempotencyKey: `donation-confirmation-${paymentIntentId}` } : undefined;

    const { data, error } = await resend.emails.send(payload, options);
    if (error) {
      StoreLog.error('email_failed', ref, `Resend: ${error.message || JSON.stringify(error)}`);
      return;
    }
    StoreLog.event('email_sent', ref, `→ ${to} (${data && data.id ? data.id : 'no-id'})`);
  } catch (err) {
    StoreLog.error('email_failed', ref, err && err.message ? err.message : String(err));
  }
}

module.exports = { sendDonationConfirmation, buildEmail };
