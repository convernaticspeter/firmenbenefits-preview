// Pilot dashboard: aggregates the ClickUp submissions (JSON line at the end of each task)
// into counts per month, offer, Gremium (br), source, region. Output contains no personal data.
import { FORMS } from './schema.mjs';

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const PALETTE = ['#e7332a', '#11131a', '#ffc843', '#1d8b5f', '#243f8f'];
const REACH_MIN = { 'bis 50': 1, '51–250': 51, '251–1.000': 251, '1.001–5.000': 1001, 'über 5.000': 5001 };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = n => new Intl.NumberFormat('de-AT').format(n);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const viennaMonth = iso => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}`;
};
const monthLabel = ym => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const dateLabel = iso => new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

const QUELLEN = { 'betriebsrat/email': 'Link aus der Erstmail an den Betriebsrat', 'betriebsrat/weiterleitung': 'Link aus der Monatsübersicht' };
function quelleLabel(r) {
  if (!r.br) return 'Ohne Gremium-Link (direkt)';
  const key = `${r.utm?.source || ''}/${r.utm?.medium || ''}`;
  return QUELLEN[key] || [r.utm?.source, r.utm?.medium].filter(Boolean).join(' / ') || 'Gremium-Link ohne Kampagne';
}

// ---------- Parse ----------
export function parseTasks(tasks) {
  const records = [];
  for (const t of tasks) {
    const text = t.markdown_description || t.text_content || t.description || '';
    const line = text.split('\n').map(l => l.trim()).find(l => l.startsWith('{"typ":'));
    if (!line) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (!d.typ || !d.eingang) continue;
    const tags = (t.tags || []).map(x => x.name);
    records.push({ ...d, doi: d.doi || tags.includes('fb-doi-bestaetigt') });
  }
  return records;
}

// ---------- Aggregate ----------
export function aggregate(records, { offers, site, gremien = {}, now = new Date() }) {
  // Months from pilot start (or an earlier first record, so totals and chart always match) up to now.
  const start = [site.pilot.start, ...records.map(r => r.eingang)].filter(Boolean).sort()[0] || now.toISOString();
  const months = [];
  for (let d = new Date(start.slice(0, 7) + '-01T12:00:00Z'); viennaMonth(d.toISOString()) <= viennaMonth(now.toISOString()) || months.length === 0; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push(viennaMonth(d.toISOString()));
    if (months.length > 24) break;
  }
  const tracked = offers.filter(o => o.auswertung !== false);
  const anfragen = records.filter(r => r.typ === 'anfrage');
  const br = records.filter(r => r.typ === 'betriebsrat');
  const partner = records.filter(r => r.typ === 'partner');

  const perMonth = Object.fromEntries(months.map(m => [m, Object.fromEntries(tracked.map(o => [o.slug, 0]))]));
  const gremium = new Map();
  const quelle = new Map();
  for (const r of anfragen) {
    const m = viennaMonth(r.eingang);
    if (perMonth[m] && r.angebot in perMonth[m]) perMonth[m][r.angebot]++;
    const key = r.br || '';
    const g = gremium.get(key) || { br: key, total: 0, months: Object.fromEntries(months.map(x => [x, 0])), offers: {}, last: '' };
    g.total++; if (m in g.months) g.months[m]++;
    g.offers[r.angebot] = (g.offers[r.angebot] || 0) + 1;
    if (r.eingang > g.last) g.last = r.eingang;
    gremium.set(key, g);
    const q = quelleLabel(r);
    quelle.set(q, (quelle.get(q) || 0) + 1);
  }
  const gremienRows = [...gremium.values()].filter(g => g.br).sort((a, b) => b.total - a.total || b.last.localeCompare(a.last))
    .map(g => ({ ...g, name: gremien[g.br] || '' }));
  const ohneRef = gremium.get('')?.total || 0;

  const regionOptions = FORMS.betriebsrat.fields.find(f => f.name === 'region').options;
  const sizeOptions = FORMS.betriebsrat.fields.find(f => f.name === 'beschaeftigte').options;
  const regionen = regionOptions.map(label => ({ label, bestaetigt: br.filter(r => r.region === label && r.doi).length, offen: br.filter(r => r.region === label && !r.doi).length })).filter(r => r.bestaetigt + r.offen);
  const groessen = sizeOptions.map(label => ({ label, n: br.filter(r => r.beschaeftigte === label && r.doi).length }));
  const reichweite = br.filter(r => r.doi).reduce((s, r) => s + (REACH_MIN[r.beschaeftigte] || 0), 0);
  const branchen = [...partner.reduce((m, r) => m.set(r.branche || '–', (m.get(r.branche || '–') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);

  return {
    months, tracked, untracked: offers.filter(o => o.auswertung === false), perMonth,
    anfragenTotal: anfragen.length, mitRef: anfragen.length - ohneRef, ohneRef,
    gremienRows, quelle: [...quelle].sort((a, b) => b[1] - a[1]),
    brTotal: br.length, brBestaetigt: br.filter(r => r.doi).length, regionen, groessen, reichweite,
    partnerTotal: partner.length, branchen,
    start: site.pilot.start || start, ende: site.pilot.ende
  };
}

// ---------- Demo data (preview only) ----------
export function demoRecords({ offers, now = new Date('2027-01-24T10:00:00Z') } = {}) {
  let seed = 20261101;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr, w) => { let x = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x < 0) return arr[i]; } return arr.at(-1); };
  const day = (ym, maxDay = 28) => `${ym}-${String(1 + Math.floor(rnd() * maxDay)).padStart(2, '0')}T${String(8 + Math.floor(rnd() * 11)).padStart(2, '0')}:15:00Z`;
  const gremien = Array.from({ length: 14 }, (_, i) => `g${String(i + 1).padStart(3, '0')}`);
  const weights = [9, 7, 6, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1, 1];
  const tracked = (offers || []).filter(o => o.auswertung !== false).map(o => o.slug);
  const out = [];
  let n = 0;
  for (const [ym, count, maxDay] of [['2026-11', 9, 28], ['2026-12', 13, 28], ['2027-01', 17, 23]]) {
    for (let i = 0; i < count; i++) {
      const direkt = rnd() < 0.12;
      out.push({ typ: 'anfrage', id: `DEMO-${++n}`, angebot: tracked[0], br: direkt ? null : pick(gremien, weights), utm: direkt ? {} : { source: 'betriebsrat', medium: rnd() < 0.7 ? 'email' : 'weiterleitung' }, eingang: day(ym, maxDay) });
    }
  }
  const regionW = [[ 'Wien', 13 ], [ 'Bezirk Baden', 2 ], [ 'Bezirk Bruck an der Leitha', 2 ], [ 'Bezirk Mödling', 2 ], [ 'Bezirk Gänserndorf', 1 ], [ 'Andere Region in Niederösterreich', 1 ]];
  const sizes = ['bis 50', '51–250', '251–1.000', '1.001–5.000', 'über 5.000'];
  for (const [region, k] of regionW) for (let i = 0; i < k; i++) {
    out.push({ typ: 'betriebsrat', id: `DEMO-${++n}`, region, beschaeftigte: pick(sizes, [2, 5, 5, 3, 1]), br: null, doi: rnd() < 0.8, eingang: day(pick(['2026-11', '2026-12', '2027-01'], [5, 3, 2]), 23) });
  }
  for (const branche of ['Optiker', 'Fahrradhandel', 'Physiotherapie', 'Gastronomie']) out.push({ typ: 'partner', id: `DEMO-${++n}`, branche, eingang: day('2026-12') });
  const labels = ['Betriebsrat Spital (Wien)', 'Personalvertretung Magistrat (Wien)', 'Zentralbetriebsrat Verkehrsbetrieb (Wien)', 'Betriebsrat Pflegeheim (Wien)', 'Betriebsrat Logistikzentrum (Bruck/Leitha)', 'Betriebsrat Universität (Wien)', 'Personalvertretung Polizei (Wien)', 'Betriebsrat Versicherung (Wien)', 'Betriebsrat Klinikum (Baden)', 'Betriebsrat Handel (Mödling)', 'Betriebsrat Energieversorger (Wien)', 'Betriebsrat Bank (Wien)', 'Betriebsrat Produktion (Gänserndorf)', 'Betriebsrat Sozialverein (Wien)'];
  return { records: out.filter(r => r.eingang <= now.toISOString()), gremien: Object.fromEntries(gremien.map((g, i) => [g, labels[i]])), now };
}

// ---------- Render ----------
function bars(rows, { max, color = PALETTE[0], fmt = nf } = {}) {
  const m = max || Math.max(1, ...rows.map(r => r.value));
  return `<div class="hbars">${rows.map(r => `<div class="hbar"><span class="hbar-label">${esc(r.label)}</span><span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(r.value ? 2 : 0, (r.value / m) * 100)}%;background:${r.color || color}"></span></span><span class="hbar-val">${fmt(r.value)}</span></div>`).join('')}</div>`;
}

export function renderDashboard(a, { demo = false, generatedAt = new Date(), fontBase64 = '', offers = [] } = {}) {
  const offerName = slug => offers.find(o => o.slug === slug)?.partner || slug;
  const series = a.tracked.map((o, i) => ({ slug: o.slug, label: o.partner, color: PALETTE[i % PALETTE.length] }));
  const monthTotals = a.months.map(m => series.reduce((s, x) => s + a.perMonth[m][x.slug], 0));
  const maxMonth = Math.max(1, ...monthTotals);
  const monthChart = `<div class="vbars">${a.months.map((m, i) => `<div class="vbar"><span class="vbar-total">${monthTotals[i]}</span><span class="vbar-stack">${series.map(s => { const v = a.perMonth[m][s.slug]; return v ? `<span class="vbar-seg" style="height:${(v / maxMonth) * 100}%;background:${s.color}" title="${esc(s.label)}: ${v}"></span>` : ''; }).join('')}</span><span class="vbar-label">${monthLabel(m)}</span></div>`).join('')}</div>`;
  const legend = `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`;
  const maxG = Math.max(1, ...a.gremienRows.map(g => g.total));
  const gremienTable = a.gremienRows.length ? `<table class="table">
<thead><tr><th>Gremium</th><th class="num">Anfragen</th>${a.months.map(m => `<th class="num">${monthLabel(m).split(' ')[0]}</th>`).join('')}<th>Letzte Anfrage</th></tr></thead>
<tbody>${a.gremienRows.map(g => `<tr><td><strong>${esc(g.name || g.br)}</strong>${g.name ? `<small>br=${esc(g.br)}</small>` : ''}</td><td class="num"><span class="cell-bar"><span style="width:${(g.total / maxG) * 100}%"></span></span>${g.total}</td>${a.months.map(m => `<td class="num${g.months[m] ? '' : ' zero'}">${g.months[m] || '–'}</td>`).join('')}<td>${dateLabel(g.last)}</td></tr>`).join('')}</tbody>
${a.ohneRef ? `<tfoot><tr><td>Ohne Gremium-Referenz (direkt)</td><td class="num">${a.ohneRef}</td><td colspan="${a.months.length + 1}"></td></tr></tfoot>` : ''}
</table>` : `<p class="empty">Noch keine Anfragen mit Gremium-Referenz.</p>`;
  const stand = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt);
  const font = fontBase64 ? `@font-face{font-family:Archivo;src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:400 900;font-display:swap}` : '';
  return `<!doctype html>
<html lang="de-AT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Pilot-Dashboard | firmenbenefits.at</title>
<style>
${font}
:root{--ink:#11131a;--muted:#5d6472;--line:rgba(17,19,26,.12);--red:#e7332a;--yellow:#ffc843;--green:#1d8b5f;--cream:#fffaf1;--soft:#f7f1e7}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font:500 16px/1.45 Archivo,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 24px 40px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;padding-bottom:20px;border-bottom:2px solid var(--ink)}
.brand{display:flex;align-items:center;gap:12px}
.mark{position:relative;width:42px;height:42px;border-radius:13px 13px 13px 4px;background:var(--red);color:#fff;display:grid;place-items:center;font-weight:900;font-size:23px;transform:rotate(-8deg)}
.mark span{transform:rotate(8deg)}
.mark::after{content:"";position:absolute;top:6px;left:6px;width:7px;height:7px;border-radius:50%;background:var(--yellow);box-shadow:0 0 0 2px var(--red)}
.brand-word{font-size:20px;font-weight:600;letter-spacing:-.03em}.brand-word b{font-weight:900}.brand-word i{font-style:normal;font-weight:900;color:var(--red)}
h1{margin:0;font-size:30px;letter-spacing:-.035em;line-height:1.1}
.meta{color:var(--muted);font-size:14px;font-weight:600;text-align:right}
.demo{margin:18px 0 0;padding:12px 16px;border-radius:14px;background:var(--yellow);font-weight:800;font-size:15px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:24px 0}
.kpi{background:#fff;border:1px solid var(--line);border-radius:20px;padding:18px 18px 16px}
.kpi strong{display:block;font-size:34px;line-height:1;letter-spacing:-.04em;font-weight:900}
.kpi span{display:block;margin-top:8px;font-weight:800;font-size:15px}
.kpi small{display:block;margin-top:4px;color:var(--muted);font-size:14px;font-weight:600}
.kpi.accent{background:var(--ink);color:#fff;border-color:var(--ink)}.kpi.accent small{color:rgba(255,255,255,.7)}
.grid{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;margin-bottom:14px}
.card{background:#fff;border:1px solid var(--line);border-radius:22px;padding:22px}
.card h2{margin:0 0 4px;font-size:19px;letter-spacing:-.02em}
.card .sub{margin:0 0 18px;color:var(--muted);font-size:14px;font-weight:600}
.vbars{display:flex;align-items:flex-end;gap:18px;height:230px;padding-top:6px}
.vbar{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}
.vbar-total{font-weight:900;font-size:18px;margin-bottom:6px}
.vbar-stack{flex:1;width:100%;max-width:92px;display:flex;flex-direction:column-reverse;justify-content:flex-start;border-bottom:2px solid var(--ink)}
.vbar-seg{display:block;width:100%;border-radius:8px 8px 0 0}
.vbar-label{margin-top:8px;font-size:14px;font-weight:700;color:var(--muted)}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;font-size:14px;font-weight:700}.legend i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px;vertical-align:-1px}
.note{margin:14px 0 0;padding-top:12px;border-top:1px dashed var(--line);color:var(--muted);font-size:14px;font-weight:600}
.hbars{display:grid;gap:10px}
.hbar{display:grid;grid-template-columns:minmax(0,1fr) 44px;grid-template-areas:'label label' 'track val';gap:4px 12px;align-items:center;font-size:15px}
.hbar-label{grid-area:label;font-weight:700}
.hbar-track{grid-area:track;height:12px;background:var(--soft);border-radius:999px;overflow:hidden;display:flex}
.hbar-fill{display:block;height:100%;border-radius:999px}
.hbar-val{grid-area:val;text-align:right;font-weight:900}
.stack-legend{display:flex;gap:14px;margin-top:12px;font-size:14px;font-weight:700;color:var(--muted)}.stack-legend i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px;vertical-align:-1px}
.table{width:100%;border-collapse:collapse;font-size:15px}
.table th{text-align:left;font-size:14px;color:var(--muted);font-weight:800;padding:0 10px 10px;border-bottom:2px solid var(--ink)}
.table td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.table td small{display:block;color:var(--muted);font-size:14px;font-weight:600}
.table .num{text-align:right;white-space:nowrap}.table td.zero{color:#b6b9c0}
.table tfoot td{color:var(--muted);font-weight:700;border-bottom:0}
.cell-bar{display:inline-block;width:70px;height:8px;background:var(--soft);border-radius:999px;margin-right:10px;vertical-align:middle;overflow:hidden}.cell-bar span{display:block;height:100%;background:var(--red);border-radius:999px}
.empty{color:var(--muted);font-weight:700;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips span{background:var(--soft);border-radius:999px;padding:7px 12px;font-weight:800;font-size:14px}
footer{margin-top:22px;color:var(--muted);font-size:14px;font-weight:600}
@media (max-width:980px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.table-wrap{overflow-x:auto}}
@media (max-width:640px){.cell-bar{display:none}.wrap{padding:20px 14px 32px}.card{padding:18px}}
</style>
</head>
<body>
<div class="wrap">
<header>
<div>
<div class="brand"><span class="mark"><span>%</span></span><span class="brand-word">firmen<b>benefits</b><i>.at</i></span></div>
<h1 style="margin-top:14px">Pilot-Dashboard</h1>
</div>
<div class="meta">Pilot ${dateLabel(a.start)} – ${dateLabel(a.ende)}<br>Stand ${esc(stand)} · Quelle: ClickUp „firmenbenefits – Website-Anfragen“</div>
</header>
${demo ? '<p class="demo">Vorschau mit Beispieldaten – echte Zahlen erscheinen ab der ersten Anfrage nach dem Go-live.</p>' : ''}
<section class="kpis">
<div class="kpi accent"><strong>${nf(a.anfragenTotal)}</strong><span>Angebotsanfragen</span><small>${pct(a.mitRef, a.anfragenTotal)} % über Gremium-Links</small></div>
<div class="kpi"><strong>${nf(a.gremienRows.length)}</strong><span>Gremien mit Anfragen</span><small>mindestens 1 Anfrage im Pilot</small></div>
<div class="kpi"><strong>${nf(a.brTotal)}</strong><span>Betriebsräte angemeldet</span><small>${a.brBestaetigt} bestätigt · ${a.brTotal - a.brBestaetigt} offen</small></div>
<div class="kpi"><strong>${a.reichweite ? nf(a.reichweite) : '–'}</strong><span>Beschäftigte erreichbar</span><small>mindestens – laut bestätigten Anmeldungen</small></div>
<div class="kpi"><strong>${nf(a.partnerTotal)}</strong><span>Partner-Interessenten</span><small>über „Rabatt-Partner werden“</small></div>
</section>
<section class="grid">
<div class="card">
<h2>Anfragen pro Monat</h2>
<p class="sub">Je Partner mit Auswertung – Basis für Partner-Reporting und spätere Spenden</p>
${monthChart}
${legend}
${a.untracked.length ? `<p class="note">Nicht ausgewertet (keine Provisionsvereinbarung): ${a.untracked.map(o => esc(o.partner)).join(', ')}. Diese Anfragen gehen direkt an den Partner und werden nicht gespeichert.</p>` : ''}
</div>
<div class="card">
<h2>Woher kommen die Anfragen?</h2>
<p class="sub">Über welchen Link die Anfrage kam</p>
${a.quelle.length ? bars(a.quelle.map(([label, value]) => ({ label, value }))) : '<p class="empty">Noch keine Anfragen.</p>'}
<h2 style="margin-top:26px">Partner-Interessenten nach Branche</h2>
<p class="sub">Anfragen über „Rabatt-Partner werden“</p>
${a.branchen.length ? `<div class="chips">${a.branchen.map(([b, n]) => `<span>${esc(b)} · ${n}</span>`).join('')}</div>` : '<p class="empty">Noch keine Partner-Anfragen.</p>'}
</div>
</section>
<section class="card" style="margin-bottom:14px">
<h2>Anfragen je Gremium</h2>
<p class="sub">Über welchen Betriebsrat die Anfragen kommen (br-Referenz aus dem Angebots-Link) – sortiert nach Anzahl</p>
<div class="table-wrap">${gremienTable}</div>
</section>
<section class="grid">
<div class="card">
<h2>Betriebsrat-Anmeldungen nach Region</h2>
<p class="sub">Region der Betriebsstätte laut Anmeldeformular</p>
${a.regionen.length ? `<div class="hbars">${a.regionen.map(r => { const m = Math.max(1, ...a.regionen.map(x => x.bestaetigt + x.offen)); return `<div class="hbar"><span class="hbar-label">${esc(r.label.replace('Bezirk ', ''))}</span><span class="hbar-track"><span class="hbar-fill" style="width:${(r.bestaetigt / m) * 100}%;background:var(--green);border-radius:999px 0 0 999px"></span><span class="hbar-fill" style="width:${(r.offen / m) * 100}%;background:#c9ccd2;border-radius:0 999px 999px 0"></span></span><span class="hbar-val">${r.bestaetigt + r.offen}</span></div>`; }).join('')}</div><div class="stack-legend"><span><i style="background:var(--green)"></i>bestätigt</span><span><i style="background:#c9ccd2"></i>Bestätigung offen</span></div>` : '<p class="empty">Noch keine Anmeldungen.</p>'}
</div>
<div class="card">
<h2>Größe der angemeldeten Betriebe</h2>
<p class="sub">Beschäftigte laut Anmeldung (nur bestätigte)</p>
${a.brBestaetigt ? bars(a.groessen.map(g => ({ label: g.label, value: g.n })), { color: 'var(--ink)' }) : '<p class="empty">Noch keine bestätigten Anmeldungen.</p>'}
</div>
</section>
<footer>Nur Summen, keine Namen oder Kontaktdaten. Gremium-Namen kommen aus der Zuordnungsliste br → Gremium.</footer>
</div>
</body>
</html>
`;
}
