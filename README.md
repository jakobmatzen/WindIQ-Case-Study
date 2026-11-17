# WindIQ Case Study – Live-Ertragsrechnung

Eine kleine Anwendung, die laufend Windmessdaten abruft, daraus den Jahresertrag einer Windenergieanlage (AEP, P50, P90) berechnet und das Ergebnis zeigt. Dieses README ist der Leitfaden durch Aufbau, Arbeitsweise und die wichtigsten Entscheidungen.

**Status der Anwendung:** [stats.uptimerobot.com/tT5SSEWYNn](https://stats.uptimerobot.com/tT5SSEWYNn)

## 1. Auftrag

Case Study für die Position Fullstack Engineer bei WindIQ. Ein simulierter Messmast liefert stündlich Windgeschwindigkeiten. Daraus entsteht der erwartete Jahresertrag einer Anlage: P50 als Erwartungswert, P90 als konservativer Wert für Banken. Die Anwendung soll öffentlich erreichbar sein, automatisch getestet und ausgeliefert werden und etwa eine Woche stabil laufen. **Im Vordergrund steht Zuverlässigkeit, nicht Funktionsumfang.**

## 2. Architektur auf einen Blick

```
WindIQ Mock-API ──► Worker ──► Postgres ──► Web-App (Dashboard)
  (Messwerte,       (holt alle   (Supabase)   (liest nur aus
   Anlage, Standort) 15 Minuten,              der Datenbank)
                     prüft, rechnet)
```

- **Worker** und **Web-App** laufen getrennt. Fällt die API aus, zeigt das Dashboard weiter das zuletzt berechnete Ergebnis.
- **Ein Server** (Hetzner) mit Docker und Caddy (HTTPS) betreibt zwei Umgebungen: `dev` zum Testen und `prod` für den Live-Betrieb. Beide nutzen dasselbe Image, nur die Konfiguration unterscheidet sich.
- **Technik:** Next.js 16, React 19, Tailwind, Drizzle, Supabase Postgres, bun, GitHub Actions.

## 3. Workflow & Skills

```
Linear-Ticket ──► Feature-Branch ──/ship──► PR → dev ──/release──► PR → main (Live)
                                                                     │
                                         dev ◄── Rückführung ────────┘
```

- **Ein Ticket = ein Branch = ein PR = eine Version.** Der Branch-Name kommt aus Linear, so ist jeder Branch einem Ticket zugeordnet.
- **Versionen:** auf `dev` zählt jedes Feature hoch (`v1.0.0-beta.1`, `-beta.2` …). `main` bekommt nur fertige Versionen (`v1.0.0`) und danach nur noch Hotfixes (`v1.0.1`).
- **Saubere Historie:** PRs werden gesquasht, jeder Commit auf `dev` und `main` heißt wie seine Version und verweist auf seinen PR. `main` wird danach per Merge-Commit zurück in `dev` geführt, damit beide Branches nicht auseinanderlaufen.
- **Geschützte Branches:** `dev` und `main` nehmen Änderungen nur per PR an, und die CI muss grün sein.
- **Jede Version** steht im [CHANGELOG](CHANGELOG.md).

Die Arbeit läuft gemeinsam mit Claude Code. Damit jeder Schritt gleich abläuft, gibt es eigene Skills im Repo (`.claude/skills/`):

| Skill | Wofür |
| --- | --- |
| `/ship` | Feature abschließen: alle CI-Prüfungen lokal, Version hochzählen, CHANGELOG und Leitfaden aktualisieren, PR vorbereiten |
| `/release` | `dev` live bringen: Release-PR nach `main`, Deploy abwarten, Rückführung nach `dev` |
| `commit` | einheitliches Format für Commits |

Pushen, neue Branches und Einstellungen passieren nur nach ausdrücklicher Freigabe. Jeden PR prüfe ich selbst, gemergt wird erst auf meine Freigabe („merge #N“). Claude merged dann mit exakt der vorbereiteten Commit-Nachricht. Regeln im Detail: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## 4. Wichtige Entscheidungen

| Datum | Entscheidung | Warum |
| --- | --- | --- |
| 16.11. | Eigener Worker statt Abruf im Web-Request | API-Ausfälle oder langsame Antworten erreichen die Nutzer nie. Jeder Lauf wird protokolliert. |
| 16.11. | Ein Hetzner-Server mit Docker statt Plattform-Hosting | passt ins Budget von 100 €, volle Kontrolle, ein Image für alle Umgebungen |
| 16.11. | Supabase nur als Datenbank, Schema per Drizzle im Code | Migrationen sind versioniert und laufen automatisch im Deploy |
| 16.11. | Kein Login | das Dashboard ist öffentlich und nur lesend |
| 17.11. | Erst echte API-Daten ansehen, dann das Schema entwerfen | Die Daten enthalten Fehler, die nicht in der Doku stehen (siehe 5.) |
| 17.11. | Ticket = Branch = PR = Version, Squash auf `dev` und `main` | jede Änderung ist einem Ticket, einer Version und einem PR zugeordnet |
| 17.11. | Offene Fragen blockieren nicht | Mit einer dokumentierten Annahme weiterarbeiten (siehe 7.) und anpassen, sobald WindIQ antwortet |

## 5. Befunde aus der API

Ein vollständiger Abruf (17.11., 8.707 Stundenwerte über ein Jahr) zeigt, womit die Anwendung umgehen muss:

| Befund | Umfang | In der Doku? |
| --- | --- | --- |
| Windgeschwindigkeit als Text oder leer | 34 Texte, 29 leer | ja |
| Werte in km/h statt m/s | 349 Werte (≈ 4 %) | angedeutet |
| Fehlerwert `-999` | 42 Werte | nein |
| unmögliche Spitzen (60–83 m/s) | 13 Werte | nein |
| Lücke | einmal 72 Stunden (April) | ja |
| nachträgliche Korrekturen | ≈ 1.650 Werte, teils Tage später | ja |
| gemischte Zeitzonen (`Z`, `+02:00`) | ein Sommermonat | nein |
| kurzzeitige Ausfälle (HTTP 503) | einmal beim Abruf | nein |
| Anlagen- und Standortdaten | bereits Version 47 | ja |

## 6. Betrieb & Monitoring

- **Health-Checks:** `/api/health/live` zeigt, ob der Prozess läuft. `/api/health` prüft die Datenbank und das Alter des letzten erfolgreichen Abrufs und meldet bei Problemen einen Fehler (503).
- **Externe Überwachung:** UptimeRobot ruft `/api/health` für `dev` und `prod` regelmäßig auf und schlägt bei Ausfall per E-Mail Alarm. Die [Statusseite](https://stats.uptimerobot.com/tT5SSEWYNn) ist öffentlich.
- **Worker:** protokolliert jeden Lauf in der Datenbank (`sync_runs`) und schreibt alle 30 Sekunden ein Lebenszeichen, das Docker überwacht.
- **Deploy:** nach jedem Deploy prüft ein Smoke-Test `/api/health`.
- **Logs:** strukturiert (JSON) und rotiert.

## 7. Offene Fragen an WindIQ

Bis eine Antwort kommt, gilt jeweils die Arbeitsannahme.

| Frage | Arbeitsannahme |
| --- | --- |
| Ist `-999` ein Fehlercode? | ja, der Wert wird verworfen |
| Ab welcher Windgeschwindigkeit ist ein Wert unplausibel? | über 40 m/s wird verworfen |
| Wie gehen fehlende oder verworfene Werte in den Jahresertrag ein: auslassen oder auf ein volles Jahr hochrechnen? | noch offen, wird mit der Berechnung festgelegt. Die Datenabdeckung wird in jedem Fall angezeigt. |
| Kommen weitere Einheiten als m/s und km/h vor? | km/h wird umgerechnet, unbekannte Einheiten werden verworfen |
| „Letzte 12 Monate“: rollierend oder Kalendermonate? | rollierend, die letzten 8.760 Stunden bis zum neuesten Wert |
| Kennlinie zwischen den Stützpunkten interpolieren? | ja, linear. Unter Cut-in und über Cut-out ist die Leistung 0. |
| Sollen frühere Ergebnisse gespeichert werden (P50/P90 im Zeitverlauf)? | noch offen |

## Releases

Noch kein Release.

## Lokal starten

```bash
cp .env.example .env.local   # Zugangsdaten eintragen
bun install
bun dev                      # Web-App auf http://localhost:3000
bun run worker               # Worker (zweites Terminal)
bun test
```

Details für Entwicklung und Deployment (Englisch): [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
