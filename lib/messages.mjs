// Pure builders for mails and ClickUp tasks (unit-tested, no I/O).
import { formatDate } from './content.mjs';

const SIG = (site) => `--\nfirmenbenefits.at · ${site.betreiber.firma}, ${site.betreiber.strasse}, ${site.betreiber.ort}\nDatenschutz: https://${site.canonicalHost}/datenschutz/`;

const viennaTime = (date) => new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' }).format(date);

const lines = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => (String(v).includes('\n') ? `${k}:\n${v}` : `${k}: ${v}`)).join('\n');

function trackingLines(v) {
  return lines([['Gremium-Referenz (br)', v.br], ['utm_source', v.utm_source], ['utm_medium', v.utm_medium], ['utm_campaign', v.utm_campaign], ['utm_content', v.utm_content], ['utm_term', v.utm_term]]);
}

function mdTable(pairs) {
  return pairs.filter(([, v]) => v).map(([k, v]) => `**${k}:** ${String(v).replace(/\n/g, '  \n')}`).join('  \n');
}

// ---------- Angebotsanfrage ----------
export function anfrageMessages({ id, v, offer, site, now = new Date(), clickupUrl = '', partnerStatus = '' }) {
  const name = `${v.vorname} ${v.nachname}`;
  const until = formatDate(offer.gueltigBis);
  const contact = lines([
    ['Name', name], ['E-Mail', v.email], ['Telefon', v.telefon], ['Arbeitgeber / Organisation', v.arbeitgeber],
    ['Betriebsrat / Dienststelle', v.dienststelle], ['PLZ oder Bezirk', v.plz], ['Nachricht / Wunschtermin', v.nachricht]
  ]);
  const consent = `Die Person hat am ${viennaTime(now)} eingewilligt, dass firmenbenefits.at ihre Angaben für diese Anfrage an ${offer.partner} weitergibt.`;

  const partner = {
    subject: `Neue Anfrage mit firmenbenefits-Rabatt: ${name} (${id})`,
    replyTo: v.email,
    text: `Guten Tag,

über firmenbenefits.at ist eine neue Anfrage für Ihr Angebot eingegangen. Bitte melden Sie sich direkt bei der anfragenden Person.

firmenbenefits-Rabatt: ${offer.mailHinweis}
Gültig im Pilot bis: ${until}
Anfrage-ID: ${id}

${contact}

${consent} Bitte verwenden Sie die Daten nur für die Bearbeitung dieser Anfrage.

Antworten: Wenn Sie auf diese Mail antworten, geht Ihre Antwort direkt an ${v.vorname}.

Vielen Dank!
firmenbenefits.at

${SIG(site)}`
  };

  const copy = {
    subject: `[firmenbenefits] Anfrage ${offer.partner}: ${name} (${id})`,
    replyTo: v.email,
    text: `Neue Angebotsanfrage über firmenbenefits.at

Angebot: ${offer.rabattTitel} (${offer.slug})
Partner: ${offer.partner}
firmenbenefits-Rabatt: ${offer.mailHinweis}
Anfrage-ID: ${id}
Eingang: ${viennaTime(now)}
${partnerStatus ? `Partner-Mail: ${partnerStatus}\n` : ''}${offer.auswertung === false ? 'ClickUp: – (Angebot ohne Auswertung, wird nicht gespeichert)\n' : clickupUrl ? `ClickUp: ${clickupUrl}\n` : 'ClickUp: NICHT gespeichert – bitte manuell nachtragen\n'}
${contact}

${trackingLines(v) || 'Gremium-Referenz (br): –'}

${consent}`
  };

  const confirmation = {
    subject: `Deine Anfrage an ${offer.partner} (${id})`,
    text: `Hallo ${v.vorname},

danke für deine Anfrage über firmenbenefits.at! Wir haben sie an ${offer.partner} weitergeleitet. Du wirst persönlich kontaktiert – per Telefon oder E-Mail.

Dein firmenbenefits-Rabatt: ${offer.mailHinweis}
Gilt im Pilot bis ${until}.

Deine Anfrage-ID: ${id}

Deine Angaben:
${contact}

Du hast eine Frage oder möchtest deine Anfrage zurückziehen? Antworte einfach auf diese Mail.

Liebe Grüße
firmenbenefits.at

${SIG(site)}`
  };

  const task = {
    name: `Anfrage ${id} · ${offer.partner} · ${name}${v.br ? ` · br ${v.br}` : ''}`,
    tags: ['fb-anfrage'],
    markdown: `## Angebotsanfrage ${id}

${mdTable([['Angebot', `${offer.rabattTitel} (${offer.slug})`], ['Partner', offer.partner], ['Rabatt', offer.mailHinweis], ['Eingang', viennaTime(now)]])}

### Kontakt
${mdTable([['Name', name], ['E-Mail', v.email], ['Telefon', v.telefon], ['Arbeitgeber / Organisation', v.arbeitgeber], ['Betriebsrat / Dienststelle', v.dienststelle], ['PLZ oder Bezirk', v.plz], ['Nachricht / Wunschtermin', v.nachricht]])}

### Herkunft
${mdTable([['Gremium-Referenz (br)', v.br || '–'], ['utm_source', v.utm_source], ['utm_medium', v.utm_medium], ['utm_campaign', v.utm_campaign], ['utm_content', v.utm_content], ['utm_term', v.utm_term]])}

### Einwilligung
${consent}

\`\`\`json
${JSON.stringify({ typ: 'anfrage', id, angebot: offer.slug, partner: offer.partner, br: v.br || null, utm: { source: v.utm_source || null, medium: v.utm_medium || null, campaign: v.utm_campaign || null, content: v.utm_content || null, term: v.utm_term || null }, eingang: now.toISOString() })}
\`\`\``
  };
  return { partner, copy, confirmation, task };
}

// ---------- Betriebsrat-Anmeldung ----------
// Individual offer links for one Gremium: br = reference from the mail link, else the Anmelde-ID.
export function gremiumLinks({ br, offers = [], site }) {
  return offers.map(o => `${o.partner} (${o.regionText}): https://${site.canonicalHost}/angebote/${o.slug}/${o.auswertung === false ? '' : `?br=${encodeURIComponent(br)}&utm_source=betriebsrat&utm_medium=weiterleitung`}`).join('\n');
}

export function betriebsratMessages({ id, v, site, now = new Date(), doiUrl, clickupUrl = '', offers = [] }) {
  const linkBr = v.br || id.toLowerCase();
  const links = gremiumLinks({ br: linkBr, offers, site });
  const details = lines([
    ['Betrieb / Organisation', v.organisation], ['Region der Betriebsstätte', v.region], ['Beschäftigte (ungefähr)', v.beschaeftigte],
    ['Name', v.name], ['Funktion', v.funktion], ['E-Mail', v.email], ['Telefon', v.telefon], ['Wunsch-Angebote', v.nachricht]
  ]);
  const consent = `Einwilligung zur monatlichen Angebotsübersicht erteilt am ${viennaTime(now)} (Checkbox im Formular); Bestätigung per Double-Opt-in ausstehend.`;
  const confirmation = {
    subject: 'Bitte bestätigen: Angebotsübersicht von firmenbenefits.at',
    text: `Hallo ${v.name},

danke für eure Anmeldung! Bitte bestätigt kurz, dass ihr einmal im Monat die Angebotsübersicht von firmenbenefits.at an ${v.email} bekommen wollt:

${doiUrl}

Ohne Bestätigung schicken wir euch keine Angebotsübersicht.

Danach schicken wir euch die aktuellen Angebote mit euren eigenen Anfrage-Links zum Weiterleiten.

Für euch als Betriebsrat ist firmenbenefits.at kostenlos. Abbestellen geht jederzeit – eine kurze Antwort auf diese Mail genügt.

Eure Anmelde-Nummer: ${id}

Liebe Grüße
firmenbenefits.at

${SIG(site)}`
  };
  const copy = {
    subject: `[firmenbenefits] Betriebsrat-Anmeldung: ${v.organisation} (${id})`,
    replyTo: v.email,
    text: `Neue Anmeldung zur monatlichen Angebotsübersicht

Anmelde-ID: ${id}
Eingang: ${viennaTime(now)}
${clickupUrl ? `ClickUp: ${clickupUrl}` : 'ClickUp: NICHT gespeichert – bitte manuell nachtragen'}

${details}

${trackingLines(v) || 'Gremium-Referenz (br): –'}

${consent}

Anfrage-Links für dieses Gremium (br=${linkBr}):
${links || '–'}`
  };
  const task = {
    name: `Betriebsrat ${id} · ${v.organisation} · ${v.region}`,
    tags: ['fb-betriebsrat'],
    markdown: `## Betriebsrat-Anmeldung ${id}

${mdTable([['Betrieb / Organisation', v.organisation], ['Region der Betriebsstätte', v.region], ['Beschäftigte (ungefähr)', v.beschaeftigte], ['Name', v.name], ['Funktion', v.funktion], ['E-Mail', v.email], ['Telefon', v.telefon], ['Wunsch-Angebote', v.nachricht], ['Eingang', viennaTime(now)]])}

### Herkunft
${mdTable([['Gremium-Referenz (br)', v.br || '–'], ['utm_source', v.utm_source], ['utm_medium', v.utm_medium], ['utm_campaign', v.utm_campaign]])}

### Einwilligung
${consent}

### Anfrage-Links für dieses Gremium (br=${linkBr})
${links ? links.split('\n').map(l => `- ${l}`).join('\n') : '–'}

\`\`\`json
${JSON.stringify({ typ: 'betriebsrat', id, region: v.region, beschaeftigte: v.beschaeftigte, br: v.br || null, linkBr, doi: false, eingang: now.toISOString() })}
\`\`\``
  };
  return { confirmation, copy, task };
}

// ---------- Partner-Anfrage ----------
export function partnerMessages({ id, v, site, now = new Date(), clickupUrl = '' }) {
  const details = lines([
    ['Unternehmen', v.firma], ['Branche', v.branche], ['Region / Standort', v.standort], ['Rabattidee', v.rabattidee],
    ['Ansprechperson', v.name], ['E-Mail', v.email], ['Telefon', v.telefon], ['Website', v.website]
  ]);
  const confirmation = {
    subject: `Danke für Ihr Interesse an firmenbenefits.at (${id})`,
    text: `Guten Tag ${v.name},

danke für Ihren Vorschlag! Wir sehen uns Ihr Angebot an und melden uns persönlich mit den nächsten Schritten.

Ihre Angaben:
${details}

Ihre Anfrage-Nummer: ${id}

Freundliche Grüße
firmenbenefits.at

${SIG(site)}`
  };
  const copy = {
    subject: `[firmenbenefits] Partner-Anfrage: ${v.firma} (${id})`,
    replyTo: v.email,
    text: `Neue Partner-Anfrage über firmenbenefits.at/partner-werden/

Anfrage-ID: ${id}
Eingang: ${viennaTime(now)}
${clickupUrl ? `ClickUp: ${clickupUrl}` : 'ClickUp: NICHT gespeichert – bitte manuell nachtragen'}

${details}

${trackingLines(v)}`
  };
  const task = {
    name: `Partner-Anfrage ${id} · ${v.firma} · ${v.branche}`,
    tags: ['fb-partner'],
    markdown: `## Partner-Anfrage ${id}

${mdTable([['Unternehmen', v.firma], ['Branche', v.branche], ['Region / Standort', v.standort], ['Rabattidee', v.rabattidee], ['Ansprechperson', v.name], ['E-Mail', v.email], ['Telefon', v.telefon], ['Website', v.website], ['Eingang', viennaTime(now)]])}

\`\`\`json
${JSON.stringify({ typ: 'partner', id, branche: v.branche, standort: v.standort, utm_source: v.utm_source || null, eingang: now.toISOString() })}
\`\`\``
  };
  return { confirmation, copy, task };
}
