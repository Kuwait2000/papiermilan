#!/usr/bin/env python3
"""
Liest fuer die Themenseite "Baugebiete und Plaene" das Ratsinfoportal zurueck.

rohdaten.json beginnt im November 2023. Viele Bebauungsplaene haben ihre
ersten Schritte davor gemacht ("Am Samhof", Nr. 107, zum Beispiel 2019).
Dieses Skript holt deshalb aus den Jahren davor nur das, was die Planseite
braucht: die Sitzungen von Stadtrat und Planungsausschuss und daraus nur die
Tagesordnungspunkte mit Planbezug. Alles andere bleibt, wo es ist;
rohdaten.json wird nicht angefasst.

Verwendung:
    python3 plaene_alt_holen.py                    # 2014-01 bis 2023-10
    python3 plaene_alt_holen.py --von 2018-01 --bis 2020-12

Ergebnis: ../data/plaene_alt.json (gleicher Aufbau wie "sitzungen" in rohdaten.json)
"""

import argparse
import json
import os
import re
from datetime import date

import ris_ingolstadt as ris

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "data", "plaene_alt.json")

# Gremien, in denen Bauleitplaene beraten und beschlossen werden
GREMIUM = re.compile(r"Stadtrat|Stadtentwicklung|Planungsausschuss", re.I)
# Tagesordnungspunkte mit Planbezug
PLANBEZUG = re.compile(r"bebauungs|grünordnungsplan|baugebiet", re.I)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--von", default="2014-01", help="Startmonat YYYY-MM")
    parser.add_argument("--bis", default="2023-10", help="Endmonat YYYY-MM")
    args = parser.parse_args()

    basis = ris.QUELLEN["stadt"]["basis_url"]
    ids = []
    for jahr, monat in ris.monate(args.von, args.bis):
        seite = ris.hole(f"si0040.php?__cjahr={jahr}&__cmonat={monat}&__canz=1&__cselect=0", basis)
        neu = []
        for sid, titel in re.findall(r'si0056\.php\?__ksinr=(\d+)" title="Details anzeigen: ([^"]*)"', seite):
            if GREMIUM.search(titel) and sid not in ids and sid not in neu:
                neu.append(sid)
        ids.extend(neu)
        print(f"  Kalender {monat:02d}/{jahr}: {len(neu)} Sitzungen", flush=True)

    sitzungen = []
    for nummer, sid in enumerate(ids, 1):
        seite = ris.hole(f"si0056.php?__ksinr={sid}", basis)
        sitzung = ris.parse_sitzung(sid, seite, basis, "php")
        if not sitzung:
            continue
        sitzung["quelle"] = "stadt"
        sitzung["tops"] = [
            t for t in sitzung["tops"]
            if t["oeffentlich"] and PLANBEZUG.search(t["titel"] + " " + t.get("zusatz", ""))
        ]
        print(f"    [{nummer}/{len(ids)}] {sitzung['datum_anzeige']} {sitzung['gremium'][:44]:44} "
              f"{len(sitzung['tops'])} Plan-TOPs", flush=True)
        if not sitzung["tops"]:
            continue
        for top in sitzung["tops"]:
            kvonr = re.search(r"__kvonr=(\d+)", top["vorlage_url"] or "")
            if kvonr and not top["verfahren"]:
                top["beratungen"] = ris.parse_beratungen(
                    ris.hole(f"vo0053.php?__kvonr={kvonr.group(1)}", basis), basis, "php")
        sitzungen.append(sitzung)

    sitzungen.sort(key=lambda s: s["datum"], reverse=True)
    ergebnis = {
        "hinweis": "Nur Stadtrat und Planungsausschuss, nur Tagesordnungspunkte mit Planbezug. "
                   "Ergaenzt rohdaten.json fuer die Zeit davor.",
        "abgerufen_am": date.today().isoformat(),
        "zeitraum": {"von": args.von, "bis": args.bis},
        "anzahl_sitzungen": len(sitzungen),
        "anzahl_tops": sum(len(s["tops"]) for s in sitzungen),
        "sitzungen": sitzungen,
    }
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{ergebnis['anzahl_tops']} Plan-TOPs aus {len(sitzungen)} Sitzungen -> {ZIEL}")


if __name__ == "__main__":
    main()
