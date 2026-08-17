#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TODAY_ISO = '2026-08-14';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || DRY_RUN;

const CAMPAIGNS_DIR = path.join(__dirname, '..', 'campaigns');

function log(...args) {
  if (VERBOSE) console.log('[refresh-dates]', ...args);
}

function detectLanguage(filename) {
  const base = path.basename(filename);
  if (base.startsWith('glioblastoma-serafina') || base.startsWith('leucemia-serafina')) return 'it';
  if (base.startsWith('glioblastoma-mariana') || base.startsWith('leucemia-mariana')) return 'pt';
  if (base.startsWith('glioblastome-chloe') || base.startsWith('leucemie-chloe')) return 'fr';
  if (base.startsWith('glioblastoma-sofia') || base.startsWith('leukemia-sofia')) return 'el';
  if (base.startsWith('glejak-natalia') || base.startsWith('bialaczka-natalia')) return 'pl';
  if (base.startsWith('glioblastoma-lucia') || base.startsWith('leucemia-lucia')) return 'es';
  if (base.startsWith('glioblastoma-emily') || base.startsWith('leukemia-emily')) return 'en-us';
  if (base.startsWith('glioblastoma-grace') || base.startsWith('leukemia-grace')) return 'en-uk';
  return null;
}

function detectDisease(filename) {
  const base = path.basename(filename);
  if (base.startsWith('glioblastom') || base.startsWith('glejak')) return 'gbm';
  return 'leu';
}

const BODY_REPLACEMENTS = {
  it: {
    gbm: [
      ['nel febbraio 2026', 'nell\'aprile 2026'],
      ['Il 22 febbraio', 'Il 20 aprile'],
      ['il 10 marzo 2026', 'il 10 maggio 2026'],
      ['10 marzo 2026', '10 maggio 2026'],
      ['La RM di controllo di maggio 2026', 'La RM di controllo di luglio 2026'],
      ['ad aprile, se otteniamo', 'a settembre, se otteniamo'],
      ['ad aprile se otteniamo', 'a settembre se otteniamo']
    ],
    leu: [
      ['nel marzo 2026', 'nel maggio 2026'],
      ['Il 20 marzo', 'Il 18 maggio'],
      ['fine agosto', 'fine settembre']
    ]
  },
  pt: {
    gbm: [
      ['em fevereiro de 2026', 'em abril de 2026'],
      ['No dia 22 de fevereiro', 'No dia 20 de abril'],
      ['22 de fevereiro', '20 de abril'],
      ['no dia 10 de março de 2026', 'no dia 10 de maio de 2026'],
      ['10 de março de 2026', '10 de maio de 2026'],
      ['controlo de maio de 2026', 'controlo de julho de 2026'],
      ['em abril, se conseguirmos', 'em setembro, se conseguirmos'],
      ['em abril se conseguirmos', 'em setembro se conseguirmos']
    ],
    leu: [
      ['em março de 2026', 'em maio de 2026'],
      ['20 de março', '18 de maio'],
      ['final de agosto', 'final de setembro'],
      ['fim de agosto', 'fim de setembro']
    ]
  },
  fr: {
    gbm: [
      ['en février 2026', 'en avril 2026'],
      ['Le 22 février', 'Le 20 avril'],
      ['le 10 mars 2026', 'le 10 mai 2026'],
      ['10 mars 2026', '10 mai 2026'],
      ['contrôle de mai 2026', 'contrôle de juillet 2026'],
      ['en avril, si nous obtenons', 'en septembre, si nous obtenons'],
      ['en avril si nous obtenons', 'en septembre si nous obtenons']
    ],
    leu: [
      ['en mars 2026', 'en mai 2026'],
      ['Le 20 mars', 'Le 18 mai'],
      ['fin août', 'fin septembre']
    ]
  },
  el: {
    gbm: [
      ['τον Φεβρουάριο του 2026', 'τον Απρίλιο του 2026'],
      ['Στις 22 Φεβρουαρίου', 'Στις 20 Απριλίου'],
      ['στις 10 Μαρτίου 2026', 'στις 10 Μαΐου 2026'],
      ['10 Μαρτίου 2026', '10 Μαΐου 2026'],
      ['ελέγχου τον Μάιο 2026', 'ελέγχου τον Ιούλιο 2026'],
      ['τον Απρίλιο, αν εξασφαλίσουμε', 'τον Σεπτέμβριο, αν εξασφαλίσουμε'],
      ['τον Απρίλιο, εάν εξασφαλίσουμε', 'τον Σεπτέμβριο, εάν εξασφαλίσουμε'],
      ['τον Απρίλιο εάν εξασφαλίσουμε', 'τον Σεπτέμβριο εάν εξασφαλίσουμε']
    ],
    leu: [
      ['τον Μάρτιο του 2026', 'τον Μάιο του 2026'],
      ['Στις 20 Μαρτίου', 'Στις 18 Μαΐου'],
      ['τέλη Αυγούστου', 'τέλη Σεπτεμβρίου']
    ]
  },
  pl: {
    gbm: [
      ['w lutym 2026', 'w kwietniu 2026'],
      ['22 lutego', '20 kwietnia'],
      ['10 marca 2026', '10 maja 2026'],
      ['Kontrolny MRI z maja 2026', 'Kontrolny MRI z lipca 2026'],
      ['w kwietniu, jeśli', 'we wrześniu, jeśli'],
      ['w kwietniu jeśli', 'we wrześniu jeśli']
    ],
    leu: [
      ['w marcu 2026', 'w maju 2026'],
      ['20 marca', '18 maja'],
      ['koniec sierpnia', 'koniec września']
    ]
  },
  es: {
    gbm: [
      ['en febrero de 2026', 'en abril de 2026'],
      ['El 22 de febrero', 'El 20 de abril'],
      ['el 10 de marzo de 2026', 'el 10 de mayo de 2026'],
      ['10 de marzo de 2026', '10 de mayo de 2026'],
      ['RM de control de mayo de 2026', 'RM de control de julio de 2026'],
      ['en abril, si conseguimos', 'en septiembre, si conseguimos'],
      ['en abril si conseguimos', 'en septiembre si conseguimos']
    ],
    leu: [
      ['en marzo de 2026', 'en mayo de 2026'],
      ['20 de marzo', '18 de mayo'],
      ['finales de agosto', 'finales de septiembre']
    ]
  },
  'en-uk': {
    gbm: [
      ['in February 2026', 'in April 2026'],
      ['On February 22nd', 'On April 20th'],
      ['22nd February', '20th April'],
      ['on 10th March 2026', 'on 10th May 2026'],
      ['10th March 2026', '10th May 2026'],
      ['follow-up MRI in May 2026', 'follow-up MRI in July 2026'],
      ['MRI in May 2026', 'MRI in July 2026'],
      ['in April, if we secure', 'in September, if we secure'],
      ['in April if we secure', 'in September if we secure']
    ],
    leu: [
      ['in March 2026', 'in May 2026'],
      ['On March 20th', 'On May 18th'],
      ['20th March', '18th May'],
      ['On 20th March', 'On 18th May'],
      ['late August', 'late September'],
      ['end of August', 'end of September']
    ]
  },
  'en-us': {
    gbm: [
      ['in February 2026', 'in April 2026'],
      ['On February 22nd', 'On April 20th'],
      ['February 22nd', 'April 20th'],
      ['on March 10, 2026', 'on May 10, 2026'],
      ['March 10, 2026', 'May 10, 2026'],
      ['follow-up MRI in May 2026', 'follow-up MRI in July 2026'],
      ['MRI in May 2026', 'MRI in July 2026'],
      ['in April, if we secure', 'in September, if we secure'],
      ['in April if we secure', 'in September if we secure']
    ],
    leu: [
      ['in March 2026', 'in May 2026'],
      ['On March 20th', 'On May 18th'],
      ['March 20th', 'May 18th'],
      ['late August', 'late September'],
      ['end of August', 'end of September']
    ]
  }
};

const CHROME_REPLACEMENTS = {
  it:      { createdDate: '15 Lug 2026', updateDates: { gbm: ['10 Ago 2026', '4 Ago 2026', '25 Lug 2026', '15 Lug 2026'], leu: ['11 Ago 2026', '5 Ago 2026', '26 Lug 2026', '15 Lug 2026'] } },
  pt:      { createdDate: '15 Jul 2026', updateDates: { gbm: ['10 Ago 2026', '4 Ago 2026', '25 Jul 2026', '15 Jul 2026'], leu: ['11 Ago 2026', '5 Ago 2026', '26 Jul 2026', '15 Jul 2026'] } },
  fr:      { createdDate: '15 Juil 2026', updateDates: { gbm: ['10 Août 2026', '4 Août 2026', '25 Juil 2026', '15 Juil 2026'], leu: ['11 Août 2026', '5 Août 2026', '26 Juil 2026', '15 Juil 2026'] } },
  el:      { createdDate: '15 Ιουλ 2026', updateDates: { gbm: ['10 Αυγ 2026', '4 Αυγ 2026', '25 Ιουλ 2026', '15 Ιουλ 2026'], leu: ['11 Αυγ 2026', '5 Αυγ 2026', '26 Ιουλ 2026', '15 Ιουλ 2026'] } },
  pl:      { createdDate: '15 Lip 2026', updateDates: { gbm: ['10 Sie 2026', '4 Sie 2026', '25 Lip 2026', '15 Lip 2026'], leu: ['11 Sie 2026', '5 Sie 2026', '26 Lip 2026', '15 Lip 2026'] } },
  es:      { createdDate: '15 Jul 2026', updateDates: { gbm: ['10 Ago 2026', '4 Ago 2026', '25 Jul 2026', '15 Jul 2026'], leu: ['11 Ago 2026', '5 Ago 2026', '26 Jul 2026', '15 Jul 2026'] } },
  'en-uk': { createdDate: '15 Jul 2026', updateDates: { gbm: ['10 Aug 2026', '4 Aug 2026', '25 Jul 2026', '15 Jul 2026'], leu: ['11 Aug 2026', '5 Aug 2026', '26 Jul 2026', '15 Jul 2026'] } },
  'en-us': { createdDate: '15 Jul 2026', updateDates: { gbm: ['10 Aug 2026', '4 Aug 2026', '25 Jul 2026', '15 Jul 2026'], leu: ['11 Aug 2026', '5 Aug 2026', '26 Jul 2026', '15 Jul 2026'] } }
};

const DAYS_LEFT_BY_FILE = {
  'glioblastoma-grace.json': 29,
  'glioblastoma-emily.json': 32,
  'glioblastoma-serafina.json': 31,
  'glioblastoma-mariana.json': 35,
  'glioblastoma-sofia.json': 28,
  'glioblastome-chloe.json': 34,
  'glejak-natalia.json': 30,
  'glioblastoma-lucia.json': 33,
  'leukemia-grace.json': 33,
  'leukemia-emily.json': 28,
  'leucemia-serafina.json': 36,
  'leucemia-mariana.json': 30,
  'leukemia-sofia.json': 32,
  'leucemie-chloe.json': 29,
  'bialaczka-natalia.json': 35,
  'leucemia-lucia.json': 31
};

function refreshFile(filePath) {
  const lang = detectLanguage(filePath);
  const disease = detectDisease(filePath);
  if (!lang) { log(`SKIP unknown language: ${filePath}`); return null; }

  const raw = fs.readFileSync(filePath, 'utf8');
  let json;
  try { json = JSON.parse(raw); } catch (e) { console.error(`FAIL parse ${filePath}: ${e.message}`); return null; }

  let textContent = JSON.stringify(json);
  const bodyMap = BODY_REPLACEMENTS[lang]?.[disease];
  let bodyHits = 0;
  if (bodyMap) {
    const sentinels = [];
    bodyMap.forEach(([oldStr, newStr], idx) => {
      const token = `\u0001SENT${idx}\u0001`;
      const before = textContent;
      textContent = textContent.split(oldStr).join(token);
      if (textContent !== before) { bodyHits++; sentinels.push([token, newStr]); }
    });
    for (const [token, newStr] of sentinels) {
      textContent = textContent.split(token).join(newStr);
    }
  }
  json = JSON.parse(textContent);

  const chrome = CHROME_REPLACEMENTS[lang];
  if (chrome) {
    if (json.organizer?.createdDate) json.organizer.createdDate = chrome.createdDate;
    const updateDates = chrome.updateDates[disease];
    if (Array.isArray(json.updates) && updateDates) {
      json.updates.forEach((u, idx) => {
        if (updateDates[idx]) u.date = updateDates[idx];
        u.isNew = idx === 0;
      });
    }
  }

  const basename = path.basename(filePath);
  json.daysLeft = DAYS_LEFT_BY_FILE[basename] || 32;

  const out = JSON.stringify(json, null, 2) + '\n';
  if (DRY_RUN) {
    log(`DRY ${basename}: lang=${lang} disease=${disease} bodyHits=${bodyHits} raised=${json.raised} donors=${json.donorCount} daysLeft=${json.daysLeft}`);
  } else {
    fs.writeFileSync(filePath, out, 'utf8');
    log(`WROTE ${basename}: lang=${lang} disease=${disease} bodyHits=${bodyHits} raised=${json.raised} donors=${json.donorCount} daysLeft=${json.daysLeft}`);
  }
  return { file: basename, lang, disease, bodyHits, daysLeft: json.daysLeft };
}

function main() {
  console.log(`[refresh-dates-2026-08] today=${TODAY_ISO} dryRun=${DRY_RUN}`);
  const results = [];
  for (const sub of ['glioblastoma', 'leukemia']) {
    const dir = path.join(CAMPAIGNS_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const r = refreshFile(path.join(dir, file));
      if (r) results.push(r);
    }
  }
  console.log(`[refresh-dates-2026-08] processed ${results.length} campaign files (${DRY_RUN ? 'dry-run' : 'written'})`);
  if (results.length > 0) {
    console.log('\nSummary:');
    for (const r of results) {
      console.log(`  ${r.file.padEnd(35)} lang=${r.lang.padEnd(5)} ${r.disease} bodyHits=${r.bodyHits} daysLeft=${r.daysLeft}`);
    }
  }
}

main();
