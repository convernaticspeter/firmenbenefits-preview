// firmenbenefits.at – static pages from dist/ plus form API.
// Flow per submission: validate → mosparo (fail closed) → ClickUp task → mails (Emailit SMTP).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { loadContent } from './lib/content.mjs';
import { validate, mosparoFieldNames, requestId } from './lib/schema.mjs';
import { verifyMosparo } from './lib/mosparo.mjs';
import * as clickup from './lib/clickup.mjs';
import { anfrageMessages, betriebsratMessages, partnerMessages } from './lib/messages.mjs';

const env = process.env;
const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, 'dist');
const { site, offersBySlug } = await loadContent();
const CANON = site.canonicalHost;
const offerAliases = Object.fromEntries(Object.values(offersBySlug).flatMap(o => [[o.slug, o.slug], ...(o.aliase || []).map(a => [a, o.slug])]));
const previewHosts = (env.PREVIEW_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const validHosts = new Set([CANON, 'www.' + CANON, ...previewHosts, 'localhost', '127.0.0.1']);
const port = Number(env.PORT || 3000);
const QA = (env.FORM_QA_RECIPIENT || '').trim();
// QA redirect applies only to preview hosts – on the canonical host mails always go to the real recipients.
const qaFor = publicHost => (QA && publicHost !== CANON ? QA : '');

const transport = nodemailer.createTransport({
  host: env.EMAILIT_SMTP_HOST, port: Number(env.EMAILIT_SMTP_PORT || 587), secure: env.EMAILIT_SMTP_PORT === '465',
  auth: { user: env.EMAILIT_SMTP_USER, pass: env.EMAILIT_SMTP_PASSWORD }, connectionTimeout: 15000, socketTimeout: 20000,
  pool: true, maxConnections: 1, maxMessages: 50
});
const mailConfigured = () => Boolean(env.EMAILIT_SMTP_HOST && env.EMAILIT_SMTP_USER && env.EMAILIT_SMTP_PASSWORD && env.EMAILIT_SMTP_FROM && env.FB_COPY_TO);
const from = () => ({ name: env.MAIL_FROM_NAME || 'firmenbenefits.at', address: env.EMAILIT_SMTP_FROM });
const copyTo = qa => qa || env.FB_COPY_TO;
const replyTo = () => env.FB_REPLY_TO || env.FB_COPY_TO || site.betreiber.email;

async function send({ to, subject, text, replyTo: rt, qa = '' }) {
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, error: 'no_recipient' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await transport.sendMail({ from: from(), to, subject: (qa ? 'TEST – ' : '') + subject, text, replyTo: rt || replyTo() });
      return { ok: Boolean(result.accepted?.length), messageId: result.messageId };
    } catch (error) {
      const err = { ok: false, error: error.code || 'SMTP_ERROR', status: error.responseCode || null };
      console.error(JSON.stringify({ event: 'smtp_failed', attempt, code: err.error, status: err.status, response: String(error.response || '').slice(0, 160) }));
      if (attempt === 2 || (err.status && err.status >= 500)) return err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function store(task) {
  if (!clickup.clickupConfigured()) return null;
  try { return await clickup.createTask(task); } catch (error) { console.error(JSON.stringify({ event: 'clickup_failed', status: error.status || null })); return null; }
}

const doiSig = (id, tid) => createHmac('sha256', env.FB_DOI_SECRET || '').update(`doi|${id}|${tid}`).digest('hex').slice(0, 32);
function log(event, id, data) { console.info(JSON.stringify({ event, id, ...data })); }

// ---------- Handlers ----------
async function handleAnfrage(v, ctx) {
  const qa = qaFor(ctx.publicHost);
  const offer = offersBySlug[v.angebot];
  const id = requestId();
  const now = new Date();
  const first = anfrageMessages({ id, v, offer, site, now });
  const stored = await store(first.task);
  const recipients = qa ? [qa] : offer.empfaenger;
  const partnerResult = await send({ to: recipients, qa, ...first.partner });
  const partnerStatus = partnerResult.ok ? `zugestellt an ${recipients.join(', ')}${qa ? ' (QA-Umleitung)' : ''}` : `FEHLGESCHLAGEN (${partnerResult.error}) – bitte manuell an ${offer.empfaenger.join(', ')} weiterleiten`;
  const msgs = anfrageMessages({ id, v, offer, site, now, clickupUrl: stored?.url || '', partnerStatus });
  const confResult = await send({ to: v.email, qa, ...msgs.confirmation });
  const copyResult = await send({ to: copyTo(qa), qa, ...msgs.copy });
  log('anfrage', id, { qa: Boolean(qa), angebot: offer.slug, br: Boolean(v.br), stored: Boolean(stored), partner: partnerResult.ok, copy: copyResult.ok, confirmation: confResult.ok });
  if (!partnerResult.ok && !copyResult.ok) return { status: 502, body: { error: 'Deine Anfrage konnte gerade nicht übermittelt werden. Bitte versuch es noch einmal.' } };
  return { status: 200, body: { ok: true, id } };
}

async function handleBetriebsrat(v, ctx) {
  const qa = qaFor(ctx.publicHost);
  const id = requestId();
  const now = new Date();
  const offers = Object.values(offersBySlug);
  const first = betriebsratMessages({ id, v, site, now, doiUrl: '', offers });
  const stored = await store(first.task);
  const tid = stored?.id || '';
  const doiUrl = `https://${ctx.publicHost}/bestaetigen/?id=${encodeURIComponent(id)}&tid=${encodeURIComponent(tid)}&sig=${doiSig(id, tid)}`;
  const msgs = betriebsratMessages({ id, v, site, now, doiUrl, clickupUrl: stored?.url || '', offers });
  const confResult = await send({ to: v.email, qa, ...msgs.confirmation });
  const copyResult = await send({ to: copyTo(qa), qa, ...msgs.copy });
  log('betriebsrat', id, { qa: Boolean(qa), br: Boolean(v.br), stored: Boolean(stored), confirmation: confResult.ok, copy: copyResult.ok });
  if (!confResult.ok && !copyResult.ok) return { status: 502, body: { error: 'Die Anmeldung konnte gerade nicht übermittelt werden. Bitte versucht es noch einmal.' } };
  return { status: 200, body: { ok: true, id } };
}

async function handlePartner(v, ctx) {
  const qa = qaFor(ctx.publicHost);
  const id = requestId();
  const now = new Date();
  const first = partnerMessages({ id, v, site, now });
  const stored = await store(first.task);
  const msgs = partnerMessages({ id, v, site, now, clickupUrl: stored?.url || '' });
  const confResult = await send({ to: v.email, qa, ...msgs.confirmation });
  const copyResult = await send({ to: copyTo(qa), qa, ...msgs.copy });
  log('partner', id, { qa: Boolean(qa), stored: Boolean(stored), copy: copyResult.ok, confirmation: confResult.ok });
  if (!stored && !copyResult.ok) return { status: 502, body: { error: 'Ihre Anfrage konnte gerade nicht übermittelt werden. Bitte versuchen Sie es noch einmal.' } };
  return { status: 200, body: { ok: true, id } };
}

async function handleBestaetigen(fields, ctx) {
  const id = String(fields.id || ''); const tid = String(fields.tid || ''); const sig = String(fields.sig || '');
  const invalid = { status: 400, body: { error: 'Der Bestätigungslink ist ungültig.' } };
  if (!/^FB-\d{4}-[A-Z0-9]{5}$/.test(id) || !/^[a-z0-9]{0,20}$/.test(tid) || !/^[a-f0-9]{32}$/.test(sig) || !env.FB_DOI_SECRET) return invalid;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(doiSig(id, tid)))) return invalid;
  const when = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  let done = false;
  if (tid && clickup.clickupConfigured()) {
    try {
      await clickup.addComment(tid, `✅ Double-Opt-in bestätigt am ${when} über den Bestätigungslink (Anmelde-ID ${id}).`);
      await clickup.addTag(tid, 'fb-doi-bestaetigt');
      done = true;
    } catch (error) { console.error(JSON.stringify({ event: 'doi_clickup_failed', status: error.status || null })); }
  }
  if (!done) {
    const r = await send({ to: copyTo(qaFor(ctx.publicHost)), qa: qaFor(ctx.publicHost), subject: `[firmenbenefits] Double-Opt-in bestätigt (${id})`, text: `Die Anmeldung ${id} wurde am ${when} über den Bestätigungslink bestätigt.\nClickUp-Task: ${tid || 'nicht vorhanden'} – bitte manuell vermerken.` });
    if (!r.ok) return { status: 502, body: { error: 'Die Bestätigung konnte gerade nicht gespeichert werden.' } };
  }
  log('doi', id, { clickup: done });
  return { status: 200, body: { ok: true } };
}

// ---------- HTTP ----------
const REDIRECTS = {
  '/index.html': '/', '/startseite/': '/', '/hello-world/': '/', '/betriebsraete.html': '/#mitmachen', '/betriebsraete/': '/#mitmachen', '/hr.html': '/',
  '/unternehmen.html': '/partner-werden/', '/partner/': '/partner-werden/', '/impressum.html': '/impressum/', '/datenschutz.html': '/datenschutz/',
  '/datenschutzerklaerung/': '/datenschutz/', '/kontakt/': '/#mitmachen', '/wp-sitemap.xml': '/sitemap.xml', '/sitemap_index.xml': '/sitemap.xml', '/page-sitemap1.xml': '/sitemap.xml'
};
const OLD_IDS = { '1': '/', '41': '/', '141': '/impressum/', '146': '/datenschutz/' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const buckets = new Map();
const LIMITS = { anfrage: 10, betriebsrat: 5, partner: 5, bestaetigen: 20 };

function csp() {
  const m = env.MOSPARO_HOST ? new URL(env.MOSPARO_HOST).origin : '';
  const p = new URL(site.plausibleScript).origin;
  return [`default-src 'self'`, `script-src 'self' ${m} ${p}`, `style-src 'self' 'unsafe-inline' ${m}`, `img-src 'self' data: ${m}`, `font-src 'self' ${m}`, `connect-src 'self' ${m} ${p}`, `worker-src 'self' blob: ${m}`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`].join('; ').replace(/\s+;/g, ';');
}

function rateLimited(ip, kind) {
  const now = Date.now();
  for (const [k, v] of buckets) if (now - v.start > 3600000) buckets.delete(k);
  const key = kind + '|' + ip;
  const b = buckets.get(key) || { start: now, count: 0 };
  if (b.count >= (LIMITS[kind] || 5)) return true;
  b.count++; buckets.set(key, b);
  return false;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 32768) throw Object.assign(new Error('too_large'), { status: 413 }); }
  return (req.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
}

async function api(req, res, url, host, json) {
  if (url.pathname === '/api/health') return json(200, { ok: true, mail: mailConfigured(), clickup: clickup.clickupConfigured(), mosparo: Boolean(env.MOSPARO_HOST && env.MOSPARO_PRIVATE_KEY), doi: Boolean(env.FB_DOI_SECRET), qaPreview: Boolean(QA) });
  if (url.pathname === '/api/mosparo-config') return json(200, { host: env.MOSPARO_HOST || '', uuid: env.MOSPARO_UUID || '', publicKey: env.MOSPARO_PUBLIC_KEY || '' });
  const kind = { '/api/anfrage': 'anfrage', '/api/betriebsrat': 'betriebsrat', '/api/partner': 'partner', '/api/bestaetigen': 'bestaetigen' }[url.pathname];
  if (!kind) return json(404, { error: 'Nicht gefunden.' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(405, { error: 'Bitte per POST senden.' }); }
  const origin = req.headers.origin;
  if (origin) { let oh = ''; try { oh = new URL(origin).hostname; } catch {} if (!validHosts.has(oh)) return json(403, { error: 'Ungültiger Ursprung.' }); }
  let fields;
  try { fields = await readBody(req); } catch (error) { return json(error.status || 400, { error: error.status === 413 ? 'Die Eingabe ist zu lang.' : 'Ungültiges Formular.' }); }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',').at(-1).trim();
  if (rateLimited(ip, kind)) return json(429, { error: 'Zu viele Versuche. Bitte versuch es später noch einmal.' });
  const publicHost = validHosts.has(host) && host !== 'www.' + CANON && host !== 'localhost' && host !== '127.0.0.1' ? host : CANON;
  if (kind === 'bestaetigen') { const r = await handleBestaetigen(fields, { publicHost }); return json(r.status, r.body); }

  const check = validate(kind, fields, { offers: offersBySlug });
  if (!check.ok) return json(422, { error: 'Bitte prüfe die markierten Felder.', errors: check.errors });
  if (!env.MOSPARO_HOST || !env.MOSPARO_PRIVATE_KEY) return json(503, { error: 'Die Spamprüfung ist gerade nicht verfügbar.' });
  if (!fields._mosparo_submitToken || !fields._mosparo_validationToken) return json(422, { error: 'Bitte bestätige noch die Spamprüfung.' });
  try {
    const names = mosparoFieldNames(kind).filter(n => Object.hasOwn(fields, n));
    const data = Object.fromEntries(names.map(n => [n, String(fields[n])]));
    const result = await verifyMosparo(data, String(fields._mosparo_submitToken), String(fields._mosparo_validationToken));
    if (!result.valid) { console.warn(JSON.stringify({ event: 'mosparo_rejected', kind, reason: result.reason })); return json(422, { error: 'Die Spamprüfung ist fehlgeschlagen. Bitte lade die Seite neu und versuch es noch einmal.' }); }
  } catch { console.error(JSON.stringify({ event: 'mosparo_unavailable', kind })); return json(503, { error: 'Die Spamprüfung ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.' }); }
  if (!mailConfigured()) return json(503, { error: 'Der Versand ist gerade nicht verfügbar.' });

  const handler = { anfrage: handleAnfrage, betriebsrat: handleBetriebsrat, partner: handlePartner }[kind];
  const r = await handler(check.values, { publicHost });
  return json(r.status, r.body);
}

const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    const canonical = host === CANON;
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', csp());
    if (canonical) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    // Offer pages are unlisted: only reachable via the individual links in the Betriebsrat mails.
    const unlisted = /^\/(angebote|danke|bestaetigen)\//.test(url.pathname);
    if ((!canonical && host !== 'www.' + CANON) || unlisted) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

    if (host === 'www.' + CANON) { res.writeHead(301, { Location: `https://${CANON}${url.pathname}${url.search}` }); return res.end(); }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, host, json);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }

    // Links aus den Betriebsrats-Mails: /?angebot=<slug|alias>&br=<id>#anfrage → Angebotsseite (Fragment bleibt im Browser erhalten)
    const wanted = url.pathname === '/' ? (url.searchParams.get('angebot') || '').toLowerCase() : '';
    if (wanted && offerAliases[wanted]) {
      const q = new URLSearchParams(url.search); q.delete('angebot');
      res.writeHead(302, { Location: `/angebote/${offerAliases[wanted]}/${q.toString() ? '?' + q : ''}` }); return res.end();
    }
    if (url.pathname === '/angebote/' || url.pathname === '/angebote') { res.writeHead(302, { Location: '/' }); return res.end(); }
    const oldId = url.searchParams.get('page_id') || url.searchParams.get('p');
    if (oldId && OLD_IDS[oldId]) { res.writeHead(301, { Location: OLD_IDS[oldId] }); return res.end(); }
    if (REDIRECTS[url.pathname]) { res.writeHead(301, { Location: REDIRECTS[url.pathname] + (REDIRECTS[url.pathname].includes('#') ? '' : url.search) }); return res.end(); }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(canonical ? `User-agent: *\nAllow: /\nDisallow: /danke/\nDisallow: /bestaetigen/\nDisallow: /api/\nSitemap: https://${CANON}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
    }

    let decoded; try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (decoded.includes('\0') || decoded.includes('\\')) { res.writeHead(400); return res.end(); }
    let file = path.join(distDir, path.posix.normalize(decoded));
    if (file !== distDir && !file.startsWith(distDir + path.sep)) { res.writeHead(400); return res.end(); }
    let stat; try { stat = await fs.stat(file); } catch {}
    if (stat?.isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end(); }
      file = path.join(file, 'index.html');
      try { stat = await fs.stat(file); } catch { stat = null; }
    }
    let status = 200;
    if (!stat?.isFile()) { status = 404; file = path.join(distDir, '404.html'); }
    let data = await fs.readFile(file);
    const ext = path.extname(file);
    if (ext === '.html') {
      let html = data.toString().replaceAll('__ROBOTS__', canonical ? 'index, follow' : 'noindex, nofollow');
      if (!canonical) html = html.replace(/<script defer data-domain="[^"]*" src="https:\/\/plausible\.convernatics\.com\/js\/script\.js"><\/script>\n?/g, '');
      data = Buffer.from(html);
    }
    const cache = ext === '.html' || ext === '.xml' ? 'no-cache' : url.pathname.startsWith('/fonts/') && !url.pathname.endsWith('.css') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
    res.writeHead(status, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error(JSON.stringify({ event: 'request_failed', code: error.code || error.message }));
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Serverfehler');
  }
});

server.listen(port, () => console.info(JSON.stringify({ event: 'listening', port, qaPreview: Boolean(QA), mail: mailConfigured(), clickup: clickup.clickupConfigured() })));
export { server };
