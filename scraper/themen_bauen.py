#!/usr/bin/env python3
"""
Baut die Themen-Kacheln (Startseite und themen.html) aus dem Feed:
je Lebenslage eine Kachel mit Zahl der Einträge, verlinkt auf die gefilterte
Startseite. Im Originalprojekt kamen die Kacheln aus den Datendateien der
einzelnen Themenseiten (Haushalt, Klima ...); diese Portierung hat nur den
Feed, deshalb wird hier daraus gebaut.

    python3 themen_bauen.py        # nach jedem feed_bauen.py-Lauf

Ergebnis: ../data/themen.js (window.THEMEN_DATEN)
"""

import json
import os
import re

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN_VZ = os.path.join(os.path.dirname(HIER), "data")


def lade(name):
    with open(os.path.join(DATEN_VZ, name), encoding="utf-8") as f:
        return json.load(f)


def de(zahl, nachkomma=0):
    """Deutsche Schreibweise: 1.234,5"""
    return f"{zahl:,.{nachkomma}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def main():
    """Kacheln aus dem Feed: je Lebenslage die Zahl der Einträge, verlinkt
    auf die gefilterte Startseite (index.html?lebenslage=...)."""
    from urllib.parse import quote
    feed = lade("feed.json")
    zaehler = {}
    for e in feed["eintraege"]:
        if e.get("duenn"):
            continue   # nur Titel, keine Zusammenfassung — nicht als "Thema" zaehlen
        for w in e.get("lebenslage") or []:
            zaehler[w] = zaehler.get(w, 0) + 1
    reihenfolge = feed["achsen"].get("lebenslage") or []
    werte = [w for w in reihenfolge if zaehler.get(w)] + sorted(w for w in zaehler if w not in reihenfolge)
    werte.sort(key=lambda w: -zaehler[w])
    palette = ["#003e59", "#5b4b8a", "#b00e2b", "#7a2e55", "#2e7d4f", "#b8430f", "#4d5a1f",
               "#96551f", "#2f5f86", "#1d6a6f", "#14505c", "#6b3f69"]
    kacheln = []
    for i, w in enumerate(werte):
        n = zaehler[w]
        kacheln.append(dict(
            href="index.html?lebenslage=" + quote(w),
            farbe=palette[i % len(palette)],
            titel=w, titel_l=w,
            zahl=f"{de(n)} {'Thema' if n == 1 else 'Themen'}",
            text="in Rat und Kreistag auf der Tagesordnung – hier alle Einträge dazu.",
            text_l="Dazu gibt es hier alle Themen.",
        ))
    if not kacheln:
        kacheln.append(dict(
            href="index.html", farbe="#003e59",
            titel="Noch keine Themen", titel_l="Noch keine Themen",
            zahl="0", text="Sobald der Feed gebaut ist, stehen hier die Lebenslagen.",
            text_l="Hier stehen später die Themen."))

    ziel = os.path.join(DATEN_VZ, "themen.js")
    with open(ziel, "w", encoding="utf-8") as f:
        f.write("/* Erzeugt von scraper/themen_bauen.py -- nicht von Hand aendern. */\n")
        f.write("window.THEMEN_DATEN = ")
        f.write(json.dumps(kacheln, ensure_ascii=False, indent=1))
        f.write(";\n")
    print(f"Geschrieben: {ziel}")
    for k in kacheln:
        print(f"  {k['titel']:24} {k['zahl']}")


if __name__ == "__main__":
    main()
