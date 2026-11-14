#!/usr/bin/env python3
"""
Holt die Umgriffe der Ingolstaedter Bebauungsplaene vom Landesdienst
"Bauleitplaene Bayern (Umringe)" und legt sie als GeoJSON ab.

Quelle: WMS des Landesamts fuer Digitalisierung, Breitband und Vermessung,
https://gdiserv.bayern.de/bauleitplanung/wms, Ebenen bplan_rechtskraft und
bplan_im_verfahren. Lizenz CC BY-ND 4.0, Namensnennung "Bauleitplaene
Bayern". Der Dienst nennt sich selbst eine Erstinformation ohne Gewaehr.
Wegen "ND" (keine Bearbeitung) bleiben die Geometrien, wie sie kommen:
nicht vereinfacht, nicht verschnitten. Der Dienst rundet auf vier
Nachkommastellen, also auf etwa zehn Meter.

Der Dienst hat keinen WFS. GetFeatureInfo liefert aber GeoJSON samt
Geometrie fuer alles, was im Fangkreis um den abgefragten Bildpunkt liegt,
und der Fangkreis ist in Bildpunkten bemessen. Ein Bild von 6 x 3 Punkten
ueber dem Stadtgebiet macht ihn so gross, dass eine einzige Abfrage in der
Bildmitte alle Plaene der Stadt (und einige der Nachbarn) trifft. Gefiltert
wird danach ueber den Gemeindeschluessel. Geprueft am 14.11.2026: 8 x 4
Punkte ergeben 425 Ingolstaedter Plaene, 6 x 3 ergeben 427, 4 x 2 ergeben 426.

Der Haken: Der Dienst vereinfacht die Geometrie passend zum Bildmassstab.
Aus der Sammelabfrage kommen deshalb nur grobe Dreiecke und Vierecke. Sie
taugt als Liste mit Sachdaten, nicht als Umgriff. Im zweiten Schritt fragt
das Skript jeden Plan einzeln in feinem Massstab ab (ein Bildpunkt = etwa
zwei Meter), und zwar an einem Eckpunkt der groben Flaeche: Der liegt auf
dem Rand des echten Umgriffs und trifft ihn deshalb sicher. Was eine solche
Abfrage an Nachbarplaenen mitliefert, wird gleich uebernommen.

Neben dem Umgriff stehen dort je Plan die Daten von Aufstellungsbeschluss,
Satzungsbeschluss und Inkrafttreten und die Links zu Planzeichnung und Text.
Das Inkrafttreten fehlt im Ratsinfoportal; es kommt nur von hier.

Ergebnis: ../data/plangebiete.json und ../data/plangebiete.js (window.PLANGEBIETE)
"""

import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN = os.path.join(HIER, "..", "data")
DIENST = "https://gdiserv.bayern.de/bauleitplanung/wms"
GKZ = 9161000
BBOX = "11.24,48.68,11.56,48.84"
# Ebene -> (Breite, Hoehe) des gedachten Bildes; je kleiner, desto groesser der Fangkreis
EBENEN = {"bplan_rechtskraft": (6, 3), "bplan_im_verfahren": (1, 1)}
# Rechtsstand nach XPlanung (BP_Rechtsstand)
# Grad je Bildpunkt fuer die Einzelabfragen: zuerst etwa 2 m, bei Fehlschlag groeber
FEIN_GRAD = (0.00002, 0.00005, 0.0002)
RECHTSSTAND = {1000: "aufstellung", 2000: "entwurf", 3000: "satzung", 4000: "rechtskraft"}


def hole(ebene, breite, hoehe, bbox=BBOX):
    parameter = {
        "service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo",
        "layers": ebene, "query_layers": ebene, "styles": "", "srs": "EPSG:4326",
        "bbox": bbox, "width": breite, "height": hoehe, "x": breite // 2, "y": hoehe // 2,
        "feature_count": 5000, "info_format": "application/json",
    }
    url = DIENST + "?" + urllib.parse.urlencode(parameter)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "PapierPanther"}), timeout=180) as a:
            roh = a.read()
    except Exception as fehler:  # System-Python scheitert mitunter am TLS-Handshake
        print(f"  urllib: {fehler}; versuche curl", file=sys.stderr)
        roh = subprocess.run(["curl", "-sS", "-m", "180", url], check=True, capture_output=True).stdout
    return json.loads(roh)["features"]


def groesster_ring(geometrie):
    polygone = [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]
    return max((p[0] for p in polygone), key=len)


def fein_holen(features, ebene_von):
    """Ersetzt die groben Geometrien der Sammelabfrage durch die fein aufgeloesten."""
    fertig = set()
    for nummer, (planid, f) in enumerate(sorted(features.items()), 1):
        if planid in fertig:
            continue
        x, y = groesster_ring(f["geometry"])[0]
        for punkt in FEIN_GRAD:
            h = punkt * 300
            try:
                treffer = hole(ebene_von[planid], 600, 600, f"{x - h},{y - h},{x + h},{y + h}")
            except Exception as fehler:
                print(f"  ! {f['properties']['nr']}: {fehler}", file=sys.stderr)
                treffer = []
            for t in treffer:
                pid = t["properties"].get("planid")
                if pid in features and pid not in fertig and t.get("geometry") and ebene_von[pid] == ebene_von[planid]:
                    # Nachbarn nur aus der feinsten Stufe uebernehmen, den gesuchten Plan aus jeder
                    if punkt == FEIN_GRAD[0] or pid == planid:
                        features[pid]["geometry"] = t["geometry"]
                        fertig.add(pid)
            time.sleep(0.25)
            if planid in fertig:
                break
        if nummer % 40 == 0:
            print(f"  fein: {len(fertig)}/{len(features)}", flush=True)
    return fertig


def datum(wert):
    """Der Dienst setzt 1899-12-31 ein, wo ein Datum fehlt."""
    return wert if wert and wert > "1900" else ""


def main():
    features = {}
    ebene_von = {}
    for ebene, (breite, hoehe) in EBENEN.items():
        alle = hole(ebene, breite, hoehe)
        stadt = [f for f in alle if f["properties"].get("gkz") == GKZ and f.get("geometry")]
        print(f"{ebene}: {len(alle)} Objekte, davon {len(stadt)} in Ingolstadt")
        if len(alle) >= 5000:
            sys.exit("Obergrenze erreicht, Abfrage ist nicht vollstaendig")
        for f in stadt:
            p = f["properties"]
            stand = RECHTSSTAND.get(p.get("rechtssta"), "")
            if ebene == "bplan_rechtskraft":
                stand = "rechtskraft"
            nr = " ".join(str(p.get("nummer") or "").split())
            ebene_von[p["planid"]] = ebene
            features[p["planid"]] = {
                "type": "Feature",
                "properties": {
                    "nr": nr,
                    "name": (p.get("planname") or "").strip(),
                    "stand": stand,
                    "aufstellung": datum(p.get("aufstellun")),
                    "satzung": datum(p.get("satzungsbe")),
                    "inkraft": datum(p.get("inkrafttre")) if stand == "rechtskraft" else "",
                    "plan_url": p.get("scanurl") or "",
                    "text_url": p.get("texturl") or "",
                    "begruendung_url": p.get("begrurl") or "",
                    "planid": p["planid"],
                },
                "geometry": f["geometry"],
            }
    if len(features) < 400:
        sys.exit(f"Nur {len(features)} Plaene, erwartet ueber 400. Nichts geschrieben.")

    fertig = fein_holen(features, ebene_von)
    grob = sorted(features[pid]["properties"]["nr"] for pid in features if pid not in fertig)
    if grob:
        print(f"  ! Nur grob aufgeloest, weggelassen: {', '.join(grob)}", file=sys.stderr)
    if len(grob) > 20:
        sys.exit("Zu viele Plaene ohne feine Geometrie. Nichts geschrieben.")

    liste = sorted((features[pid] for pid in fertig), key=lambda f: f["properties"]["nr"])
    geo = {
        "type": "FeatureCollection",
        "quelle": "Bauleitpläne Bayern (Umringe), Landesamt für Digitalisierung, Breitband und Vermessung",
        "lizenz": "CC BY-ND 4.0, https://creativecommons.org/licenses/by-nd/4.0/deed.de",
        "namensnennung": "Bauleitpläne Bayern",
        "hinweis": "Erstinformation ohne Gewähr. Geometrien unverändert übernommen, wie der Dienst sie im Maßstab "
                   "von etwa zwei Metern je Bildpunkt liefert (auf etwa zehn Meter gerundet). "
                   "Verbindlich sind allein die Pläne der Stadt Ingolstadt.",
        "dienst": DIENST,
        "abgerufen_am": date.today().isoformat(),
        "features": liste,
    }
    with open(os.path.join(DATEN, "plangebiete.json"), "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    with open(os.path.join(DATEN, "plangebiete.js"), "w", encoding="utf-8") as f:
        f.write("/* Umgriffe der Bebauungsplaene: Bauleitplaene Bayern, CC BY-ND 4.0, unveraendert; "
                "geholt von scraper/plangebiete_holen.py */\nwindow.PLANGEBIETE = "
                + json.dumps(geo, ensure_ascii=False, separators=(",", ":")) + ";\n")
    je = {}
    for f in liste:
        je[f["properties"]["stand"]] = je.get(f["properties"]["stand"], 0) + 1
    print(f"{len(liste)} Plaene: {je}")


if __name__ == "__main__":
    main()
