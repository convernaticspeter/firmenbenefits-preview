// Pilot dashboard as a standalone HTML file.
//   node scripts/dashboard.mjs --out dashboard.html [--gremien gremien.json]   (live data from ClickUp)
//   node scripts/dashboard.mjs --demo --out vorschau.html                      (preview with demo data)
// Env for live data: CLICKUP_TOKEN, CLICKUP_LIST_ID. gremien.json: { "<br>": "Gremium-Name", … }
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../lib/content.mjs';
import { listTasks } from '../lib/clickup.mjs';
import { parseTasks, aggregate, renderDashboard, demoRecords } from '../lib/dashboard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const demo = args.includes('--demo');
const out = opt('--out') || 'dashboard.html';

const { site, offers } = await loadContent();
let records, gremien = {}, now = new Date();
if (demo) {
  ({ records, gremien, now } = demoRecords({ offers }));
} else {
  if (!process.env.CLICKUP_TOKEN || !process.env.CLICKUP_LIST_ID) throw new Error('CLICKUP_TOKEN und CLICKUP_LIST_ID setzen (oder --demo).');
  records = parseTasks(await listTasks());
  if (opt('--gremien')) gremien = JSON.parse(await fs.readFile(opt('--gremien'), 'utf8'));
}
const fontBase64 = (await fs.readFile(path.join(root, 'public/fonts/archivo-latin.woff2'))).toString('base64');
const html = renderDashboard(aggregate(records, { offers, site, gremien, now }), { demo, generatedAt: now, fontBase64, offers });
await fs.writeFile(out, html);
console.log(`Dashboard → ${out} (${records.length} Einträge${demo ? ', Beispieldaten' : ''})`);
