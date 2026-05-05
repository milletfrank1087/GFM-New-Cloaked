const RECENT_ALERTS = new Map();
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function shouldEmit(key) {
  const now = Date.now();
  const last = RECENT_ALERTS.get(key) || 0;
  if (now - last < DEDUPE_WINDOW_MS) return false;
  RECENT_ALERTS.set(key, now);
  if (RECENT_ALERTS.size > 200) {
    for (const [k, t] of RECENT_ALERTS.entries()) {
      if (now - t > DEDUPE_WINDOW_MS) RECENT_ALERTS.delete(k);
    }
  }
  return true;
}

function loudConsole(title, lines) {
  const RED = '\x1b[41m\x1b[37m\x1b[1m';
  const RESET = '\x1b[0m';
  const sep = '═'.repeat(72);
  console.error(`${RED}${sep}${RESET}`);
  console.error(`${RED} OPERATOR ALERT :: ${title.padEnd(50)}${RESET}`);
  console.error(`${RED}${sep}${RESET}`);
  for (const ln of lines) console.error(`${RED} ${String(ln).padEnd(70)}${RESET}`);
  console.error(`${RED}${sep}${RESET}`);
}

async function postWebhook(url, payload) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[alerts] webhook ${url} returned ${res.status}`);
    }
  } catch (err) {
    console.error(`[alerts] webhook ${url} failed: ${err.message}`);
  }
}

async function emitAlert({ key, title, severity = 'critical', context = {} }) {
  if (!shouldEmit(key)) return;

  const storeDomain = process.env.STORE_DOMAIN || 'unknown';
  const storeId = process.env.STORE_ID || 'unknown';
  const lines = [
    `Store      : ${storeId} (${storeDomain})`,
    `Severity   : ${severity}`,
    `Time (UTC) : ${new Date().toISOString()}`,
    ''
  ];
  for (const [k, v] of Object.entries(context)) {
    lines.push(`${k.padEnd(11)}: ${String(v).slice(0, 200)}`);
  }
  loudConsole(title, lines);

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (webhook) {
    const text = `*${title}*\n` +
      `Store: \`${storeId}\` (${storeDomain})\n` +
      `Severity: \`${severity}\`\n` +
      `Time: ${new Date().toISOString()}\n` +
      Object.entries(context).map(([k, v]) => `${k}: \`${String(v).slice(0, 200)}\``).join('\n');
    const payload = {
      text,
      content: text,
      title,
      severity,
      store: storeId,
      domain: storeDomain,
      context,
      timestamp: new Date().toISOString()
    };
    await postWebhook(webhook, payload);
  }
}

module.exports = { emitAlert };
