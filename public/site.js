/* firmenbenefits.at – client behaviour. No cookies, no local/session storage. */
window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };

const TRACK_KEYS = ['br', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const BR_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const query = new URLSearchParams(location.search);

// --- Gremium reference + UTM: read from URL, keep across internal links (no storage) ---
const tracking = {};
for (const key of TRACK_KEYS) {
  let v = (query.get(key) || '').trim().slice(0, 120);
  if (key === 'br') { v = v.toLowerCase(); if (!BR_RE.test(v)) v = ''; }
  if (v) tracking[key] = v;
}
if (Object.keys(tracking).length) {
  for (const a of document.querySelectorAll('a[href^="/"]')) {
    const url = new URL(a.getAttribute('href'), location.origin);
    if (url.pathname.startsWith('/impressum') || url.pathname.startsWith('/datenschutz')) continue;
    for (const [k, v] of Object.entries(tracking)) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    a.setAttribute('href', url.pathname + url.search + url.hash);
  }
  for (const form of document.querySelectorAll('form.fb-form')) {
    for (const [k, v] of Object.entries(tracking)) { const input = form.querySelector(`input[type=hidden][name="${k}"]`); if (input) input.value = v; }
  }
}

// --- Mobile menu ---
const menu = document.querySelector('.mobile-menu');
menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.removeAttribute('open')));
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu?.removeAttribute('open'); });
document.addEventListener('click', e => { if (menu?.open && !e.target.closest('.mobile-menu')) menu.removeAttribute('open'); });

// --- Forms ---
const THANKS = { anfrage: '/danke/anfrage/', betriebsrat: '/danke/betriebsrat/', partner: '/danke/partner/' };
const EVENTS = { anfrage: 'Anfrage gesendet', betriebsrat: 'Betriebsrat angemeldet', partner: 'Partner-Anfrage gesendet' };

function setStatus(form, text, state) {
  const status = form.querySelector('.form-status');
  status.textContent = text; status.dataset.state = state || ''; status.hidden = !text;
}
function clearErrors(form) {
  for (const f of form.querySelectorAll('.field.invalid')) f.classList.remove('invalid');
  for (const p of form.querySelectorAll('.field-error')) { p.textContent = ''; p.hidden = true; }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
}
function showErrors(form, errors) {
  let first = null;
  for (const [name, msg] of Object.entries(errors || {})) {
    const el = form.elements[name];
    if (!el || !el.closest) continue;
    const wrap = el.closest('.field');
    const p = wrap?.querySelector('.field-error');
    wrap?.classList.add('invalid'); el.setAttribute('aria-invalid', 'true');
    if (p) { p.textContent = msg; p.hidden = false; }
    const details = el.closest('details'); if (details) details.open = true;
    first = first || el;
  }
  first?.focus();
}
function clientValidate(form) {
  const errors = {};
  for (const el of form.querySelectorAll('input:not([type=hidden]), textarea, select')) {
    if (!el.name || el.name.startsWith('_mosparo')) continue;
    if (el.type === 'checkbox') { if (el.required && !el.checked) errors[el.name] = 'Bitte bestätige dieses Feld.'; continue; }
    if (el.required && !el.value.trim()) errors[el.name] = el.tagName === 'SELECT' ? 'Bitte eine Option auswählen.' : 'Bitte ausfüllen.';
    else if (el.type === 'email' && el.value && !el.checkValidity()) errors[el.name] = 'Bitte eine gültige E-Mail-Adresse eingeben.';
  }
  return errors;
}

async function loadMosparo() {
  const response = await fetch('/api/mosparo-config', { headers: { Accept: 'application/json' } });
  const config = await response.json();
  if (!config.host || !config.uuid || !config.publicKey) throw new Error('Die Spamprüfung ist gerade nicht verfügbar.');
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = config.host + '/build/mosparo-frontend.js';
    s.onload = resolve; s.onerror = () => reject(new Error('Die Spamprüfung konnte nicht geladen werden.'));
    document.head.append(s);
  });
  return config;
}

async function initForms() {
  const forms = [...document.querySelectorAll('form.fb-form')];
  if (!forms.length) return;
  for (const form of forms) form.querySelector('[type=submit]').disabled = true;
  let config;
  try { config = await loadMosparo(); }
  catch (error) {
    for (const form of forms) setStatus(form, error.message + ' Bitte schreib uns an einfach@convernatics.com.', 'error');
    return;
  }
  for (const form of forms) {
    const kind = form.dataset.form;
    new window.mosparo(`mosparo-box-${kind}`, config.host, config.uuid, config.publicKey, { loadCssResource: true, language: 'de_DE' });
    const button = form.querySelector('[type=submit]');
    button.disabled = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      clearErrors(form);
      const errors = clientValidate(form);
      if (Object.keys(errors).length) { showErrors(form, errors); setStatus(form, 'Bitte prüfe die markierten Felder.', 'error'); return; }
      if (!form.querySelector('[name=_mosparo_validationToken]')?.value) { setStatus(form, 'Bitte bestätige noch die Spamprüfung.', 'error'); return; }
      const label = button.textContent;
      button.disabled = true; button.textContent = 'Wird gesendet …'; setStatus(form, '', '');
      try {
        const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)), headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) { if (data.errors) showErrors(form, data.errors); throw new Error(data.error || 'Das hat gerade nicht geklappt.'); }
        const props = {};
        if (kind === 'anfrage') props.angebot = form.elements.angebot.value;
        if (kind === 'betriebsrat') props.region = form.elements.region.value;
        if (tracking.br && form.elements.br) props.br = tracking.br;
        const next = new URL(THANKS[kind], location.origin);
        next.searchParams.set('id', data.id);
        if (kind === 'anfrage') {
          next.searchParams.set('angebot', form.elements.angebot.value);
          const partner = form.closest('[data-partner]')?.dataset.partner;
          if (partner) next.searchParams.set('partner', partner);
        }
        if (tracking.br && form.elements.br) next.searchParams.set('br', tracking.br);
        let navigated = false;
        const go = () => { if (!navigated) { navigated = true; location.assign(next.pathname + next.search); } };
        window.plausible(EVENTS[kind], { props, callback: go });
        setTimeout(go, 1200);
      } catch (error) {
        const msg = error.name === 'TimeoutError' ? 'Der Versand dauert zu lange. Bitte versuch es noch einmal.' : error.message;
        setStatus(form, msg + (msg.includes('@') ? '' : ' Falls es weiter nicht klappt: einfach@convernatics.com'), 'error');
        button.disabled = false; button.textContent = label;
      }
    });
  }
}
void initForms();

// --- Thank-you pages ---
const id = (query.get('id') || '').trim();
if (/^FB-\d{4}-[A-Z0-9]{5}$/.test(id)) {
  document.querySelectorAll('[data-fill="id"]').forEach(el => { el.textContent = id; });
  document.querySelectorAll('[data-show="id"]').forEach(el => { el.hidden = false; });
}
const partnerName = (query.get('partner') || '').trim().slice(0, 80);
if (partnerName) document.querySelectorAll('[data-fill="partner"]').forEach(el => { el.textContent = partnerName; });

// --- Double opt-in confirmation (/bestaetigen/) ---
const doi = document.querySelector('form.doi-form');
if (doi) {
  for (const k of ['id', 'tid', 'sig']) doi.elements[k].value = (query.get(k) || '').slice(0, 200);
  doi.addEventListener('submit', async event => {
    event.preventDefault();
    const button = doi.querySelector('button'); button.disabled = true;
    const status = doi.querySelector('.form-status');
    try {
      const response = await fetch('/api/bestaetigen', { method: 'POST', body: new URLSearchParams(new FormData(doi)), headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Die Bestätigung hat nicht geklappt.');
      location.assign('/danke/bestaetigt/');
    } catch (error) {
      status.textContent = error.message + ' Bitte schreib uns an einfach@convernatics.com.'; status.dataset.state = 'error'; status.hidden = false; button.disabled = false;
    }
  });
}
