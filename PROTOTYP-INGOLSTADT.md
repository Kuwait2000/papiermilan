# PapierPanther — Datenlage und Befunde

Rechercheprotokoll zu [README.md](README.md). Es hält fest, was die
Untersuchung des Ingolstädter Ratsinfoportals im Juli 2026 ergeben hat und
warum die Seite so gebaut ist, wie sie ist.

**Was hier steht und was nicht:** Die Befunde zum Portal gelten weiter. Die
Mengenangaben (Sitzungen, Tagesordnungspunkte, Einträge) sind Messungen mit
Datum und beschreiben den Datensatz von damals. Den heutigen Aufbau, den
Schnellstart und alle Skripte beschreibt [README.md](README.md), die Regeln für
Texte und Stände [KURATION.md](KURATION.md). Aktuelle Zahlen stehen in der
Fußzeile der Seite.

**Bewusste Beschränkungen:**

- ausschließlich öffentlich zugängliche Daten
- kein Kontakt zur Stadtverwaltung
- keine Spiegelung städtischer PDFs, nur Verlinkung

---

## Was die Datenrecherche ergeben hat

Die Ingolstädter Datenlandschaft, Stand 29.07.2026:

| Frage | Befund |
|---|---|
| Ratsinformationssystem | **SessionNet** ("Session" von Somacos GmbH & Co. KG), unter `ingolstadt.de/sessionnet` |
| Zweite Instanz | **`ingolstadt.de/sessionnetbza`** — eigenes Portal für die 12 Bezirksausschüsse, gleiche Software, gleicher Parser |
| OParl-Schnittstelle | **Nein.** Die Standard-Endpunkte (`/oparl`, `/oparl/v1.0/system`) antworten mit 404 |
| Bei *Politik bei uns* erfasst | **Nein.** Von 56 dort geführten Körperschaften ist Ingolstadt keine |
| RSS / iCal / API | **Keine gefunden** (`rss.php`, `ical.php`, `kalender.php` → 404) |
| robots.txt | Sperrt weder `/sessionnet/` noch `/sessionnetbza/` (geprüft 29.07.2026) |
| Datentiefe | Sitzungskalender reicht bis **2003** zurück |
| Livestreams | Stadtrat als Video, Ausschüsse als Audio, `ingolstadt.de/live` |
| Beteiligungsplattform | `ingolstadt-macht-mit.de` (nicht ausgewertet, auf `beteiligen.html` verlinkt) |
| Offenes Datenportal | Keines gefunden |

### Die Bezirksausschüsse sind der Fund

Ingolstadt hat **12 Bezirksausschüsse** und ist die einzige bayerische Stadt, die
sie freiwillig eingeführt hat (seit 1967). Ihre Tagesordnungen liegen in einer
eigenen SessionNet-Instanz und enthalten genau die hyperlokale Ebene, die dem
Stadtrat fehlt:

> „Tempo 30 auf der Gaimersheimer Straße" · „Schachtische im Piuspark" ·
> „Trinkbrunnen in der Kanalstraße" · „Basketballkorb für den Piuspark" ·
> „Mülleimer Wohnmobilstellplatz am Hallenbad" · „Gefährlicher Verkehr Kupferstraße"

Zwei Eigenheiten:

- **Keine Vorlagennummern.** In 186 geprüften BZA-Punkten kam keine einzige vor.
  Deshalb gibt es für BZA-Punkte keinen Beratungsweg. Ihr Stand ergibt sich aus
  dem Sitzungstermin (siehe [KURATION.md](KURATION.md)).
- **Viel Sitzungsroutine.** Etwa ein Drittel jeder BZA-Tagesordnung ist Formalie
  („Feststellung der Beschlussfähigkeit", „Genehmigung des Protokolls"). Diese
  Punkte werden in `ris_ingolstadt.py` über `VERFAHREN_MUSTER` markiert und aus
  der Aufbereitung herausgehalten, bleiben aber in den Rohdaten.

Die 12 Bezirke, wie sie das Portal führt: I-Mitte, II-Nordwest, III-Nordost,
IV-Südost, V-Südwest, VI-West, VII-Etting, VIII-Oberhaunstadt,
IX-Mailing/Feldkirchen, X-Süd, XI-Friedrichshofen/Hollerstauden,
XII-Münchener Straße.

**Konsequenz:** Es gibt keinen maschinenlesbaren Zugang. Die Daten müssen aus dem
HTML gelesen werden — genau der Fall, den das Toolkit als Regelfall in Deutschland
beschreibt. Der Parser in `scraper/ris_ingolstadt.py` leistet das.

Struktur, an der der Parser hängt (bei Portal-Updates die Bruchstelle):

- Monatsansicht: `si0040.php?__cjahr=JJJJ&__cmonat=M&__canz=1&__cselect=0`
- Sitzung mit Tagesordnung: `si0056.php?__ksinr=<id>`
- Vorlage: `vo0050.php?__kvonr=<id>`
- **Beratungsweg einer Vorlage: `vo0053.php?__kvonr=<id>`**
- Dokument: `getfile.php?id=<id>&type=do`
- Sitzungsdaten in `div.smc-table-cell.siname|sigrname|siort|sidat|yytime`
- Tagesordnungspunkte als `div.card.card-light` mit `span.badge` (Nummer) und
  `div.smc-card-text-title` (Titel), innerhalb `#smcaccordion`
- Beratungsstationen als `div#smcpanelN`, Kopfzeile im Format
  `01.07.2026 Ausschuss … TOP 3 öffentlich - Vorberatung`

---

## Der Beratungsstand

Aus `vo0053.php` lässt sich ohne einen einzigen PDF-Zugriff ablesen, welches
Gremium wann und **in welcher Rolle** befasst war. Gefundene Rollen: `Vorberatung`,
`Entscheidung`, `Bekanntgabe`. Unbekannte Rollen werden unverändert
durchgereicht, statt verworfen zu werden. Die Rollen des Bezirks Oberbayern
(„beschließend nach § 7 GeschO", „vorberatend nach …", „Kenntnisnahme") ordnet
`feed_bauen.py::rolle_art` denselben Ständen zu.

Welche Stände die Seite daraus bildet und wie sie beschriftet sind, steht in
[KURATION.md](KURATION.md), Abschnitt „Stand". Zwei Grundsätze stammen aus der
Recherche und gelten weiter:

- **Die Rolle ist die geplante Rolle.** Eine Entscheidungsstation in der
  Vergangenheit heißt nicht, dass der Beschluss gefasst wurde. Er kann vertagt
  worden sein. „Entschieden" steht deshalb nur dort, wo
  `scraper/niederschriften_lesen.py` das Ergebnis im Protokoll gefunden hat.
- **Der Stand ist kein Filter, der etwas versteckt.** Ohne Auswahl erscheinen
  alle Einträge, auch reine Beratungen ohne jede Entscheidung.

Kommende Sitzungen stehen früh im Kalender (Termin, Gremium, Ort), aber ohne
Tagesordnung. Die erscheint erst mit der Ladung, etwa eine bis zwei Wochen
vorher.

---

## Erfahrungen aus der Aufbereitung

`entwuerfe_bauen.py` erzeugt für offene Punkte regelbasiert Vorschläge:
geputzter Titel, Schlagworte über Stichwortlisten, bei BZA-Punkten der Bezirk
aus dem Gremiennamen. Diese Einträge tragen `"entwurf": true`. Der `klartext`
bleibt bei Entwürfen leer. Die Karte zeigt dann nur den Titel, statt Text zu
erfinden. Bestehende Einträge werden nie überschrieben.

- **Bei BZA-Titeln reicht die Regelbasis** für Schlagworte und Bezirk, weil die
  Titel schon Alltagssprache sind („Basketballkorb für den Piuspark").
- **Bei Stadtrats-Titeln reicht sie nicht.** Dort steckt die
  Übersetzungsleistung, und die braucht den Text der Vorlage.
- **Zu breite Stichwörter erzeugen falsche Zuordnungen, und die sind
  schädlicher als fehlende.** Aufgefallen und behoben: „markt" traf
  *Viktualienmarkt*, „pflege" traf *Schwenkweiherpflege*, „kanal" traf
  *Kanalstraße*, „see" hätte *Museen* getroffen. Die Listen arbeiten deshalb
  mit Wortgrenzen und zusammengesetzten Begriffen.

Stand bei Einführung der Entwürfe (31.07.2026): 51 Sitzungen und 470
Tagesordnungspunkte aus Mai bis Juli 2026, davon 64 als Sitzungsroutine
ausgesondert. Aufbereitet waren 136 Einträge, 22 von Hand und 114 als Entwurf.

---

## Umgang mit Fehlern

Bewusste Entscheidung: **keine Einzelprüfung jedes Eintrags**, sondern ein klarer
Hinweis plus Quellenlink. Der Aufwand für redaktionelle Verifikation stünde in
keinem Verhältnis zum Nutzen.

- Der Hinweisbalken oben sagt, dass die Texte automatisiert und mit KI aufbereitet
  sind, **Fehler enthalten können** und das Originaldokument maßgeblich ist.
- Jede Karte verlinkt sichtbar auf das Ratsinfoportal, nicht erst nach dem
  Aufklappen.
- Aufgeklappt zeigt jede Karte den amtlichen Wortlaut sowie Links zu Sitzung,
  Vorlage und allen Anlagen.
- Die Oberfläche sagt an mehreren Stellen, dass dies **kein Angebot der Stadt** ist.
- `scraper/pruefen.py` bricht ab, wenn ein Text nicht mehr zu seinem
  Tagesordnungspunkt passt oder ein Beschluss behauptet wird, den kein Protokoll
  belegt.

---

## Befund: Beschlüsse und Sitzungsinhalte auswerten

Recherchiert am 29.07.2026 an echten Dokumenten. Ergebnis: **machbar und
billig**, die Protokolle reichen aus. Umgesetzt ist das in
`scraper/niederschriften_lesen.py`.


**Sind die Niederschriften öffentlich?** Ja. Der öffentliche Teil steht online im
Ratsinfoportal, als PDF am jeweiligen Sitzungseintrag. (Nur Kommissionen und
Beiräte sind ausschließlich vor Ort einsehbar, und auf Abschriften besteht kein
Anspruch — für das Lesen und Aufbereiten der Online-PDFs ist das unerheblich.)

**Abdeckung** (Stichprobe Sept.–Nov. 2025, 40 Sitzungen): 12 Sitzungen hatten eine
Niederschrift. Die Lücken sind fast ausschließlich Aufsichtsräte städtischer
GmbHs und Beiräte. Die politisch relevanten Gremien — Stadtrat und Fachausschüsse
— haben ihre Protokolle. **Wichtig:** Protokolle erscheinen erst nach Genehmigung
in der Folgesitzung, also mit **4–8 Wochen Verzug**. Im aktuellen Quartal lagen
nur 2 von 29 vor.

**Was drinsteht** — die Protokolle sind Verlaufsprotokolle mit namentlichen
Wortbeiträgen, und sie enthalten den Beschluss in einem klaren, maschinell
auffindbaren Muster:

```
Abstimmung über den Antrag der Verwaltung V0657/25:
Mit allen Stimmen:
1. Der Stadtrat befürwortet ...
```

In allen 12 Abstimmungen der Stichprobe lautete die Formel „Mit allen Stimmen" —
also einstimmig. Wie eine strittige Abstimmung notiert wird, ist damit **nicht
belegt**: Formulierungen wie „Stimmenmehrheit", „Gegenstimmen", „Enthaltung" oder
„abgelehnt" kamen in der Stichprobe **null Mal** vor. Zahlenmäßige
Stimmenverhältnisse werden nicht protokolliert. Die Stichprobe hat das offen gelassen.

**Aufwand pro Protokoll** (gemessen):

| Protokoll | Seiten | Zeichen | ≈ Tokens |
|---|---|---|---|
| Sportausschuss 07.10.2025 | 10 | 16.700 | 4.200 |
| Stadtrat 08.10.2025 | 24 | 52.600 | 13.100 |
| Bauausschuss 15.10.2025 (33 TOPs) | 60 | 136.100 | 34.000 |

Grobrechnung: Kerngremien tagen etwa **4–6 Mal im Monat**, im Schnitt ~15.000
Tokens pro Protokoll → **grob 60.000–100.000 Tokens Eingabe pro Monat**. Das ist
für ein Sprachmodell wenig; die Kosten liegen im Bereich weniger Euro monatlich.
Der Textabruf selbst ist kostenlos: PDFs sind digital erzeugt, kein OCR nötig
(`pdfplumber` liest sie direkt).

**Günstiger Zwischenschritt ohne PDFs:** Der Reiter „Beratungen" jeder Vorlage
(`vo0053.php?__kvonr=<id>`) listet den Beratungsweg und markiert die Rolle jeder
Station explizit:

```
01.07.2026  Ausschuss für Sport ...  TOP 3  öffentlich - Vorberatung
29.07.2026  Stadtrat                 TOP 14 öffentlich - Entscheidung
```

Damit ist ohne jeden PDF-Zugriff erkennbar, **wo die Entscheidung fiel** und ob
sie schon gefallen ist. Nur der Beschlusstext selbst fehlt.

## Hosting und Rechtliches

Die Seite läuft auf **GitHub Pages** aus dem Repository
`github.com/mnkeller/papierpanther`, Branch `main`, unter
<https://schanzer-papierpanther.de/> (eigene Domain per `CNAME`). Ein
`git push` auf `main` aktualisiert den Live-Stand.

- **Daten außerhalb der Seite.** Die Feed-Daten standen anfangs in `index.html`.
  Seit dem Zwei-Jahres-Rückstand liegen sie in `data/feed.js` und werden per
  `<script src>` geladen. Das funktioniert, anders als `fetch()`, auch über
  `file://`. Die Datei ist inzwischen mehrere Megabyte groß. Sie in Teilen
  nachzuladen wäre der nächste Schritt.
- **Impressum** nach § 5 DDG mit Verantwortlichem nach § 18 Abs. 2 MStV:
  [impressum.html](impressum.html).
- **Datenschutzerklärung:** [datenschutz.html](datenschutz.html). Die Seite
  setzt keine Cookies und bindet nichts Externes ein. Personenbezogene Daten
  fallen nur über die Server-Logs von GitHub an (Drittlandübermittlung USA).
- **Kein Angebot der Stadt.** Der Hinweis ist eine rechtlich relevante Aussage.
  Er steht im Hinweisbalken, im Fußtext und im Impressum.
- **Neutralität.** Die Seite tritt als neutrale Bürgerinformation auf. Auf
  Servern einer Partei gehostet könnte diese Neutralität in Frage stehen,
  unabhängig von der Qualität der Aufbereitung. Das ist eine politische
  Entscheidung, keine technische.
- **Urheberrecht:** Beschlüsse, Vorlagen und Satzungen sind weitgehend amtliche
  Werke (§ 5 UrhG). Auf die Originaldokumente zu verlinken ist unproblematisch.
  Die PDFs der Stadt zu spiegeln wäre eine andere Frage und ist nicht nötig.
- **Rücksicht auf die Quelle:** Die Pause von 1,2 Sekunden pro Abruf, der eigene
  User-Agent und der Dateicache in `scraper/.cache/` gehören zum Konzept.

---

## Gemessen: wie groß war der Rückstand von zwei Jahren?


Erhoben am 31.07.2026 für **August 2024 bis Juli 2026**, indem alle 48
Kalendermonate beider Portale gezogen wurden (exakte Sitzungszahl) und je Quelle
eine Zufallsstichprobe von 12 Sitzungen ausgewertet wurde (Verhältniszahlen).

| | Stadtrat + Ausschüsse | Bezirksausschüsse | gesamt |
|---|---|---|---|
| Sitzungen (exakt) | 251 | 109 | **360** |
| TOPs je Sitzung (Stichprobe) | 5,2 | 11,8 | — |
| TOPs hochgerechnet | ~1.320 | ~1.290 | **~2.610** |
| davon Sitzungsroutine | 6 % | 22 % | — |
| davon mit Vorlage | 57 % | **0 %** | — |

**Das ist deutlich weniger als eine lineare Hochrechnung aus dem Fenster
Mai–Juli 2026 ergibt** (die käme auf ~3.700 TOPs). Grund: 2026 ist
Kommunalwahljahr, die Monate nach der Konstituierung sind ungewöhnlich dicht —
im Juni 2026 tagten 12 Bezirksausschüsse, in ruhigen Monaten sind es 1 bis 3.

Konsequenz für die Aufbereitung:

- Die **~1.290 BZA-Punkte brauchen kein Sprachmodell**. Sie haben keine Vorlage
  (0 % — bestätigt den Befund oben), ihre Titel sind bereits Alltagssprache, und
  die Regelbasis in `entwuerfe_bauen.py` trifft sie.
- Die eigentliche Übersetzungsarbeit sind die **~750 Stadtrats-Punkte mit
  Vorlage** (57 % von ~1.320). Das ist die Menge, für die sich ein LLM lohnt —
  eine Größenordnung weniger als befürchtet.
- Ein vollständiger Scrape-Lauf über zwei Jahre sind rund **1.900 Abrufe**
  (360 Sitzungen + ~750 Beratungswege + ~750 Vorlagen), bei 1,2 s Pause etwa
  40 Minuten.

---

## Fragen an den ersten Prototyp

Diese Fragen sollte die erste Fassung (Juli 2026, 136 Einträge) beantworten.
Sie bleiben als Maßstab stehen:

1. **Relevanz:** Treffen die Einträge, was Ingolstädter:innen wissen wollen? Ist
   die Körnung der BZA-Punkte („Fahrradbügel Mauthstraße") richtig oder zu
   kleinteilig?
2. **Mischung:** Stadtrat und Bezirksausschüsse stehen gleichrangig im selben
   Feed. Funktioniert das, oder gehören sie getrennt?
3. **Entwürfe:** Wirkt ein Eintrag, der nur aus dem Titel besteht, brauchbar
   oder unfertig?
4. **Achsen:** Trägt die Bezirksachse? Ist der Stand verständlich?
5. **Sprache:** Klar genug oder noch zu nah am Amtsdeutsch?

## Was aus den Plänen wurde

Die Liste „Wenn es weitergeht" vom Juli 2026, mit heutigem Stand:

| Vorhaben | Stand |
|---|---|
| Kommende Sitzungen aus dem Kalender aufnehmen | umgesetzt (`ris_ingolstadt.py`, Abschnitt „Demnächst" der Startseite) |
| Beschlüsse aus Niederschriften erschließen | umgesetzt (`niederschriften_lesen.py`) |
| Stadtrats-Punkte aufbereiten | umgesetzt, läuft mit jedem Daten-Update weiter |
| Stadtratsanträge nach Fraktion (`vo0040.php`) | umgesetzt (`antraege.html`) |
| Hosting | umgesetzt, siehe oben |
| Einträge ohne Stadtbezirk zuordnen | offen. `feed_bauen.py` meldet sie am Ende jedes Laufs. Orte wie Weiherfeld, Sandrach, Unterbrunnenreuth und Baggersee sind absichtlich nicht geraten. |
| Verwaltungskontakt | nicht begonnen |

---

Methodik: MeinBezirk-Toolkit von Igor Schwarzmann, CC-BY-4.0.
Ingolstadt-Adaption und Parser: dieses Repository.
Datenquelle: Ratsinfoportal der Stadt Ingolstadt, öffentlich zugängliche Seiten.
