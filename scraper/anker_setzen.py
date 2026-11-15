#!/usr/bin/env python3
"""
Titel-Anker fuer data/kuration.json.

Warum: Der Schluessel eines Eintrags ist "<quelle>:<sitzung>#<TOP-Nummer>",
bei unnummerierten Punkten die Position in der Tagesordnung ("Ö3"). Schiebt
die Stadt per Nachtrag einen Punkt ein oder nummeriert um, zeigt derselbe
Schluessel ploetzlich auf einen anderen Tagesordnungspunkt — und die
Zusammenfassung steht unter dem falschen amtlichen Titel. Niemand merkt es.

Deshalb merkt sich jeder Eintrag in "titel_anker" den amtlichen Titel, zu dem
er geschrieben wurde. pruefen.py vergleicht Anker und aktuellen Titel und
bricht ab, wenn sie auseinanderlaufen.

Verwendung:
    python3 anker_setzen.py              # fehlende Anker setzen (aktueller Titel)
    python3 anker_setzen.py --zeigen     # Abweichungen nur auflisten
    python3 anker_setzen.py --umhaengen  # verrutschte Eintraege an den Punkt
                                         # mit dem passenden Titel haengen
    python3 anker_setzen.py --bestaetigen REF [REF ...]
                                         # Titel wurde nur redaktionell geaendert:
                                         # Anker auf den neuen Titel setzen

feed_bauen.py ruft die erste Form selbst auf; neue Eintraege bekommen ihren
Anker also beim naechsten Feed-Bau, ohne dass man daran denken muss.
"""

import argparse
import json
import os
import re
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN_VZ = os.path.join(os.path.dirname(HIER), "data")

sys.path.insert(0, HIER)
from referenzen import bare_positionen, top_ref  # noqa: E402


def norm(titel):
    """Vergleichsform: Gross/Klein und Leerraum zaehlen nicht."""
    return re.sub(r"\s+", " ", titel or "").strip().casefold()


def top_index(roh):
    """{ref: (sitzung, top)} ueber alle Tagesordnungspunkte."""
    index = {}
    for sitzung in roh["sitzungen"]:
        quelle = sitzung.get("quelle", "stadt")
        bare_pos = bare_positionen(sitzung)
        for top in sitzung["tops"]:
            index[top_ref(quelle, sitzung, top, bare_pos)] = (sitzung, top)
    return index


def abweichungen(eintraege, index):
    """[(ref, anker, aktueller_titel)] fuer Eintraege, deren Anker nicht mehr
    zum Tagesordnungspunkt unter ihrem Schluessel passt."""
    liste = []
    for ref, kur in eintraege.items():
        anker = kur.get("titel_anker")
        if not anker or ref not in index:
            continue
        aktuell = index[ref][1]["titel"]
        if norm(anker) != norm(aktuell):
            liste.append((ref, anker, aktuell))
    return liste


def fehlende_setzen(eintraege, index):
    """Setzt den Anker, wo er fehlt. Liefert die Anzahl."""
    n = 0
    for ref, kur in eintraege.items():
        if kur.get("titel_anker") or ref not in index:
            continue
        kur["titel_anker"] = index[ref][1]["titel"]
        n += 1
    return n


def umhaengen(eintraege, index):
    """
    Haengt verrutschte Eintraege an den Punkt derselben Sitzung, dessen Titel
    zum Anker passt. Nur wenn dieser Punkt eindeutig ist und dort kein anderer,
    weiterhin passender Eintrag sitzt. Alle Verschiebungen werden erst
    berechnet und dann gemeinsam ausgefuehrt — bei einer Umnummerierung rueckt
    meist eine ganze Kette um eins weiter.
    """
    je_sitzung = {}
    for ref, (sitzung, top) in index.items():
        je_sitzung.setdefault(ref.split("#")[0], []).append((ref, norm(top["titel"])))

    plan, offen = {}, []
    for ref, anker, _aktuell in abweichungen(eintraege, index):
        kandidaten = [r for r, t in je_sitzung[ref.split("#")[0]] if t == norm(anker)]
        if len(kandidaten) == 1:
            plan[ref] = kandidaten[0]
        else:
            offen.append((ref, anker, len(kandidaten)))

    verrutscht = set(plan)
    for alt, neu in list(plan.items()):
        besetzt = neu in eintraege and neu not in verrutscht
        if besetzt:
            offen.append((alt, eintraege[alt]["titel_anker"], "Ziel besetzt: " + neu))
            del plan[alt]

    verschoben = {neu: eintraege[alt] for alt, neu in plan.items()}
    for alt in plan:
        del eintraege[alt]
    eintraege.update(verschoben)
    return plan, offen


def speichere(kuration, pfad):
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(kuration, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--zeigen", action="store_true", help="Abweichungen nur auflisten")
    parser.add_argument("--umhaengen", action="store_true",
                        help="verrutschte Eintraege an den passenden Punkt haengen")
    parser.add_argument("--bestaetigen", nargs="+", metavar="REF",
                        help="Anker dieser Eintraege auf den aktuellen Titel setzen")
    args = parser.parse_args()

    kur_pfad = os.path.join(DATEN_VZ, "kuration.json")
    with open(kur_pfad, encoding="utf-8") as f:
        kuration = json.load(f)
    with open(os.path.join(DATEN_VZ, "rohdaten.json"), encoding="utf-8") as f:
        index = top_index(json.load(f))
    eintraege = kuration["eintraege"]

    if args.zeigen:
        liste = abweichungen(eintraege, index)
        for ref, anker, aktuell in liste:
            print(f"{ref}\n   geschrieben zu: {anker}\n   steht jetzt bei: {aktuell}")
        print(f"{len(liste)} Abweichungen")
        return 1 if liste else 0

    if args.bestaetigen:
        for ref in args.bestaetigen:
            if ref not in eintraege or ref not in index:
                print(f"unbekannt: {ref}")
                continue
            eintraege[ref]["titel_anker"] = index[ref][1]["titel"]
            print(f"Anker neu gesetzt: {ref}")
        speichere(kuration, kur_pfad)
        return 0

    if args.umhaengen:
        plan, offen = umhaengen(eintraege, index)
        for alt, neu in plan.items():
            print(f"umgehaengt: {alt} -> {neu}")
        for ref, anker, grund in offen:
            print(f"nicht eindeutig, bitte von Hand: {ref} ({grund}) — {anker}")
        if plan:
            speichere(kuration, kur_pfad)
        return 1 if offen else 0

    n = fehlende_setzen(eintraege, index)
    if n:
        speichere(kuration, kur_pfad)
    print(f"{n} Anker gesetzt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
