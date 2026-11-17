# Kontext: WindIQ Case Study – Live-Ertragsrechnung

Diese Datei beschreibt, worum es in diesem Projekt geht, welche Rahmenbedingungen gelten und welche Fachbegriffe verwendet werden. Sie ist die gemeinsame Grundlage für Entwicklung und Review.

## Auftrag

Case Study für die Position **Fullstack Engineer** bei **WindIQ**.

WindIQ ist eine digitale Plattform, auf der mehrere Gutachterbüros für Windenergie zusammenarbeiten. Projektentwickler verwalten dort ihre Windprojekte, prüfen Standorte vor und beauftragen Gutachten.

Eine Kernfrage auf der Plattform lautet: **Wie viel Strom erzeugt eine Windenergieanlage an einem Standort im Jahr?** Mehrere Gruppen arbeiten mit derselben Zahl, jede mit einer anderen Frage:

| Wer | Frage an die Zahl |
| --- | --- |
| Gutachter | Kann ich das Ergebnis fachlich vertreten? Woher kommt jeder Wert? |
| Projektierer | Lohnt sich der Standort? Wie entwickelt sich der Ertrag? |
| Bank | Wie sicher ist der Ertrag? (→ P90) |

**Zu bauen ist eine kleine Version davon:**

1. **Anwendung:** holt laufend Messwerte aus einer API, berechnet Jahresertrag, P50 und P90 und visualisiert das Ergebnis.
2. **Deployment:** öffentlich erreichbar, automatisiert getestet und ausgeliefert.
3. **Betrieb:** läuft stabil, bis sich WindIQ meldet. Zu zeigen ist, wie der Betrieb überwacht wird.

> Laut Aufgabe geht es WindIQ **vor allem darum, dass die Anwendung zuverlässig läuft**. Robustheit und Betrieb sind wichtiger als viele Features.

Wie das umgesetzt wird und was darüber hinaus gebaut wird, ist freigestellt.

## Rahmenbedingungen

| Punkt | Wert |
| --- | --- |
| Zeitaufwand | etwa 4–5 Stunden, verteilt über 7 Tage |
| Budget | 100 € pauschal für Hosting und sonstige Kosten |
| Technologie und Hoster | frei wählbar, KI-Tools erlaubt |
| Live-Betrieb | etwa eine Woche |
| Abgabe | **Montag, 23.11.2026, EOD** |
| Fragen | per E-Mail an WindIQ möglich |

**Abgabe umfasst:**
- URL der Anwendung
- Zugangsdaten separat, falls es ein Login gibt
- Link zum GitHub-Repository (bis zur Abgabe privat, zur Abgabe öffentlich)

> Das Repository wird öffentlich. Deshalb gehören keine Zugangsdaten und keine vertraulichen Unterlagen hinein. Die API-Zugangsdaten stehen nur in `.env.local` bzw. in den GitHub-Secrets.

## Datenquelle: WindIQ Mock-API

Ein **simulierter Messmast** liefert jede Stunde einen neuen Messwert. Das letzte Jahr ist abrufbar. Für die Case Study ist das die einzige Datenquelle. In der Praxis kommen später weitere Messmasten über andere Systeme und Schnittstellen hinzu, deshalb sollte die Datenanbindung austauschbar sein.

- Basis-URL: `https://windiq-mock-api.sliplane.app`
- Doku: `/docs` (Swagger UI), Spezifikation: `/openapi.json` (OpenAPI 3.1)
- Env-Variablen: `WINDIQ_API_BASE_URL`, `WINDIQ_CLIENT_ID`, `WINDIQ_CLIENT_SECRET`

| Endpunkt | Inhalt |
| --- | --- |
| `POST /auth/token` | Tausch von `client_id` + `client_secret` gegen ein Bearer-Token (`expires_in` in Sekunden, Beispiel 3600). Kein Refresh-Token. |
| `GET /v1/mast` | Messmast: `id`, `name`, `latitude`, `longitude`, `measurement_height_m`, `operator`, `commissioned_at` |
| `GET /v1/measurements` | Stündliche Messwerte, paginiert (siehe unten) |
| `GET /v1/turbine` | Anlage: `rated_power_kw`, `hub_height_m`, `rotor_diameter_m`, `cut_in_wind_speed_ms`, `cut_out_wind_speed_ms`, `power_curve[]` (Stützpunkte in 1-m/s-Schritten), `version`, `updated_at` |
| `GET /v1/site` | Standort: `shear_exponent` (α), `losses.{availability, electrical, wake}` (Anteile, 0,03 = 3 %), `uncertainty` (U, Anteil), `version`, `updated_at` |

Alle `/v1/`-Endpunkte erwarten `Authorization: Bearer <access_token>`.

### Messwerte (`GET /v1/measurements`)

Query-Parameter:
- `since`: nur Werte mit `timestamp >= since`, sortiert nach `timestamp`
- `updated_since`: nur Werte mit `updated_at >= updated_since`, dann **sortiert nach `updated_at`**
- `limit`: 1–500, Standard 100
- `cursor`: `next_cursor` der vorherigen Seite. Weiterblättern, bis `next_cursor` `null` ist.

Ein Messwert:

| Feld | Bedeutung |
| --- | --- |
| `timestamp` | Beginn der Messstunde, ISO 8601 mit Zeitzone |
| `wind_speed` | mittlere Windgeschwindigkeit der Stunde auf **Messhöhe**. Typ laut Doku: `number`, `string` **oder** `null` |
| `unit` | Einheit von `wind_speed` (Beispiel `m/s`) |
| `wind_direction_deg` | Windrichtung in Grad, 0 = Nord |
| `version` | Version des Werts |
| `updated_at` | letzte Änderung des Werts |

### Auffälligkeiten laut API-Doku (relevant für Zuverlässigkeit)

Diese Punkte ergeben sich aus der Spezifikation und müssen im Code behandelt werden:

1. **`wind_speed` kann eine Zahl, ein String oder `null` sein:** Werte also parsen, validieren und fehlende Werte erkennen.
2. **Jeder Wert hat eine eigene `unit`:** nicht blind von m/s ausgehen, gegebenenfalls umrechnen oder verwerfen.
3. **Werte haben `version` und `updated_at`:** bereits abgerufene Werte können nachträglich korrigiert werden. Reiner Abruf per `since` reicht deshalb nicht, Korrekturen kommen über `updated_since`. Speichern als Upsert auf `timestamp`, neueste `version` gewinnt.
4. **Anlage und Standort sind versioniert:** Kennlinie, α, Verluste und Unsicherheit können sich ändern. Das Ergebnis muss dann neu berechnet werden, und es sollte nachvollziehbar sein, mit welcher Version gerechnet wurde.
5. **Token läuft ab:** bei `401` neues Token holen und den Request wiederholen.
6. **Lücken möglich:** Stunden können fehlen. Die Datenabdeckung der letzten 12 Monate sollte sichtbar sein.
7. Nicht dokumentiert sind Rate-Limits, 5xx-Verhalten und Timeouts. Deshalb defensiv arbeiten: Timeouts, Retries mit Backoff, Ausfall der API darf die Anwendung nicht stören (zuletzt berechnetes Ergebnis weiter anzeigen).

### Beobachtet im echten Datenabruf (17.11.2026, nicht in der Doku)

Ein voller Abruf (8.707 Stundenwerte) zeigt zusätzlich:

- **Fehlerwert `-999`** (42 Werte) und **unmögliche Spitzen** von 60–83 m/s (13 Werte): Plausibilitätsprüfung nötig.
- **`km/h`** kommt tatsächlich vor (349 Werte, plausibel nach Umrechnung ÷ 3,6). Strings sind sauber numerisch (`"6.69"`).
- **Gemischte Zeitzonen** (`Z`, `+00:00`, `+02:00`): vor dem Upsert auf UTC normalisieren, sonst entstehen doppelte Stunden.
- **HTTP 503** tritt schon beim normalen Blättern auf: Retries sind von Anfang an Pflicht.
- Der Cursor ist base64 für `offset:<n>`. Ein Retry mit demselben Cursor ist sicher.

## Berechnung (Vorgabe aus der Case Study)

1. **Höhenumrechnung:** Der Mast misst tiefer als die Nabe.
   `v_Nabe = v_Mess × (h_Nabe / h_Mess) ^ α`
   (`h_Mess` = `mast.measurement_height_m`, `h_Nabe` = `turbine.hub_height_m`, `α` = `site.shear_exponent`)
2. **AEP brutto:** Energie laut Leistungskennlinie über die letzten 12 Monate, in MWh. Jede Stunde: Leistung bei `v_Nabe` aus der Kennlinie (kW) × 1 h = kWh, summiert und durch 1.000 geteilt.
3. **AEP netto** = AEP brutto × (1 − Verfügbarkeit) × (1 − elektrisch) × (1 − Abschattung)
   (`losses.availability`, `losses.electrical`, `losses.wake`)
4. **P50** = AEP netto
   **P90** = P50 × (1 − 1,282 × U) (`U` = `site.uncertainty`)

Plausibilität mit den Beispielwerten der Doku: Mast 100 m, Nabe 140 m, α = 0,2 → Faktor (1,4)^0,2 ≈ 1,07. Verluste 3 % / 2 % / 5 % → netto ≈ 89,4 % von brutto. U = 10 % → P90 ≈ 87,2 % von P50.

### Annahmen

Offene Fragen an WindIQ und die jeweils geltende Arbeitsannahme stehen im README (Abschnitt „Offene Fragen an WindIQ“). Vor jeder Arbeit an Validierung oder Berechnung dort nachlesen und neue Fragen dort ergänzen.

## Glossar

| Begriff | Erklärung |
| --- | --- |
| **WEA / Windenergieanlage** | ein einzelnes Windrad. Mehrere Anlagen bilden einen **Windpark**. |
| **Messmast** | Mast mit Messgeräten, der Windgeschwindigkeit und -richtung in einer bestimmten Höhe misst |
| **Messhöhe** (`h_Mess`) | Höhe der Messung über Grund, hier niedriger als die Nabe |
| **Nabenhöhe** (`h_Nabe`) | Höhe der Rotorachse über Grund. Dort zählt der Wind. |
| **Höhenexponent α / Windgradient / Shear** | beschreibt, wie stark der Wind mit der Höhe zunimmt (Potenzgesetz) |
| **Leistungskennlinie / Power Curve** | Tabelle: Windgeschwindigkeit auf Nabenhöhe → elektrische Leistung der Anlage |
| **Cut-in / Cut-out** | Windgeschwindigkeit, ab der die Anlage Strom erzeugt bzw. zum Schutz abschaltet |
| **Nennleistung** (`rated_power_kw`) | maximale Leistung der Anlage |
| **kW / MW** | Leistung (Momentanwert) |
| **kWh / MWh** | Energiemenge (Leistung × Zeit). 3,6 MW eine Stunde lang = 3,6 MWh. |
| **MWh/a** | Megawattstunden pro Jahr |
| **AEP** | *Annual Energy Production*: Jahresenergieertrag |
| **AEP brutto** | Ertrag laut Kennlinie, ohne Verluste |
| **AEP netto** | Ertrag nach Abzug der Verluste |
| **Verfügbarkeitsverlust** | Ausfall durch Wartung, Störungen |
| **Elektrische Verluste** | Verluste in Kabeln, Trafo, Netzanschluss |
| **Abschattung / Nachlauf / Wake** | Ertragsverlust, weil Anlagen sich gegenseitig den Wind nehmen |
| **Unsicherheit U** | Gesamtunsicherheit der Ertragsschätzung als Anteil |
| **P50** | Ertrag, der mit 50 % Wahrscheinlichkeit erreicht oder übertroffen wird (Erwartungswert) |
| **P90** | Ertrag, der mit 90 % Wahrscheinlichkeit erreicht wird. Konservativer Wert, an dem Banken die Finanzierung bemessen. 1,282 ist das 90-%-Quantil der Normalverteilung. |
| **Volllaststunden** | AEP / Nennleistung: wie viele Stunden die Anlage bei voller Leistung laufen müsste, um den Jahresertrag zu erzeugen |
| **Kapazitätsfaktor** | Volllaststunden / 8.760 h |
| **Datenabdeckung** | Anteil der Stunden im Zeitraum, für die ein gültiger Messwert vorliegt |
| **Ertragsgutachten** | Fachgutachten über den erwarteten Ertrag eines Standorts. In Deutschland nach Richtlinie **FGW-TR6**. |
| **bankfähig** | Gutachten, das Banken für die Finanzierung akzeptieren (akkreditiertes Büro, z. B. DAkkS / ISO/IEC 17025) |
| **Gutachterbüro** | Ingenieurbüro, das Windgutachten erstellt |
| **Projektierer** | Projektentwickler, der Windparks plant und zur Genehmigung bringt |
| **ERA5 / Global Wind Atlas** | frei verfügbare Wind-Modelldatensätze für grobe Ersteinschätzungen (nicht Teil dieser Case Study) |
| **LiDAR** | Windmessung per Laser vom Boden aus, Alternative zum Messmast |

## Technische Entscheidungen

| Bereich | Entscheidung |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind 4 |
| Runtime / Paketmanager | bun |
| Datenbank | Supabase (Postgres), getrennte Projekte für Dev und Prod |
| ORM / Migrationen | Drizzle, code-first: Schema in `src/db/schema.ts`, Migrationen in `drizzle/` |
| Auth | kein Login: das Dashboard ist öffentlich und nur lesend |
| Hintergrundjobs | eigener Worker-Container pro Umgebung (`src/worker`), protokolliert jeden Lauf in `sync_runs` |
| Betrieb | `/api/health/live` (Prozess läuft), `/api/health` (DB + Alter des letzten erfolgreichen Syncs, 503 bei Problemen), JSON-Logs, Log-Rotation |
| Hosting | ein Hetzner-VPS, Docker-Container (App + Worker) für Dev und Prod hinter Caddy (HTTPS). Ein Image für alle Umgebungen, Konfiguration per Env-Variablen. |
| CI/CD | GitHub Actions: PR-Checks (Lint, Typecheck, `bun test`, Build), Deploy `dev` → Dev, `main` → Prod, Migrationen im Deploy, Smoke-Test gegen `/api/health` nach dem Deploy |

Details zum Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
