import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = ['slug', 'partner', 'rabattTitel', 'rabattKurz', 'rabatte', 'mailHinweis', 'regionen', 'regionText', 'gueltigBis', 'empfaenger', 'portrait', 'schritte', 'formHinweis'];

export async function loadContent() {
  const site = JSON.parse(await fs.readFile(path.join(root, 'content/site.json'), 'utf8'));
  const dir = path.join(root, 'content/angebote');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort();
  const offers = [];
  for (const file of files) {
    const offer = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    const missing = REQUIRED.filter(k => offer[k] === undefined || offer[k] === '' || (Array.isArray(offer[k]) && !offer[k].length));
    if (missing.length) throw new Error(`${file}: Pflichtfelder fehlen: ${missing.join(', ')}`);
    if (offer.slug + '.json' !== file) throw new Error(`${file}: slug muss dem Dateinamen entsprechen`);
    if (!/^[a-z0-9-]+$/.test(offer.slug)) throw new Error(`${file}: slug nur a-z, 0-9 und Bindestrich`);
    for (const r of offer.regionen) if (!site.regionen[r]) throw new Error(`${file}: unbekannte Region ${r}`);
    if (offer.aktiv === false) continue;
    // auswertung: false → no origin tracking, no ClickUp task, no copy (only partner mail + confirmation).
    offer.auswertung = offer.auswertung !== false;
    offers.push(offer);
  }
  offers.sort((a, b) => (a.reihenfolge ?? 99) - (b.reihenfolge ?? 99));
  return { site, offers, offersBySlug: Object.fromEntries(offers.map(o => [o.slug, o])) };
}

export function formatDate(iso) {
  const months = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${months[m - 1]} ${y}`;
}
