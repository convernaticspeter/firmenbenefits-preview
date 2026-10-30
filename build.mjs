// Static site generator: content/*.json + templates → dist/
// New offer = new file in content/angebote/ → unlisted offer page with its own
// request form (noindex, not linked, not in the sitemap). Offers are only reachable
// via the individual links in the Betriebsrat mails (/angebote/<slug>/?br=<id>&utm_*).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, formatDate } from './lib/content.mjs';
import { FORMS } from './lib/schema.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const { site, offers } = await loadContent();
const BASE = 'https://' + site.canonicalHost;
const PILOT = site.pilot.endeText;
const VERSION = process.env.BUILD_VERSION || Date.now().toString(36);

const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const regionLabel = key => site.regionen[key].label;
const regionLang = key => site.regionen[key].lang;
const pilotRegionen = site.pilot.regionen;
const listJoin = arr => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' und ' + arr.at(-1);
const noeBezirke = listJoin(pilotRegionen.filter(r => r !== 'wien').map(regionLabel));

const BRAND = '<span class="brand-mark" aria-hidden="true"><span>%</span></span><span class="brand-text"><span class="brand-word">firmen<b>benefits</b><i>.at</i></span><small>Rabatte für Belegschaften</small></span>';

const ICONS = {
  training: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg>',
  kueche: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 7h.01M12 7h.01M9 14h6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  form: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>'
};
const icon = name => ICONS[name] || ICONS.tag;

// ---------- Layout ----------
function layout({ title, description, urlPath, body, noindex = false, active = '' }) {
  const canonical = BASE + urlPath;
  const nav = [
    ['/#ablauf', 'So funktioniert’s', 'ablauf'],
    ['/#fragen', 'Fragen', 'fragen'],
    ['/partner-werden/', 'Partner werden', 'partner']
  ];
  const navLinks = nav.map(([href, label, key]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="de-AT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="${noindex ? 'noindex, nofollow' : '__ROBOTS__'}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_AT">
<meta property="og:site_name" content="firmenbenefits.at">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${BASE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#e7332a">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css?v=${VERSION}">
<link rel="stylesheet" href="/styles.css?v=${VERSION}">
<script defer src="/site.js?v=${VERSION}"></script>
<script defer data-domain="${e(site.plausibleDomain)}" src="${e(site.plausibleScript)}"></script>
</head>
<body>
<a class="skip-link" href="#inhalt">Zum Inhalt</a>
<header class="site-header">
<nav aria-label="Hauptnavigation" class="nav">
<a aria-label="firmenbenefits.at – Startseite" class="brand" href="/">${BRAND}</a>
<div class="nav-links">${navLinks}</div>
<a class="nav-cta" href="/#mitmachen">Angebotsübersicht anfordern</a>
<details class="mobile-menu">
<summary aria-label="Menü öffnen">Menü</summary>
<div class="mobile-menu-panel">${navLinks}<a href="/#mitmachen">Angebotsübersicht anfordern</a></div>
</details>
</nav>
</header>
<main id="inhalt">
${body}
</main>
<footer class="site-footer">
<div class="inner footer-grid">
<div>
<span class="brand brand-footer">${BRAND}</span>
<p class="footer-note">Regionale Betriebe geben ihr Werbebudget als Rabatt an Belegschaften weiter. Für Betriebsräte und Personalvertretungen kostenlos.</p>
</div>
<nav aria-label="Footer-Navigation" class="footer-links"><a href="/#mitmachen">Für Betriebsräte</a><a href="/partner-werden/">Partner werden</a><a href="/#fragen">Fragen</a></nav>
<nav aria-label="Rechtliches" class="footer-links"><a href="/impressum/">Impressum</a><a href="/datenschutz/">Datenschutz</a></nav>
</div>
<div class="inner conv-credit"><a href="https://convernatics.com" rel="noopener">Website von Convernatics</a></div>
</footer>
</body>
</html>
`;
}

// ---------- Components ----------
function regionChips(keys, cls = 'chips') {
  return `<ul class="${cls}" aria-label="Regionen">${keys.map(k => `<li>${e(regionLabel(k))}</li>`).join('')}</ul>`;
}

function field(f0, overrides = {}) {
  const f = overrides[f0.name] ? { ...f0, ...overrides[f0.name] } : f0;
  const id = `f-${f.name}`;
  const req = f.required ? ' required' : '';
  const opt = f.required ? '' : ' <span class="opt">optional</span>';
  const common = `id="${id}" name="${f.name}"${req}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${f.max ? ` maxlength="${f.max}"` : ''} aria-describedby="${id}-err"`;
  let control;
  if (f.type === 'textarea') control = `<textarea ${common}${f.placeholder ? ` placeholder="${e(f.placeholder)}"` : ''} rows="4"></textarea>`;
  else if (f.type === 'select') control = `<select ${common}><option value="">Bitte wählen</option>${f.options.map(o => `<option>${e(o)}</option>`).join('')}</select>`;
  else {
    const inputmode = f.type === 'tel' ? ' inputmode="tel"' : f.type === 'email' ? ' inputmode="email"' : '';
    control = `<input type="${f.type}" ${common}${inputmode}${f.placeholder ? ` placeholder="${e(f.placeholder)}"` : ''}>`;
  }
  return `<div class="field"><label for="${id}">${e(f.label)}${opt}</label>${control}<p class="field-error" id="${id}-err" hidden></p></div>`;
}

function renderFields(fields, overrides = {}) {
  let out = '';
  let pending = [];
  const flush = () => { if (pending.length) { out += pending.length === 2 ? `<div class="form-grid">${pending.join('')}</div>` : pending.join(''); pending = []; } };
  for (const f of fields) {
    const html = field(f, overrides);
    if (f.half) { pending.push(html); if (pending.length === 2) flush(); }
    else { flush(); out += html; }
  }
  flush();
  return out;
}

function renderForm(formKey, { submit, checkboxLabel, hiddenValues = {}, note, optionalSummary, overrides = {} }) {
  const form = FORMS[formKey];
  const visible = form.fields.filter(f => f.type !== 'checkbox');
  const main = visible.filter(f => f.group !== 'optional');
  const optional = visible.filter(f => f.group === 'optional');
  const checkbox = form.fields.find(f => f.type === 'checkbox');
  const hidden = form.hidden.map(n => `<input type="hidden" name="${n}" value="${e(hiddenValues[n] || '')}">`).join('');
  return `<form class="fb-form" data-form="${formKey}" action="${form.endpoint}" method="post" novalidate>
${hidden}
<p class="form-hint">Felder ohne „optional“ bitte ausfüllen.</p>
${renderFields(main, overrides)}
${optional.length ? `<details class="optional-fields"><summary>${e(optionalSummary || 'Weitere Angaben (optional)')}</summary><div class="optional-inner">${renderFields(optional, overrides)}</div></details>` : ''}
${checkbox ? `<div class="field check"><input type="checkbox" id="f-${checkbox.name}" name="${checkbox.name}" value="${checkbox.value}" required aria-describedby="f-${checkbox.name}-err"><label for="f-${checkbox.name}">${checkboxLabel}</label><p class="field-error" id="f-${checkbox.name}-err" hidden></p></div>` : ''}
<div class="mosparo-wrap" id="mosparo-box-${formKey}"></div>
<button class="btn primary submit" type="submit">${e(submit)}</button>
<p class="form-status" role="status" aria-live="polite" hidden></p>
<p class="form-note">${note}</p>
</form>`;
}

function stepList(steps) {
  return `<ol class="steps">${steps.map(([t, d], i) => `<li class="step-card"><span class="step-no">${String(i + 1).padStart(2, '0')}</span><div><h3>${e(t)}</h3><p>${e(d)}</p></div></li>`).join('')}</ol>`;
}

function faq(items, openFirst = true) {
  return `<div class="faq">${items.map(([q, a], i) => `<details${openFirst && i === 0 ? ' open' : ''}><summary>${e(q)}</summary><p>${a}</p></details>`).join('')}</div>`;
}

// ---------- Pages ----------
function homePage() {
  const monat = new Intl.DateTimeFormat('de-AT', { month: 'long', timeZone: 'Europe/Vienna' }).format(new Date());
  const mailRows = [
    ['training', 'Gesundheit & Fitness', 'Link für eure Belegschaft', '%'],
    ['kueche', 'Wohnen & Küche', 'Link für eure Belegschaft', '%'],
    ['tag', 'Neue Partner', 'kommen laufend dazu', 'neu']
  ].map(([ic, title, sub, tag], i) => `<li class="mail-offer${i === 2 ? ' is-soon' : ''}"><span class="icon">${icon(ic)}</span><span><strong>${title}</strong><small>${sub}</small></span><span class="mail-tag">${tag}</span></li>`).join('');
  const brForm = renderForm('betriebsrat', {
    submit: 'Angebotsübersicht anfordern',
    checkboxLabel: 'Ja, schickt uns einmal im Monat die Angebotsübersicht per E-Mail. Wir können das jederzeit abbestellen – eine kurze Mail genügt.',
    note: 'Kostenlos. Wir verwenden eure Angaben für die monatliche Angebotsübersicht und speichern sie dafür in unserem Projekt-Tool. Mehr in der <a href="/datenschutz/">Datenschutzerklärung</a>.'
  });
  const body = `
<section class="hero">
<div class="hero-grid">
<div>
<p class="eyebrow">Pilot ab November · Wien und Umgebung · bis ${PILOT}</p>
<h1>Rabatte für eure Belegschaft. Für euch kostenlos.</h1>
<p class="lead">Regionale Betriebe geben ihr Werbebudget nicht Google oder Meta, sondern euren Kolleg:innen – als Rabatt. Ihr leitet die Angebote weiter, eure Leute fragen direkt bei uns an. Kein Portal, kein Login, kein Aufwand.</p>
<div class="hero-actions">
<a class="btn primary" href="#mitmachen">Angebotsübersicht anfordern →</a>
<a class="btn secondary" href="#ablauf">So funktioniert’s</a>
</div>
<p class="hero-note">Für Betriebsräte und Personalvertretungen. Einmal im Monat kommt die Übersicht – fertig zum Weiterleiten.</p>
</div>
<aside aria-label="So sieht eure Monatsübersicht aus" class="mail-mock">
<div class="mail-sheet">
<div class="mail-head"><span class="mail-from"><span class="brand-mark" aria-hidden="true"><span>%</span></span><span><strong>firmenbenefits.at</strong><small>an euren Betriebsrat</small></span></span><span class="mail-date">1 × im Monat</span></div>
<p class="mail-subject">Eure Angebote für ${monat}</p>
<ul class="mail-offers">${mailRows}</ul>
<div class="mail-forward"><span>Fertiger Text zum Weiterleiten</span><span class="mail-btn">Weiterleiten →</span></div>
</div>
<p class="mail-caption">Nur über eure Übersicht – nicht öffentlich im Netz.</p>
</aside>
</div>
</section>
<div aria-label="Das Wichtigste in Kürze" class="stat-strip">
<div class="stat"><strong>Kostenlos</strong><span>für Betriebsräte und Personalvertretungen</span></div>
<div class="stat"><strong>1 × im Monat</strong><span>die Angebotsübersicht zum Weiterleiten</span></div>
<div class="stat"><strong>Ohne Ausweis</strong><span>Anfrage einfach über das Formular</span></div>
<div class="stat"><strong>Aus der Region</strong><span>Betriebe aus Wien und Umgebung</span></div>
</div>

<section class="section" id="ablauf">
<p class="kicker">So funktioniert’s</p>
<h2>Ihr leitet weiter. Den Rest erledigen wir.</h2>
${stepList([
    ['Ihr meldet euch an', 'Über das Formular unten oder mit einem kurzen „Ja“ auf unsere Mail. Wir nehmen euren Betriebsrat in den Verteiler auf.'],
    ['Ihr leitet die Übersicht weiter', 'Einmal im Monat bekommt ihr die aktuellen Angebote – mit einem fertigen Text für Mail, Intranet oder Aushang.'],
    ['Eure Kolleg:innen fragen an', 'Über den eigenen Link beim Angebot. Der Betrieb meldet sich persönlich und gibt den Rabatt – ohne Ausweis, ohne Code.']
  ])}
</section>

<section class="dark" id="warum">
<div class="section">
<p class="kicker">Warum das funktioniert</p>
<h2>Werbebudget, das bei euren Leuten ankommt</h2>
<p class="body-big">Regionale Betriebe zahlen viel Geld an Google oder Meta, bis jemand anruft. Bei firmenbenefits.at fließt dieses Budget als Rabatt direkt zu den Beschäftigten.</p>
<div class="audience-list">
<article class="card"><h3>Für eure Kolleg:innen</h3><p>Echte Rabatte bei Betrieben in der Nähe – angefragt in einer Minute.</p></article>
<article class="card"><h3>Für euch</h3><p>Jeden Monat etwas Konkretes für die Belegschaft, ohne Verhandlungsaufwand.</p></article>
<article class="card"><h3>Für die Betriebe</h3><p>Neue Kund:innen aus der Region statt teurer Klickpreise.</p></article>
</div>
</div>
</section>

<section class="section pilot-section" id="pilot">
<div class="pilot-card">
<div>
<p class="kicker">Pilot</p>
<h2>Wir starten in Wien und Umgebung</h2>
<p>Der Pilot läuft von November bis ${PILOT} in Wien und den niederösterreichischen Bezirken ${noeBezirke}. Danach kommen laufend weitere Angebote und Regionen dazu.</p>
<p>Euer Betrieb liegt woanders? Meldet euch trotzdem – so wissen wir, wo wir als Nächstes Partner suchen.</p>
</div>
${regionChips(pilotRegionen, 'chips big')}
</div>
</section>

<section class="section" id="fragen">
<p class="kicker">Fragen</p>
<h2>Was Betriebsräte uns fragen</h2>
${faq([
    ['Kostet das unseren Betriebsrat etwas?', 'Nein. firmenbenefits.at ist für Betriebsräte und Personalvertretungen kostenlos. Die Rabatte geben die teilnehmenden Betriebe aus ihrem Werbebudget.'],
    ['Was hat der Betriebsrat davon? Gibt es eine Provision?', 'Eine Provision zahlen wir derzeit nicht, weil wir im Pilot die Einlösungen noch nicht messen. Wenn sich das Modell bewährt, arbeiten wir daran, dass teilnehmende Unternehmen an Betriebsräte spenden, wo das für sie finanziell darstellbar ist. Euer unmittelbarer Vorteil: jeden Monat etwas Konkretes für eure Kolleg:innen, ohne Verhandlungsaufwand.'],
    ['Brauchen unsere Kolleg:innen einen Ausweis oder Code?', 'Nein. Sie schicken ihre Anfrage über das Formular beim jeweiligen Angebot und geben dabei ihren Arbeitgeber an. Der Betrieb meldet sich direkt bei ihnen.'],
    ['Warum stehen die Angebote nicht auf der Website?', 'Die Rabatte sind ein Vorteil für die Belegschaften, die ihr erreicht. Deshalb gibt es sie nur über eure Monatsübersicht mit eigenen Anfrage-Links – nicht öffentlich im Netz und nicht in Suchmaschinen.'],
    ['Welche Daten bekommt der Betrieb?', 'Nur die Angaben aus der Anfrage – und nur, wenn die anfragende Person der Weitergabe zustimmt. Ihr als Betriebsrat gebt keine Daten eurer Kolleg:innen weiter.'],
    ['Wer darf die Angebote nutzen?', 'Die Beschäftigten, an die ihr die Angebote weitergebt. Manche Angebote gelten nur in bestimmten Regionen – das steht jeweils beim Angebot.'],
    ['Wie oft bekommen wir Post?', 'Einmal im Monat, mit den aktuellen Angeboten und einem Text zum Weiterleiten. Abbestellen geht jederzeit – eine kurze Mail an uns genügt.'],
    ['Unser Betrieb liegt nicht im Pilotgebiet. Können wir trotzdem mitmachen?', 'Ja, meldet euch gern an. Nach dem Pilot bauen wir weitere Regionen auf, und eure Anmeldung zeigt uns, wo wir als Nächstes Partner suchen.']
  ])}
</section>

<section class="section contact" id="mitmachen">
<div>
<p class="kicker">Mitmachen</p>
<h2>Angebotsübersicht für euren Betriebsrat anfordern</h2>
<p class="body-big">Tragt euch ein, dann schicken wir euch einmal im Monat die aktuellen Angebote – mit einem fertigen Text zum Weiterleiten.</p>
<ul class="tick-list"><li>Kostenlos für Betriebsräte und Personalvertretungen</li><li>Einmal im Monat, fertig zum Weiterleiten</li><li>Jederzeit abbestellbar</li></ul>
</div>
${brForm}
</section>

<section class="section partner-teaser">
<div class="callout">
<p class="kicker">Für regionale Betriebe</p>
<h2>Rabatt statt Klickpreise</h2>
<p>Sie möchten Beschäftigten aus der Region einen Vorteil geben und dafür neue Kund:innen gewinnen? Dann werden Sie Rabatt-Partner.</p>
<a class="btn secondary" href="/partner-werden/" data-track-link>Rabatt-Partner werden →</a>
</div>
</section>`;
  return layout({
    title: 'firmenbenefits.at – Rabatte für eure Belegschaft, kostenlos für Betriebsräte',
    description: `Regionale Betriebe geben ihr Werbebudget als Rabatt an Belegschaften weiter. Für Betriebsräte und Personalvertretungen kostenlos. Pilot in Wien und Umgebung von November bis ${PILOT}.`,
    urlPath: '/',
    body
  });
}

function offerPage(o) {
  const until = formatDate(o.gueltigBis);
  const form = renderForm('anfrage', {
    submit: `Anfrage an ${o.partner} senden`,
    hiddenValues: { angebot: o.slug },
    optionalSummary: 'Optional: Betriebsrat, PLZ oder Nachricht ergänzen',
    checkboxLabel: `Ich bin einverstanden, dass firmenbenefits.at meine Angaben an ${e(o.partner)} weitergibt, damit ${e(o.partner)} sich wegen meiner Anfrage bei mir meldet.`,
    note: `Deine Angaben verwenden wir nur für diese Anfrage. Mehr in der <a href="/datenschutz/">Datenschutzerklärung</a>.`,
    overrides: o.nachrichtPlatzhalter ? { nachricht: { placeholder: o.nachrichtPlatzhalter } } : {}
  });
  const body = `
<section class="page-hero offer-hero">
<div class="inner offer-hero-grid">
<div>
<p class="eyebrow">${e(o.kategorie)} · ${e(o.regionen.length === 1 ? 'nur ' + regionLabel(o.regionen[0]) : 'Wien und NÖ-Bezirke')}</p>
<h1>${e(o.rabattTitel)}</h1>
<p class="lead">${e(o.lead)}</p>
<div class="hero-actions"><a class="btn primary" href="#anfrage">Jetzt anfragen →</a></div>
</div>
<aside class="facts" aria-label="Das Angebot auf einen Blick">
<p class="facts-title">Dein firmenbenefits-Rabatt</p>
<ul class="facts-rabatte">${o.rabatte.map(r => `<li>${icon('check')}<span>${e(r)}</span></li>`).join('')}</ul>
<dl>
<div><dt>${icon('pin')}Region</dt><dd>${e(o.regionText.charAt(0).toUpperCase() + o.regionText.slice(1))}</dd></div>
<div><dt>${icon('clock')}Gültig</dt><dd>im Pilot bis ${e(until)}</dd></div>
<div><dt>${icon('form')}So bekommst du ihn</dt><dd>Anfrage über das Formular – ohne Ausweis, ohne Code</dd></div>
</dl>
</aside>
</div>
</section>

<section class="section split portrait">
<div>
<p class="kicker">Der Partner</p>
<h2>${e(o.portraitTitel || o.partner)}</h2>
</div>
<div>
${o.portrait.map(p => `<p class="body-copy">${e(p)}</p>`).join('')}
${o.leistungen?.length ? `<ul class="tick-list">${o.leistungen.map(l => `<li>${e(l)}</li>`).join('')}</ul>` : ''}
${o.adresse ? `<p class="partner-address">${icon('pin')}<span>${e(o.adresse)}</span></p>` : ''}
${o.website ? `<p class="partner-link"><a href="${e(o.website)}" rel="noopener" target="_blank">${e(o.websiteLabel || o.website)} ↗</a></p>` : ''}
</div>
</section>

<section class="section" id="ablauf">
<p class="kicker">So läuft’s</p>
<h2>In drei Schritten zum Rabatt</h2>
${stepList(o.schritte)}
</section>

<section class="section contact" id="anfrage" data-partner="${e(o.partner)}">
<div>
<p class="kicker">Anfrage</p>
<h2>Jetzt anfragen</h2>
<p class="body-big">${e(o.formHinweis)}</p>
<ul class="tick-list"><li>${e(o.rabatte[0])}${o.rabatte.length > 1 ? ' und mehr' : ''}</li><li>Ohne Ausweis, ohne Code</li><li>Gilt im Pilot bis ${e(until)}</li></ul>
</div>
${form}
</section>`;
  return layout({
    title: o.seoTitel || `${o.rabattTitel} – ${o.partner} | firmenbenefits.at`,
    description: o.seoBeschreibung || `${o.rabattTitel} bei ${o.partner}. Gilt im Pilot bis ${until}.`,
    urlPath: `/angebote/${o.slug}/`,
    body,
    noindex: true
  });
}

function partnerPage() {
  const form = renderForm('partner', {
    submit: 'Angebot vorschlagen',
    note: 'Wir melden uns persönlich bei Ihnen. Ihre Angaben verwenden wir nur für diese Anfrage – mehr in der <a href="/datenschutz/">Datenschutzerklärung</a>.'
  });
  const body = `
<section class="page-hero">
<div class="inner">
<p class="eyebrow">Für regionale Betriebe</p>
<h1>Rabatt statt Klickpreise</h1>
<p class="lead">Was zahlen Sie heute an Google oder Meta, bis eine neue Kundin bei Ihnen anruft? Bei firmenbenefits.at fließt dieses Geld nicht an Werbeplattformen, sondern als Rabatt direkt zu Ihren neuen Kund:innen.</p>
<div class="hero-actions"><a class="btn primary" href="#partner-formular">Angebot vorschlagen →</a></div>
</div>
</section>

<section class="section">
<p class="kicker">So funktioniert’s</p>
<h2>Sie legen den Vorteil fest. Wir bringen ihn in die Belegschaften.</h2>
${stepList([
    ['Sie legen einen Vorteil fest', 'Zum Beispiel 10 bis 15 % für Beschäftigte – passend zu Ihrem Angebot und Ihrer Kalkulation.'],
    ['Wir bringen ihn zu den Beschäftigten', 'Über Betriebsräte und Personalvertretungen: per monatlicher Angebotsübersicht, die intern weitergeleitet wird.'],
    ['Anfragen kommen direkt zu Ihnen', 'Über das Formular auf firmenbenefits.at – mit allen Kontaktdaten und dem Hinweis auf Ihren Rabatt.']
  ])}
</section>

<section class="section">
<p class="kicker">Der Unterschied</p>
<h2>Bezahlt wird erst, wenn jemand kauft</h2>
<div class="comparison two">
<div class="compare-card bad"><strong>Klassische Anzeige</strong><p>Sie zahlen pro Klick – egal, ob daraus je eine Anfrage wird. Das Geld geht an Plattformen, die mit Ihrer Region nichts zu tun haben.</p></div>
<div class="compare-card good"><strong>firmenbenefits.at</strong><p>Sie geben Rabatt, wenn jemand bei Ihnen kauft. Der Vorteil landet bei Beschäftigten aus der Region – empfohlen von ihrem eigenen Betriebsrat.</p></div>
</div>
</section>

<section class="section pilot-section">
<div class="pilot-card">
<div>
<p class="kicker">Pilot</p>
<h2>Ab November läuft unser Pilot in Wien und Umgebung</h2>
<p>Bis ${PILOT} sind ${listJoin(offers.map(o => `${o.partner} (${o.kategorie})`))} mit dabei. Danach bauen wir weitere Regionen auf.</p>
</div>
${regionChips(pilotRegionen, 'chips big')}
</div>
</section>

<section class="section contact" id="partner-formular">
<div>
<p class="kicker">Rabatt-Partner werden</p>
<h2>Ihr Angebot für Belegschaften</h2>
<p class="body-big">Erzählen Sie uns kurz, was Sie anbieten und welcher Vorteil für Beschäftigte denkbar wäre. Wir melden uns mit den Details.</p>
<ul class="tick-list"><li>Rabatt statt Klickpreise</li><li>Anfragen direkt zu Ihnen</li><li>Persönliche Abstimmung vor dem Start</li></ul>
</div>
${form}
</section>`;
  return layout({
    title: 'Rabatt-Partner werden – Rabatt statt Klickpreise | firmenbenefits.at',
    description: 'Für regionale Betriebe: Statt Werbebudget an Google oder Meta zu zahlen, geben Sie Beschäftigten einen Rabatt – verbreitet über Betriebsräte und Personalvertretungen.',
    urlPath: '/partner-werden/',
    body,
    active: 'partner'
  });
}

function legalPage({ title, urlPath, h1, html, description }) {
  return layout({ title: `${title} | firmenbenefits.at`, description, urlPath, body: `<section class="page-hero"><div class="inner"><p class="eyebrow">Rechtliches</p><h1>${h1}</h1></div></section><section class="section legal">${html}</section>` });
}

function impressumPage() {
  const b = site.betreiber;
  const html = `
<h2>Medieninhaber, Herausgeber und Betreiber</h2>
<p>${e(b.firma)}<br>Inhaber: ${e(b.inhaber)}<br>${e(b.strasse)}<br>${e(b.ort)}<br>${e(b.land)}</p>
<p>E-Mail: <a href="mailto:${e(b.email)}">${e(b.email)}</a><br>Telefon: <a href="tel:${e(b.telefonHref)}">${e(b.telefon)}</a></p>
<h2>Unternehmensangaben</h2>
<p>Rechtsform: Einzelunternehmen<br>Unternehmensgegenstand: Werbeagentur sowie Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik; Betrieb der Plattform firmenbenefits.at<br>Gewerbeberechtigungen: Werbeagentur (GISA-Zahl 29499335); Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik (GISA-Zahl 27745687)<br>UID-Nummer: ${e(b.uid)}<br>Mitglied der Wirtschaftskammer Wien<br>Gewerbebehörde: Magistratisches Bezirksamt für den 1./8. Bezirk<br>Anwendbare Rechtsvorschriften: Gewerbeordnung 1994, abrufbar unter <a href="https://www.ris.bka.gv.at" rel="noopener">www.ris.bka.gv.at</a></p>
<h2>Offenlegung nach § 25 Mediengesetz</h2>
<p>Medieninhaber: ${e(b.firma)}, Inhaber ${e(b.inhaber)}, ${e(b.strasse)}, ${e(b.ort)}.</p>
<p>Grundlegende Richtung: Information über Rabattangebote regionaler Unternehmen für Beschäftigte sowie über die Zusammenarbeit mit Betriebsräten, Personalvertretungen und Partnerunternehmen.</p>
<h2>Angebote der Partnerunternehmen</h2>
<p>Die auf firmenbenefits.at vorgestellten Rabatte gewähren die jeweiligen Partnerunternehmen. Vertragspartner für Leistungen und Käufe ist ausschließlich das jeweilige Partnerunternehmen.</p>
<h2>Haftung für Links</h2>
<p>Diese Website enthält Links zu Websites Dritter. Für deren Inhalte sind ausschließlich die jeweiligen Betreiber verantwortlich.</p>`;
  return legalPage({ title: 'Impressum', urlPath: '/impressum/', h1: 'Impressum', html, description: 'Impressum und Offenlegung von firmenbenefits.at.' });
}

function datenschutzPage() {
  const b = site.betreiber;
  const mail = `<a href="mailto:${e(b.email)}">${e(b.email)}</a>`;
  const html = `
<p>Hier steht, welche Daten wir beim Besuch von firmenbenefits.at, bei Anfragen über unsere Formulare und bei der Kontaktaufnahme mit Betriebsräten verarbeiten. Stand: Oktober 2026.</p>
<h2>1. Verantwortlicher</h2>
<p>${e(b.firma)}, Inhaber ${e(b.inhaber)}<br>${e(b.strasse)}, ${e(b.ort)}, ${e(b.land)}<br>E-Mail: ${mail}, Telefon: ${e(b.telefon)}</p>
<h2>2. Kurz zusammengefasst</h2>
<ul>
<li>Diese Website setzt keine Cookies und speichert nichts auf deinem Gerät. Deshalb gibt es auch kein Cookie-Banner.</li>
<li>Schriften, Spamschutz und Besucherstatistik laufen auf unserem eigenen Server in Österreich – ohne Google, Meta oder andere Werbenetzwerke.</li>
<li>Eine Anfrage zu einem Angebot geben wir nur mit deiner Einwilligung an das Unternehmen weiter, das den Rabatt gewährt – nicht an deinen Arbeitgeber und nicht an deinen Betriebsrat.</li>
</ul>
<h2>3. Hosting und Server-Logfiles</h2>
<p>Die Website läuft auf einem Server der netcup GmbH (Emmy-Noether-Straße 10, 76131 Karlsruhe, Deutschland) in einem Rechenzentrum in Österreich. netcup verarbeitet die Daten als unser Auftragsverarbeiter.</p>
<p>Beim Aufruf verarbeitet der Server technisch notwendige Zugriffsdaten: IP-Adresse, Datum und Uhrzeit, aufgerufene Domain, Anfragemethode und Statuscode sowie die Angaben, die dein Browser automatisch mitschickt. Die Zugriffsprotokolle werden regelmäßig rotiert und automatisch gelöscht. Zum Schutz vor Angriffen werten wir Zugriffe lokal auf unserem Server automatisiert aus und sperren auffällige IP-Adressen vorübergehend; dafür werden keine Daten an Dritte übermittelt. Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren und funktionsfähigen Website (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>4. Schriftarten</h2>
<p>Die Schriftarten (Archivo, Source Serif 4) liegen auf unserem Server. Es wird keine Verbindung zu Google Fonts oder anderen Schriftanbietern aufgebaut.</p>
<h2>5. Besucherstatistik mit Plausible</h2>
<p>Für eine anonyme Besucherstatistik nutzen wir Plausible Analytics, das wir selbst unter plausible.convernatics.com auf unserem Server in Österreich betreiben. Plausible setzt keine Cookies und speichert nichts auf deinem Gerät. Erfasst werden aufgerufene Seite, Referrer, Browser, Betriebssystem, Gerätetyp und das aus der IP-Adresse abgeleitete Land bzw. die Region. Wir sehen auch, ob ein Formular abgeschickt wurde – mit dem Namen des Angebots und gegebenenfalls dem Kürzel des weiterleitenden Betriebsrats, aber nicht, was im Formular steht. Deine IP-Adresse wird nicht gespeichert; sie fließt nur in eine täglich wechselnde Kennung ein. Rechtsgrundlage ist unser berechtigtes Interesse an einer datensparsamen Reichweitenmessung (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>6. Spamschutz mit mosparo</h2>
<p>Unsere Formulare schützen wir mit mosparo, das wir selbst auf unserem Server betreiben (spam.firmenbenefits.at). mosparo prüft die Eingaben und technische Merkmale wie die IP-Adresse auf Spam-Muster, setzt keine Cookies und gibt keine Daten an Dritte weiter. Die Prüfdaten werden automatisch nach kurzer Zeit gelöscht. Rechtsgrundlage ist unser berechtigtes Interesse am Schutz vor Spam und Missbrauch (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>7. Anfragen zu einem Angebot</h2>
<p>Wenn du über das Formular eines Angebots anfragst, verarbeiten wir Vorname, Nachname, E-Mail, Telefon und Arbeitgeber sowie – wenn du sie angibst – Betriebsrat/Dienststelle, PLZ oder Bezirk und deine Nachricht. Dazu speichern wir, über welches Angebot und welchen Link du gekommen bist (Kürzel des weiterleitenden Betriebsrats und Kampagnenparameter wie utm_source). So sehen wir, über welche Betriebsräte Anfragen entstehen.</p>
<p><strong>Weitergabe an das Partnerunternehmen:</strong> Mit deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) leiten wir deine Angaben per E-Mail an das Unternehmen weiter, das den Rabatt gewährt, damit es sich bei dir meldet. Welches Unternehmen das ist, steht namentlich auf der Angebotsseite und im Einwilligungstext direkt über dem Absende-Button. Ab der Weitergabe verarbeitet das Unternehmen deine Daten in eigener Verantwortung.</p>
<p>Deine Anfrage geben wir weder an deinen Arbeitgeber noch an deinen Betriebsrat weiter. Du bekommst eine Bestätigung per E-Mail. Die Einwilligung kannst du jederzeit an ${mail} widerrufen; die bis dahin erfolgte Weitergabe bleibt rechtmäßig. Die Speicherung der Anfrage bei uns dient der Abwicklung und dem Nachweis gegenüber den Partnerunternehmen (Art. 6 Abs. 1 lit. b und f DSGVO).</p>
<h2>8. Anmeldung zur monatlichen Angebotsübersicht</h2>
<p>Wenn ihr euren Betriebsrat oder eure Personalvertretung anmeldet, verarbeiten wir Organisation, Region der Betriebsstätte, ungefähre Zahl der Beschäftigten, Name, Funktion, E-Mail, Telefon und eure Nachricht. Damit schicken wir euch einmal im Monat die aktuellen Angebote zum Weiterleiten. Rechtsgrundlage ist eure Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die ihr zusätzlich über einen Link in einer Bestätigungsmail bestätigt. Ohne diese Bestätigung schicken wir keine Angebotsübersicht. Abbestellen geht jederzeit mit einer kurzen Antwort auf eine unserer Mails oder an ${mail}.</p>
<h2>9. Anfragen von Unternehmen</h2>
<p>Wenn Sie uns als Unternehmen ein Angebot vorschlagen, verarbeiten wir Ihre Angaben, um die Anfrage zu beantworten und eine mögliche Zusammenarbeit vorzubereiten (Art. 6 Abs. 1 lit. b DSGVO).</p>
<h2>10. Kontaktaufnahme mit Betriebsräten und Personalvertretungen</h2>
<p>Wir schreiben Betriebsräte und Personalvertretungen gezielt per E-Mail an, um ihnen firmenbenefits.at vorzustellen. Das Angebot ist für sie kostenlos und für ihre Belegschaft gedacht. Dafür verarbeiten wir Name, Funktion, dienstliche E-Mail-Adresse und gegebenenfalls Telefonnummer sowie Organisation, Gremium und Standort. Die Daten stammen aus öffentlich zugänglichen Quellen, vor allem von Websites der Betriebsräte, Personalvertretungen, Unternehmen, Dienststellen und Gewerkschaften. Wir speichern sie in unserer Kontaktliste, unter anderem in ClickUp.</p>
<p>Rechtsgrundlage ist unser berechtigtes Interesse, Interessenvertretungen der Beschäftigten über ein Angebot für ihre Belegschaft zu informieren (Art. 6 Abs. 1 lit. f DSGVO). Du kannst dem jederzeit widersprechen – eine kurze Antwort auf unsere Mail oder eine Nachricht an ${mail} genügt. Danach schreiben wir dich nicht mehr an und behalten nur einen Sperrvermerk, damit das so bleibt.</p>
<h2>11. Auftragsverarbeiter und Empfänger</h2>
<ul>
<li><strong>netcup GmbH</strong>, Karlsruhe, Deutschland – Hosting von Website, Plausible und mosparo (Rechenzentrum in Österreich).</li>
<li><strong>FunFirst s.r.o. (Emailit)</strong>, Prag, Tschechien – Versand der E-Mails, die die Website verschickt (Weiterleitung an Partner, Bestätigungen).</li>
<li><strong>Mango Technologies, Inc. (ClickUp)</strong>, 350 Tenth Ave, Suite 500, San Diego, CA 92101, USA – Ablage und Bearbeitung der Anfragen und Kontakte in unserem Aufgaben-Tool. ClickUp verarbeitet die Daten auch in den USA; Grundlage dafür sind die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO).</li>
<li><strong>Microsoft Ireland Operations Limited</strong>, Dublin, Irland (Microsoft 365) – E-Mail-Postfächer @firmenbenefits.at. Eine Übermittlung an die Microsoft Corporation in den USA ist nicht ausgeschlossen; Grundlage sind der Angemessenheitsbeschluss zum EU-US Data Privacy Framework, nach dem Microsoft zertifiziert ist, sowie Standardvertragsklauseln. Mails an @convernatics.com laufen über unseren eigenen Mailserver in Österreich.</li>
<li>Das jeweilige <strong>Partnerunternehmen</strong>, dessen Angebot du anfragst (siehe Punkt 7), als eigenständiger Verantwortlicher.</li>
</ul>
<h2>12. Speicherdauer</h2>
<ul>
<li>Anfragen zu Angeboten und von Unternehmen speichern wir bis zu drei Jahre ab der Anfrage, um Rückfragen zu klären und die Zusammenarbeit mit den Partnerunternehmen nachzuweisen. Danach löschen wir sie oder behalten nur anonyme Zählungen.</li>
<li>Anmeldungen zur Angebotsübersicht speichern wir bis zum Widerruf; den Nachweis der Einwilligung danach noch bis zu drei Jahre.</li>
<li>Nach einem Widerspruch gegen die Kontaktaufnahme bleibt nur der Sperrvermerk.</li>
<li>Gesetzliche Aufbewahrungspflichten bleiben unberührt.</li>
</ul>
<h2>13. Deine Rechte</h2>
<p>Du hast nach Maßgabe der DSGVO das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit. Verarbeiten wir deine Daten aufgrund berechtigter Interessen, kannst du jederzeit widersprechen (Art. 21 DSGVO). Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen. Schreib uns dazu an ${mail}.</p>
<p>Wenn du meinst, dass die Verarbeitung deiner Daten gegen Datenschutzrecht verstößt, kannst du dich bei der Österreichischen Datenschutzbehörde beschweren: Barichgasse 40–42, 1030 Wien, Telefon +43 1 52 152-0, <a href="mailto:dsb@dsb.gv.at">dsb@dsb.gv.at</a>.</p>`;
  return legalPage({ title: 'Datenschutzerklärung', urlPath: '/datenschutz/', h1: 'Datenschutzerklärung', html, description: 'Datenschutzerklärung von firmenbenefits.at: Formulare, Weitergabe an Partnerunternehmen, Kontaktaufnahme mit Betriebsräten, Plausible und mosparo.' });
}

function thanksPage({ urlPath, title, h1, html }) {
  return layout({ title: `${title} | firmenbenefits.at`, description: title, urlPath, noindex: true, body: `<section class="page-hero thanks"><div class="inner"><div class="thanks-card">${html.replace('%H1%', `<h1>${h1}</h1>`)}</div></div></section>` });
}

const thanksPages = [
  thanksPage({
    urlPath: '/danke/anfrage/', title: 'Danke für deine Anfrage', h1: 'Danke, deine Anfrage ist angekommen.',
    html: `<p class="eyebrow">Anfrage gesendet</p>%H1%
<p class="lead">Wir haben deine Anfrage an <strong data-fill="partner">das Partnerunternehmen</strong> weitergeleitet. Du wirst persönlich kontaktiert – per Telefon oder E-Mail.</p>
<ol class="next-steps"><li><strong>Bestätigung prüfen:</strong> Eine E-Mail mit allen Details ist unterwegs. Nichts bekommen? Schau bitte im Spam-Ordner nach.</li><li><strong>Auf den Rückruf warten:</strong> <span data-fill="partner">Das Partnerunternehmen</span> meldet sich bei dir und kennt deinen firmenbenefits-Rabatt bereits.</li></ol>
<p class="ref" data-show="id" hidden>Deine Anfrage-Nummer: <strong data-fill="id"></strong></p>
<div class="hero-actions"><a class="btn secondary" href="/" data-track-link>Zur Startseite</a></div>`
  }),
  thanksPage({
    urlPath: '/danke/betriebsrat/', title: 'Fast geschafft', h1: 'Fast geschafft – bitte bestätigt kurz.',
    html: `<p class="eyebrow">Anmeldung erhalten</p>%H1%
<p class="lead">Wir haben euch eine E-Mail mit einem Bestätigungslink geschickt. Sobald ihr bestätigt, bekommt ihr einmal im Monat die Angebotsübersicht zum Weiterleiten.</p>
<ol class="next-steps"><li><strong>E-Mail öffnen</strong> und auf „Anmeldung bestätigen“ klicken. Nichts bekommen? Schaut bitte im Spam-Ordner nach.</li><li><strong>Übersicht bekommen:</strong> Danach schicken wir euch die aktuellen Angebote mit euren eigenen Anfrage-Links zum Weiterleiten.</li></ol>
<p class="ref" data-show="id" hidden>Eure Anmelde-Nummer: <strong data-fill="id"></strong></p>
<div class="hero-actions"><a class="btn secondary" href="/" data-track-link>Zur Startseite</a></div>`
  }),
  thanksPage({
    urlPath: '/danke/partner/', title: 'Danke für Ihr Interesse', h1: 'Danke, wir melden uns persönlich.',
    html: `<p class="eyebrow">Anfrage erhalten</p>%H1%
<p class="lead">Wir sehen uns Ihr Angebot an und melden uns mit den nächsten Schritten. Eine Bestätigung ist per E-Mail unterwegs.</p>
<p class="ref" data-show="id" hidden>Ihre Anfrage-Nummer: <strong data-fill="id"></strong></p>
<div class="hero-actions"><a class="btn secondary" href="/" data-track-link>Zur Startseite</a></div>`
  }),
  thanksPage({
    urlPath: '/bestaetigen/', title: 'Anmeldung bestätigen', h1: 'Anmeldung bestätigen',
    html: `<p class="eyebrow">Angebotsübersicht</p>%H1%
<p class="lead">Ein Klick noch: Bestätigt, dass ihr einmal im Monat die Angebotsübersicht von firmenbenefits.at per E-Mail bekommen wollt.</p>
<form class="doi-form" action="/api/bestaetigen" method="post"><input type="hidden" name="id"><input type="hidden" name="tid"><input type="hidden" name="sig"><button class="btn primary" type="submit">Ja, Angebotsübersicht erhalten</button><p class="form-status" role="status" aria-live="polite" hidden></p></form>`
  }),
  thanksPage({
    urlPath: '/danke/bestaetigt/', title: 'Anmeldung bestätigt', h1: 'Danke, eure Anmeldung ist bestätigt.',
    html: `<p class="eyebrow">Bestätigt</p>%H1%
<p class="lead">Ab jetzt bekommt ihr einmal im Monat die aktuelle Angebotsübersicht – mit einem fertigen Text zum Weiterleiten.</p>
<div class="hero-actions"><a class="btn secondary" href="/" data-track-link>Zur Startseite</a></div>`
  })
];

function notFoundPage() {
  return layout({ title: 'Seite nicht gefunden | firmenbenefits.at', description: 'Seite nicht gefunden', urlPath: '/404/', noindex: true, body: `<section class="page-hero thanks"><div class="inner"><div class="thanks-card"><p class="eyebrow">Fehler 404</p><h1>Diese Seite gibt es nicht.</h1><p class="lead">Vielleicht ist das Angebot abgelaufen oder der Link unvollständig. Euer Betriebsrat schickt jeden Monat die aktuellen Links.</p><div class="hero-actions"><a class="btn primary" href="/">Zur Startseite</a></div></div></div></section>` });
}

// ---------- Write ----------
async function write(urlPath, html) {
  const file = urlPath.endsWith('/') ? path.join(dist, urlPath, 'index.html') : path.join(dist, urlPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
}

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(root, 'public'), dist, { recursive: true });

const pages = [['/', homePage()], ['/partner-werden/', partnerPage()], ['/impressum/', impressumPage()], ['/datenschutz/', datenschutzPage()]];
const offerPages = offers.map(o => [`/angebote/${o.slug}/`, offerPage(o)]);
for (const [p, html] of [...pages, ...offerPages]) await write(p, html);
for (const html of thanksPages) {
  const p = html.match(/rel="canonical" href="https:\/\/[^/]+([^"]+)"/)[1];
  await write(p, html);
}
await write('/404.html', notFoundPage());

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(([p]) => `<url><loc>${BASE}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
await write('/sitemap.xml', sitemap);
console.log(`Build ok: ${pages.length} öffentliche Seiten, ${offerPages.length} Angebotsseiten (nicht gelistet), ${thanksPages.length + 1} Systemseiten → dist/`);
