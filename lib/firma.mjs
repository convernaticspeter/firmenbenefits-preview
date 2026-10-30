// Company name from the offer link (?firma=…): shown on the offer page instead of the region.
// Display only – never stored, never submitted with the form.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function cleanFirma(raw) {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Replaces the fallback text of every element marked with data-firma-vorlage="… %s …".
export function personalize(html, firma) {
  const name = cleanFirma(firma);
  if (!name) return html;
  return html.replace(/(<[a-z]+\b[^>]*\bdata-firma-vorlage="([^"]*)"[^>]*>)[^<]*(<\/[a-z]+>)/g,
    (_, open, vorlage, close) => open + esc(vorlage.replace('%s', name)) + close);
}
