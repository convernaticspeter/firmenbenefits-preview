// Single source of truth for all forms: the build renders fields from here,
// the server validates against the same definitions.

export const TRACKING_FIELDS = ['br', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export const BR_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const REGION_OPTIONS = [
  'Wien',
  'Bezirk Baden',
  'Bezirk Bruck an der Leitha',
  'Bezirk Gänserndorf',
  'Bezirk Mödling',
  'Andere Region in Niederösterreich',
  'Anderes Bundesland'
];

const BESCHAEFTIGTE_OPTIONS = ['bis 50', '51–250', '251–1.000', '1.001–5.000', 'über 5.000'];

const FUNKTION_OPTIONS = [
  'Betriebsratsvorsitz',
  'Betriebsratsmitglied',
  'Personalvertretung',
  'HR / Geschäftsführung',
  'Andere Funktion'
];

export const FORMS = {
  anfrage: {
    endpoint: '/api/anfrage',
    hidden: ['angebot', ...TRACKING_FIELDS],
    fields: [
      { name: 'vorname', label: 'Vorname', type: 'text', required: true, autocomplete: 'given-name', max: 80, half: true },
      { name: 'nachname', label: 'Nachname', type: 'text', required: true, autocomplete: 'family-name', max: 80, half: true },
      { name: 'arbeitgeber', label: 'Arbeitgeber / Organisation', type: 'text', required: true, autocomplete: 'organization', max: 160, placeholder: 'Bei wem arbeitest du?' },
      { name: 'email', label: 'E-Mail', type: 'email', required: true, autocomplete: 'email', max: 254, half: true, placeholder: 'name@beispiel.at' },
      { name: 'telefon', label: 'Telefon', type: 'tel', required: true, autocomplete: 'tel', max: 40, half: true, placeholder: '+43 …' },
      { name: 'dienststelle', label: 'Betriebsrat / Dienststelle', type: 'text', required: false, max: 160, group: 'optional', placeholder: 'Von welchem Betriebsrat hast du das Angebot?' },
      { name: 'plz', label: 'PLZ oder Bezirk', type: 'text', required: false, autocomplete: 'postal-code', max: 60, group: 'optional', placeholder: 'z. B. 1100 oder Mödling' },
      { name: 'nachricht', label: 'Nachricht oder Wunschtermin', type: 'textarea', required: false, max: 3000, group: 'optional' },
      { name: 'einwilligung', type: 'checkbox', required: true, value: 'ja' }
    ]
  },
  betriebsrat: {
    endpoint: '/api/betriebsrat',
    hidden: [...TRACKING_FIELDS],
    fields: [
      { name: 'organisation', label: 'Betrieb / Organisation', type: 'text', required: true, autocomplete: 'organization', max: 160, placeholder: 'z. B. Betriebsrat der Muster GmbH' },
      { name: 'region', label: 'Region der Betriebsstätte', type: 'select', required: true, options: REGION_OPTIONS, half: true },
      { name: 'beschaeftigte', label: 'Beschäftigte (ungefähr)', type: 'select', required: true, options: BESCHAEFTIGTE_OPTIONS, half: true },
      { name: 'name', label: 'Dein Name', type: 'text', required: true, autocomplete: 'name', max: 120, half: true },
      { name: 'funktion', label: 'Funktion', type: 'select', required: false, options: FUNKTION_OPTIONS, half: true },
      { name: 'email', label: 'E-Mail für die Angebotsübersicht', type: 'email', required: true, autocomplete: 'email', max: 254, half: true, placeholder: 'betriebsrat@beispiel.at' },
      { name: 'telefon', label: 'Telefon', type: 'tel', required: false, autocomplete: 'tel', max: 40, half: true, placeholder: '+43 …' },
      { name: 'nachricht', label: 'Welche Angebote würden eure Kolleg:innen freuen?', type: 'textarea', required: false, max: 3000, placeholder: 'Fitness, Handwerk, Freizeit, Essen oder etwas ganz anderes?' },
      { name: 'monatlich', type: 'checkbox', required: true, value: 'ja' }
    ]
  },
  partner: {
    endpoint: '/api/partner',
    hidden: [...TRACKING_FIELDS],
    fields: [
      { name: 'firma', label: 'Unternehmen', type: 'text', required: true, autocomplete: 'organization', max: 160, half: true },
      { name: 'branche', label: 'Branche', type: 'text', required: true, max: 120, half: true, placeholder: 'z. B. Fitness, Tischlerei, Gastronomie' },
      { name: 'standort', label: 'Region / Standort', type: 'text', required: true, max: 160, placeholder: 'z. B. 2340 Mödling, Einzugsgebiet Wien Süd' },
      { name: 'rabattidee', label: 'Welchen Vorteil könnten Sie Belegschaften geben?', type: 'textarea', required: true, max: 3000, placeholder: 'z. B. 10 % auf alle Leistungen, Gratis-Erstberatung, Paketpreis' },
      { name: 'name', label: 'Ansprechperson', type: 'text', required: true, autocomplete: 'name', max: 120, half: true },
      { name: 'email', label: 'E-Mail', type: 'email', required: true, autocomplete: 'email', max: 254, half: true },
      { name: 'telefon', label: 'Telefon', type: 'tel', required: false, autocomplete: 'tel', max: 40, half: true },
      { name: 'website', label: 'Website', type: 'url', required: false, autocomplete: 'url', max: 200, half: true, placeholder: 'https://' }
    ]
  }
};

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function clean(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}

// Returns { ok, values, errors } – errors map field name → German message.
export function validate(formKey, input, ctx = {}) {
  const form = FORMS[formKey];
  const values = {};
  const errors = {};
  for (const field of form.fields) {
    const raw = input[field.name];
    if (raw !== undefined && typeof raw !== 'string') { errors[field.name] = 'Ungültige Eingabe.'; continue; }
    const v = clean(raw);
    if (field.type === 'checkbox') {
      const checked = v === (field.value || 'ja');
      if (field.required && !checked) errors[field.name] = 'Bitte bestätige dieses Feld.';
      values[field.name] = checked ? 'ja' : '';
      continue;
    }
    if (field.max && v.length > field.max) { errors[field.name] = `Bitte höchstens ${field.max} Zeichen.`; continue; }
    if (!v) {
      if (field.required) errors[field.name] = 'Bitte ausfüllen.';
      values[field.name] = '';
      continue;
    }
    if (field.type === 'email' && !EMAIL_RE.test(v)) errors[field.name] = 'Bitte eine gültige E-Mail-Adresse eingeben.';
    if (field.type === 'tel' && ((v.match(/\d/g) || []).length < 6 || !/^[0-9+()\/.\s-]+$/.test(v))) errors[field.name] = 'Bitte eine gültige Telefonnummer eingeben.';
    if (field.type === 'select' && !field.options.includes(v)) errors[field.name] = 'Bitte eine Option auswählen.';
    if (field.type === 'url' && !/^(https?:\/\/)?[^\s<>"']+\.[^\s<>"']{2,}$/i.test(v)) errors[field.name] = 'Bitte eine gültige Adresse eingeben.';
    values[field.name] = v;
  }
  for (const name of form.hidden) {
    const v = clean(input[name]).slice(0, 120);
    values[name] = v;
  }
  if ('br' in values) {
    const br = values.br.toLowerCase();
    values.br = BR_PATTERN.test(br) ? br : '';
  }
  if (formKey === 'anfrage') {
    if (!ctx.offers || !ctx.offers[values.angebot]) errors.angebot = 'Dieses Angebot gibt es nicht (mehr).';
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

// Fields mosparo inspects: every visible text-like field (no hidden fields, no checkboxes).
export function mosparoFieldNames(formKey) {
  return FORMS[formKey].fields.filter(f => f.type !== 'checkbox').map(f => f.name);
}

const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function requestId(date = new Date(), random = globalThis.crypto) {
  const bytes = new Uint8Array(5);
  random.getRandomValues(bytes);
  const suffix = [...bytes].map(b => ID_ALPHABET[b % 32]).join('');
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `FB-${yy}${mm}-${suffix}`;
}
