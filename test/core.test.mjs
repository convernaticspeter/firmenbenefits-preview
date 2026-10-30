import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, requestId, mosparoFieldNames, FORMS } from '../lib/schema.mjs';
import { loadContent } from '../lib/content.mjs';
import { anfrageMessages, betriebsratMessages, partnerMessages } from '../lib/messages.mjs';
import { prepare, mosparoJson } from '../lib/mosparo.mjs';
import { personalize, cleanFirma } from '../lib/firma.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const { site, offers, offersBySlug } = await loadContent();
const anfrage = { angebot: 'kuechen-schwechat', vorname: 'Maria', nachname: 'Muster', arbeitgeber: 'Muster GmbH', email: 'maria@example.at', telefon: '+43 660 1234567', einwilligung: 'ja', br: 'G042', utm_source: 'betriebsrat' };

test('content: alle Angebote vollständig und Pilot-Ende einheitlich', () => {
  assert.ok(offers.length >= 2);
  for (const o of offers) {
    assert.equal(o.gueltigBis, site.pilot.ende);
    assert.ok(o.empfaenger.every(e => e.includes('@')));
  }
});

test('anfrage: gültige Eingabe, br wird normalisiert', () => {
  const r = validate('anfrage', anfrage, { offers: offersBySlug });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.values.br, 'g042');
});

test('anfrage: Pflichtfelder, Einwilligung und Angebot werden erzwungen', () => {
  const r = validate('anfrage', { ...anfrage, telefon: '', einwilligung: '', angebot: 'gibtsnicht', email: 'kaputt' }, { offers: offersBySlug });
  assert.equal(r.ok, false);
  assert.ok(r.errors.telefon && r.errors.einwilligung && r.errors.angebot && r.errors.email);
});

test('anfrage: ungültige br-Referenz wird verworfen, nicht abgelehnt', () => {
  const r = validate('anfrage', { ...anfrage, br: '<script>' }, { offers: offersBySlug });
  assert.equal(r.ok, true);
  assert.equal(r.values.br, '');
});

test('betriebsrat: Region und Beschäftigte sind Pflicht, Einwilligung monatlich Pflicht', () => {
  const ok = validate('betriebsrat', { organisation: 'BR Test', region: 'Wien', beschaeftigte: '51–250', name: 'Max', email: 'br@example.at', monatlich: 'ja' });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const bad = validate('betriebsrat', { organisation: 'BR Test', region: 'Mars', name: 'Max', email: 'br@example.at' });
  assert.ok(bad.errors.region && bad.errors.beschaeftigte && bad.errors.monatlich);
});

test('partner: Pflichtfelder', () => {
  const r = validate('partner', { firma: 'X', branche: 'Y', standort: 'Wien', rabattidee: '10 %', name: 'A', email: 'a@b.at' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('requestId: Format FB-YYMM-XXXXX', () => {
  const id = requestId(new Date('2026-10-30T10:00:00Z'));
  assert.match(id, /^FB-2610-[2-9A-HJ-NP-Z]{5}$/);
});

test('mosparo: nur sichtbare Textfelder, deterministische Signatur, PHP-JSON', () => {
  assert.ok(!mosparoFieldNames('anfrage').includes('einwilligung'));
  assert.ok(!mosparoFieldNames('anfrage').includes('br'));
  const a = prepare({ b: '2', a: 'ä/1' }, 'secret', 'tok');
  const b = prepare({ a: 'ä/1', b: '2' }, 'secret', 'tok');
  assert.equal(a.formSignature, b.formSignature);
  assert.equal(mosparoJson({ x: 'ä/' }), '{"x":"\\u00e4\\/"}');
});

test('mails: Rabatt-Hinweis und Anfrage-ID in allen drei Anfrage-Mails', () => {
  const offer = offersBySlug['kuechen-schwechat'];
  const v = validate('anfrage', anfrage, { offers: offersBySlug }).values;
  const m = anfrageMessages({ id: 'FB-2610-ABCDE', v, offer, site, clickupUrl: 'https://app.clickup.com/t/x', partnerStatus: 'ok' });
  for (const mail of [m.partner, m.copy, m.confirmation]) {
    assert.ok((mail.subject + mail.text).includes('FB-2610-ABCDE'));
    assert.ok(mail.text.includes(offer.mailHinweis));
  }
  assert.ok(m.partner.text.includes('firmenbenefits-Rabatt: '));
  assert.ok(!m.partner.text.includes('g042'), 'Partner sieht keine Gremium-Referenz');
  assert.ok(m.copy.text.includes('g042'));
  assert.equal(m.partner.replyTo, 'maria@example.at');
  assert.ok(m.task.name.includes('br g042'));
  assert.match(m.task.markdown, /"br":"g042"/);
});

test('mails: Betriebsrat-DOI-Link und Partner-Bestätigung', () => {
  const v = validate('betriebsrat', { organisation: 'BR Test', region: 'Wien', beschaeftigte: '51–250', name: 'Max', email: 'br@example.at', monatlich: 'ja' }).values;
  const m = betriebsratMessages({ id: 'FB-2610-ABCDE', v, site, doiUrl: 'https://x/bestaetigen/?id=1', offers });
  assert.ok(m.confirmation.text.includes('https://x/bestaetigen/?id=1'));
  assert.ok(!m.confirmation.text.includes('/angebote/'), 'keine öffentliche Angebotsübersicht verlinken');
  for (const o of offers.filter(o => o.auswertung)) assert.ok(m.task.markdown.includes(`/angebote/${o.slug}/?br=fb-2610-abcde&utm_source=betriebsrat`));
  for (const o of offers.filter(o => !o.auswertung)) assert.ok(m.task.markdown.includes(`/angebote/${o.slug}/`) && !m.task.markdown.includes(`/angebote/${o.slug}/?br=`));
  const withBr = betriebsratMessages({ id: 'FB-2610-ABCDE', v: { ...v, br: 'g042' }, site, doiUrl: 'x', offers });
  assert.ok(withBr.copy.text.includes('?br=g042&'));
  const p = partnerMessages({ id: 'FB-2610-ABCDE', v: validate('partner', { firma: 'X', branche: 'Y', standort: 'Wien', rabattidee: '10 %', name: 'A', email: 'a@b.at' }).values, site });
  assert.ok(p.copy.subject.includes('Partner-Anfrage'));
});

test('schema: jedes Formular hat Endpoint und versteckte Tracking-Felder', () => {
  for (const [k, f] of Object.entries(FORMS)) {
    assert.ok(f.endpoint.startsWith('/api/'), k);
    assert.ok(f.hidden.includes('br'), k);
  }
});

test('build: Angebote sind nicht öffentlich auffindbar', () => {
  execFileSync(process.execPath, ['build.mjs'], { stdio: 'pipe' });
  const read = p => readFileSync(new URL('../dist/' + p, import.meta.url), 'utf8');
  const sitemap = read('sitemap.xml');
  assert.ok(!sitemap.includes('/angebote/'), 'Sitemap ohne Angebote');
  assert.ok(!existsSync(new URL('../dist/angebote/index.html', import.meta.url)), 'keine Übersichtsseite');
  assert.ok(!existsSync(new URL('../dist/angebote.json', import.meta.url)), 'kein Angebots-JSON');
  for (const page of ['index.html', 'partner-werden/index.html', 'impressum/index.html', 'datenschutz/index.html', '404.html']) {
    const html = read(page);
    assert.ok(!html.includes('href="/angebote/'), page + ' verlinkt keine Angebote');
    for (const o of offers) assert.ok(!html.includes(o.rabattTitel), page + ' nennt kein Angebot: ' + o.rabattTitel);
  }
  for (const o of offers) {
    const html = read(`angebote/${o.slug}/index.html`);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(html.includes('data-form="anfrage"') && html.includes(`value="${o.slug}"`));
  }
});

test('Angebot ohne Auswertung (Michelle): keine Herkunftsdaten, kein br-Feld', () => {
  const o = offersBySlug['personal-training-wien'];
  assert.equal(o.auswertung, false);
  assert.equal(offersBySlug['kuechen-schwechat'].auswertung, true);
  const r = validate('anfrage', { ...anfrage, angebot: o.slug, utm_campaign: 'x' }, { offers: offersBySlug });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.values.br, ''); assert.equal(r.values.utm_source, ''); assert.equal(r.values.utm_campaign, '');
  const html = readFileSync(new URL(`../dist/angebote/${o.slug}/index.html`, import.meta.url), 'utf8');
  assert.ok(!html.includes('name="br"') && !html.includes('name="utm_source"'));
  assert.ok(html.includes('Wir speichern keine Kopie'));
  const k = readFileSync(new URL('../dist/angebote/kuechen-schwechat/index.html', import.meta.url), 'utf8');
  assert.ok(k.includes('name="br"'));
});

test('Angebotsseite: Firmenname aus ?firma= statt Bezirken', () => {
  for (const o of offers) {
    const html = readFileSync(new URL(`../dist/angebote/${o.slug}/index.html`, import.meta.url), 'utf8');
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>')).replace(/<form[\s\S]*?<\/form>/g, '');
    for (const word of ['Bezirk', 'Bruck an der Leitha', 'Baden', 'Mödling', 'Gänserndorf', 'NÖ']) assert.ok(!main.includes(word), `${o.slug}: ${word}`);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(!head.includes('Bezirk'), `${o.slug}: Bezirk in Meta`);
    const p = personalize(html, '  Wiener   Linien ');
    assert.ok(p.includes('Für die Belegschaft von Wiener Linien</span>'));
    assert.ok(p.includes('>die Belegschaft von Wiener Linien</dd>'));
    assert.equal(personalize(html, ''), html);
    assert.ok(personalize(html, '<script>alert(1)</script>&"').includes('scriptalert(1)/script&amp;&quot;'));
  }
  assert.equal(cleanFirma('x'.repeat(200)).length, 80);
});
