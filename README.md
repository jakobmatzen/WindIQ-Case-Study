# WindIQ Case Study – Live-Ertragsrechnung

Eine kleine Anwendung, die laufend Windmessdaten abruft, daraus den Jahresertrag einer Windenergieanlage (AEP, P50, P90) berechnet und das Ergebnis zeigt. Dieses README ist der Leitfaden durch Aufbau, Arbeitsweise und die wichtigsten Entscheidungen.

**Status der Anwendung:** [stats.uptimerobot.com/tT5SSEWYNn](https://stats.uptimerobot.com/tT5SSEWYNn)

## 1. Auftrag

Case Study für die Position Fullstack Engineer bei Vidia Equity, Projekt WindIQ. Ein simulierter Messmast liefert stündlich Windgeschwindigkeiten. Daraus entsteht der erwartete Jahresertrag einer Anlage: P50 als Erwartungswert, P90 als konservativer Wert für Banken. Die Anwendung soll öffentlich erreichbar sein, automatisch getestet und ausgeliefert werden und etwa eine Woche stabil laufen. **Im Vordergrund steht Zuverlässigkeit, nicht Funktionsumfang.**

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
- **Feste Schichten:** Die Kernlogik (Werte prüfen, Ertrag berechnen) besteht aus reinen Funktionen ohne Datenbank- oder API-Zugriff. Jede Datenquelle steckt hinter einer gemeinsamen Schnittstelle, ein weiterer Messmast ist nur ein neuer Adapter. ESLint prüft die Grenzen automatisch. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
| 16.11. | Eigener Worker statt Abruf im Web-Request | API-Ausfälle oder langsame Antworten erreichen die Nutzenden nie. Jeder Lauf wird protokolliert. |
| 16.11. | Ein Hetzner-Server mit Docker statt Plattform-Hosting | passt ins Budget von 100 €, volle Kontrolle, ein Image für alle Umgebungen |
| 16.11. | Supabase nur als Datenbank, Schema per Drizzle im Code | Migrationen sind versioniert und laufen automatisch im Deploy |
| 16.11. | Kein Login | das Dashboard ist öffentlich und nur lesend |
| 17.11. | Erst echte API-Daten ansehen, dann das Schema entwerfen | Die Daten enthalten Fehler, die nicht in der Doku stehen (siehe 5.) |
| 17.11. | Ticket = Branch = PR = Version, Squash auf `dev` und `main` | jede Änderung ist einem Ticket, einer Version und einem PR zugeordnet |
| 17.11. | Feste Schichten, Grenzen per ESLint geprüft | Die Kernlogik ist testbar und Schritt für Schritt nachvollziehbar. Neue Datenquellen brauchen keinen Umbau. |
| 17.11. | Kernlogik test-first, gegen echte API-Daten und die Referenzwerte der Doku | Wenn die Zahlen falsch sind, ist alles andere wertlos |
| 17.11. | Automatischer Code-Review vor jedem PR | eine zweite Prüfung vor meinem eigenen Review |
| 17.11. | Offene Punkte blockieren nicht | Mit einer dokumentierten Annahme weiterarbeiten (siehe 7. Annahmen). Rückfragen an Vidia Equity gebündelt in einer E-Mail. |
| 17.11. | PRs merged Claude erst auf meine Freigabe | Titel und Nachricht stimmen immer, nichts muss von Hand kopiert werden. Die Kontrolle bleibt bei mir. |
| 17.11. | Unbrauchbare Messwerte werden mit Grund gespeichert, nicht weggeworfen | Datenabdeckung und Ablehngründe bleiben sichtbar, der Rohwert bleibt für Gutachtende nachvollziehbar |
| 17.11. | Pro Stunde ein Wert in UTC, die neueste Version gewinnt | Die API liefert Stunden in gemischten Zeitzonen und teils doppelt (siehe 5.) |
| 17.11. | Aufräum-Review (`simplify`) einmal pro Release statt pro Ticket | Es kostete pro Ticket viel KI-Budget und fand vor allem Kosmetik. Der Fehler-Review bleibt bei jedem PR. |
| 18.11. | Anlage und Standort werden je Version unveränderlich gespeichert, jedes Ergebnis verweist darauf | Gutachtende sehen zu jedem P50/P90, mit welcher Kennlinie, welchen Verlusten und welcher Unsicherheit gerechnet wurde |
| 18.11. | Ein neues Ergebnis nur, wenn sich Messwerte, Zeitraum, Anlage oder Standort ändern | Die Ergebnis-Historie zeigt echte Änderungen statt vier gleicher Einträge pro Stunde |
| 18.11. | Antworten der API werden Feld für Feld geprüft, bevor gerechnet wird | Ein kaputter Wert (z. B. Verlust in Prozent statt als Anteil) bricht den Lauf mit klarer Meldung ab, statt ein falsches Ergebnis anzuzeigen |
| 18.11. | Datenbank-Migrationen erzeugt Claude selbst, angewendet werden sie nur auf meine Freigabe | Eine Migration verändert eine echte Datenbank und lässt sich schwer zurücknehmen. Im Deploy laufen sie automatisch nach meinem Merge. |
| 18.11. | Korrekturen kommen über einen eigenen Stand (`updated_since`), der nach jeder Seite gespeichert wird und eine Stunde überlappt | Keine Korrektur geht verloren, auch wenn ein Lauf abbricht. Neue Stunden werden zuerst geholt, damit ein Problem bei den Korrekturen sie nicht aufhält. |
| 18.11. | Vorübergehende API-Fehler (5xx, 429, Netzwerk, Timeout) werden bis zu 4-mal mit wachsender Wartezeit wiederholt, alle anderen nicht | Ausfälle und Rate-Limits sind nicht dokumentiert, ein 503 kam schon beim normalen Abruf. Ein dauerhafter Fehler wie falsche Zugangsdaten soll dagegen sofort sichtbar werden. |
| 18.11. | Ein Messwert ohne gültige Stunde oder Version wird übersprungen und geloggt, nicht die ganze Seite abgelehnt | Sonst scheitert jeder Lauf an derselben Seite und der Abruf bleibt dauerhaft stehen |
| 18.11. | Oberfläche erst als Prototypen (sechs Varianten auf der echten Seite), dann eine umgesetzt | Am echten Layout entscheidet es sich besser als in der Vorstellung. Gewählt: Navy-Leiste mit P90/P50 und ein Wasserfall von brutto bis P90, im Stil der WindIQ-App. |
| 18.11. | Das Dashboard rechnet nicht selbst, es zeichnet die gespeicherte Rechnung Schritt für Schritt nach | Gutachtende sehen jeden Zwischenwert mit Version. Ein Test stellt sicher, dass Herleitung und gespeichertes Ergebnis dieselben Zahlen liefern. |
| 18.11. | Grafiken als einfaches SVG vom Server statt einer Chart-Bibliothek | Kein JavaScript im Browser, scharf auf dem Handy. Eine Bibliothek lohnt sich erst für Zeitverläufe mit Tooltips. |
| 18.11. | Der Worker speichert mit jedem Ergebnis auch die Monatswerte und die Ablehnungsgründe | Die Seite rechnet weiterhin nicht selbst, und jedes Ergebnis bleibt mit seiner Monatsaufteilung nachvollziehbar |
| 18.11. | Tooltips öffnen sofort beim Überfahren und auch per Tippen, weiterhin ohne Chart-Bibliothek | Auf dem Handy gibt es kein Hover. Im Verlauf gehört jedem Punkt der nächstgelegene Streifen, so trifft man ihn auch bei vielen Ergebnissen. |
| 19.11. | Im Verlauf erscheinen die Punkte nur beim Überfahren oder Tippen | Mit jedem Ergebnis kommen zwei Punkte dazu. Ohne sie bleiben die Linien auch nach Wochen Betrieb ruhig und lesbar. |
| 19.11. | Live-Aktualisierung per kurzer Abfrage alle 30 Sekunden statt Supabase Realtime | Der Browser greift nie direkt auf die Datenbank zu, und neue Daten kommen höchstens stündlich. Realtime bräuchte einen öffentlichen Schlüssel und Freigaben direkt auf den Tabellen. |

## 5. Befunde aus der API

Ein vollständiger Abruf (17.11., 8.707 Stundenwerte über ein Jahr) zeigt, womit die Anwendung umgehen muss:

| Befund | Umfang | In der Doku? |
| --- | --- | --- |
| Windgeschwindigkeit als Text oder leer | 34 Texte, 29 leer | ja |
| Werte in km/h statt m/s | 349 Werte (≈ 4 %) | angedeutet |
| Fehlerwert `-999` | 42 Werte | nein |
| unmögliche Spitzen (60–83 m/s) | 13 Werte | nein |
| negative Windgeschwindigkeit (bis −2,9 m/s) | 17 Werte | nein |
| Lücke | einmal 72 Stunden (April) | ja |
| nachträgliche Korrekturen | ≈ 1.650 Werte, teils Tage später | ja |
| gemischte Zeitzonen (`Z`, `+02:00`) | ein Sommermonat | nein |
| doppelt gelieferte Stunden (einmal `Z`, einmal `+00:00`) | 19 Stunden | nein |
| kurzzeitige Ausfälle (HTTP 503) | einmal beim Abruf | nein |
| Anlagen- und Standortdaten | bereits Version 47 | ja |

## 6. Betrieb & Monitoring

- **Health-Checks:** `/api/health/live` zeigt, ob der Prozess läuft. `/api/health` prüft die Datenbank und das Alter des letzten erfolgreichen Abrufs und der letzten erfolgreichen Ertragsrechnung und meldet bei Problemen einen Fehler (503).
- **Externe Überwachung:** UptimeRobot ruft `/api/health` für `dev` und `prod` regelmäßig auf und schlägt bei Ausfall per E-Mail Alarm. Die [Statusseite](https://stats.uptimerobot.com/tT5SSEWYNn) ist öffentlich.
- **Worker:** protokolliert jeden Lauf in der Datenbank (`sync_runs`) und schreibt alle 30 Sekunden ein Lebenszeichen, das Docker überwacht.
- **Deploy:** nach jedem Deploy prüft ein Smoke-Test `/api/health`.
- **Betrieb im Dashboard:** die letzten Läufe mit Status, verarbeiteten Werten und Korrekturen, dazu der Link zur Statusseite. Fehlertexte stehen nur im Log, nicht auf der öffentlichen Seite, weil sie interne Hosts nennen können.
- **Ausfall-Hinweis:** Ist der letzte erfolgreiche Abruf älter als 2 Stunden, zeigt die Seite einen Hinweis. Das zuletzt berechnete Ergebnis bleibt sichtbar.
- **Live-Aktualisierung:** Die Seite fragt alle 30 Sekunden `/api/version` ab und holt ihre Daten nur neu, wenn der Worker etwas geändert hat, ohne Neuladen und ohne Scrollsprung. „Live · vor 12 s“ zeigt, wann zuletzt geprüft wurde. Fällt die Abfrage zweimal aus, steht dort „Keine Verbindung“, die Daten bleiben sichtbar. Hält der Worker an, springt die Seite nach 2 Stunden von selbst auf „Daten veraltet“.
- **Logs:** strukturiert (JSON) und rotiert. Jede Wiederholung eines Requests und jeder übersprungene Messwert steht als Warnung im Log.

## 7. Annahmen

Wo Aufgabe und API-Doku offen sind, gilt die folgende Annahme. Die mit *nachgefragt* markierten Punkte betreffen den Umgang mit Lücken und unbrauchbaren Werten. Ich habe sie am 18.11. per E-Mail bei Vidia Equity angefragt.

| Punkt | Annahme |
| --- | --- |
| Ist `-999` ein Fehlercode? | ja, der Wert wird verworfen. *nachgefragt* |
| Sind negative Werte ein Messfehler oder Windstille? | Messfehler, der Wert wird verworfen. Der Einfluss ist klein, aber nicht null: Als Windstille gewertet brächten sie 0 kWh, verworfen werden sie mit dem Durchschnitt hochgerechnet (≈ 0,2 % Unterschied). *nachgefragt* |
| Ab welcher Windgeschwindigkeit ist ein Wert unplausibel? | über 40 m/s wird verworfen. *nachgefragt* |
| Wie gehen fehlende oder verworfene Werte in den Jahresertrag ein: auslassen oder auf ein volles Jahr hochrechnen? | hochrechnen: Ertrag der gültigen Stunden × 8.760 / Anzahl gültiger Stunden. Die Datenabdeckung steht immer daneben, unter 90 % „unsicher“, unter 70 % „nicht aussagekräftig“. *nachgefragt* |
| Kommen weitere Einheiten als m/s und km/h vor? | km/h wird umgerechnet, unbekannte Einheiten werden verworfen. *nachgefragt* |
| „Letzte 12 Monate“: rollierend oder Kalendermonate? | rollierend, die letzten 8.760 Stunden bis zum neuesten Wert |
| Kennlinie zwischen den Stützpunkten interpolieren? | ja, linear. Unter Cut-in und über Cut-out ist die Leistung 0. |
| Sollen frühere Ergebnisse gespeichert werden (P50/P90 im Zeitverlauf)? | ja, ein neues Ergebnis, sobald sich Messwerte, Anlage oder Standort ändern |
| Der Messmast hat in der API keine Version. Kann sich die Messhöhe ändern? | ja, möglich. Jedes Ergebnis speichert die verwendete Messhöhe; ändert sie sich, wird neu gerechnet. |
| Bleibt das Blättern mit `updated_since` stabil, wenn ein Wert währenddessen erneut korrigiert wird? | nein, ein Eintrag kann übersprungen werden. Eine Stunde Überlappung fängt das im Normalbetrieb ab (ein Lauf alle 15 Minuten holt eine Seite). |
| Volllaststunden und Kapazitätsfaktor: auf Basis von AEP brutto oder netto? | netto (P50): AEP netto / Nennleistung, Kapazitätsfaktor = Volllaststunden / 8.760 h |
| Energie je Monat: wie werden Monate mit Lücken hochgerechnet, und welche Monate zählen? | Kalendermonate (UTC), der erste und letzte Monat des Zeitraums nur teilweise. Jeder Monat wird mit seiner eigenen Abdeckung auf seine Stunden hochgerechnet, danach werden alle Monate gemeinsam so skaliert, dass ihre Summe AEP brutto ergibt. |
| Gibt es Rate-Limits oder ein festes Timeout der API? | unbekannt. Jeder Request bricht nach 30 s ab, ein `Retry-After` wird beachtet (höchstens 1 Minute). |

## 8. Ausblick

- **Längere Zeiträume:** Die Berechnung nimmt Anfang und Ende als Parameter und normiert immer auf ein Jahr. Sobald mehr als ein Jahr Messdaten vorliegt, lassen sich so mehrjährige Mittel rechnen und anzeigen, ohne die Rechnung zu ändern. Heute liefert die API nur das letzte Jahr, deshalb zeigt die Seite die letzten 8.760 Stunden.

## Releases

- **v1.0.0** (19.11.2026): erstes Release. Das Live-Dashboard mit Jahresertrag, P50, P90, Datenabdeckung und Herleitung läuft in Produktion, der Worker holt stündlich neue Messwerte und Korrekturen.

## Lokal starten

```bash
cp .env.example .env.local   # Zugangsdaten eintragen
bun install
bun dev                      # Web-App auf http://localhost:3000
bun run worker               # Worker (zweites Terminal)
bun test
```

Details für Entwicklung und Deployment (Englisch): [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
