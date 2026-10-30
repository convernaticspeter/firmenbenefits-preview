import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, requestId, mosparoFieldNames, FORMS } from '../lib/schema.mjs';
import { loadContent } from '../lib/content.mjs';
import { anfrageMessages, betriebsratMessages, partnerMessages } from '../lib/messages.mjs';
import { prepare, mosparoJson } from '../lib/mosparo.mjs';

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
  const m = betriebsratMessages({ id: 'FB-2610-ABCDE', v, site, doiUrl: 'https://x/bestaetigen/?id=1' });
  assert.ok(m.confirmation.text.includes('https://x/bestaetigen/?id=1'));
  const p = partnerMessages({ id: 'FB-2610-ABCDE', v: validate('partner', { firma: 'X', branche: 'Y', standort: 'Wien', rabattidee: '10 %', name: 'A', email: 'a@b.at' }).values, site });
  assert.ok(p.copy.subject.includes('Partner-Anfrage'));
});

test('schema: jedes Formular hat Endpoint und versteckte Tracking-Felder', () => {
  for (const [k, f] of Object.entries(FORMS)) {
    assert.ok(f.endpoint.startsWith('/api/'), k);
    assert.ok(f.hidden.includes('br'), k);
  }
});
