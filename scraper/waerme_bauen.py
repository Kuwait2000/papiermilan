#!/usr/bin/env python3
"""
Baut die Daten fuer die Themenseite "Waermeplan" (waerme.html).

    python3 waerme_bauen.py          # Gebiete aus dem Cache, sonst holen
    python3 waerme_bauen.py --neu    # Gebiete frisch von 2035.de holen

Vier Bausteine:

1. Eignungsgebiete. Die Stadt zeigt sie auf https://2035.de/map/ und laedt
   dafuer eine GeoJSON-Datei (141 Flaechen, WGS84). Die Datei traegt keine
   Lizenzangabe; Herausgeber von 2035.de ist die Stadt Ingolstadt (Stabsstelle
   Strategien Klima, Biodiversitaet & Donau). Uebernommen werden Umriss, Name,
   Hinweis und Klasse. Die Koordinaten werden auf sechs Nachkommastellen
   gerundet (etwa zehn Zentimeter), sonst bleibt die Geometrie, wie sie ist.

2. Adressen. Jede Hausnummer aus data/wege-adressen.json (OpenStreetMap,
   von wege_bauen.py) wird der Flaeche zugeordnet, in der sie liegt. Daraus
   entstehen die Anteile je Stadtbezirk. Das ist eine eigene Auswertung, keine
   Zahl der Stadt: Der Bericht zaehlt Gebaeude aus dem Liegenschaftskataster,
   hier zaehlen Hausnummern. Die Stadtsumme dient als Gegenprobe (der Bericht
   nennt 12,8 Prozent der Gebaeude am Waermenetz bei 70 Prozent Anschluss).

3. Zahlen aus dem Abschlussbericht "Energienutzungsplan Ingolstadt"
   (greenventory, 28.05.2024). Von Hand aus dem Fliesstext uebernommen, mit
   Seitenzahl. Bei einem neuen Bericht hier aendern.

4. Was seither im Stadtrat war. Die Eintraege kommen aus data/feed.json
   (Kurztexte der Kuration); welche dazugehoeren, steht in RAT. Nach einem
   Daten-Update dieses Skript neu laufen lassen, dann ziehen Stand und Texte
   nach.

Ergebnis: ../data/waerme.json und ../data/waerme.js (window.WAERME)
"""

import json
import os
import subprocess
import sys
import urllib.request
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN = os.path.join(HIER, "..", "data")
CACHE = os.path.join(HIER, ".cache", "waerme_eignungsgebiete.geojson")
QUELLE = "https://2035.de/wp-content/uploads/2024/11/eignungsgebiete_ingolstadt-v1.geojson"
BERICHT = "https://2035.de/wp-content/uploads/2024/10/abschlussbericht_enp_ingolstadt.pdf"

# Klassen der Stadt -> eigene Schluessel. Reihenfolge = Reihenfolge der Legende.
KLASSEN = {
    "heating grid": "netz",
    "Wärmenetz, geringe Priorität": "netz_spaeter",
    "Gas/Wärmepumpen-Prüfgebiet": "gas_wp",
    "individual heating": "einzel",
}
REIHENFOLGE = ["netz", "netz_spaeter", "gas_wp", "einzel", "ohne"]
# Titel, die nur die Klasse wiederholen und kein Name sind
KEIN_NAME = ("wärmepumpen prüfgebiet", "prüfgebiet", "gas/wärmepumpen-prüfgebiet")

# Zahlen aus dem Abschlussbericht, Fliesstext. s = Seite im PDF.
AUS_DEM_BERICHT = {
    "titel": "Energienutzungsplan Ingolstadt, Abschlussbericht",
    "datum": "2024-05-28",
    "verfasser": "greenventory GmbH im Auftrag der Stadt Ingolstadt",
    "url": BERICHT,
    "gebaeude": {"wert": 27863, "s": 22},
    "anteil_vor_1979_prozent": {"wert": 60, "s": 22},
    "waermebedarf_gwh": {"wert": 1700, "s": 24},
    "waermebedarf_sektoren_prozent": {"wohnen": 47.4, "industrie": 31.4, "gewerbe": 17.8, "oeffentlich": 3.3, "s": 24},
    "endenergie_gwh": {"wert": 1986, "s": 26},
    # Anteile an der Endenergie fuer Waerme heute
    "energietraeger_prozent": [
        {"name": "Erdgas", "name_l": "Erd-Gas", "wert": 70.9, "fossil": True},
        {"name": "Heizöl", "name_l": "Heiz-Öl", "wert": 14.9, "fossil": True},
        {"name": "Fernwärme", "name_l": "Fern-Wärme", "wert": 11.4, "fossil": False},
        {"name": "Holz und andere Biomasse", "name_l": "Holz", "wert": 2.3, "fossil": False},
        {"name": "Strom (Wärmepumpen, Direktheizung)", "name_l": "Strom", "wert": 0.5, "fossil": False},
    ],
    "energietraeger_s": 26,
    "fernwaerme_abwaerme_prozent": {"wert": 90, "s": 31},
    "fernwaerme_anschlussquote": {"von": 20, "bis": 25, "s": 31},
    # Zielbild 2035: Anteil der Gebaeude je Heizung
    "ziel_2035_prozent": [
        {"name": "Luft-Wärmepumpe", "name_l": "Wärme-Pumpe mit Luft", "wert": 52.8, "gebaeude": 14257},
        {"name": "Biomasse-Kessel", "name_l": "Heizung mit Holz", "wert": 18.1, "gebaeude": 4884},
        {"name": "Erd-Wärmepumpe", "name_l": "Wärme-Pumpe mit Erd-Wärme", "wert": 15.6, "gebaeude": 4219},
        {"name": "Wärmenetz", "name_l": "Fern-Wärme", "wert": 12.8, "gebaeude": None},
        {"name": "Gas aus erneuerbaren Quellen (Industrie)", "name_l": "Gas für Fabriken", "wert": 0.8, "gebaeude": None},
    ],
    "ziel_s": 80,
    "ziel_anschlussquote_prozent": {"wert": 70, "s": 79},
    "gebaeude_in_gas_wp_pruefgebieten": {"wert": 18700, "s": 80},
    "sanierungsrate_angenommen_prozent": {"wert": 2, "s": 84},
    "sanierungsrate_bund_prozent": {"wert": 0.8, "s": 84},
    "thg_minderung_2035_prozent": {"wert": 82, "s": 83},
    "fernwaerme_2035_prozent": [
        {"name": "Abwärme aus Raffinerie und Müllverwertung", "wert": 55.2},
        {"name": "Flusswärme aus der Donau (Großwärmepumpen)", "wert": 17.6},
        {"name": "Gase aus erneuerbaren Quellen", "wert": 14.0},
        {"name": "Biomasse", "wert": 12.9},
    ],
    "fernwaerme_2035_s": 81,
    "massnahmen": {"wert": 15, "s": 87},
}

# Beschluss des Plans: aus der Niederschrift des Stadtrats vom 22.10.2024 (Dokument "Beschluss StR")
BESCHLUSS = {
    "datum": "2024-10-22", "gremium": "Stadtrat", "vorlage": "V0651/24",
    "ergebnis": "Gegen vier Stimmen beschlossen",
    "vorlage_url": "https://www.ingolstadt.de/sessionnet/vo0050.php?__kvonr=19417",
    "beschluss_url": "https://www.ingolstadt.de/sessionnet/getfile.php?id=226959&type=do",
    "kosten_genannt_mio": 290,
}

# Eintraege aus dem Feed, die zur Umsetzung gehoeren: Schluessel ist die Vorlage oder die Ref.
# "stand" ueberschreibt den Stand aus dem Feed, wo der dort offen ist und das Protokoll gelesen wurde.
RAT = [
    {"vorlage": "V0651/24", "stand": "Beschlossen, gegen vier Stimmen", "datum": "2024-10-22",
     "titel": "Stadtrat beschließt Energienutzungsplan und Wärmeplanung",
     "titel_l": "Der Stadt-Rat beschließt den Wärme-Plan",
     "text": "Der Stadtrat beschließt den Plan und erfüllt damit die Pflicht nach § 4 des Wärmeplanungsgesetzes. "
             "Die Verwaltung soll mit den Stadtwerken und dem VerbraucherService Bayern eine gemeinsame Anlaufstelle "
             "für Fragen zu Energiesparen, Sanierung und Wärmeversorgung einrichten. In der Sitzung nennt die "
             "Bürgermeisterin Kosten von etwa 290 Millionen Euro.",
     "text_l": "Der Stadt-Rat sagt Ja zum Wärme-Plan. Die Stadt soll eine Stelle einrichten. Dort bekommen Sie Rat zum Heizen."},
    {"vorlage": "V0762/24", "titel_l": "Die ÖDP will besondere Kredite für die Energie-Wende prüfen lassen"},
    {"ref": "stadt:11817#Ö 12", "titel": "Antrag: Ziel „Klimaneutralität 2035“ aufheben und korrigieren",
     "titel_l": "Antrag: Das Klima-Ziel für 2035 soll geändert werden",
     "text": "Im Stadtrat stand ein Antrag auf der Tagesordnung, das Ziel der Klimaneutralität bis 2035 aufzuheben und zu "
             "korrigieren. Der Wärmeplan rechnet mit diesem Zieljahr. Was dabei herauskam, haben wir nicht ausgewertet; "
             "es steht im Protokoll der Sitzung.",
     "text_l": "Im Stadt-Rat ging es um das Klima-Ziel für das Jahr 2035. Der Wärme-Plan rechnet mit diesem Jahr."},
    {"vorlage": "V0247/25", "titel_l": "Die Stadt lässt prüfen: Wärme aus der Donau"},
    {"vorlage": "V0770/23", "titel_l": "Die SPD will auch einen Plan für Kälte"},
    {"ref": "stadt:13504#Ö 21.4", "titel_l": "Was das Klima-Ziel bisher gekostet hat"},
]


def hole_gebiete(neu):
    if neu or not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        try:
            with urllib.request.urlopen(urllib.request.Request(QUELLE, headers={"User-Agent": "PapierPanther"}), timeout=60) as a:
                roh = a.read()
        except Exception as fehler:  # System-Python scheitert mitunter am TLS-Handshake
            print(f"  urllib: {fehler}; versuche curl", file=sys.stderr)
            roh = subprocess.run(["curl", "-sS", "-m", "60", QUELLE], check=True, capture_output=True).stdout
        json.loads(roh)  # nur ablegen, was sich lesen laesst
        with open(CACHE, "wb") as f:
            f.write(roh)
    with open(CACHE, encoding="utf-8") as f:
        return json.load(f), date.fromtimestamp(os.path.getmtime(CACHE)).isoformat()


def runde(koordinaten):
    if isinstance(koordinaten[0], (int, float)):
        return [round(koordinaten[0], 6), round(koordinaten[1], 6)]
    return [runde(k) for k in koordinaten]


def ringe(geometrie):
    """Liste von Polygonen, jedes eine Liste von Ringen."""
    return [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]


def im_ring(x, y, ring):
    drin = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            drin = not drin
        j = i
    return drin


def in_flaeche(x, y, polygone):
    for polygon in polygone:
        if im_ring(x, y, polygon[0]) and not any(im_ring(x, y, loch) for loch in polygon[1:]):
            return True
    return False


def rahmen(polygone):
    xs = [p[0] for polygon in polygone for p in polygon[0]]
    ys = [p[1] for polygon in polygone for p in polygon[0]]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    roh, abgerufen = hole_gebiete("--neu" in sys.argv)

    gebiete = []
    for f in roh["features"]:
        e = f["properties"]
        klasse = KLASSEN.get(e["category_name"])
        if not klasse:
            sys.exit(f"Unbekannte Klasse in der Quelle: {e['category_name']!r}. KLASSEN ergaenzen.")
        titel = (e.get("title") or "").strip()
        name = "" if titel.lower() in KEIN_NAME else titel
        geometrie = {"type": f["geometry"]["type"], "coordinates": runde(f["geometry"]["coordinates"])}
        polygone = ringe(geometrie)
        gebiete.append({"id": e["geometry_id"], "klasse": klasse, "name": name,
                        "hinweis": (e.get("description") or "").strip(), "geometrie": geometrie,
                        "polygone": polygone, "rahmen": rahmen(polygone), "adressen": 0, "bezirke": {}})

    # Liegt eine Adresse in mehreren Flaechen, gewinnt die Klasse, die in der Legende weiter oben steht
    rang = {k: i for i, k in enumerate(REIHENFOLGE)}
    gebiete.sort(key=lambda g: rang[g["klasse"]])

    with open(os.path.join(DATEN, "bezirke.json"), encoding="utf-8") as f:
        bezirke = [{"nr": b["properties"]["beznr"], "name": b["properties"]["bezname"], "polygone": ringe(b["geometry"])}
                   for b in json.load(f)["features"]]
    for b in bezirke:
        b["rahmen"] = rahmen(b["polygone"])
        b["zahl"] = {k: 0 for k in REIHENFOLGE}

    with open(os.path.join(DATEN, "wege-adressen.json"), encoding="utf-8") as f:
        adressen = json.load(f)

    def finde(x, y, liste):
        for eintrag in liste:
            x0, y0, x1, y1 = eintrag["rahmen"]
            if x0 <= x <= x1 and y0 <= y <= y1 and in_flaeche(x, y, eintrag["polygone"]):
                return eintrag
        return None

    stadt = {k: 0 for k in REIHENFOLGE}
    ohne_bezirk = mehrfach = 0
    for strasse in adressen["strassen"]:
        lat = lon = 0
        for dlat, dlon in zip(strasse[2], strasse[3]):
            lat += dlat
            lon += dlon
            x, y = lon / 1e5, lat / 1e5
            g = finde(x, y, gebiete)
            klasse = g["klasse"] if g else "ohne"
            if g:
                g["adressen"] += 1
                if sum(1 for h in gebiete if h is not g and h["rahmen"][0] <= x <= h["rahmen"][2]
                       and h["rahmen"][1] <= y <= h["rahmen"][3] and in_flaeche(x, y, h["polygone"])):
                    mehrfach += 1
            stadt[klasse] += 1
            b = finde(x, y, bezirke)
            if b:
                b["zahl"][klasse] += 1
                if g:
                    g["bezirke"][b["nr"]] = g["bezirke"].get(b["nr"], 0) + 1
            else:
                ohne_bezirk += 1

    name_von = {b["nr"]: b["name"] for b in bezirke}
    features = []
    for g in sorted(gebiete, key=lambda g: g["id"]):
        # Bezirk, in dem die meisten Adressen der Flaeche liegen
        bezirk = max(g["bezirke"].items(), key=lambda kv: kv[1])[0] if g["bezirke"] else ""
        features.append({"type": "Feature", "geometry": g["geometrie"],
                         "properties": {"id": g["id"], "klasse": g["klasse"], "name": g["name"], "hinweis": g["hinweis"],
                                        "adressen": g["adressen"], "bezirk": bezirk, "bezirk_name": name_von.get(bezirk, "")}})

    with open(os.path.join(DATEN, "feed.json"), encoding="utf-8") as f:
        feed = json.load(f)
    rat = []
    for wunsch in RAT:
        treffer = [e for e in feed["eintraege"]
                   if (wunsch.get("vorlage") and e.get("vorlage") == wunsch["vorlage"]) or e.get("ref") == wunsch.get("ref")]
        if not treffer:
            print(f"  Hinweis: {wunsch.get('vorlage') or wunsch.get('ref')} steht nicht (mehr) im Feed, uebersprungen", file=sys.stderr)
            continue
        e = treffer[0]
        letzter = max(e["auftritte"], key=lambda a: a["datum"])
        rat.append({
            "datum": wunsch.get("datum") or letzter["datum"],
            "gremium": "Stadtrat" if any(a["gremium"] == "Stadtrat" for a in e["auftritte"]) else letzter["gremium"],
            "vorlage": e.get("vorlage") or "",
            "titel": wunsch.get("titel") or e.get("klartext_titel") or e.get("amtlicher_titel"),
            "titel_l": wunsch.get("titel_l") or e.get("klartext_titel_leicht") or wunsch.get("titel") or e.get("klartext_titel"),
            "text": wunsch.get("text") or e.get("klartext") or "",
            "text_l": wunsch.get("text_l") or e.get("klartext_leicht") or "",
            "stand": wunsch.get("stand") or e.get("stand") or "",
            "url": e.get("vorlage_url") or letzter["sitzung_url"],
            "niederschrift_url": e.get("niederschrift_url") or "",
        })
    rat.sort(key=lambda r: r["datum"])

    gesamt = sum(stadt.values())
    ergebnis = {
        "erzeugt_von": "scraper/waerme_bauen.py",
        "erzeugt_am": date.today().isoformat(),
        "stand_ratsdaten": feed.get("daten_abgerufen_am", ""),
        "quelle": {
            "name": "Eignungsgebiete der kommunalen Wärmeplanung, Stadt Ingolstadt",
            "seite": "https://2035.de/map/", "datei": QUELLE, "abgerufen_am": abgerufen,
            "herausgeber": "Stadt Ingolstadt, Stabsstelle Strategien Klima, Biodiversität & Donau",
            "hinweis": "Die Datei trägt keine Lizenzangabe. Umrisse auf sechs Nachkommastellen gerundet, sonst unverändert. "
                       "Verbindlich ist allein der Wärmeplan der Stadt.",
        },
        "adressen": {
            "quelle": adressen["quelle"], "stand": adressen["erzeugt_am"], "gesamt": gesamt, "je_klasse": stadt,
            "hinweis": "Hausnummern aus OpenStreetMap, jede der Fläche zugeordnet, in der sie liegt. Eigene Auswertung, keine Zahl der Stadt.",
        },
        "klassen": REIHENFOLGE,
        "bezirke": [{"nr": b["nr"], "name": b["name"], "adressen": sum(b["zahl"].values()), "je_klasse": b["zahl"]}
                    for b in sorted(bezirke, key=lambda b: b["nr"])],
        "bericht": AUS_DEM_BERICHT,
        "beschluss": BESCHLUSS,
        "rat": rat,
        "gebiete": {"type": "FeatureCollection", "features": features},
    }

    with open(os.path.join(DATEN, "waerme.json"), "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    with open(os.path.join(DATEN, "waerme.js"), "w", encoding="utf-8") as f:
        f.write("/* Erzeugt von scraper/waerme_bauen.py -- nicht von Hand aendern. Eignungsgebiete: Stadt Ingolstadt (2035.de) */\n")
        f.write("window.WAERME = ")
        json.dump(ergebnis, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"{len(features)} Flächen, {gesamt} Adressen ({ohne_bezirk} ohne Bezirk, {mehrfach} in mehr als einer Fläche)")
    for k in REIHENFOLGE:
        print(f"  {k:13} {stadt[k]:6}  {stadt[k] / gesamt * 100:5.1f} %")
    netz = stadt["netz"] + stadt["netz_spaeter"]
    print(f"  Wärmenetz zusammen {netz / gesamt * 100:.1f} % der Adressen; Bericht: 12,8 % der Gebäude bei 70 % Anschluss, "
          f"also rund {12.8 / 0.7:.0f} % der Gebäude in Eignungsgebieten")
    for b in ergebnis["bezirke"]:
        z = b["je_klasse"]
        print(f"  {b['nr']} {b['name']:28} {b['adressen']:5}  Netz {(z['netz'] + z['netz_spaeter']) / max(1, b['adressen']) * 100:5.1f} %"
              f"  Gas/WP {z['gas_wp'] / max(1, b['adressen']) * 100:5.1f} %  Einzel {z['einzel'] / max(1, b['adressen']) * 100:5.1f} %"
              f"  ohne {z['ohne']}")
    print(f"{len(rat)} Einträge aus dem Rat")


if __name__ == "__main__":
    main()
