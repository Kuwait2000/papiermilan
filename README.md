# PapierPanther — Büren & Kreis Paderborn

Was der Rat der Stadt Büren und der Kreistag des Kreises Paderborn entscheiden,
und wen es betrifft.

Die Tagesordnungen beider Gremien sind öffentlich — aber in Amtsdeutsch,
verteilt über hunderte Einzelpunkte in zwei Ratsinformationssystemen, die
niemand freiwillig durchsucht. Dieses Projekt liest sie aus, bereitet sie in
normaler Sprache und Einfacher Sprache auf und sortiert sie danach, wen sie
betreffen.

**Kein offizielles Angebot der Stadt Büren oder des Kreises Paderborn.**
Verbindlich ist immer das Originaldokument — jeder Eintrag verlinkt seine Quelle.

Dies ist eine Portierung von [PapierPanther (Ingolstadt)](https://github.com/mnkeller/papierpanther)
von Michael Keller auf die eigene Heimat. Der Quellcode steht wie das Original
unter der EUPL-1.2, die Texte unter CC BY 4.0 (siehe unten, Abschnitt Lizenz).

## Datenquellen

Beide Portale laufen auf derselben Software (SessionNet / Somacos „Session“),
gehostet bei zwei verschiedenen Anbietern (OWL-IT bzw. gremien.info), und sind
öffentlich ohne Anmeldung erreichbar:

| Quelle (Schlüssel) | Portal | Gremium |
|---|---|---|
| `stadt_bueren` | https://bueren.gremien.info/info.php | Rat und Ausschüsse der Stadt Büren (verlinkt von [bueren.de → Rathaus → Rat und Ausschüsse](https://www.bueren.de/de/rathaus/ratsinfosystem.php)) |
| `kreis_paderborn` | https://sessionnet.owl-it.de/kreis_paderborn/bi/info.asp | Kreistag und Ausschüsse des Kreises Paderborn (verlinkt von [kreis-paderborn.de](https://www.kreis-paderborn.de/kreis_paderborn/politik/kreistag/kreistagsinformationssystem/kreistagsinformationssystem.php)) |

Eingetragen in `scraper/ris_ingolstadt.py` im Dictionary `QUELLEN`.
Vor dem ersten Lauf `robots.txt` der Quelle prüfen
(`curl -s https://bueren.gremien.info/robots.txt`). Der Scraper hält 1,2 s
Pause je Abruf, schickt einen eigenen User-Agent und puffert alles in
`scraper/.cache/` (liegt in `.gitignore`).

## Schnellstart: lokal auf deinem PC ausführen

Voraussetzung: **Python 3.10 oder neuer** (z. B. von python.org; auf macOS und
Windows einfach den Installer nehmen). Kein Webserver nötig.

```bash
git clone <URL-deines-forks> papierpanther
cd papierpanther

# 1. Daten aus den beiden Portalen holen (nur Python-Standardbibliothek)
cd scraper
python3 ris_ingolstadt.py                      # letzte 3 Monate, beide Portale
# python3 ris_ingolstadt.py --von 2025-01 --bis 2026-12   # laengerer Zeitraum
# python3 ris_ingolstadt.py --quelle kreis_paderborn       # nur ein Portal

# 2. Vorschlaege fuer Klartexte erzeugen (legt Eintraege in data/kuration.json an)
python3 entwuerfe_bauen.py --max 30 --probelauf # erst trocken testen
python3 entwuerfe_bauen.py                      # schreibt nach data/kuration.json

# 3. Feed bauen (data/feed.json + feed.js, data/fabrik.js)
python3 feed_bauen.py

# 4. Themen-Kacheln bauen (data/themen.js)
python3 themen_bauen.py

# 5. Beschluesse aus den Niederschriften lesen (braucht pdfplumber + pypdf)
python3 -m pip install -r ../requirements.txt   # einmalig
python3 niederschriften_lesen.py
python3 feed_bauen.py                           # nochmal, damit Beschluesse einfliessen

# 6. Alles pruefen (Exit-Code 0 = in Ordnung)
python3 pruefen.py
cd ..

# 7. Seite lokal ansehen
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

Ein Doppelklick auf `index.html` funktioniert meist auch — die Daten liegen in
`data/feed.js` als klassisches `<script src>` (nicht per `fetch`), damit sie auch
über `file://` geladen werden. Manche Browser (Safari) verweigern das Nachladen
lokaler Dateien; dann nimm den Server aus Schritt 7.

**Regelmäßiges Aktualisieren:** Schritte 1–6 erneut ausführen. Ohne
`--no-cache` lädt der Scraper nur neu, was sich noch ändern kann (Kalender ab
Vormonat, Sitzungen der letzten 70 Tage, laufende Beratungswege); alles Ältere
kommt aus dem Cache. `orte_bauen.py` (Ortsansicht) und die Kartenseite
(`wege_bauen.py`) sind optional und in dieser Portierung noch nicht auf Büren
umgestellt — siehe „Optionale Erweiterungen“.

## Was du anpassen musst (Platzhalter)

Suche im ganzen Projekt nach `DEINE-DOMAIN` bzw. `DEINE-` und ersetze:

- `DEINE-DOMAIN.example` in allen HTML-Dateien (canonical, og:url), in
  `scraper/ris_ingolstadt.py` (`USER_AGENT`), `scraper/wege_bauen.py` und
  `zaehler.js` — deine eigene Domain, sobald du eine hast.
- `[Dein Name]`, `[Straße und Hausnummer]`, `[PLZ Ort]`, `deine-adresse@example.de`
  in `impressum.html` und `datenschutz.html` — **vor dem Live-Schalten ausfüllen**
  (§ 5 DDG bzw. Art. 13 DSGVO).
- `zaehler.js` ist deaktiviert (Hostname-Platzhalter trifft nie zu). Zum
  Einschalten der anonymen Zählung eigene Domain eintragen und in der CSP aller
  HTML-Dateien `connect-src` wieder um den GoatCounter-Host ergänzen.
- `CNAME` wurde entfernt. Für eine eigene Domain bei GitHub Pages die Datei neu
  anlegen und die Domain eintragen (siehe „Veröffentlichen“).

## Aufbau

```
index.html            Startseite: alle Eintraege, Filter, kommende Termine
themen.html           Themen-Kacheln je Lebenslage (aus data/themen.js)
so-funktionierts.html Fabrik: wie aus einem TOP ein Eintrag wird
impressum.html / datenschutz.html / barrierefreiheit.html   Rechtsseiten
basis.css, kopf.js, zaehler.js   gemeinsam fuer alle Seiten
seiten/               Seitenskripte (seiten/index.js gehoert zu index.html)
themen-kacheln.js     zeichnet die Kacheln aus data/themen.js
data/
  kuration.json       Klartexte + Schlagworte (hand- und maschinengepflegt; Vorlage liegt bei)
  rohdaten.json       unveraenderte Auslesung der Portale (erzeugt von ris_ingolstadt.py)
  feed.json / feed.js erzeugt von feed_bauen.py -- nicht von Hand aendern
  themen.js           erzeugt von themen_bauen.py
  fabrik.js           Zahlen fuer so-funktionierts.html (aus feed_bauen.py)
scraper/
  ris_ingolstadt.py   liest die SessionNet-Portale aus      -> data/rohdaten.json
  entwuerfe_bauen.py  erzeugt Kurations-Vorschlaege         -> data/kuration.json
  vorlagen_holen.py   holt Vorlagen-Texte fuer die Kuration
  feed_bauen.py       rohdaten + kuration                   -> data/feed.json + feed.js + fabrik.js
  niederschriften_lesen.py  Beschluesse aus Protokollen     -> data/beschluesse.json (PDFs: pdfplumber/pypdf)
  anker_setzen.py     Titel-Anker in kuration.json pruefen/reparieren
  themen_bauen.py     Kacheln je Lebenslage                 -> data/themen.js
  inhalte_bauen.py    Inhaltskatalog (INHALTE.md)           -> INHALTE.md
  pruefen.py          Zusicherungen nachrechnen (Exit-Code)
```

Die Trennung von `rohdaten.json` und `kuration.json` ist bewusst: Neu-Scrapen
überschreibt niemals die aufbereiteten Texte.

Reihenfolge nach einem Daten-Update:
`ris_ingolstadt.py` → `entwuerfe_bauen.py` → `feed_bauen.py` →
`niederschriften_lesen.py` → `feed_bauen.py` → `themen_bauen.py` → `pruefen.py`

## Sicherheit

Die Seite zeigt Texte, die nicht von hier stammen: Titel aus den Portalen,
Zusammenfassungen eines Sprachmodells. Drei Sicherungen greifen hintereinander:

1. **Maskieren bei der Ausgabe** (`textContent` bzw. `esc()` vor `innerHTML`).
2. **Content-Security-Policy ohne `'unsafe-inline'` für Skripte** in jeder Seite
   (`script-src 'self'`) — selbst eingeschleustes HTML führt keinen Code aus.
3. **`pruefen.py`**: Links im Feed zeigen nur auf die erlaubten Hosts
   (`ERLAUBTE_HOSTS`: bueren.gremien.info, sessionnet.owl-it.de,
   sessionnet.krz.de, bueren.de, kreis-paderborn.de), keine nicht-öffentlichen
   TOPs kuratiert, jeder
   „Entschieden“-Eintrag braucht Beschlusstext + Protokoll-Link.

## Optionale Erweiterungen (im Originalprojekt vorhanden)

- **Ortsansicht** (`?ort=…`, „In meiner Nähe“): `scraper/wege_bauen.py` +
  `scraper/orte_bauen.py`. Dafür in `wege_bauen.py` das Gebiet setzen
  (`GEMEINDE`, AGS: Kreis Paderborn `05774000`, nur Büren `05774024`) und
  `LAT0/LON0` (steht auf Büren), ggf. `BEZIRKE_URL` (Gemeinden des Kreises als
  GeoJSON), dann `python3 wege_bauen.py && python3 orte_bauen.py`. Der
  Unfallatlas-Filter steht in `orte_bauen.py` (`UNFALL_LAND/REGBEZ/KREIS` =
  05/3/74 für den Kreis Paderborn). Ohne diese Daten läuft die Startseite
  trotzdem — `orte_bauen.py` überspringt sich dann mit einem Hinweis.
- **Themenseiten** (Haushalt, Klima, Baugebiete, „Deine 15 Minuten“ …) liegen
  noch als Ingolstadt-Fassung im Repo (`haushalt.html`, `wege.html`, …) und
  sind **nicht verlinkt** (`kopf.js`: `THEMEN = []`). Zum Übernehmen jeweils
  Datenquelle, Seite und Skript anpassen und in `kopf.js` wieder eintragen.
- **Schaubild-Modus** (`grafik/kern.js`) ist auf `index.html`/`themen.html`
  abgeschaltet, weil er Karten-Daten braucht.

## Veröffentlichen (GitHub Pages)

1. Auf GitHub einen **Fork** von `mnkeller/papierpanther` anlegen (oder dieses
   Repo in deinen Account kopieren) und die Änderungen dorthin pushen.
2. Im Fork: **Settings → Pages → Source: Deploy from a branch → Branch `main`**.
3. Eigene Domain (optional): Datei `CNAME` mit der Domain anlegen, bei deinem
   DNS-Anbieter einen CNAME/ALIAS auf `<dein-user>.github.io` setzen.
4. Platzhalter aus dem Abschnitt oben ersetzen (Domain, Impressum).

## Lizenz und Herkunft

- Code: **EUPL-1.2** (siehe `LICENSE`). Wer eine veränderte Fassung weitergibt
  oder als Website betreibt, muss den Quellcode ebenfalls unter der EUPL oder
  einer kompatiblen Lizenz offenlegen — ein öffentlicher GitHub-Fork genügt.
- Selbst geschriebene Inhalte: **CC BY 4.0**.
- Dieses Projekt ist eine Weiterentwicklung von
  [PapierPanther (Ingolstadt)](https://github.com/mnkeller/papierpanther)
  (Michael Keller), das wiederum der Idee von
  [MeinBezirk](https://igorschwarzmann.com/meinbezirk/toolkit/) (Igor Schwarzmann)
  folgt. Name, Wortmarke und Maskottchen „PapierPanther“ sind nicht mitlizenziert.
- Die ausgelesenen Ratsdaten stehen unter CC BY 4.0 mit Namensnennung; die
  Lizenzen der übrigen Fremddaten stehen jeweils bei den Daten (`NOTICE`).

Hintergrund zum Originalprojekt: `PROTOTYP-INGOLSTADT.md`.
