# firmenbenefits.at

Website für firmenbenefits.at: statische Seiten (generiert aus `content/`) plus kleiner Node-Server für die Formulare.

## Neues Angebot anlegen (ca. 5 Minuten)

1. `content/angebote/kuechen-schwechat.json` kopieren und als `content/angebote/<slug>.json` speichern (Dateiname = `slug`).
2. Felder anpassen: `partner`, `rabattTitel`, `rabattKurz`, `rabatte`, `mailHinweis` (steht als „firmenbenefits-Rabatt: …“ in der Partner-Mail), `regionen` (Schlüssel aus `content/site.json`), `regionText`, `gueltigBis`, `empfaenger` (Mailadresse(n) des Partners), `portrait`, `leistungen`, `schritte`, `formHinweis`.
3. `npm test && npm run build` – der Build prüft Pflichtfelder und Regionen.
4. Committen, pushen, in Coolify deployen.

Daraus entstehen automatisch: Angebotsseite `/angebote/<slug>/` mit Anfrageformular, Karte in `/angebote/` (inkl. Regionsfilter), Teaser auf der Startseite, Eintrag in Sitemap und Datenschutzerklärung (Partnerliste). Abgelaufene Angebote: `"aktiv": false`.

## Formulare und Datenfluss

| Formular | Seite | Endpoint |
|---|---|---|
| Angebotsanfrage | `/angebote/<slug>/` | `POST /api/anfrage` |
| Betriebsrat-Anmeldung (monatliche Übersicht, Double-Opt-in) | `/#mitmachen` | `POST /api/betriebsrat` → Bestätigung `/bestaetigen/` → `POST /api/bestaetigen` |
| Rabatt-Partner werden | `/partner-werden/` | `POST /api/partner` |

Jede Anfrage: Validierung → mosparo (fail closed) → ClickUp-Task in `CLICKUP_LIST_ID` → Mails über Emailit-SMTP (Partner, Kopie an `FB_COPY_TO`, Bestätigung an die anfragende Person). Die Anfrage-ID `FB-YYMM-XXXXX` steht in allen Mails und im Task.

Gremium-Referenz: `?br=<id>` (Kleinbuchstaben, Ziffern, `-`, `_`, max. 40 Zeichen) wird über alle internen Links mitgenommen und landet im Formular (verstecktes Feld `br`), im ClickUp-Task und in der Kopie-Mail – nicht in der Partner-Mail. Dasselbe gilt für `utm_*`. Es wird nichts im Browser gespeichert (keine Cookies, kein Storage).

Plausible-Events (nur auf firmenbenefits.at): `Anfrage gesendet` (props `angebot`, `br`), `Betriebsrat angemeldet` (props `region`, `br`), `Partner-Anfrage gesendet`.

## Umgebungsvariablen

`EMAILIT_SMTP_HOST`, `EMAILIT_SMTP_PORT`, `EMAILIT_SMTP_USER`, `EMAILIT_SMTP_PASSWORD`, `EMAILIT_SMTP_FROM`, `MAIL_FROM_NAME`, `FB_COPY_TO`, `FB_REPLY_TO`, `CLICKUP_TOKEN`, `CLICKUP_LIST_ID`, `MOSPARO_HOST`, `MOSPARO_UUID`, `MOSPARO_PUBLIC_KEY`, `MOSPARO_PRIVATE_KEY`, `FB_DOI_SECRET`, `PREVIEW_HOSTS` (kommagetrennt).

`FORM_QA_RECIPIENT` (nur Preview): leitet Partner-Mail und Kopie an diese Adresse um und setzt „TEST –“ vor den Betreff.

## Lokal

```bash
npm ci && npm test && npm run build && PORT=4311 node server.mjs
```
