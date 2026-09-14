#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TODAY_ISO = '2026-09-14';
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

// GBM: April→June, 20th April→20th June, May→July, July MRI→September MRI, September clinic→November clinic
// LEU: May→July, 18th May→18th July, late September transplant→late November
const BODY_REPLACEMENTS = {
  it: {
    gbm: [
      ['nell\'aprile 2026', 'nel giugno 2026'],
      ['Il 20 aprile', 'Il 20 giugno'],
      ['il 10 maggio 2026', 'il 10 luglio 2026'],
      ['10 maggio 2026', '10 luglio 2026'],
      ['La RM di controllo di luglio 2026', 'La RM di controllo di settembre 2026'],
      ['a settembre, se otteniamo', 'a novembre, se otteniamo'],
      ['a settembre se otteniamo', 'a novembre se otteniamo']
    ],
    leu: [
      ['nel maggio 2026', 'nel luglio 2026'],
      ['Il 18 maggio', 'Il 18 luglio'],
      ['fine settembre', 'fine novembre']
    ]
  },
  pt: {
    gbm: [
      ['em abril de 2026', 'em junho de 2026'],
      ['No dia 20 de abril', 'No dia 20 de junho'],
      ['20 de abril', '20 de junho'],
      ['no dia 10 de maio de 2026', 'no dia 10 de julho de 2026'],
      ['10 de maio de 2026', '10 de julho de 2026'],
      ['controlo de julho de 2026', 'controlo de setembro de 2026'],
      ['em setembro, se conseguirmos', 'em novembro, se conseguirmos'],
      ['em setembro se conseguirmos', 'em novembro se conseguirmos']
    ],
    leu: [
      ['em maio de 2026', 'em julho de 2026'],
      ['18 de maio', '18 de julho'],
      ['final de setembro', 'final de novembro'],
      ['fim de setembro', 'fim de novembro']
    ]
  },
  fr: {
    gbm: [
      ['en avril 2026', 'en juin 2026'],
      ['Le 20 avril', 'Le 20 juin'],
      ['le 10 mai 2026', 'le 10 juillet 2026'],
      ['10 mai 2026', '10 juillet 2026'],
      ['contrôle de juillet 2026', 'contrôle de septembre 2026'],
      ['en septembre, si nous obtenons', 'en novembre, si nous obtenons'],
      ['en septembre si nous obtenons', 'en novembre si nous obtenons']
    ],
    leu: [
      ['en mai 2026', 'en juillet 2026'],
      ['Le 18 mai', 'Le 18 juillet'],
      ['fin septembre', 'fin novembre']
    ]
  },
  el: {
    gbm: [
      ['τον Απρίλιο του 2026', 'τον Ιούνιο του 2026'],
      ['Στις 20 Απριλίου', 'Στις 20 Ιουνίου'],
      ['στις 10 Μαΐου 2026', 'στις 10 Ιουλίου 2026'],
      ['10 Μαΐου 2026', '10 Ιουλίου 2026'],
      ['ελέγχου τον Ιούλιο 2026', 'ελέγχου τον Σεπτέμβριο 2026'],
      ['τον Σεπτέμβριο, αν εξασφαλίσουμε', 'τον Νοέμβριο, αν εξασφαλίσουμε'],
      ['τον Σεπτέμβριο, εάν εξασφαλίσουμε', 'τον Νοέμβριο, εάν εξασφαλίσουμε'],
      ['τον Σεπτέμβριο εάν εξασφαλίσουμε', 'τον Νοέμβριο εάν εξασφαλίσουμε']
    ],
    leu: [
      ['τον Μάιο του 2026', 'τον Ιούλιο του 2026'],
      ['Στις 18 Μαΐου', 'Στις 18 Ιουλίου'],
      ['τέλη Σεπτεμβρίου', 'τέλη Νοεμβρίου']
    ]
  },
  pl: {
    gbm: [
      ['w kwietniu 2026', 'w czerwcu 2026'],
      ['20 kwietnia', '20 czerwca'],
      ['10 maja 2026', '10 lipca 2026'],
      ['Kontrolny MRI z lipca 2026', 'Kontrolny MRI z września 2026'],
      ['we wrześniu, jeśli', 'w listopadzie, jeśli'],
      ['we wrześniu jeśli', 'w listopadzie jeśli']
    ],
    leu: [
      ['w maju 2026', 'w lipcu 2026'],
      ['18 maja', '18 lipca'],
      ['koniec września', 'koniec listopada']
    ]
  },
  es: {
    gbm: [
      ['en abril de 2026', 'en junio de 2026'],
      ['El 20 de abril', 'El 20 de junio'],
      ['el 10 de mayo de 2026', 'el 10 de julio de 2026'],
      ['10 de mayo de 2026', '10 de julio de 2026'],
      ['RM de control de julio de 2026', 'RM de control de septiembre de 2026'],
      ['en septiembre, si conseguimos', 'en noviembre, si conseguimos'],
      ['en septiembre si conseguimos', 'en noviembre si conseguimos']
    ],
    leu: [
      ['en mayo de 2026', 'en julio de 2026'],
      ['18 de mayo', '18 de julio'],
      ['finales de septiembre', 'finales de noviembre']
    ]
  },
  'en-uk': {
    gbm: [
      ['in April 2026', 'in June 2026'],
      ['On April 20th', 'On June 20th'],
      ['20th April', '20th June'],
      ['on 10th May 2026', 'on 10th July 2026'],
      ['10th May 2026', '10th July 2026'],
      ['follow-up MRI in July 2026', 'follow-up MRI in September 2026'],
      ['MRI in July 2026', 'MRI in September 2026'],
      ['in September, if we secure', 'in November, if we secure'],
      ['in September if we secure', 'in November if we secure']
    ],
    leu: [
      ['in May 2026', 'in July 2026'],
      ['On May 18th', 'On July 18th'],
      ['18th May', '18th July'],
      ['On 18th May', 'On 18th July'],
      ['late September', 'late November'],
      ['end of September', 'end of November']
    ]
  },
  'en-us': {
    gbm: [
      ['in April 2026', 'in June 2026'],
      ['On April 20th', 'On June 20th'],
      ['April 20th', 'June 20th'],
      ['on May 10, 2026', 'on July 10, 2026'],
      ['May 10, 2026', 'July 10, 2026'],
      ['follow-up MRI in July 2026', 'follow-up MRI in September 2026'],
      ['MRI in July 2026', 'MRI in September 2026'],
      ['in September, if we secure', 'in November, if we secure'],
      ['in September if we secure', 'in November if we secure']
    ],
    leu: [
      ['in May 2026', 'in July 2026'],
      ['On May 18th', 'On July 18th'],
      ['May 18th', 'July 18th'],
      ['late September', 'late November'],
      ['end of September', 'end of November']
    ]
  }
};

// createdDate → 1 Sep 2026; update dates → Sep 12, Sep 5, Aug 27, Aug 16
const CHROME_REPLACEMENTS = {
  it:      { createdDate: '1 Set 2026', updateDates: { gbm: ['12 Set 2026', '5 Set 2026', '27 Ago 2026', '16 Ago 2026'], leu: ['13 Set 2026', '6 Set 2026', '28 Ago 2026', '16 Ago 2026'] } },
  pt:      { createdDate: '1 Set 2026', updateDates: { gbm: ['12 Set 2026', '5 Set 2026', '27 Ago 2026', '16 Ago 2026'], leu: ['13 Set 2026', '6 Set 2026', '28 Ago 2026', '16 Ago 2026'] } },
  fr:      { createdDate: '1 Sep 2026', updateDates: { gbm: ['12 Sep 2026', '5 Sep 2026', '27 Août 2026', '16 Août 2026'], leu: ['13 Sep 2026', '6 Sep 2026', '28 Août 2026', '16 Août 2026'] } },
  el:      { createdDate: '1 Σεπ 2026', updateDates: { gbm: ['12 Σεπ 2026', '5 Σεπ 2026', '27 Αυγ 2026', '16 Αυγ 2026'], leu: ['13 Σεπ 2026', '6 Σεπ 2026', '28 Αυγ 2026', '16 Αυγ 2026'] } },
  pl:      { createdDate: '1 Wrz 2026', updateDates: { gbm: ['12 Wrz 2026', '5 Wrz 2026', '27 Sie 2026', '16 Sie 2026'], leu: ['13 Wrz 2026', '6 Wrz 2026', '28 Sie 2026', '16 Sie 2026'] } },
  es:      { createdDate: '1 Sep 2026', updateDates: { gbm: ['12 Sep 2026', '5 Sep 2026', '27 Ago 2026', '16 Ago 2026'], leu: ['13 Sep 2026', '6 Sep 2026', '28 Ago 2026', '16 Ago 2026'] } },
  'en-uk': { createdDate: '1 Sep 2026', updateDates: { gbm: ['12 Sep 2026', '5 Sep 2026', '27 Aug 2026', '16 Aug 2026'], leu: ['13 Sep 2026', '6 Sep 2026', '28 Aug 2026', '16 Aug 2026'] } },
  'en-us': { createdDate: '1 Sep 2026', updateDates: { gbm: ['12 Sep 2026', '5 Sep 2026', '27 Aug 2026', '16 Aug 2026'], leu: ['13 Sep 2026', '6 Sep 2026', '28 Aug 2026', '16 Aug 2026'] } }
};

const DAYS_LEFT_BY_FILE = {
  'glioblastoma-grace.json': 31,
  'glioblastoma-emily.json': 27,
  'glioblastoma-serafina.json': 34,
  'glioblastoma-mariana.json': 29,
  'glioblastoma-sofia.json': 37,
  'glioblastome-chloe.json': 26,
  'glejak-natalia.json': 33,
  'glioblastoma-lucia.json': 30,
  'leukemia-grace.json': 28,
  'leukemia-emily.json': 35,
  'leucemia-serafina.json': 32,
  'leucemia-mariana.json': 27,
  'leukemia-sofia.json': 36,
  'leucemie-chloe.json': 30,
  'bialaczka-natalia.json': 29,
  'leucemia-lucia.json': 34
};

const RAISED_MULTIPLIER = 1.18;
const DONOR_MULTIPLIER = 1.18;

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

  const oldRaised = json.raised;
  const oldDonors = json.donorCount;
  json.raised = Math.round(json.raised * RAISED_MULTIPLIER / 10) * 10;
  json.donorCount = Math.round(json.donorCount * DONOR_MULTIPLIER);

  if (Array.isArray(json.milestones)) {
    json.milestones.forEach(m => {
      m.reached = json.raised >= m.amount;
    });
  }

  if (Array.isArray(json.recentDonors)) {
    const freshTimes = ['2 min ago', '8 min ago', '14 min ago', '22 min ago', '35 min ago'];
    json.recentDonors.forEach((d, i) => {
      if (freshTimes[i]) d.time = freshTimes[i];
    });
  }

  const out = JSON.stringify(json, null, 2) + '\n';
  if (DRY_RUN) {
    log(`DRY ${basename}: lang=${lang} disease=${disease} bodyHits=${bodyHits} raised=${oldRaised}->${json.raised} donors=${oldDonors}->${json.donorCount} daysLeft=${json.daysLeft}`);
  } else {
    fs.writeFileSync(filePath, out, 'utf8');
    log(`WROTE ${basename}: lang=${lang} disease=${disease} bodyHits=${bodyHits} raised=${oldRaised}->${json.raised} donors=${oldDonors}->${json.donorCount} daysLeft=${json.daysLeft}`);
  }
  return { file: basename, lang, disease, bodyHits, daysLeft: json.daysLeft, raised: json.raised, donors: json.donorCount };
}

function main() {
  console.log(`[refresh-dates-2026-09] today=${TODAY_ISO} dryRun=${DRY_RUN}`);
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
  console.log(`[refresh-dates-2026-09] processed ${results.length} campaign files (${DRY_RUN ? 'dry-run' : 'written'})`);
  if (results.length > 0) {
    console.log('\nSummary:');
    for (const r of results) {
      console.log(`  ${r.file.padEnd(35)} lang=${r.lang.padEnd(5)} ${r.disease} bodyHits=${r.bodyHits} daysLeft=${r.daysLeft} raised=${r.raised} donors=${r.donors}`);
    }
  }
}

main();
