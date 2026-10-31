# firmenbenefits.at

Website für firmenbenefits.at: statische Seiten (generiert aus `content/`) plus kleiner Node-Server für die Formulare.

## Neues Angebot anlegen (ca. 5 Minuten)

1. `content/angebote/kuechen-schwechat.json` kopieren und als `content/angebote/<slug>.json` speichern (Dateiname = `slug`).
2. Felder anpassen: `partner`, `rabattTitel`, `rabattKurz`, `rabatte`, `mailHinweis` (steht als „firmenbenefits-Rabatt: …“ in der Partner-Mail), `regionen` (Schlüssel aus `content/site.json`), `regionText`, `gueltigBis`, `empfaenger` (Mailadresse(n) des Partners), `portrait`, `leistungen`, `schritte`, `formHinweis`.
3. `npm test && npm run build` – der Build prüft Pflichtfelder und Regionen.
4. Committen, pushen, in Coolify deployen.

Daraus entsteht automatisch die Angebotsseite `/angebote/<slug>/` mit eigenem Anfrageformular. Angebote sind **nicht öffentlich auffindbar**: keine Übersicht (`/angebote/` → Startseite), keine Links von öffentlichen Seiten, nicht in der Sitemap, `noindex` (Meta + `X-Robots-Tag`). Erreichbar nur über die individuellen Links in den Betriebsrats-Mails. Abgelaufene Angebote: `"aktiv": false`. Angebote ohne Provisions-/Reporting-Vereinbarung: `"auswertung": false` → kein Herkunfts-Tracking (br/utm), kein ClickUp-Task, keine Kopie; die Anfrage geht nur an den Partner, dazu die Bestätigung an die anfragende Person. Kopie an `FB_COPY_TO` nur als Notfall, wenn die Partner-Mail fehlschlägt.

Link-Format je Angebot und Gremium: `https://firmenbenefits.at/angebote/<slug>/?br=<BR-ID>&utm_source=betriebsrat&utm_medium=email&utm_campaign=<yyyy-mm>`. Alte Kurzform `/?angebot=<alias>&br=<BR-ID>` leitet per 302 auf die Angebotsseite weiter (Aliase im Feld `aliase`). Bei Betriebsrat-Anmeldungen über das Formular stehen die fertigen Links des Gremiums im ClickUp-Task und in der Kopie-Mail.

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

## Dashboard (Pilot-Reporting)

`node scripts/dashboard.mjs --out dashboard.html [--gremien gremien.json]` erzeugt aus der ClickUp-Liste (`CLICKUP_TOKEN`, `CLICKUP_LIST_ID`) ein eigenständiges HTML-Dashboard: Anfragen pro Monat und Partner, Anfragen je Gremium (`br`), Herkunft, Betriebsrat-Anmeldungen nach Region und Größe, Partner-Interessenten. Nur Summen, keine Personendaten. `gremien.json` ordnet `br` einem Namen zu (`{ "g001": "Betriebsrat …" }`) und liegt bewusst nicht im Repo. `--demo` erzeugt eine Vorschau mit Beispieldaten. Angebote mit `"auswertung": false` erscheinen nicht.
