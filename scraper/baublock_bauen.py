#!/usr/bin/env python3
"""Baubloecke des Energie-Atlas Bayern fuer Ingolstadt -> data/baublock.json und data/baublock.js

Das Bayerische Landesamt fuer Umwelt (LfU) zeigt im Energie-Atlas je Baublock, womit heute
ueberwiegend geheizt wird, aus welcher Zeit die Gebaeude stammen (beides Zensus 2022) und wie
hoch der Waermebedarf ist (Modell des LfU, heute und nach ehrgeiziger Sanierung). Der Dienst
"Planungsgrundlagen Waerme" steht unter CC BY 4.0:

    Datenquelle: Bayerisches Landesamt fuer Umwelt, www.lfu.bayern.de

Der Dienst ist ein WMS und gibt keine Geometrien als Daten heraus. Er zeichnet die Karte aber
auch als SVG, und darin stehen die Umrisse in voller Genauigkeit. Ablauf:

  1. ein Kartenbild der ganzen Stadt als SVG holen und die Umrisse zurueckrechnen,
  2. nur Bloecke behalten, deren Innenpunkt in einem Stadtbezirk liegt,
  3. je Block die Sachdaten mit einer GetFeatureInfo-Abfrage am Innenpunkt holen
     (vier Ebenen in einer Abfrage, rund 4.000 Abfragen, im Cache abgelegt) und als Probe
     die zurueckgerechnete Flaeche mit der Flaechenangabe des LfU vergleichen,
  4. jeden Block einem Gebiet des Waermeplans (data/waerme.json) und einem Bezirk zuordnen
     und auswerten.

Bloecke, die das Statistikamt aus Geheimhaltung sperrt oder die keine Wohngebaeude haben,
bleiben ohne Werte ("geheim / keine Daten") und werden in der Auswertung getrennt gezaehlt.

    python3 baublock_bauen.py          # nutzt den Cache
    python3 baublock_bauen.py --neu    # holt alles neu (dauert einige Minuten)

Vorher muss waerme_bauen.py gelaufen sein.
"""
import json
import math
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN = os.path.join(HIER, "..", "data")
CACHE_SVG = os.path.join(HIER, ".cache", "baublock_flaechen.svg")
CACHE_INFO = os.path.join(HIER, ".cache", "baublock_info.json")
DIENST = "https://www.lfu.bayern.de/gdi/wms/energieatlas/planungsgrundlagen_waerme"
EBENEN = ["bblock_heiztyp_zensus", "bblock_gebart_zensus", "waermedicht_i_zustand_z2", "waermedichte_amb_sanierung_z2"]
NAMENSNENNUNG = "Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de"
AGENT = "PapierPanther-Datenabruf (schanzer-papierpanther.de)"
REIHENFOLGE = ["netz", "netz_spaeter", "gas_wp", "einzel", "ohne"]
# Bildbreite fuer den SVG-Abruf; der Dienst erlaubt hoechstens 4096 Pixel je Seite. Die Hoehe folgt
# aus dem Rahmen, sodass ein Pixel in beiden Richtungen gleich viele Grad misst. Sonst passt der
# Dienst den Ausschnitt stillschweigend an und die Umrisse landen an der falschen Stelle.
BREITE = 4000


def hole(url, wartezeit=120):
    anfrage = urllib.request.Request(url, headers={"User-Agent": AGENT})
    try:
        with urllib.request.urlopen(anfrage, timeout=wartezeit) as antwort:
            return antwort.read()
    except Exception:
        # System-Python scheitert bei manchen Servern am TLS-Handshake, curl nicht
        return subprocess.run(["curl", "-sS", "-m", str(wartezeit), "-A", AGENT, url], check=True, capture_output=True).stdout


def im_ring(x, y, ring):
    innen = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            innen = not innen
        j = i
    return innen


def im_polygon(x, y, ringe):
    return im_ring(x, y, ringe[0]) and not any(im_ring(x, y, loch) for loch in ringe[1:])


def polygone_von(geometrie):
    return [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]


def in_geometrie(x, y, geometrie):
    return any(im_polygon(x, y, p) for p in polygone_von(geometrie))


def flaeche(ring):
    return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1)) / 2


def innenpunkt(ringe):
    """Ein Punkt, der sicher im Polygon liegt: Schwerpunkt, sonst Mitte des breitesten Schnitts."""
    aussen = ringe[0]
    sx = sum(p[0] for p in aussen[:-1]) / (len(aussen) - 1)
    sy = sum(p[1] for p in aussen[:-1]) / (len(aussen) - 1)
    if im_polygon(sx, sy, ringe):
        return sx, sy
    ys = [p[1] for p in aussen]
    bester = None
    for teil in (0.5, 0.35, 0.65, 0.2, 0.8):
        y = min(ys) + (max(ys) - min(ys)) * teil
        schnitte = []
        for ring in ringe:
            for i in range(len(ring) - 1):
                (x1, y1), (x2, y2) = ring[i], ring[i + 1]
                if (y1 > y) != (y2 > y):
                    schnitte.append(x1 + (x2 - x1) * (y - y1) / (y2 - y1))
        schnitte.sort()
        for a, b in zip(schnitte[::2], schnitte[1::2]):
            if bester is None or b - a > bester[0]:
                bester = (b - a, (a + b) / 2, y)
    return (bester[1], bester[2]) if bester else (sx, sy)


def hoehe_fuer(rahmen):
    west, sued, ost, nord = rahmen
    return round(BREITE * (nord - sued) / (ost - west))


def lies_svg(svg, rahmen):
    """Umrisse aus dem Kartenbild zurueck in Laenge und Breite rechnen."""
    west, sued, ost, nord = rahmen
    HOEHE = hoehe_fuer(rahmen)
    m = re.search(r'matrix\(([\d.]+) 0 0 -([\d.]+) ([\d.]+) ([\d.]+)\)', svg)
    if not m:
        raise SystemExit("SVG des LfU hat ein unerwartetes Format (keine Matrix gefunden)")
    a, cx, cy = float(m.group(1)), float(m.group(3)), float(m.group(4))
    bloecke = []
    for pfad, fuellung in re.findall(r'<path d="([^"]*)"[^>]*?fill="([^"]*)"', svg):
        if fuellung in ("none", "#FFFFFF"):
            continue
        ringe = []
        for teil in re.split(r'(?=M)', pfad):
            punkte = re.findall(r'[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)', teil)
            if len(punkte) < 3:
                continue
            ring = []
            for x, y in punkte:
                lon = west + (cx + a * float(x)) / BREITE * (ost - west)
                lat = nord - (cy - a * float(y)) / HOEHE * (nord - sued)
                punkt = [round(lon, 5), round(lat, 5)]
                if not ring or ring[-1] != punkt:
                    ring.append(punkt)
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            if len(ring) >= 4:
                ringe.append(ring)
        if not ringe:
            continue
        # Ein Pfad kann mehrere Teile und Loecher enthalten: der Groesse nach ordnen, jeder Ring,
        # der in einem groesseren Teil liegt, ist dessen Loch, sonst ein eigener Teil
        ringe.sort(key=lambda r: -abs(flaeche(r)))
        teile = []
        for ring in ringe:
            wirt = next((t for t in teile if im_ring(ring[0][0], ring[0][1], t[0])), None)
            if wirt:
                wirt.append(ring)
            else:
                teile.append([ring])
        bloecke.append(teile)
    return bloecke


def vereinfache(ring, toleranz=0.000012):
    """Douglas-Peucker; die Toleranz entspricht rund einem Meter."""
    def dp(punkte):
        if len(punkte) < 3:
            return punkte
        (x1, y1), (x2, y2) = punkte[0], punkte[-1]
        dx, dy = x2 - x1, y2 - y1
        laenge = math.hypot(dx, dy) or 1e-12
        weit, wo = 0, 0
        for i in range(1, len(punkte) - 1):
            abstand = abs(dy * (punkte[i][0] - x1) - dx * (punkte[i][1] - y1)) / laenge
            if abstand > weit:
                weit, wo = abstand, i
        if weit <= toleranz:
            return [punkte[0], punkte[-1]]
        return dp(punkte[:wo + 1])[:-1] + dp(punkte[wo:])
    # Ring an der Stelle teilen, die am weitesten vom Anfang liegt, sonst faellt er zusammen
    fern = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]))
    neu = dp(ring[:fern + 1])[:-1] + dp(ring[fern:])
    return neu if len(neu) >= 4 else ring


def hektar(teile):
    """Flaeche eines Blocks in Hektar, fuer den Abgleich mit der Angabe des LfU."""
    grad2 = sum(abs(flaeche(t[0])) - sum(abs(flaeche(l)) for l in t[1:]) for t in teile)
    breite = teile[0][0][0][1]
    return grad2 * 111320 * 111320 * math.cos(math.radians(breite)) / 10000


def zahl(text):
    """'5.697 m²' -> 5697, '0,68 ha' -> 0.68, '--' -> None"""
    m = re.match(r'\s*(-?[\d.]+(?:,\d+)?)', text or "")
    if not m:
        return None
    wert = float(m.group(1).replace(".", "").replace(",", "."))
    return int(wert) if wert == int(wert) else wert


def frage_block(punkt):
    lon, lat = punkt
    d = 0.00002
    ebenen = ",".join(EBENEN)
    url = DIENST + "?" + urllib.parse.urlencode({
        "service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo", "layers": ebenen, "query_layers": ebenen,
        "styles": "", "srs": "EPSG:4326", "bbox": f"{lon - d:.6f},{lat - d:.6f},{lon + d:.6f},{lat + d:.6f}",
        "width": 101, "height": 101, "x": 50, "y": 50, "info_format": "application/geo+json", "feature_count": 20})
    for versuch in range(3):
        try:
            antwort = json.loads(hole(url, 60))
            return {f["layerName"]: f["properties"] for f in antwort.get("features", []) if f.get("layerName")}
        except Exception as fehler:
            letzter = fehler
    raise SystemExit(f"Abfrage beim LfU gescheitert ({letzter}); spaeter noch einmal starten, der Cache bleibt erhalten")


def main():
    neu = "--neu" in sys.argv
    with open(os.path.join(DATEN, "bezirke.json"), encoding="utf-8") as f:
        bezirke = json.load(f)["features"]
    with open(os.path.join(DATEN, "waerme.json"), encoding="utf-8") as f:
        waerme = json.load(f)
    gebiete = sorted(waerme["gebiete"]["features"], key=lambda g: REIHENFOLGE.index(g["properties"]["klasse"]))

    xs, ys = [], []
    for b in bezirke:
        for p in polygone_von(b["geometry"]):
            for x, y in p[0]:
                xs.append(x)
                ys.append(y)
    rahmen = (round(min(xs) - 0.005, 3), round(min(ys) - 0.005, 3), round(max(xs) + 0.005, 3), round(max(ys) + 0.005, 3))

    os.makedirs(os.path.dirname(CACHE_SVG), exist_ok=True)
    if neu or not os.path.exists(CACHE_SVG):
        url = DIENST + "?" + urllib.parse.urlencode({
            "service": "WMS", "version": "1.1.1", "request": "GetMap", "layers": EBENEN[2], "styles": "", "srs": "EPSG:4326",
            "bbox": ",".join(str(v) for v in rahmen), "width": BREITE, "height": hoehe_fuer(rahmen), "format": "image/svg+xml", "transparent": "true"})
        roh = hole(url, 240)
        if b"<svg" not in roh[:600]:
            raise SystemExit("Der Dienst des LfU hat kein SVG geliefert: " + roh[:200].decode("utf-8", "replace"))
        with open(CACHE_SVG, "wb") as f:
            f.write(b"<!-- rahmen " + json.dumps(rahmen).encode() + b" -->\n" + roh)
    with open(CACHE_SVG, encoding="utf-8") as f:
        svg = f.read()
    rahmen = tuple(json.loads(re.match(r'<!-- rahmen (\[.*?\]) -->', svg).group(1)))
    alle = lies_svg(svg, rahmen)

    bloecke = []
    for teile in alle:
        x, y = innenpunkt(teile[0])
        bezirk = next((b for b in bezirke if in_geometrie(x, y, b["geometry"])), None)
        if bezirk:
            bloecke.append({"teile": teile, "punkt": (round(x, 6), round(y, 6)), "bezirk": bezirk["properties"]})
    print(f"{len(alle)} Umrisse im Kartenbild, {len(bloecke)} davon in der Stadt")

    cache = {}
    if not neu and os.path.exists(CACHE_INFO):
        with open(CACHE_INFO, encoding="utf-8") as f:
            cache = json.load(f)
    offen = [b["punkt"] for b in bloecke if f"{b['punkt'][0]},{b['punkt'][1]}" not in cache]
    if offen:
        print(f"{len(offen)} Abfragen beim LfU …")
        with ThreadPoolExecutor(max_workers=4) as becken:
            for i, (punkt, antwort) in enumerate(zip(offen, becken.map(frage_block, offen))):
                cache[f"{punkt[0]},{punkt[1]}"] = antwort
                if (i + 1) % 500 == 0:
                    print(f"  {i + 1}")
                    with open(CACHE_INFO, "w", encoding="utf-8") as f:
                        json.dump(cache, f, ensure_ascii=False)
        with open(CACHE_INFO, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)

    traeger, alter = [], []

    def nummer(liste, wert):
        if wert in (None, "", "--"):
            return None
        if wert not in liste:
            liste.append(wert)
        return liste.index(wert)

    features = []
    ohne_angabe = abweichend = geprueft = 0
    for i, b in enumerate(bloecke):
        x, y = b["punkt"]
        info = cache[f"{x},{y}"]
        heiz, bau = info.get(EBENEN[0], {}), info.get(EBENEN[1], {})
        ist, saniert = info.get(EBENEN[2], {}), info.get(EBENEN[3], {})
        gebiet = next((g for g in gebiete if in_geometrie(x, y, g["geometry"])), None)
        eig = {
            "id": i + 1,
            "k": gebiet["properties"]["klasse"] if gebiet else "ohne",
            "bz": b["bezirk"]["beznr"],
            "e": nummer(traeger, heiz.get("Dominierender Energieträger")),
            "a": nummer(alter, bau.get("Dominierende Baualtersklasse")),
            "g": zahl(heiz.get("Gebäude")), "w": zahl(heiz.get("Wohneinheiten")), "b": zahl(heiz.get("Bewohner")),
            "d": zahl(ist.get("Wärmebedarfsdichte")), "q": zahl(ist.get("Wärmebedarf im Baublock")),
            "ds": zahl(saniert.get("Wärmebedarfsdichte")), "qs": zahl(saniert.get("Wärmebedarf im Baublock")),
            "ha": zahl(ist.get("Baublockfläche")),
        }
        if eig["e"] is None and eig["q"] is None:
            ohne_angabe += 1
            continue
        # Probe: die zurueckgerechnete Flaeche muss zur Flaechenangabe des LfU passen
        if eig["ha"]:
            geprueft += 1
            if abs(hektar(b["teile"]) - eig["ha"]) > max(0.06, 0.08 * eig["ha"]):
                abweichend += 1
        b["teile"] = [[vereinfache(r) for r in t] for t in b["teile"]]
        geometrie = ({"type": "Polygon", "coordinates": b["teile"][0]} if len(b["teile"]) == 1
                     else {"type": "MultiPolygon", "coordinates": b["teile"]})
        features.append({"type": "Feature", "properties": {k: v for k, v in eig.items() if v is not None}, "geometry": geometrie})
    if geprueft == 0 or abweichend > 0.03 * geprueft:
        raise SystemExit(f"Flaechenprobe gescheitert: {abweichend} von {geprueft} Bloecken weichen von der Flaechenangabe des LfU ab; "
                         "die Umrisse liegen vermutlich falsch")
    print(f"Flächenprobe: {geprueft - abweichend} von {geprueft} Blöcken passen zur Flächenangabe des LfU")

    # Baualtersklassen nach dem ersten Jahr ordnen, damit die Karte eine Farbreihe bilden kann
    def startjahr(klasse):
        if klasse.startswith("bis"):
            return 0
        m = re.search(r'\d{4}', klasse)
        return int(m.group(0)) if m else 9999
    ordnung = sorted(range(len(alter)), key=lambda i: startjahr(alter[i]))
    neu_nr = {alt: n for n, alt in enumerate(ordnung)}
    alter = [alter[i] for i in ordnung]
    for f in features:
        if "a" in f["properties"]:
            f["properties"]["a"] = neu_nr[f["properties"]["a"]]

    def leer():
        return {"bloecke": 0, "wohnungen": 0, "wohnungen_je_traeger": [0] * len(traeger),
                "wohnungen_je_alter": [0] * len(alter), "bedarf": 0, "bedarf_saniert": 0}

    je_klasse = {k: leer() for k in REIHENFOLGE}
    gesamt = leer()
    for f in features:
        p = f["properties"]
        for ziel in (je_klasse[p["k"]], gesamt):
            ziel["bloecke"] += 1
            if "e" in p and p.get("w"):
                ziel["wohnungen"] += p["w"]
                ziel["wohnungen_je_traeger"][p["e"]] += p["w"]
                if "a" in p:
                    ziel["wohnungen_je_alter"][p["a"]] += p["w"]
            ziel["bedarf"] += p.get("q", 0)
            ziel["bedarf_saniert"] += p.get("qs", 0)

    ergebnis = {
        "erzeugt_am": date.today().isoformat(),
        "quelle": {"name": "Energie-Atlas Bayern, Planungsgrundlagen Wärme", "herausgeber": "Bayerisches Landesamt für Umwelt",
                   "namensnennung": NAMENSNENNUNG, "lizenz": "CC BY 4.0", "lizenz_url": "https://creativecommons.org/licenses/by/4.0/deed.de",
                   "dienst": DIENST, "karte": "https://www.karten.energieatlas.bayern.de/",
                   "grundlage": "Zensus 2022 (Energieträger, Baualter, Wohnungen) und Wärmebedarfsmodell des LfU",
                   "bearbeitung": "Umrisse aus dem Kartenbild des Dienstes zurückgerechnet und auf fünf Nachkommastellen gerundet und auf rund einen Meter vereinfacht; Zuordnung zu Wärmeplan-Gebieten und Stadtbezirken über einen Innenpunkt"},
        "energietraeger": traeger, "baualter": alter,
        "bloecke_ohne_angabe": ohne_angabe, "flaechenprobe": {"geprueft": geprueft, "abweichend": abweichend},
        "gesamt": gesamt, "je_klasse": je_klasse,
        "bloecke": {"type": "FeatureCollection", "features": features},
    }
    with open(os.path.join(DATEN, "baublock.json"), "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    with open(os.path.join(DATEN, "baublock.js"), "w", encoding="utf-8") as f:
        f.write("/* Erzeugt von scraper/baublock_bauen.py -- nicht von Hand aendern. " + NAMENSNENNUNG + " (CC BY 4.0), bearbeitet */\n")
        f.write("window.BAUBLOCK = ")
        json.dump(ergebnis, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"{len(features)} Baublöcke, {ohne_angabe} weitere ohne Angabe weggelassen, {gesamt['wohnungen']} Wohnungen in Blöcken mit Angabe")
    print("Energieträger:", ", ".join(f"{t} {gesamt['wohnungen_je_traeger'][i]}" for i, t in enumerate(traeger)))
    print("Baualter:", ", ".join(f"{t} {gesamt['wohnungen_je_alter'][i]}" for i, t in enumerate(alter)))
    for k in REIHENFOLGE:
        z = je_klasse[k]
        print(f"  {k:13} {z['bloecke']:5} Blöcke, {z['wohnungen']:6} Whg., Bedarf {z['bedarf']:8} -> {z['bedarf_saniert']:8} MWh/a")
    print(f"data/baublock.js: {os.path.getsize(os.path.join(DATEN, 'baublock.js')) // 1024} kB")


if __name__ == "__main__":
    main()
