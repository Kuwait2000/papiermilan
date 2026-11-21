#!/usr/bin/env python3
"""
Baut die Ortsschicht: Welcher Eintrag im Feed betrifft welchen Ort?

    python3 orte_bauen.py            # alles aus dem Cache, nur die Baustellen frisch
    python3 orte_bauen.py --neu      # Unfallatlas neu holen (fuenf Jahre, rund 65 MB)
    python3 orte_bauen.py --zeigen   # dazu: Treffer je Name und Stichprobe zum Gegenlesen

Laeuft nach feed_bauen.py und wege_bauen.py. Vier Bausteine:

1. Ortsverzeichnis. Strassen mit ihrem Verlauf aus dem OpenStreetMap-Auszug von
   wege_bauen.py (scraper/.cache/wege/osm-netz.json), Hausnummern aus
   data/wege-adressen.json, benannte Einrichtungen (Schulen, Kitas, Parks,
   Spielplaetze ...) aus data/wege-orte.json, Plangebiete aus data/plaene.json.

2. Zuordnung. Gesucht wird im amtlichen Titel, im Kurztext und im Feld "ort"
   jedes Eintrags von Stadtrat und Bezirksausschuessen. Der Bezirk Oberbayern
   bleibt aussen vor. Die Regeln sind bewusst vorsichtig, lieber kein Ort als
   ein falscher:
   - Ein Strassenname, den es in der Stadt mehrfach gibt (Dorfstrasse,
     Dorfplatz), zaehlt nur in einem Bezirksausschuss, und dann nur das Stueck
     in dessen Bezirk. In Stadtratspunkten faellt er weg.
   - Im Bezirksausschuss zaehlt ein Ort nur, wenn er im eigenen Bezirk liegt
     oder hoechstens RAND_M Meter davor.
   - "Muenchener Strasse" ist auch der Name des Bezirks XII; steht "Bezirk"
     oder "Bezirksausschuss" davor, ist der Bezirk gemeint.
   - Einrichtungen zaehlen nur mit einem eindeutigen Eigennamen. "Grundschule"
     oder "Spielplatz" allein sind kein Ort.
   - Namen, die auch gewoehnliche Woerter sind (Schulweg, Kiesweg), zaehlen
     nur im amtlichen Titel und im Feld "ort", nicht im Kurztext. Jede
     Fundstelle muss im Original gross geschrieben sein.
   - Steht hinter der Strasse eine Hausnummer, die es gibt, ist die Adresse
     der Ort und nicht die ganze Strasse.
   - Bebauungsplaene kommen ueber die Zuordnung von plaene_bauen.py (Vorlage
     oder Sitzung plus Titel). Der Umgriff selbst bleibt in
     data/plangebiete.js (CC BY-ND, unveraendert); hier steht nur ein Punkt.

3. Unfaelle. Der Unfallatlas der Statistischen Aemter verzeichnet jeden Unfall
   mit Personenschaden, den die Polizei aufgenommen hat, als Punkt. Je Strasse
   wird gezaehlt, was hoechstens UNFALL_ABSTAND_M Meter neben ihrer Achse
   liegt, je Kreuzung im Umkreis von KREUZUNG_RADIUS_M Metern, je Adresse im
   Umkreis von ADRESSE_RADIUS_M Metern. Unfaelle an
   einer Kreuzung zaehlen bei beiden Strassen. Sachschaeden fehlen im Atlas.

4. Baustellen. Die Stadt veroeffentlicht taeglich die Baustellen und
   Sperrungen der naechsten 14 Tage (open.bydata, CC BY 4.0). Die Datei wird
   bei jedem Lauf frisch geholt; die Seite blendet abgelaufene aus.

Ergebnis: ../data/orte.json + orte.js (window.ORTE), ../data/unfaelle.js
(window.UNFAELLE), ../data/baustellen.json + baustellen.js (window.BAUSTELLEN)
"""

import collections
import csv
import io
import json
import math
import os
import re
import sys
import zipfile
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
import wege_bauen  # noqa: E402
from wege_bauen import abrufen, im_polygon, sauberer_name, schreibe, speichere, utm32_nach_wgs84, vereinfache, xy  # noqa: E402
from ris_ingolstadt import QUELLEN  # noqa: E402
from feed_bauen import KETTEN_QUELLEN  # noqa: E402

# --neu soll hier nur den Unfallatlas neu holen, nicht den OpenStreetMap-Auszug:
# der gehoert wege_bauen.py, sonst laufen Wegenetz und Ortsschicht auseinander.
NEU = wege_bauen.NEU
wege_bauen.NEU = False
ZEIGEN = '--zeigen' in sys.argv

DATEN = os.path.join(HIER, '..', 'data')
CACHE = os.path.join(HIER, '.cache', 'orte')

RAND_M = 300              # so weit darf ein Ort vor der Grenze des eigenen Bezirks liegen
MEHRFACH_LUECKE_M = 600   # Stuecke gleichen Namens, die weiter auseinanderliegen, sind zwei Strassen
LINIE_TOLERANZ_M = 6.0    # Vereinfachung der Strassenlinien fuer die Ausgabe
UNFALL_ABSTAND_M = 15.0
KREUZUNG_RADIUS_M = 35.0
ADRESSE_RADIUS_M = 50.0
KREUZUNG_NAEHE_M = 20.0   # zwei Strassen im Titel, die sich so nahe kommen, bilden eine Kreuzung
UNFALL_JAHRE = 5

UNFALL_INDEX = 'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/index.json'
UNFALL_BASIS = 'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/'
# Baustellen als GeoJSON (EPSG:25832), z. B. vom Kreis oder der Stadt als Open
# Data. Leer lassen, wenn es keinen solchen Datensatz gibt — dann wird die
# Baustellen-Schicht einfach nicht gebaut.
BAUSTELLEN_URL = ''
# Unfallatlas: Land / Regierungsbezirk / Kreis (AGS). Kreis Paderborn = 05 / 3 / 74.
UNFALL_LAND, UNFALL_REGBEZ, UNFALL_KREIS = '05', '3', '74' 

ROEMISCH = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12}

# Kategorien aus wege-orte, deren benannte Orte in Ratspunkten vorkommen. Laeden,
# Praxen, Baenke und Haltestellen bleiben draussen (Haltestellen heissen wie Strassen).
ORT_KATEGORIEN = {'grundschule', 'schule', 'kita', 'spielplatz', 'bolzplatz', 'sportanlage', 'park',
                  'krankenhaus', 'bahnhof', 'buecherei', 'sehenswuerdigkeit', 'treff', 'kirche'}
# Woerter, die allein keinen Ort benennen
ALLGEMEIN = set('''grundschule mittelschule realschule gymnasium schule berufsschule foerderschule kindergarten
    kindertagesstaette kindertageseinrichtung kinderkrippe krippe kinderhort hort kita spielplatz bolzplatz
    sportplatz sportanlage sporthalle turnhalle park kirche pfarrkirche kapelle friedhof buecherei stadtbuecherei
    bahnhof kleingartenanlage buergerhaus klinik krankenhaus rathaus stadtteiltreff jugendtreff feuerwehr
    kinderspielplatz fussballplatz tennisplatz basketballplatz skatepark stadion museum pfarrheim pfarrzentrum
    berufsfachschule fachoberschule berufsoberschule wirtschaftsschule volkshochschule musikschule
    stadtteilpark wasserspielplatz abenteuerspielplatz schuetzen schuetzenheim sportheim vereinsheim
    der die das und am an im in st sankt bueren paderborn staedtische staedtischer staedtisches katholische
    evangelische kath evang ev'''.split())
# Namen, die als Wort im Text etwas anderes meinen koennen: nie ein Ort
NICHT_ALS_ORT = {'rathaus', 'ring', 'anger', 'markt', 'promenade'}
# Strassennamen, die auch gewoehnliche Woerter sind: nur im amtlichen Titel und im Feld "ort"
NUR_IM_TITEL = {'schulweg', 'schulstr', 'kiesweg', 'feldweg', 'radweg', 'gehweg', 'fussweg', 'kirchweg', 'waldweg',
                'wiesenweg', 'muehlweg', 'bahnweg', 'hauptstr', 'ringstr', 'marktplatz', 'kirchplatz', 'sportplatz',
                'parkplatz', 'spielstr', 'dorfplatz', 'dorfstr', 'schulplatz', 'bahnhofstr', 'bahnhofsplatz',
                'kirchstr', 'gartenstr', 'bergstr', 'wiesenstr', 'feldstr', 'waldstr', 'muehlstr', 'ringweg',
                'mitterweg', 'hochweg', 'steinweg', 'rosengarten', 'wildpark', 'glacis', 'hauptbahnhof', 'westpark'}

# Wortanfaenge, damit "temporaer", "Trampelpfad" und "Unfallverhuetung" nicht als Verkehrsthema gelten
VERKEHR = re.compile(
    r'(?<![a-z])(tempo(?!r)|ampel|unfall(?!verh|versich)|unfaell|verkehr(?!ssicher|swert|sverein)|lkw|raser|kreisel)|'
    r'geschwindigkeit|zone 30|30 km|km/h|querung|zebrastreifen|ueberweg|radweg|radverkehr|radfahr|fahrrad|'
    r'schulweg|kreuzung|einmuendung|durchgangsverkehr|schwerverkehr|lieferverkehr|fussverkehr|verkehrsberuhig|'
    r'schutzstreifen|fahrbahn|messanlage|gehweg|fussgaenger|durchfahrt|einbahn|schwerlast|abbiege|vorfahrt|spielstrasse')
VORWORT = re.compile(r'(am|an|auf|im|in|zum|zur|bei|hinter|unter|vor|ueber)\b')


# ---------------------------------------------------------------- Textabgleich

def glatt(text):
    """Kleinschreibung, Umlaute und ß aufgeloest; Laenge bleibt nicht erhalten."""
    text = (text or '').lower()
    for a, b in (('ß', 'ss'), ('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('é', 'e'), ('è', 'e'), ('–', '-'), ('—', '-'), ('’', "'")):
        text = text.replace(a, b)
    return text


def glatt_index(text):
    """Wie glatt(), dazu je Zeichen die Stelle im Original (fuer die Pruefung auf Grossschreibung)."""
    aus, stellen = [], []
    for i, z in enumerate(text or ''):
        g = glatt(z)
        aus.append(g)
        stellen += [i] * len(g)
    return ''.join(aus), stellen


def gross(original, stellen, a, b, text):
    """
    Ist die Fundstelle im Original ein Name? Mindestens ein Wort muss gross beginnen.
    Beginnt der Name mit einem klein geschriebenen Vorwort ("am Fort"), darf kein
    weiteres grosses Wort folgen: "Kindertagesstaette am Fort Peyerl" meint das
    Fort Peyerl und nicht die Strasse "Am Fort".
    """
    if not any(original[stellen[m.start() + a]].isupper() for m in re.finditer(r'[a-z]+', text[a:b])):
        return False
    if VORWORT.match(text[a:b]) and not original[stellen[a]].isupper():
        danach = re.match(r'\s+([a-z]+)', text[b:b + 30])
        if danach and original[stellen[b + danach.start(1)]].isupper():
            return False
    return True


def schluessel(name):
    """Schreibweisen zusammenfuehren: 'Kipfenberger Str.', 'Kipfenbergerstraße' -> 'kipfenbergerstr'."""
    s = re.sub(r'str(asse|\.)?(?![a-z])', 'str', glatt(name))
    return re.sub(r'[^a-z0-9]+', '', s)


def muster(name):
    """Regulaerer Ausdruck fuer einen Namen im geglaetteten Text."""
    teile = [t for t in re.split(r'[\s\-/.]+', glatt(name)) if t]
    aus = []
    for t in teile:
        m = re.fullmatch(r'(.*?)str(asse)?', t)
        aus.append((re.escape(m.group(1)) + r'str(?:asse|\.)?') if m else re.escape(t))
    return r'[\s\-.]*'.join(aus)


def sucher(namen):
    """Ein Ausdruck fuer alle Namen, laengste zuerst; liefert Fundstellen als (Schluessel, Start, Ende)."""
    muster_liste = sorted({muster(n) for n in namen}, key=len, reverse=True)
    rx = re.compile(r'(?<![a-z0-9])(?:' + '|'.join(muster_liste) + r')(?![a-z])')

    def finde(text):
        return [(schluessel(m.group(0)), m.start(), m.end()) for m in rx.finditer(text)]
    return finde


# ------------------------------------------------------------------ Geometrie

def abstand_punkt_strecke(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 < 1e-9 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def abstand_punkt_linien(px, py, linien):
    best = 1e12
    for linie in linien:
        if len(linie) == 1:
            best = min(best, math.hypot(px - linie[0][0], py - linie[0][1]))
        for i in range(len(linie) - 1):
            d = abstand_punkt_strecke(px, py, linie[i][0], linie[i][1], linie[i + 1][0], linie[i + 1][1])
            if d < best:
                best = d
    return best


def abstand_linien(a, b):
    """Kleinster Abstand zweier Liniensaetze (ueber die Stuetzpunkte, das reicht fuer Kreuzungen)."""
    best, wo = 1e12, None
    for la in a:
        for p in la:
            d = abstand_punkt_linien(p[0], p[1], b)
            if d < best:
                best, wo = d, p
    for lb in b:
        for p in lb:
            d = abstand_punkt_linien(p[0], p[1], a)
            if d < best:
                best, wo = d, p
    return best, wo


def mitte(linien):
    """Punkt auf halber Laenge der laengsten Linie; bei Einzelpunkten deren Schwerpunkt."""
    if all(len(l) == 1 for l in linien):
        return sum(l[0][0] for l in linien) / len(linien), sum(l[0][1] for l in linien) / len(linien)
    linie = max(linien, key=lambda l: sum(math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]) for i in range(len(l) - 1)))
    halb = sum(math.hypot(linie[i + 1][0] - linie[i][0], linie[i + 1][1] - linie[i][1]) for i in range(len(linie) - 1)) / 2
    for i in range(len(linie) - 1):
        s = math.hypot(linie[i + 1][0] - linie[i][0], linie[i + 1][1] - linie[i][1])
        if s >= halb and s > 0:
            t = halb / s
            return linie[i][0] + t * (linie[i + 1][0] - linie[i][0]), linie[i][1] + t * (linie[i + 1][1] - linie[i][1])
        halb -= s
    return linie[0]


def zurueck(x, y):
    """Ortsnahe Meter -> (lat, lon)."""
    return y / wege_bauen.MY + wege_bauen.LAT0, x / wege_bauen.MX + wege_bauen.LON0


class Bezirke:
    def __init__(self):
        with open(os.path.join(DATEN, 'bezirke.json'), encoding='utf-8') as f:
            roh = json.load(f)
        self.liste = []
        for ft in roh['features']:
            g = ft['geometry']
            polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            ringe = [[xy(p[1], p[0]) for p in ring] for poly in polys for ring in poly]
            self.liste.append({'nr': int(ft['properties']['beznr']), 'name': ft['properties']['bezname'], 'ringe': ringe})
        self.name = {b['nr']: b['name'] for b in self.liste}

    def von(self, x, y):
        for b in self.liste:
            if im_polygon(x, y, b['ringe']):
                return b['nr']
        return 0

    def abstand(self, x, y, nr):
        """0 im Bezirk, sonst Meter bis zu seiner Grenze."""
        b = next(b for b in self.liste if b['nr'] == nr)
        if im_polygon(x, y, b['ringe']):
            return 0.0
        return abstand_punkt_linien(x, y, b['ringe'])


# ------------------------------------------------------------- Ortsverzeichnis

def stuecke(linien, luecke):
    """Linien zu Gruppen zusammenfassen, deren Punkte hoechstens `luecke` Meter auseinanderliegen."""
    gruppen = []
    for linie in linien:
        treffer = [g for g in gruppen if any(
            abs(p[0] - q[0]) < luecke and abs(p[1] - q[1]) < luecke and math.hypot(p[0] - q[0], p[1] - q[1]) < luecke
            for p in linie[::max(1, len(linie) // 6)] + [linie[-1]] for l in g for q in l[::max(1, len(l) // 6)] + [l[-1]])]
        neu = [linie]
        for g in treffer:
            neu += g
            gruppen.remove(g)
        gruppen.append(neu)
    return gruppen


def strassen_lesen(bezirke):
    """name -> {'stuecke': [{'linien': [...], 'bezirke': {nr}}], 'adressen': {hausnummer: (x, y)}}"""
    osm = wege_bauen.overpass('netz')
    knoten = {e['id']: xy(e['lat'], e['lon']) for e in osm['elements'] if e['type'] == 'node'}
    linien = collections.defaultdict(list)
    for e in osm['elements']:
        name = sauberer_name((e.get('tags') or {}).get('name', '')) if e['type'] == 'way' else ''
        if name:
            pts = [knoten[n] for n in e['nodes'] if n in knoten]
            if len(pts) > 1:
                linien[name].append(pts)
    with open(os.path.join(DATEN, 'wege-adressen.json'), encoding='utf-8') as f:
        adr = json.load(f)
    adressen = {}
    for name, nummern, lat, lon in adr['strassen']:
        a = b = 0
        punkte = {}
        for i, nr in enumerate(nummern.split('|')):
            a += lat[i]
            b += lon[i]
            punkte[nr.lower().replace(' ', '')] = xy(a / 1e5, b / 1e5)
        adressen[name] = punkte
    # Schreibweisen zusammenfuehren ("Schlosslände" in den Adressen, "Schloßlände" an der Strasse):
    # Es gilt der Name, unter dem die Strasse ihren Verlauf hat.
    je_schluessel = collections.defaultdict(list)
    for name in set(linien) | set(adressen):
        je_schluessel[schluessel(name)].append(name)
    for namen in je_schluessel.values():
        if len(namen) > 1:
            haupt = max(namen, key=lambda n: (len(linien.get(n, ())), len(adressen.get(n, ()))))
            for n in namen:
                if n != haupt:
                    linien[haupt] += linien.pop(n, [])
                    adressen.setdefault(haupt, {}).update(adressen.pop(n, {}))
    strassen = {}
    for name in linien:   # Strassen, die nur als Adresse vorkommen, haben keinen Verlauf und bleiben draussen
        ln = linien[name]
        teile = []
        for gruppe in stuecke(ln, MEHRFACH_LUECKE_M):
            bez = collections.Counter(bezirke.von(p[0], p[1]) for l in gruppe for p in l)
            bez.pop(0, None)
            teile.append({'linien': gruppe, 'bezirke': set(bez)})
        strassen[name] = {'stuecke': teile, 'adressen': adressen.get(name, {})}
    return strassen


def einrichtungen_lesen():
    """Benannte Orte mit eindeutigem Eigennamen: name -> (x, y, kategorie)"""
    with open(os.path.join(DATEN, 'wege-orte.json'), encoding='utf-8') as f:
        o = json.load(f)
    kat = [k['id'] for k in o['kategorien']]
    je_name = collections.defaultdict(list)
    for ort in o['orte']:
        if kat[ort[0]] in ORT_KATEGORIEN and ort[1]:
            je_name[ort[1]].append((xy(ort[2], ort[3]), kat[ort[0]]))
    for z in o['grosse_ziele']:
        je_name[z[0]].append((xy(z[1], z[2]), 'ziel'))
    aus = {}
    for name, liste in je_name.items():
        woerter = [w for w in re.split(r'[^a-z0-9]+', glatt(name)) if w]
        if len(schluessel(name)) < 6 or all(w in ALLGEMEIN or w.isdigit() for w in woerter) or schluessel(name) in NICHT_ALS_ORT:
            continue
        (x0, y0), k = liste[0]
        if any(math.hypot(p[0] - x0, p[1] - y0) > 300 for p, _ in liste):
            continue   # derselbe Name an zwei Stellen: nicht eindeutig
        aus[name] = (sum(p[0] for p, _ in liste) / len(liste), sum(p[1] for p, _ in liste) / len(liste), k)
    # 'Klinikum' und 'Klinikum Ingolstadt' sind ein Ort: der kuerzere Name zeigt auf den laengeren
    gleich = {}
    for kurz in aus:
        for lang in aus:
            if kurz != lang and schluessel(kurz) in schluessel(lang) and \
                    math.hypot(aus[kurz][0] - aus[lang][0], aus[kurz][1] - aus[lang][1]) < 300:
                gleich[kurz] = lang
    return aus, gleich


def plaene_lesen():
    """Zuordnung von plaene_bauen.py umdrehen: Vorlage bzw. (Sitzung, Titel) -> Plan."""
    with open(os.path.join(DATEN, 'plaene.json'), encoding='utf-8') as f:
        plaene = json.load(f)['plaene']
    with open(os.path.join(DATEN, 'plangebiete.json'), encoding='utf-8') as f:
        gebiete = {ft['properties']['nr']: ft['geometry'] for ft in json.load(f)['features']}
    je_vorlage, je_punkt, plan = {}, {}, {}
    for p in plaene:
        g = gebiete.get(p['nr'])
        if not g:
            continue
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        pts = [xy(q[1], q[0]) for poly in polys for q in poly[0]]
        plan[p['nr']] = {'name': p.get('kurz') or p.get('name') or '', 'id': p['id'],
                         'x': sum(q[0] for q in pts) / len(pts), 'y': sum(q[1] for q in pts) / len(pts)}
        for s in p['schritte']:
            if s.get('vorlage'):
                je_vorlage[s['vorlage']] = p['nr']
            je_punkt[(s.get('sitzung_url', ''), glatt(s.get('titel', '')))] = p['nr']
        for d in p['dazu']:
            je_punkt[(d.get('url', ''), glatt(d.get('titel', '')))] = p['nr']
    return plan, je_vorlage, je_punkt


# ------------------------------------------------------------------- Unfaelle

def unfaelle_lesen():
    """Unfaelle der letzten UNFALL_JAHRE Jahre im Stadtgebiet: [(jahr, x, y, kategorie, rad, fuss)]"""
    os.makedirs(CACHE, exist_ok=True)
    index_pfad = os.path.join(CACHE, 'unfallatlas-index.json')
    if NEU or not os.path.exists(index_pfad):
        speichere(index_pfad, abrufen(UNFALL_INDEX))
    with open(index_pfad, encoding='utf-8') as f:
        index = json.load(f)
    dateien = {}
    for d in index['datasets']:
        m = re.fullmatch(r'Unfallorte(\d{4})', d['name'])
        csvs = [x['name'] for x in d['files'] if x['name'].endswith('_CSV.zip')]
        if m and csvs:
            dateien[int(m.group(1))] = csvs[0]
    jahre = sorted(dateien)[-UNFALL_JAHRE:]
    alle = []
    for jahr in jahre:
        pfad = os.path.join(CACHE, 'unfaelle-%d.json' % jahr)
        if NEU or not os.path.exists(pfad):
            print('lade Unfallatlas', jahr)
            roh = abrufen(UNFALL_BASIS + dateien[jahr], timeout=600)
            zeilen = []
            with zipfile.ZipFile(io.BytesIO(roh)) as z:
                name = next(n for n in z.namelist() if n.lower().endswith(('.csv', '.txt')))
                text = z.read(name).decode('utf-8-sig', 'replace')
            for r in csv.DictReader(io.StringIO(text), delimiter=';'):
                r = {k.upper(): v for k, v in r.items() if k}
                if (r.get('ULAND'), r.get('UREGBEZ'), r.get('UKREIS')) not in ((UNFALL_LAND, UNFALL_REGBEZ, UNFALL_KREIS), (UNFALL_LAND.lstrip('0'), UNFALL_REGBEZ.lstrip('0'), UNFALL_KREIS.lstrip('0'))):
                    continue
                x = float(r['LINREFX'].replace(',', '.'))
                zeilen.append({
                    'x': x - 32000000 if x > 3e7 else x, 'y': float(r['LINREFY'].replace(',', '.')),
                    'kat': int(r['UKATEGORIE']), 'rad': int(r.get('ISTRAD') or 0), 'fuss': int(r.get('ISTFUSS') or 0)})
            if not zeilen:
                print('Unfallatlas %d: keine Zeile fuer AGS %s%s%s — Unfaellzahlen bleiben leer (AGS in orte_bauen.py pruefen)' % (jahr, UNFALL_LAND, UNFALL_REGBEZ, UNFALL_KREIS))
            speichere(pfad, json.dumps(zeilen).encode())
        with open(pfad, encoding='utf-8') as f:
            for z in json.load(f):
                lat, lon = utm32_nach_wgs84(z['x'], z['y'])
                x, y = xy(lat, lon)
                alle.append((jahr, x, y, z['kat'], z['rad'], z['fuss']))
    return jahre, alle


class Unfallraster:
    ZELLE = 100.0

    def __init__(self, unfaelle):
        self.unfaelle = unfaelle
        self.zellen = collections.defaultdict(list)
        for i, u in enumerate(unfaelle):
            self.zellen[(int(u[1] // self.ZELLE), int(u[2] // self.ZELLE))].append(i)

    def nahe(self, linien, abstand):
        """Indizes der Unfaelle, die hoechstens `abstand` Meter neben den Linien liegen."""
        kandidaten = set()
        for linie in linien:
            for i in range(max(1, len(linie) - 1)):
                a, b = linie[i], linie[min(i + 1, len(linie) - 1)]
                for cx in range(int((min(a[0], b[0]) - abstand) // self.ZELLE), int((max(a[0], b[0]) + abstand) // self.ZELLE) + 1):
                    for cy in range(int((min(a[1], b[1]) - abstand) // self.ZELLE), int((max(a[1], b[1]) + abstand) // self.ZELLE) + 1):
                        kandidaten.update(self.zellen.get((cx, cy), ()))
        return {i for i in kandidaten if abstand_punkt_linien(self.unfaelle[i][1], self.unfaelle[i][2], linien) <= abstand}

    def zahlen(self, indizes):
        u = [self.unfaelle[i] for i in indizes]
        return [len(u), sum(1 for x in u if x[4]), sum(1 for x in u if x[5]), sum(1 for x in u if x[3] in (1, 2))]


# ------------------------------------------------------------------ Baustellen

def datum_iso(tt_mm_jjjj):
    m = re.fullmatch(r'(\d\d)\.(\d\d)\.(\d{4})', (tt_mm_jjjj or '').strip())
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else ''


def sauberer_text(text):
    """Freitext der Stadt fuer die Ausgabe: ohne spitze Klammern und Steuerzeichen, hoechstens 240 Zeichen."""
    text = re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f<>]', ' ', text or '')).strip(' ;')
    text = re.sub(r'\s*;\s*', '; ', text)
    return text if len(text) <= 240 else text[:239].rsplit(' ', 1)[0] + ' …'


def baustellen_bauen():
    if not BAUSTELLEN_URL:
        return None   # kein Baustellen-Datensatz konfiguriert
    pfad = os.path.join(CACHE, 'baustellen.geojson')
    frisch = True
    try:
        speichere(pfad, abrufen(BAUSTELLEN_URL, timeout=120))
    except Exception as fehler:   # noqa: BLE001 -- ohne Netz bleibt der letzte Stand
        frisch = False
        print('Baustellen: Abruf gescheitert (%s), nehme den letzten Stand' % fehler)
        if not os.path.exists(pfad):
            return None
    with open(pfad, encoding='utf-8') as f:
        roh = json.load(f)
    if '25832' not in ((roh.get('crs') or {}).get('properties', {}).get('name', '')):
        raise SystemExit('Baustellen: unerwartetes Koordinatensystem')
    liste = []
    for ft in roh['features']:
        p, g = ft['properties'], ft['geometry']
        if not g or g['type'] != 'Point':
            continue
        lat, lon = utm32_nach_wgs84(g['coordinates'][0], g['coordinates'][1])
        wo = sauberer_name(p.get('STRASSE') or '')
        if p.get('SBOD_HNR_1'):
            wo += ' ' + sauberer_name(str(p['SBOD_HNR_1']))
        quer = ' / '.join(sauberer_name(q) for q in (p.get('SBOD_QSTR_1'), p.get('SBOD_QSTR_2')) if q)
        liste.append([round(lat, 5), round(lon, 5), wo, quer, datum_iso(p.get('BEGINN')), datum_iso(p.get('ENDE')),
                      sauberer_text(p.get('ART_ARB')), sauberer_text(p.get('ART_VB'))])
    liste.sort(key=lambda b: (b[2], b[4]))
    stand = date.today().isoformat() if frisch else date.fromtimestamp(os.path.getmtime(pfad)).isoformat()
    return {'erzeugt_von': 'scraper/orte_bauen.py', 'stand': stand,
            'quelle': 'Baustellen-Vorschau des Herausgebers (siehe BAUSTELLEN_URL in orte_bauen.py)',
            'quelle_url': BAUSTELLEN_URL,
            'format': 'liste: [lat, lon, ort, querstrassen, beginn, ende, arbeiten, verkehr]',
            'liste': liste}


# ------------------------------------------------------------------ Zuordnung

def main():
    with open(os.path.join(DATEN, 'feed.json'), encoding='utf-8') as f:
        feed = json.load(f)
    if not os.path.exists(os.path.join(DATEN, 'wege-adressen.json')):
        print('wege-adressen.json fehlt — die Ortsschicht braucht den OSM-Auszug von')
        print('scraper/wege_bauen.py (GEMEINDE/LAT0/LON0 dort auf den Kreis Paderborn')
        print('umstellen, dann: python3 wege_bauen.py). Ueberspringe orte_bauen.py;')
        print('pruefen.py meldet das als Warnung, die Startseite laeuft auch ohne Orte.')
        return
    bezirke = Bezirke()
    strassen = strassen_lesen(bezirke)
    einrichtungen, gleicher_ort = einrichtungen_lesen()
    plan, plan_je_vorlage, plan_je_punkt = plaene_lesen()

    strasse_je_schluessel = {}
    for name in strassen:
        k = schluessel(name)
        if len(k) >= 6 and k not in NICHT_ALS_ORT:
            strasse_je_schluessel.setdefault(k, name)
    ort_je_schluessel = {schluessel(n): n for n in einrichtungen if schluessel(n) not in strasse_je_schluessel}
    finde = sucher(list(strasse_je_schluessel.values()) + list(ort_je_schluessel.values()))

    orte, ort_index = [], {}   # Verzeichnis in der Reihenfolge des ersten Vorkommens

    def ort(art, name, x, y, linien=None, zusatz=None):
        key = (art, name)
        if key not in ort_index:
            ort_index[key] = len(orte)
            orte.append({'art': art, 'name': name, 'x': x, 'y': y, 'linien': linien, 'zusatz': zusatz, 'n': 0})
        return ort_index[key]

    zuordnung, treffer_je_name, verworfen = {}, collections.Counter(), collections.Counter()
    for e in feed['eintraege']:
        if e['quelle'] not in QUELLEN:
            continue
        bza = 0
        if e['quelle'] in KETTEN_QUELLEN:
            m = re.search(r'Bezirksausschuss ([IVX]+)\b', e['gremium'])
            bza = ROEMISCH.get(m.group(1), 0) if m else 0
        titel = glatt(e['amtlicher_titel'])
        # Amtlicher Titel und Feld "ort" zuerst; bis dorthin (fest) zaehlen auch Allerweltsnamen
        original = ' \n '.join([e['amtlicher_titel']] + e['ort'])
        fest = len(glatt(original))
        original += ' \n ' + e['klartext_titel'] + ' \n ' + e['klartext']
        text, stellen = glatt_index(original)
        gefunden, strassen_im_titel, mit_adresse = [], [], set()
        for k, a, b in finde(text):
            if not gross(original, stellen, a, b, text):
                verworfen['klein geschrieben'] += 1
                continue
            if k in NUR_IM_TITEL and a >= fest:
                verworfen['Allerweltsname nur im Kurztext'] += 1
                continue
            if k in strasse_je_schluessel:
                name = strasse_je_schluessel[k]
                if k == 'muenchenerstr' and re.search(r'(bezirk\w*|bza|xii)[\s\-]*$', text[max(0, a - 28):a]):
                    continue   # der Stadtbezirk, nicht die Strasse
                s = strassen[name]
                teile = s['stuecke']
                if bza:
                    teile = [t for t in teile if bza in t['bezirke'] or min(
                        bezirke.abstand(p[0], p[1], bza) for l in t['linien'] for p in l[::max(1, len(l) // 8)] + [l[-1]]) <= RAND_M]
                    if not teile:
                        verworfen['Strasse ausserhalb des Bezirks'] += 1
                        continue
                if len(teile) > 1:
                    verworfen['Strassenname mehrfach in der Stadt'] += 1
                    continue
                linien = teile[0]['linien']
                anzeige = name
                if len(s['stuecke']) > 1:
                    b_nr = bza or next(iter(teile[0]['bezirke']), 0)
                    anzeige = '%s (%s)' % (name, bezirke.name.get(b_nr, 'Kreis Paderborn'))
                # Hausnummer direkt dahinter: nur wenn es die Adresse gibt und kein Datum, Mass oder Betrag folgt
                hn = re.match(r'\s*(\d{1,3})(\s?[a-h](?![a-z]))?(?![\d:/]|[.,]\d|\s*(uhr|km|m\b|euro|prozent|%|stueck|jahre|tage))', text[b:b + 24])
                nr = ''
                if hn:   # erst mit Buchstabe ("23a"), sonst die Zahl allein
                    nr = next((n for n in (hn.group(1) + (hn.group(2) or '').strip(), hn.group(1)) if n in s['adressen']), '')
                if nr and nr in s['adressen'] and abstand_punkt_linien(*s['adressen'][nr], linien) < 400:
                    px, py = s['adressen'][nr]
                    gefunden.append(ort('a', '%s %s' % (name, nr), px, py))
                    mit_adresse.add(anzeige)
                else:
                    mx, my = mitte(linien)
                    idx = ort('s', anzeige, mx, my, linien)
                    gefunden.append(idx)
                    if a < len(titel):
                        strassen_im_titel.append(idx)
                treffer_je_name[anzeige] += 1
            else:
                name = ort_je_schluessel[k]
                name = gleicher_ort.get(name, name)
                x, y, kat = einrichtungen[name]
                if bza and bezirke.abstand(x, y, bza) > RAND_M:
                    verworfen['Einrichtung ausserhalb des Bezirks'] += 1
                    continue
                gefunden.append(ort('o', name, x, y, zusatz=kat))
                treffer_je_name[name] += 1
        # Bebauungsplan: Zuordnung von plaene_bauen.py
        nr = plan_je_vorlage.get(e['vorlage']) if e['vorlage'] else None
        if not nr:
            for auftritt in e['auftritte'] or [{'sitzung_url': e['sitzung_url']}]:
                nr = nr or plan_je_punkt.get((auftritt['sitzung_url'], titel))
        if nr and nr in plan:
            p = plan[nr]
            gefunden.append(ort('p', 'Bebauungsplan Nr. %s%s' % (nr, ' „%s“' % p['name'] if p['name'] else ''), p['x'], p['y'],
                                zusatz={'nr': nr, 'id': p['id']}))
        # Zwei Strassen im Titel, die sich treffen: die Kreuzung ist gemeint
        strassen_im_titel = list(dict.fromkeys(strassen_im_titel))
        if len(strassen_im_titel) == 2:
            a, b = (orte[i] for i in strassen_im_titel)
            d, wo = abstand_linien(a['linien'], b['linien'])
            if d <= KREUZUNG_NAEHE_M:
                gefunden.append(ort('k', '%s / %s' % tuple(sorted((a['name'], b['name']))), wo[0], wo[1]))
        # Adresse gefunden: die ganze Strasse waere zu grob
        gefunden = [i for i in dict.fromkeys(gefunden) if not (orte[i]['art'] == 's' and orte[i]['name'] in mit_adresse)]
        if gefunden:
            verkehr = 'Verkehrsplanung' in e['anlass'] or bool(VERKEHR.search(titel + ' ' + glatt(e['klartext'])))
            zuordnung[e['ref']] = {'o': gefunden, 'v': 1} if verkehr else {'o': gefunden}
            for i in gefunden:
                orte[i]['n'] += 1

    # Orte ohne Eintrag (die Strasse, wenn die Adresse genauer war) fallen aus dem Verzeichnis
    bleibt = [i for i, o in enumerate(orte) if o['n']]
    neu_nr = {alt: neu for neu, alt in enumerate(bleibt)}
    orte = [orte[i] for i in bleibt]
    for z in zuordnung.values():
        z['o'] = [neu_nr[i] for i in z['o']]

    # Unfaelle je Strasse, Kreuzung und Adresse
    jahre, unfaelle = unfaelle_lesen()
    raster = Unfallraster(unfaelle)
    for o in orte:
        if o['art'] == 's':
            o['unfall'] = raster.zahlen(raster.nahe(o['linien'], UNFALL_ABSTAND_M))
        elif o['art'] in 'ka':
            o['unfall'] = raster.zahlen(raster.nahe([[(o['x'], o['y'])]], KREUZUNG_RADIUS_M if o['art'] == 'k' else ADRESSE_RADIUS_M))

    # Ausgabe: Koordinaten in 1e-5 Grad, Linien als Differenzen
    def grad5(x, y):
        lat, lon = zurueck(x, y)
        return int(round(lat * 1e5)), int(round(lon * 1e5))

    aus_orte = []
    for o in orte:
        lat, lon = grad5(o['x'], o['y'])
        linien = None
        if o['linien']:
            linien = []
            for linie in o['linien']:
                if len(linie) < 2:
                    continue
                pts = [grad5(*linie[i]) for i in vereinfache(linie, LINIE_TOLERANZ_M)]
                flach, vor = [], (0, 0)
                for p in pts:
                    flach += [p[0] - vor[0], p[1] - vor[1]]
                    vor = p
                linien.append(flach)
        aus_orte.append([o['art'], o['name'], lat, lon, linien or 0, o.get('unfall') or 0, o['zusatz'] or 0])

    # Quellenvermerk, wie ihn der Unfallatlas verlangt, mit dem Jahr des Abrufs
    vermerk = '© Statistische Ämter des Bundes und der Länder, Deutschland, %d' % date.today().year
    im_blick = [e for e in feed['eintraege'] if e['quelle'] in QUELLEN]
    statistik = {
        'eintraege': len(im_blick), 'mit_ort': len(zuordnung),
        'orte': len(orte), 'je_art': dict(collections.Counter(o['art'] for o in orte)),
        'verworfen': dict(verworfen),
    }
    daten = {
        'erzeugt_von': 'scraper/orte_bauen.py', 'erzeugt_am': date.today().isoformat(),
        'stand_feed': feed['feed_gebaut_am'],
        'quelle': '© OpenStreetMap-Mitwirkende, ODbL 1.0 (Strassen, Adressen, Einrichtungen); '
                  'Unfallatlas: %s, Datenlizenz Deutschland – Namensnennung – Version 2.0' % vermerk,
        'format': 'orte: [art, name, lat, lon, linien, unfaelle, zusatz]. art: s Strasse, a Adresse, k Kreuzung, '
                  'o Einrichtung, p Bebauungsplan. lat/lon in 1e-5 Grad. linien: je Linie lat, lon abwechselnd, '
                  'erster Punkt absolut, danach Differenzen; 0 = keine. unfaelle: [alle, mit Rad, mit Fussgaenger, '
                  'schwer oder toedlich] oder 0. eintraege: ref -> {o: Ortsindizes, v: 1 bei Verkehrsthema}.',
        'unfall': {'von': jahre[0], 'bis': jahre[-1], 'anzahl': len(unfaelle),
                   'abstand_m': UNFALL_ABSTAND_M, 'kreuzung_m': KREUZUNG_RADIUS_M, 'adresse_m': ADRESSE_RADIUS_M,
                   'vermerk': vermerk, 'lizenz': 'dl-de/by-2-0', 'lizenz_url': 'https://www.govdata.de/dl-de/by-2-0',
                   'url': 'https://unfallatlas.statistikportal.de/'},
        'statistik': statistik,
        'orte': aus_orte,
        'eintraege': zuordnung,
    }
    groesse = schreibe('orte', 'ORTE', daten, 'erzeugt von scraper/orte_bauen.py: Orte der Eintraege im Feed')

    # Unfallpunkte fuer Umkreis und Karte: [lat, lon, jahr - von, kategorie, rad, fuss], Koordinaten als Differenzen
    punkte, vor = [], (0, 0)
    for u in sorted(unfaelle, key=lambda u: (u[2], u[1])):
        p = grad5(u[1], u[2])
        punkte.append([p[0] - vor[0], p[1] - vor[1], u[0] - jahre[0], u[3], u[4], u[5]])
        vor = p
    schreibe('unfaelle', 'UNFAELLE', {
        'erzeugt_von': 'scraper/orte_bauen.py', 'erzeugt_am': date.today().isoformat(),
        'quelle': 'Unfallatlas, ' + vermerk,
        'lizenz': 'Datenlizenz Deutschland – Namensnennung – Version 2.0, https://www.govdata.de/dl-de/by-2-0',
        'url': 'https://unfallatlas.statistikportal.de/', 'von': jahre[0], 'bis': jahre[-1],
        'format': 'punkte: [lat, lon, jahr - von, kategorie, mit Rad, mit Fussgaenger]. lat/lon in 1e-5 Grad als '
                  'Differenz zum vorigen Punkt. kategorie: 1 mit Getoeteten, 2 mit Schwerverletzten, 3 mit Leichtverletzten.',
        'punkte': punkte}, 'erzeugt von scraper/orte_bauen.py: Unfaelle mit Personenschaden im Stadtgebiet', nur_js=True)

    baustellen = baustellen_bauen()
    if baustellen:
        schreibe('baustellen', 'BAUSTELLEN', baustellen, 'erzeugt von scraper/orte_bauen.py: Baustellen der Stadt, 14 Tage Vorschau')

    print('Orte: %d von %d Eintraegen verortet (%.0f %%), %d Orte %s, orte.js %d KB' % (
        len(zuordnung), len(im_blick), 100 * len(zuordnung) / len(im_blick), len(orte), statistik['je_art'], groesse // 1024))
    print('verworfen:', dict(verworfen))
    print('Unfaelle %d-%d: %d im Stadtgebiet; Baustellen: %s' % (
        jahre[0], jahre[-1], len(unfaelle), len(baustellen['liste']) if baustellen else 'keine Daten'))
    if ZEIGEN:
        print('\nHaeufigste Namen:')
        for name, n in treffer_je_name.most_common(70):
            print('  %3d  %s' % (n, name))
        import random
        random.seed(7)
        je_ref = {e['ref']: e for e in feed['eintraege']}
        print('\nStichprobe:')
        for ref in random.sample(sorted(zuordnung), 40):
            print('  %-48s <- %s' % (' | '.join(orte[i]['name'] for i in zuordnung[ref]['o'])[:48], je_ref[ref]['amtlicher_titel'][:80]))


if __name__ == '__main__':
    main()
