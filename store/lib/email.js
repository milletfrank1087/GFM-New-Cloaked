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

function buildDescriptorNotice(descriptor, isSanctuary) {
  const label = isSanctuary ? 'RISEHOPE' : (descriptor || BRAND_NAME);
  if (!label) return { html: '', text: '' };
  const safe = escapeHtml(label);
  const textColor = isSanctuary ? '#646960' : '#6b7280';
  const strongColor = isSanctuary ? '#263e33' : '#374151';
  return {
    html: `<p style="margin:14px 28px 0 28px;font-size:12px;line-height:1.5;color:${textColor};text-align:center;">
        On your bank statement, this transaction will appear as <strong style="color:${strongColor};">${safe}</strong> &mdash; that&rsquo;s our secure payment processing descriptor.
      </p>`,
    text: `On your bank statement, this transaction will appear as ${label} -- that's our secure payment processing descriptor.`
  };
}

const EMAIL_TEMPLATES = {
  default: {
    subject: 'Thank you for your generous donation',
    brandColor: '#00a85a',
    tagline: 'Confirmation of your donation',
    heading: (g) => `Thank you${g ? ', ' + g : ''}.`,
    body: [
      'Your donation has arrived &mdash; and it truly moves us. Generosity like yours, often from people we may never get to meet, is what carries families through their hardest days.',
      'Every gift, no matter its size, becomes real comfort and hope for someone who needs it. Thank you for being part of that.'
    ],
    signoff: `With heartfelt gratitude,<br>The ${escapeHtml(BRAND_NAME)} Team`,
    footerText: 'This is a confirmation of a payment you made. Please keep it for your records.',
    textBody: [
      'Your donation has arrived -- and it truly moves us. Generosity like yours, often from people we may never get to meet, is what carries families through their hardest days.',
      'Every gift, no matter its size, becomes real comfort and hope for someone who needs it. Thank you for being part of that.'
    ],
    textSignoff: `With heartfelt gratitude,\nThe ${BRAND_NAME} Team`
  },
  sanctuary: {
    subject: 'Official Receipt: Your calf sanctuary sponsorship is confirmed',
    brandColor: '#2d5140',
    tagline: 'Emergency Neonatal Calf Rescue &bull; Congressional Docket #AGR-2026-884',
    heading: (g) => `Thank you${g ? ', ' + g : ''} &mdash; orphaned calves are receiving warm care tonight because of you.`,
    body: [
      'Your sponsorship has been recorded in the Frontline Calf Rescue registry and is already being directed toward emergency nursery stalls, warm colostrum formula bottles, and around-the-clock veterinary triage for vulnerable newborn calves across our sanctuary network.',
      'Calves arriving from commercial livestock barns &mdash; including fragile newborns like baby Barnaby who needed intensive incubator care &mdash; receive fresh thermal straw bedding, electrolyte replenishment, and lifetime sanctuary pasture protection where they will never face an auction ring.'
    ],
    signoff: 'With profound gratitude for standing with them,<br><strong>Frontline Calf Rescue Team</strong>',
    footerText: 'Frontline Calf Rescue is an independent citizen advocacy coalition and frontline animal rescue fund (Docket #AGR-2026-884). Contributions underwrite direct veterinary care and are non-tax-deductible.',
    textBody: [
      'Your sponsorship has been recorded in the Frontline Calf Rescue registry and is already being directed toward emergency nursery stalls, warm colostrum formula bottles, and around-the-clock veterinary triage for vulnerable newborn calves across our sanctuary network.',
      'Calves arriving from commercial livestock barns -- including fragile newborns like baby Barnaby who needed intensive incubator care -- receive fresh thermal straw bedding, electrolyte replenishment, and lifetime sanctuary pasture protection where they will never face an auction ring.'
    ],
    textSignoff: 'With profound gratitude for standing with them,\nFrontline Calf Rescue Team'
  }
};

function getTemplate(templateId) {
  return EMAIL_TEMPLATES[templateId] || EMAIL_TEMPLATES.default;
}

function buildHtml({ greeting, rows, descriptor, templateId }) {
  const isSanctuary = templateId === 'sanctuary';
  const notice = buildDescriptorNotice(descriptor, isSanctuary);
  const t = getTemplate(templateId);
  const safeGreeting = escapeHtml(greeting);

  if (isSanctuary) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f6ef;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#263e33;">
  <div style="max-width:540px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#263e33;letter-spacing:-0.5px;">Frontline <span style="font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#646960;text-transform:uppercase;">CALF RESCUE</span></div>
      <div style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:100px;background:#eaf0e5;border:1px solid #d8dccf;font-size:11px;font-weight:600;color:#486044;">Docket #AGR-2026-884 &bull; Certified Citizen Inscription</div>
    </div>
    <div style="background:#fffefa;border:1px solid #d8dccf;border-radius:10px;box-shadow:0 8px 30px rgba(38,62,51,0.05);overflow:hidden;">
      <div style="padding:28px 28px 8px 28px;">
        <h1 style="margin:0 0 14px 0;font-family:Georgia,serif;font-size:21px;font-weight:400;line-height:1.25;color:#263e33;">${t.heading(safeGreeting)}</h1>
        ${t.body.map(p => `<p style="margin:0 0 14px 0;font-size:14.5px;line-height:1.6;color:#486044;">${p}</p>`).join('\n        ')}
      </div>
      <div style="margin:0 24px 20px 24px;background:#eaf0e5;border:1px solid #d8dccf;border-radius:8px;padding:14px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;color:#263e33;">
          ${rowsToHtml(rows)}
        </table>
      </div>
      <div style="padding:0 28px 20px 28px;">
        <p style="margin:0;font-size:14px;line-height:1.55;color:#486044;">
          ${t.signoff}
        </p>
      </div>
      ${notice.html}
      <div style="height:20px;"></div>
    </div>
    <p style="margin:18px 0 0 0;text-align:center;font-size:11px;line-height:1.5;color:#646960;">
      ${escapeHtml(t.footerText)}
    </p>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:540px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:22px;font-weight:700;color:${t.brandColor};letter-spacing:-0.3px;">${escapeHtml(BRAND_NAME)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${t.tagline}</div>
    </div>
    <div style="background:#ffffff;border:1px solid #e8ebee;border-radius:14px;overflow:hidden;">
      <div style="padding:28px 28px 6px 28px;">
        <h1 style="margin:0 0 14px 0;font-size:20px;font-weight:700;color:#111827;">${t.heading(safeGreeting)}</h1>
        ${t.body.map(p => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4b5563;">${p}</p>`).join('\n        ')}
      </div>
      <div style="margin:0 28px 22px 28px;background:#f7faf8;border:1px solid #e4efe9;border-radius:10px;padding:14px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">
          ${rowsToHtml(rows)}
        </table>
      </div>
      <div style="padding:0 28px 24px 28px;">
        <p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;">
          ${t.signoff}
        </p>
      </div>
      ${notice.html}
      <div style="height:24px;"></div>
    </div>
    <p style="margin:18px 0 0 0;text-align:center;font-size:11px;line-height:1.5;color:#9ca3af;">
      ${escapeHtml(t.footerText)}
    </p>
  </div>
</body>
</html>`;
}

function buildText({ greeting, rows, descriptor, templateId }) {
  const notice = buildDescriptorNotice(descriptor);
  const t = getTemplate(templateId);
  const headingText = t.heading(greeting || '').replace(/&mdash;/g, '--').replace(/&[a-z]+;/g, '');
  const lines = [headingText, ''];
  for (const p of t.textBody) {
    lines.push(p, '');
  }
  lines.push(rowsToText(rows), '', t.textSignoff);
  if (notice.text) {
    lines.push('', notice.text);
  }
  lines.push('', t.footerText);
  return lines.join('\n');
}

function buildEmail(opts) {
  const {
    name, currency, reference,
    donationAmount, tip, total,
    cardBrand, cardLast4, paymentSource,
    descriptor, emailTemplate
  } = opts || {};
  const ref = reference || '---';
  const cur = currency || 'EUR';
  const donationNum = Number(donationAmount);
  const tipNum = Number(tip) || 0;
  const totalNum = Number(total) || (Number.isFinite(donationNum) ? donationNum + tipNum : 0);
  const hasTip = tipNum > 0;
  const templateId = emailTemplate || 'default';

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
  const t = getTemplate(templateId);
  return {
    subject: t.subject,
    html: buildHtml({ greeting, rows, descriptor, templateId }),
    text: buildText({ greeting, rows, descriptor, templateId })
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
