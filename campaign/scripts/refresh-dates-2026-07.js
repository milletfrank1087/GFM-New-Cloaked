#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TODAY_ISO = '2026-07-18';
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
      ['nel dicembre 2025', 'nel febbraio 2026'],
      ['Il 24 dicembre', 'Il 22 febbraio'],
      ['il 10 gennaio 2026', 'il 10 marzo 2026'],
      ['10 gennaio 2026', '10 marzo 2026'],
      ['La RM di controllo di marzo 2026', 'La RM di controllo di maggio 2026']
    ],
    leu: [
      ['nel gennaio 2026', 'nel marzo 2026'],
      ['Il 20 gennaio', 'Il 20 marzo'],
      ['fine giugno', 'fine agosto']
    ]
  },
  pt: {
    gbm: [
      ['em dezembro de 2025', 'em fevereiro de 2026'],
      ['No dia 24 de dezembro', 'No dia 22 de fevereiro'],
      ['24 de dezembro', '22 de fevereiro'],
      ['no dia 10 de janeiro de 2026', 'no dia 10 de março de 2026'],
      ['10 de janeiro de 2026', '10 de março de 2026'],
      ['controlo de março de 2026', 'controlo de maio de 2026']
    ],
    leu: [
      ['em janeiro de 2026', 'em março de 2026'],
      ['20 de janeiro', '20 de março'],
      ['final de junho', 'final de agosto'],
      ['fim de junho', 'fim de agosto']
    ]
  },
  fr: {
    gbm: [
      ['en décembre 2025', 'en février 2026'],
      ['Le 24 décembre', 'Le 22 février'],
      ['le 10 janvier 2026', 'le 10 mars 2026'],
      ['10 janvier 2026', '10 mars 2026'],
      ['contrôle de mars 2026', 'contrôle de mai 2026']
    ],
    leu: [
      ['en janvier 2026', 'en mars 2026'],
      ['Le 20 janvier', 'Le 20 mars'],
      ['fin juin', 'fin août']
    ]
  },
  el: {
    gbm: [
      ['τον Δεκέμβριο του 2025', 'τον Φεβρουάριο του 2026'],
      ['Στις 24 Δεκεμβρίου', 'Στις 22 Φεβρουαρίου'],
      ['στις 10 Ιανουαρίου 2026', 'στις 10 Μαρτίου 2026'],
      ['10 Ιανουαρίου 2026', '10 Μαρτίου 2026'],
      ['ελέγχου τον Μάρτιο 2026', 'ελέγχου τον Μάιο 2026']
    ],
    leu: [
      ['τον Ιανουάριο του 2026', 'τον Μάρτιο του 2026'],
      ['Στις 20 Ιανουαρίου', 'Στις 20 Μαρτίου'],
      ['τέλη Ιουνίου', 'τέλη Αυγούστου']
    ]
  },
  pl: {
    gbm: [
      ['w grudniu 2025', 'w lutym 2026'],
      ['24 grudnia', '22 lutego'],
      ['10 stycznia 2026', '10 marca 2026'],
      ['Kontrolny MRI z marca 2026', 'Kontrolny MRI z maja 2026']
    ],
    leu: [
      ['w styczniu 2026', 'w marcu 2026'],
      ['20 stycznia', '20 marca'],
      ['koniec czerwca', 'koniec sierpnia']
    ]
  },
  es: {
    gbm: [
      ['en diciembre de 2025', 'en febrero de 2026'],
      ['El 24 de diciembre', 'El 22 de febrero'],
      ['el 10 de enero de 2026', 'el 10 de marzo de 2026'],
      ['10 de enero de 2026', '10 de marzo de 2026'],
      ['RM de control de marzo de 2026', 'RM de control de mayo de 2026']
    ],
    leu: [
      ['en enero de 2026', 'en marzo de 2026'],
      ['20 de enero', '20 de marzo'],
      ['finales de junio', 'finales de agosto']
    ]
  },
  'en-uk': {
    gbm: [
      ['in December 2025', 'in February 2026'],
      ['On December 24th', 'On February 22nd'],
      ['24th December', '22nd February'],
      ['on January 10, 2026', 'on March 10, 2026'],
      ['on 10th January 2026', 'on 10th March 2026'],
      ['January 10, 2026', 'March 10, 2026'],
      ['10th January 2026', '10th March 2026'],
      ['follow-up MRI in March 2026', 'follow-up MRI in May 2026'],
      ['MRI in March 2026', 'MRI in May 2026']
    ],
    leu: [
      ['in January 2026', 'in March 2026'],
      ['On January 20th', 'On March 20th'],
      ['20th January', '20th March'],
      ['On 20th January', 'On 20th March'],
      ['end of June', 'end of August'],
      ['late June', 'late August']
    ]
  },
  'en-us': {
    gbm: [
      ['in December 2025', 'in February 2026'],
      ['On December 24th', 'On February 22nd'],
      ['December 24th', 'February 22nd'],
      ['on January 10, 2026', 'on March 10, 2026'],
      ['January 10, 2026', 'March 10, 2026'],
      ['follow-up MRI in March 2026', 'follow-up MRI in May 2026'],
      ['MRI in March 2026', 'MRI in May 2026']
    ],
    leu: [
      ['in January 2026', 'in March 2026'],
      ['On January 20th', 'On March 20th'],
      ['end of June', 'end of August'],
      ['late June', 'late August']
    ]
  }
};

const CHROME_REPLACEMENTS = {
  it:      { createdDate: '1 Giu 2026',  updateDates: { gbm: ['12 Lug 2026', '7 Lug 2026', '20 Giu 2026', '1 Giu 2026'], leu: ['10 Lug 2026', '5 Lug 2026', '20 Giu 2026', '1 Giu 2026'] } },
  pt:      { createdDate: '1 Jun 2026',  updateDates: { gbm: ['12 Jul 2026', '7 Jul 2026', '20 Jun 2026', '1 Jun 2026'], leu: ['10 Jul 2026', '5 Jul 2026', '20 Jun 2026', '1 Jun 2026'] } },
  fr:      { createdDate: '1 Juin 2026', updateDates: { gbm: ['12 Juil 2026', '7 Juil 2026', '20 Juin 2026', '1 Juin 2026'], leu: ['10 Juil 2026', '5 Juil 2026', '20 Juin 2026', '1 Juin 2026'] } },
  el:      { createdDate: '1 Ιουν 2026', updateDates: { gbm: ['12 Ιουλ 2026', '7 Ιουλ 2026', '20 Ιουν 2026', '1 Ιουν 2026'], leu: ['10 Ιουλ 2026', '5 Ιουλ 2026', '20 Ιουν 2026', '1 Ιουν 2026'] } },
  pl:      { createdDate: '1 Cze 2026',  updateDates: { gbm: ['12 Lip 2026', '7 Lip 2026', '20 Cze 2026', '1 Cze 2026'], leu: ['10 Lip 2026', '5 Lip 2026', '20 Cze 2026', '1 Cze 2026'] } },
  es:      { createdDate: '1 Jun 2026',  updateDates: { gbm: ['12 Jul 2026', '7 Jul 2026', '20 Jun 2026', '1 Jun 2026'], leu: ['10 Jul 2026', '5 Jul 2026', '20 Jun 2026', '1 Jun 2026'] } },
  'en-uk': { createdDate: '1 Jun 2026',  updateDates: { gbm: ['12 Jul 2026', '7 Jul 2026', '20 Jun 2026', '1 Jun 2026'], leu: ['10 Jul 2026', '5 Jul 2026', '20 Jun 2026', '1 Jun 2026'] } },
  'en-us': { createdDate: '1 Jun 2026',  updateDates: { gbm: ['12 Jul 2026', '7 Jul 2026', '20 Jun 2026', '1 Jun 2026'], leu: ['10 Jul 2026', '5 Jul 2026', '20 Jun 2026', '1 Jun 2026'] } }
};

const DAYS_LEFT_BY_FILE = {
  'glioblastoma-grace.json': 31,
  'glioblastoma-emily.json': 34,
  'glioblastoma-serafina.json': 29,
  'glioblastoma-mariana.json': 36,
  'glioblastoma-sofia.json': 33,
  'glioblastome-chloe.json': 28,
  'glejak-natalia.json': 37,
  'glioblastoma-lucia.json': 32,
  'leukemia-grace.json': 35,
  'leukemia-emily.json': 30,
  'leucemia-serafina.json': 38,
  'leucemia-mariana.json': 27,
  'leukemia-sofia.json': 34,
  'leucemie-chloe.json': 31,
  'bialaczka-natalia.json': 33,
  'leucemia-lucia.json': 36
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
  json.daysLeft = DAYS_LEFT_BY_FILE[basename] || 33;

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
  console.log(`[refresh-dates-2026-07] today=${TODAY_ISO} dryRun=${DRY_RUN}`);
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
  console.log(`[refresh-dates-2026-07] processed ${results.length} campaign files (${DRY_RUN ? 'dry-run' : 'written'})`);
  if (results.length > 0) {
    console.log('\nSummary:');
    for (const r of results) {
      console.log(`  ${r.file.padEnd(35)} lang=${r.lang.padEnd(5)} ${r.disease} bodyHits=${r.bodyHits} daysLeft=${r.daysLeft}`);
    }
  }
}

main();
