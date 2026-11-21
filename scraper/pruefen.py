#!/usr/bin/env python3
"""
Prueft die Daten auf Zusagen, die die Seite gegenueber Leserinnen macht.

Kein Testrahmen, keine Abhaengigkeiten: ein Lauf, eine Liste, ein Exit-Code.

    python3 pruefen.py            # alles pruefen
    python3 pruefen.py --streng   # Warnungen wie Fehler behandeln

Hintergrund: Die teuersten Fehler in diesem Projekt waren keine Abstuerze,
sondern stilles Verschwinden. Ein Filter, der mehr weglaesst als gedacht.
Eine Zusammenfassung, die die bessere Fassung verwirft. Beides faellt beim
Draufschauen nicht auf, weil das Ergebnis plausibel aussieht — es ist nur
unvollstaendig. Dagegen helfen Zusicherungen, die nachrechnen.
"""

import argparse
import base64
import collections
import json
import os
import re
import sys
import urllib.parse
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN_VZ = os.path.join(os.path.dirname(HIER), "data")

sys.path.insert(0, HIER)
from entwuerfe_bauen import ist_sammelueberschrift  # noqa: E402
from referenzen import bare_positionen, ist_beteiligung, top_ref  # noqa: E402
from feed_bauen import KEIN_STADTBEZIRK, KETTEN_QUELLEN, STAND_REIHENFOLGE, STATUS_ALLE  # noqa: E402
from ris_ingolstadt import HAUPT_QUELLE, QUELLEN  # noqa: E402

fehler, warnungen = [], []


def fehlt(text):
    fehler.append(text)


def warnt(text):
    warnungen.append(text)


def lade(name):
    with open(os.path.join(DATEN_VZ, name), encoding="utf-8") as f:
        return json.load(f)


# --------------------------------------------------------------- Zusicherungen

def p_referenzen(kur, index):
    """Jeder Kurationseintrag muss einen Tagesordnungspunkt haben.

    Ausnahme: ':antrag:'-Refs (siehe antraege_offen.py) haben nie einen
    Sitzungs-TOP -- das ist gerade ihr Sinn, solange sie nicht terminiert sind.
    """
    tot = [r for r in kur if r not in index and ":antrag:" not in r]
    if tot:
        fehlt(f"{len(tot)} Kurationseintraege zeigen ins Leere: {tot[:5]}")


def p_titel_anker(kur, index):
    """
    Jede Zusammenfassung haengt am Tagesordnungspunkt, zu dem sie geschrieben
    wurde.

    Der Schluessel ist Sitzung plus TOP-Nummer, bei unnummerierten Punkten die
    Position. Nummeriert die Stadt per Nachtrag um, zeigt er auf einen anderen
    Punkt — und der Text stuende unter dem falschen amtlichen Titel. Der
    gemerkte Titel ("titel_anker", siehe anker_setzen.py) macht das sichtbar.
    """
    import anker_setzen
    for ref, anker, aktuell in anker_setzen.abweichungen(kur, index):
        fehlt(
            f"{ref}: Zusammenfassung wurde zu {anker[:60]!r} geschrieben, unter dem "
            f"Schluessel steht jetzt {aktuell[:60]!r} — anker_setzen.py --umhaengen"
        )
    ohne = [r for r, k in kur.items() if r in index and not k.get("titel_anker")]
    if ohne:
        warnt(f"{len(ohne)} Eintraege ohne Titel-Anker (feed_bauen.py setzt ihn), z. B. {ohne[0]}")


def p_kein_verlust(kur, feed):
    """
    Kein ausgearbeiteter Text darf aus dem Feed verschwinden.

    Genau das ist passiert, als die Themen-Buendelung die zuerst eingetragene
    Fassung behielt: Die Einfache-Sprache-Fassung war weg, ohne Meldung.
    """
    im_feed = {e["ref"] for e in feed}
    themen = {e["thema"] for e in feed}
    for ref, k in kur.items():
        if ref in im_feed or not k.get("klartext_leicht"):
            continue
        # Darf fehlen, wenn das Thema durch einen anderen Eintrag vertreten ist
        # UND dieser ebenfalls Einfache Sprache hat.
        vertreter = [e for e in feed if e["ref"] != ref and e["thema"] in themen
                     and e.get("klartext_leicht")]
        if not vertreter:
            fehlt(f"Einfache-Sprache-Fassung verschwunden: {ref}")


def p_keine_doppelten_themen(feed):
    """Ein Thema, eine Karte."""
    zaehler = collections.Counter(e["thema"] for e in feed)
    mehrfach = [t for t, n in zaehler.items() if n > 1]
    if mehrfach:
        fehlt(f"{len(mehrfach)} Themen erscheinen mehrfach: {mehrfach[:5]}")


def p_achsenwerte(kur, achsen):
    """Nur Werte, die die Oberflaeche auch als Filter anbietet."""
    for achse in ("lebenslage", "bezirk", "anlass"):
        erlaubt = set(achsen[achse])
        for ref, k in kur.items():
            unbekannt = set(k.get(achse, [])) - erlaubt
            if unbekannt:
                fehlt(f"{ref}: unbekannte {achse}-Werte {sorted(unbekannt)}")


def p_pflichtfelder(kur):
    for ref, k in kur.items():
        if not k.get("klartext_titel", "").strip():
            fehlt(f"{ref}: klartext_titel ist leer")
        if k.get("klartext_leicht") and not k.get("klartext_titel_leicht"):
            warnt(f"{ref}: leichter Text ohne leichten Titel")


ERLAUBTE_HOSTS = {
    # Ratsinfo-/Kreistagsinfosysteme (SessionNet bei OWL-IT, dazu ein Mirror)
    "sessionnet.owl-it.de", "sessionnet.krz.de",
    # Webauftritte der Gebietskörperschaften (für weiterführende Links)
    "www.bueren.de", "bueren.de",
    "www.kreis-paderborn.de", "kreis-paderborn.de", "mein.kreis-paderborn.de",
}


def p_nur_erlaubte_hosts(feed):
    """
    Jeder Link im Feed zeigt auf die Ratsinfoportale von Stadt und Kreis — nichts sonst.

    Verteidigung gegen einen kuenftigen Parser- oder Kurationsfehler, der eine
    externe oder javascript:-URL einschleust. Aktuell schuetzt nur Zufall
    davor (absolut() in ris_ingolstadt.py stellt jeder Nicht-http-URL die
    Basis-Adresse voran) — das hier macht es zur Zusicherung.
    """
    fehlerhaft = []
    for e in feed:
        urls = [e.get("vorlage_url"), e.get("sitzung_url"), e.get("niederschrift_url")]
        urls += [d.get("url") for d in e.get("dokumente") or []]
        urls += [s.get("sitzung_url") for s in e.get("beratungsweg") or []]
        fehlerhaft += [f"{e['ref']}: {url!r}" for url in _fremde_urls(urls)]
    if fehlerhaft:
        fehlt(f"{len(fehlerhaft)} URLs ausserhalb der erlaubten Hosts: {fehlerhaft[:5]}")


def _fremde_urls(urls):
    """Alle URLs, die nicht per http(s) auf einen ERLAUBTE_HOSTS zeigen
    (leere Werte werden uebersprungen)."""
    for url in filter(None, urls):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("https", "http") or parsed.netloc not in ERLAUBTE_HOSTS:
            yield url


def p_antraege_hosts(antraege):
    """
    Dieselbe Zusicherung wie p_nur_erlaubte_hosts, fuer antraege.html: dort
    landen vorlage_url und pdf_url ungeprueft als href im Link.
    """
    fehlerhaft = []
    for partei, liste in antraege["parteien"].items():
        for a in liste:
            urls = [a.get("vorlage_url"), a.get("pdf_url")]
            fehlerhaft += [f"{partei} {a.get('vorlage')}: {url!r}" for url in _fremde_urls(urls)]
    if fehlerhaft:
        fehlt(f"antraege.json: {len(fehlerhaft)} URLs ausserhalb der erlaubten Hosts: {fehlerhaft[:5]}")


def p_haushalt_hosts(haushalt):
    """Die Quellenlinks der Haushaltsseite zeigen nur auf das Ratsinfoportal."""
    q = haushalt.get("quellen") or {}
    urls = list((q.get("anlage2_je_jahr") or {}).values())
    urls += [q.get("anlage1_aktuell"), q.get("anlage5_vorbericht_aktuell")]
    fehlerhaft = list(_fremde_urls(urls))
    if fehlerhaft:
        fehlt(f"haushalt.json: {len(fehlerhaft)} Quellen-URLs ausserhalb der erlaubten Hosts: {fehlerhaft[:5]}")


def p_hsk(hsk):
    """
    Zweite Pruefsumme fuer data/hsk.json (Haushaltssicherungskonzept), aus
    demselben Grund wie p_haushalt_summen: hsk_lesen.py prueft beim Lesen,
    aber eine liegengebliebene oder von Hand angefasste Datei faellt nur hier
    auf. Ausserdem landen vorlage_url und die Quellen als href auf hsk.html.
    """
    m = hsk["massnahmen"]
    kzv = hsk["bericht"]["konsolidierungsziel"]
    for i, j in enumerate(kzv["jahre"]):
        summe = sum((x["teur"].get(j) or 0) for x in m["verwaltungshaushalt"])
        gedruckt = m["summe_verwaltungshaushalt"][j]
        if abs(summe - gedruckt) > 1:
            fehlt(f"hsk.json {j}: Massnahmen summieren zu {summe:.1f}, Summe {gedruckt}")
        if abs(kzv["kzv"][i] + gedruckt - kzv["differenz_gesamt"][i]) > 1:
            fehlt(f"hsk.json {j}: Sparziel + Massnahmen ergibt nicht die gedruckte Differenz")
    for x in m["verwaltungshaushalt"]:
        if not x.get("titel") or not x.get("titel_leicht") or not x.get("bereich"):
            warnt(f"hsk.json: Massnahme {x['nr']} ohne Klartext/Einfache Sprache/Bereich")
        for satz in filter(None, (s.strip() for s in re.split(r"[.!?]", x.get("text_leicht") or ""))):
            if len(satz.split()) > 14:
                warnt(f"hsk.json {x['nr']}: Satz mit {len(satz.split())} Woertern (Einfache Sprache)")
    fw = hsk["freiwillige_leistungen"]
    summe = sum(p["euro"]["2026"] for p in fw["posten"])
    if abs(summe - fw["summe_euro"]["2026"]) > 0.5 * len(fw["posten"]):
        fehlt(f"hsk.json: freiwillige Leistungen 2026 summieren zu {summe}, gedruckt {fw['summe_euro']['2026']}")
    urls = [v for k, v in hsk["quellen"].items() if k != "vorlage_nr"]
    urls += [x.get("vorlage_url") for liste in ("verwaltungshaushalt", "personal", "vermoegenshaushalt")
             for x in m[liste]]
    urls += [e.get("url") for e in hsk["bericht"]["zeitleiste"]]
    urls += [b.get("url") for b in hsk["bericht"]["beratung"]]
    fehlerhaft = list(_fremde_urls(urls))
    if fehlerhaft:
        fehlt(f"hsk.json: {len(fehlerhaft)} URLs ausserhalb der erlaubten Hosts: {fehlerhaft[:5]}")


WEGE_DATEIEN = ("wege-netz", "wege-orte", "wege-zellen", "bezirke", "wege-adressen")
KARTE = None  # wird in p_wege() auf die erste karten/*.pmtiles gesetzt
KARTE_VZ = os.path.join(os.path.dirname(HIER), "karten")


def p_wege():
    """
    Kontrollzahlen fuer die Erreichbarkeitskarte (scraper/wege_bauen.py).

    Ein halber Overpass-Abruf oder ein falsch umgerechnetes Zensus-Gitter
    liefert Dateien, die gut aussehen: weniger Knoten, Zellen ohne Bezirk,
    zu wenige Einwohner. Deshalb die Groessenordnungen nachzaehlen.
    """
    da = [n for n in WEGE_DATEIEN if os.path.exists(os.path.join(DATEN_VZ, n + ".json"))]
    if not da:
        return
    for n in WEGE_DATEIEN:
        for endung in (".json", ".js"):
            if not os.path.exists(os.path.join(DATEN_VZ, n + endung)):
                fehlt(f"{n}{endung} fehlt (wege_bauen.py schreibt alle vier Dateien gemeinsam)")
    if len(da) < len(WEGE_DATEIEN):
        return
    netz, orte, zellen, bezirke, adressen = (lade(n + ".json") for n in WEGE_DATEIEN)
    if adressen["anzahl"] < 20000:
        fehlt(f"wege-adressen: nur {adressen['anzahl']} Adressen, erwartet ueber 20.000")
    # Grundkarte fuer wege.html: vorhanden, PMTiles v3, unter 50 MB (GitHub-Grenze je Datei)
    import glob
    karten = sorted(glob.glob(os.path.join(KARTE_VZ, "*.pmtiles")))
    if not karten:
        fehlt("karten/*.pmtiles fehlt (scraper/karte_bauen.py)")
    else:
        karte = karten[0]
        with open(karte, "rb") as f:
            if f.read(8) != b"PMTiles\x03":
                fehlt(f"{karte}: kein PMTiles-v3-Archiv")
        if os.path.getsize(karte) > 50 * 1024 * 1024:
            fehlt(f"{karte} ist groesser als 50 MB")
    if not 20000 <= netz["knoten_anzahl"] <= 200000:
        fehlt(f"wege-netz: {netz['knoten_anzahl']} Knoten, erwartet 20.000 bis 200.000")
    if len(netz["lat"]) != netz["knoten_anzahl"] or len(netz["von"]) != netz["kanten_anzahl"]:
        fehlt("wege-netz: Feldlaengen passen nicht zu knoten_anzahl/kanten_anzahl")
    if os.path.getsize(os.path.join(DATEN_VZ, "wege-netz.js")) > 2 * 1024 * 1024:
        fehlt("wege-netz.js ist groesser als 2 MB")
    # wege.js rechnet Personen und Bedingungen aus diesen Feldern und Codes
    for feld in ("klasse", "lit", "treppe", "oberflaeche", "gehweg", "querung", "schatten",
                 "gesperrt", "rollstuhl", "benannt"):
        if feld not in netz["kanten_felder"]:
            fehlt(f"wege-netz: Kantenfeld {feld} fehlt (braucht wege.js)")
    for feld in ("querung", "bordstein", "barriere"):
        if feld not in netz["knoten_felder"]:
            fehlt(f"wege-netz: Knotenfeld {feld} fehlt (braucht wege.js)")
    codes = netz["codes"]
    for feld, werte in (("klasse", ("sammelstrasse", "hauptstrasse", "fussweg", "pfad", "feldweg", "erschliessung")),
                        ("querung", ("ampel", "zebrastreifen")), ("gehweg", ("nein", "separat")),
                        ("lit", ("nein", "unbekannt")), ("oberflaeche", ("unbefestigt", "pflaster_grob")),
                        ("rollstuhl", ("nein",)), ("bordstein", ("hoch",))):
        for w in werte:
            if w not in codes.get(feld, []):
                fehlt(f"wege-netz: Code {feld}={w} fehlt (braucht wege.js)")
    n = netz["knoten_anzahl"]
    if any(o[5] and max(o[5]) >= n for o in orte["orte"]):
        fehlt("wege-orte: Einstiegsknoten ausserhalb des Netzes")
    pflicht = ("supermarkt", "apotheke", "hausarzt", "grundschule", "spielplatz", "haltestelle")
    zahl = {k["id"]: k["anzahl"] for k in orte["kategorien"]}
    for k in ("bolzplatz", "eis", "bahnhof", "touristinfo", "cafe", "hotel", "kirche", "trinkwasser", "sitzbank"):
        if zahl.get(k, 0) < 1:
            warnt(f"wege-orte: keine Orte der Kategorie {k} (Zielliste einer Person in wege.js)")
    for k in pflicht:
        if zahl.get(k, 0) < 5:
            fehlt(f"wege-orte: nur {zahl.get(k, 0)} Orte der Kategorie {k}")
    nrs = {int(f["properties"]["beznr"]) for f in bezirke["features"]}
    if not nrs:
        fehlt("bezirke: keine Bezirke/Gebiete gefunden")
    ohne = sum(1 for b in zellen["bezirk"] if b not in nrs)
    if ohne:
        fehlt(f"wege-zellen: {ohne} Zellen ohne gueltigen Bezirk")
    ew = sum(zellen["einwohner"])
    if not 20000 <= ew <= 1500000:
        fehlt(f"wege-zellen: {ew} Einwohner, Plausibilitaetsbereich 20.000 bis 1.500.000")
    p_wege_personen(zellen, orte)
    p_wege_phase5(netz, orte)
    p_wege_rad_inseln(netz, orte)


def _texte(wert):
    """Alle Zeichenketten in einer verschachtelten Struktur."""
    if isinstance(wert, str):
        yield wert
    elif isinstance(wert, dict):
        for v in wert.values():
            yield from _texte(v)
    elif isinstance(wert, (list, tuple)):
        for v in wert:
            yield from _texte(v)


def p_kein_html_in_fremddaten():
    """
    Namen aus OpenStreetMap, dem Fahrplan und dem Adressbestand duerfen kein
    HTML enthalten.

    Diese Daten schreibt nicht die Stadt und nicht dieses Projekt — in
    OpenStreetMap kann jede und jeder einen Ortsnamen aendern. Ein Name wie
    <img src=x onerror=...> waere nach dem naechsten Datenlauf Teil der Seite.
    wege.js maskiert bei der Ausgabe, wege_bauen.py filtert beim Bauen; das
    hier ist die dritte Sicherung und die einzige, die laut wird.
    """
    for name in ("wege-orte", "wege-adressen", "wege-bus", "bezirke", "orte", "baustellen"):
        pfad = os.path.join(DATEN_VZ, name + ".json")
        if not os.path.exists(pfad):
            continue
        # "<" gefolgt von Buchstabe, "/" oder "!" ist der Anfang eines Tags.
        # Ein blosses "<" (etwa "Abstand < 25 m" in einer Feldbeschreibung)
        # ist harmlos und kommt in den eigenen Formatangaben vor.
        # "format" ist die selbst geschriebene Feldbeschreibung der Datei
        # ("stadt:<id>") — kein Fremdtext.
        daten = {k: v for k, v in lade(name + ".json").items() if k != "format"}
        verdaechtig = [t for t in _texte(daten) if re.search(r"<[A-Za-z/!]", t)]
        if verdaechtig:
            fehlt(f"{name}.json: {len(verdaechtig)} Texte mit HTML-Tag, "
                  f"z. B. {verdaechtig[0][:60]!r}")


def p_wege_phase5(netz, orte):
    """
    Bus-Reichweite (oepnv_bauen.py), grosse Ziele, Kennzahlen ab Rathausplatz und
    die Daten der grafischen Fassung. Der Fahrplan steht unter CC BY-SA; fehlt die
    Lizenzangabe in der Datei, darf sie nicht veroeffentlicht werden.
    """
    grosse = orte.get("grosse_ziele") or []
    if len(grosse) < 6 or any(not g[3] for g in grosse):
        fehlt(f"wege-orte: {len(grosse)} grosse Ziele, erwartet 6 mit Einstiegsknoten")
    tw = sum(1 for o in orte["orte"] if orte["kategorien"][o[0]]["id"] == "trinkwasser")
    if tw < 10:
        warnt(f"wege-orte: nur {tw} Trinkwasserbrunnen (OSM + Stadt), erwartet mindestens 10")
    personen = lade("wege-personen.json")
    if not os.path.exists(os.path.join(DATEN_VZ, "wege-rathausplatz.json")):
        fehlt("wege-rathausplatz.json fehlt (wege_bauen.py)")
    else:
        rp = lade("wege-rathausplatz.json")["personen"]
        if set(rp) != set(personen["reihe"]):
            fehlt("wege-rathausplatz: Personen passen nicht zu wege-personen.json")
    with open(os.path.join(DATEN_VZ, "grafik.js"), encoding="utf-8") as f:
        if '"wege":' not in f.read():
            fehlt("grafik.js ohne Wege-Daten (grafik_bauen.py nach wege_bauen.py laufen lassen)")
    pfad = os.path.join(DATEN_VZ, "wege-bus.json")
    if not os.path.exists(pfad):
        warnt("wege-bus.json fehlt (oepnv_bauen.py); „Mit Bus“ funktioniert dann nicht")
        return
    bus = lade("wege-bus.json")
    if "CC BY-SA 3.0" not in bus.get("lizenz", "") or "INVG" not in bus.get("quelle", ""):
        fehlt("wege-bus: Lizenz- oder Quellenangabe des Fahrplans fehlt")
    if os.path.getsize(os.path.join(DATEN_VZ, "wege-bus.js")) > 1.5 * 1024 * 1024:
        fehlt("wege-bus.js ist groesser als 1,5 MB")
    h = bus["haltestellen"]
    if len(h) < 150:
        fehlt(f"wege-bus: nur {len(h)} Haltestellen im Stadtgebiet")
    if any(k >= netz["knoten_anzahl"] for x in h for k in x[3]):
        fehlt("wege-bus: Einstiegsknoten ausserhalb des Netzes (oepnv_bauen.py nach wege_bauen.py laufen lassen)")
    for f in bus["fenster"]:
        fid = f["id"]
        if len(bus["takt"].get(fid, [])) != len(h) or len(bus["ziele"].get(fid, [])) != len(h):
            fehlt(f"wege-bus {fid}: Takt oder Ziele passen nicht zur Zahl der Haltestellen")
            continue
        for liste in bus["ziele"][fid]:
            d = 0
            for v in liste:
                d += v // 32
                if d >= len(h) or v % 32 > bus["grenze_min"]:
                    fehlt(f"wege-bus {fid}: Ziel ausserhalb oder ueber {bus['grenze_min']} Minuten")
                    break


def p_wege_rad_inseln(netz, orte):
    """
    Rad im Netz (Merkmale rad und einbahn, Werte in wege-personen) und Einrasten
    ohne Inseln: Jede Haltestelle und jeder Ort braucht fuer jede Person einen
    Einstieg in einem Netzstueck, das sie nutzen kann. Sonst zeigt die Karte etwa
    fuer den Rollstuhl ab Hauptbahnhof gar nichts (Bahnsteig nur ueber Treppen).
    """
    for feld in ("rad", "einbahn"):
        if feld not in netz["kanten_felder"]:
            fehlt(f"wege-netz: Kantenmerkmal {feld} fehlt (wege_bauen.py neu laufen lassen)")
            return
    i_rad, i_ein = netz["kanten_felder"].index("rad"), netz["kanten_felder"].index("einbahn")
    je_typ = collections.Counter(netz["typ"])
    fahren = sum(n for t, n in je_typ.items() if netz["kanten_typen"][t][i_rad] == 0)
    einbahn = sum(n for t, n in je_typ.items() if netz["kanten_typen"][t][i_ein])
    if fahren < netz["kanten_anzahl"] // 2 or einbahn < 300:
        fehlt(f"wege-netz: Rad unplausibel ({fahren} fahrbare Kanten, {einbahn} Einbahn-Kanten von {netz['kanten_anzahl']})")
    personen = lade("wege-personen.json")
    rad = personen.get("verkehrsarten", {}).get("rad", {})
    if not rad.get("schieben_kmh") or "treppe_s" not in rad or not personen["allgemein"].get("insel_knoten_min"):
        fehlt("wege-personen: verkehrsarten.rad (schieben_kmh, treppe_s) oder allgemein.insel_knoten_min fehlt")
        return
    if not any(p.get("rad_kmh") for p in personen["personen"].values()):
        fehlt("wege-personen: keine Person mit rad_kmh")
    from wege_bauen import Typen, einrast_masken, netz_aus_datei, INF   # noqa: E402
    roh = netz_aus_datei()
    masken = einrast_masken(roh, personen)
    typen = Typen(roh)
    gross = [set() for _ in masken]
    for m, g in zip(masken, gross):
        for e, (a, b) in enumerate(typen.ende):
            if m[e] < INF:
                g.update((a, b))
    if os.path.exists(os.path.join(DATEN_VZ, "wege-bus.json")):
        h = lade("wege-bus.json")["haltestellen"]
        aus = [x[0] for x in h if any(not g.intersection(x[3]) for g in gross)]
        if aus:
            fehlt(f"wege-bus: {len(aus)} Haltestellen nur ueber eine Insel erreichbar, z. B. {aus[:3]} (oepnv_bauen.py)")
    aus = [o[1] or o[8] for o in orte["orte"] if any(not g.intersection(o[5]) for g in gross)]
    if len(aus) > 20:
        fehlt(f"wege-orte: {len(aus)} Orte fuer eine Person nur ueber eine Insel erreichbar, z. B. {aus[:3]}")


def p_wege_personen(zellen, orte):
    """
    Minuten je Person (wege-zellen-<person>), gemeinsame Werte (wege-personen)
    und Sparplan-Massnahmen (wege-massnahmen). Python und wege.js rechnen mit
    derselben Personendatei; laeuft die .js hinter der .json her, rechnet die
    Seite mit anderen Werten als die Zellen.
    """
    personen = lade("wege-personen.json")
    with open(os.path.join(DATEN_VZ, "wege-personen.js"), encoding="utf-8") as f:
        js = f.read()
    try:
        im_js = json.loads(js[js.index("=") + 1:].strip().rstrip(";"))
    except ValueError:
        im_js = None
    if im_js != personen:
        fehlt("wege-personen.js passt nicht zu wege-personen.json (wege_bauen.py neu laufen lassen)")
    kats = {k["id"] for k in orte["kategorien"]}
    n_orte = len(orte["orte"])
    for pid in personen["reihe"]:
        p = personen["personen"][pid]
        for k in p["ziele"]:
            if k not in kats:
                fehlt(f"wege-personen: {pid} hat unbekanntes Ziel {k}")
        name = f"wege-zellen-{pid}"
        if not os.path.exists(os.path.join(DATEN_VZ, name + ".json")):
            fehlt(f"{name}.json fehlt")
            continue
        daten = lade(name + ".json")
        for k in p["ziele"]:
            if k not in daten["kategorien"]:
                fehlt(f"{name}: keine Minuten fuer {k}")
                continue
            felder = daten["kategorien"][k]
            n1 = base64.b64decode(felder["n1"])
            o1 = base64.b64decode(felder["ort1"])
            if len(n1) != zellen["anzahl"] or len(o1) != 2 * zellen["anzahl"]:
                fehlt(f"{name} {k}: {len(n1)} Werte fuer {zellen['anzahl']} Zellen")
                continue
            orte_idx = {int.from_bytes(o1[i:i + 2], "little") for i in range(0, len(o1), 2)}
            if any(o != 65535 and o >= n_orte for o in orte_idx):
                fehlt(f"{name} {k}: Ortsindex ausserhalb von wege-orte (Dateien aus verschiedenen Laeufen?)")
    m = lade("wege-massnahmen.json")
    osm = {o[8] for o in orte["orte"] if len(o) > 8}
    for x in m["massnahmen"]:
        for o in x["orte"]:
            if o["osm"] not in osm:
                fehlt(f"wege-massnahmen {x['hsk_nr']}: Ort {o['name']} ({o['osm']}) nicht in wege-orte")
        if x["person"] not in personen["personen"] or x["wirkung"] not in ("naechster", "erreichbar"):
            fehlt(f"wege-massnahmen {x['hsk_nr']}: Person oder Wirkung unbekannt")
    hsk = lade("hsk.json")["massnahmen"]
    nrs = {(liste, y["nr"]) for liste in ("verwaltungshaushalt", "personal", "vermoegenshaushalt") for y in hsk[liste]}
    for x in m["massnahmen"]:
        if (x["hsk_liste"], x["hsk_nr"]) not in nrs:
            fehlt(f"wege-massnahmen: Massnahme {x['hsk_liste']} {x['hsk_nr']} steht nicht in hsk.json")
    if not os.path.exists(os.path.join(DATEN_VZ, "wege-massnahmen.js")):
        fehlt("wege-massnahmen.js fehlt (wege_bauen.py)")


def p_plaene():
    """Baugebiete und Plaene: Steckbriefe (plaene_bauen.py) und Umgriffe (plangebiete_holen.py)."""
    if not os.path.exists(os.path.join(DATEN_VZ, "plaene.json")):
        return
    plaene = lade("plaene.json")["plaene"]
    gebiete = lade("plangebiete.json")
    erlaubt = {"www.ingolstadt.de", "wms1.riwagis.de"}

    if "CC BY-ND" not in gebiete.get("lizenz", "") or not gebiete.get("namensnennung"):
        fehlt("plangebiete.json: Lizenz oder Namensnennung fehlt (Bauleitplaene Bayern, CC BY-ND 4.0)")
    if len(gebiete["features"]) < 400:
        fehlt(f"plangebiete.json: nur {len(gebiete['features'])} Umgriffe, erwartet ueber 400")
    for f in gebiete["features"]:
        g = f["geometry"]
        polygone = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polygone:
            for x, y in poly[0]:
                if not (11.0 < x < 11.8 and 48.5 < y < 49.0):
                    fehlt(f"plangebiete.json: Umgriff {f['properties']['nr']} liegt weit ausserhalb der Stadt")
                    break

    ids = [p["id"] for p in plaene]
    doppelt = {i for i in ids if ids.count(i) > 1}
    if doppelt:
        fehlt(f"plaene.json: doppelte Kennungen {sorted(doppelt)}")
    nummern = {p["nr"] for p in plaene}
    # Anlass der Seite: die beiden Plaene aus dem Antrag des BZA XI muessen auffindbar sein
    for nr in ("107 H", "196"):
        if nr not in nummern:
            fehlt(f"plaene.json: Plan {nr} fehlt (Am Samhof / Am Dachsberg)")
    for p in plaene:
        st = p["status"]
        if st["schritt"] == "kraft" and "inkraft" not in p["stationen"]:
            fehlt(f"Plan {p['nr']}: als geltend gefuehrt, aber ohne Datum des Inkrafttretens")
        if st["schritt"] == "kraft" and st["quelle"] != "land":
            fehlt(f"Plan {p['nr']}: 'in Kraft' darf nur vom Landesdienst kommen, nicht aus Ratsbeschluessen")
        if p["im_rat"] and not p["schritte"]:
            fehlt(f"Plan {p['nr']}: als Ratsplan gefuehrt, aber ohne Vorlage")
        urls = [z["url"] for z in p["zeichnungen"]] + [d["url"] for d in p["dazu"]]
        urls += [a["url"] for e in p["schritte"] for a in e["anlagen"]] + [e["vorlage_url"] for e in p["schritte"]]
        if p["amt"]:
            urls += [u for u in (p["amt"]["plan_url"], p["amt"]["text_url"]) if u]
        for u in urls:
            teile = urllib.parse.urlparse(u)
            if teile.scheme != "https" or teile.netloc not in erlaubt:
                fehlt(f"Plan {p['nr']}: Link auf nicht erlaubten Host: {u[:80]}")
                break
    ohne = [p["nr"] for p in plaene if p["im_rat"] and not p["umgriff"] and p["letzte_bewegung"] >= "2023-11"]
    if ohne:
        warnt(f"Plaene mit Ratsvorlage seit 11/2023 ohne Umgriff im Landesdienst: {', '.join(ohne)}")


def p_waerme():
    """Waermeplan: Flaechen der Stadt (waerme_bauen.py), Zaehlung je Bezirk und Links auf waerme.html."""
    if not os.path.exists(os.path.join(DATEN_VZ, "waerme.json")):
        return
    w = lade("waerme.json")
    flaechen = w["gebiete"]["features"]
    if len(flaechen) < 100:
        fehlt(f"waerme.json: nur {len(flaechen)} Flaechen, erwartet rund 140")
    erlaubt_klassen = set(w["klassen"]) - {"ohne"}
    for f in flaechen:
        if f["properties"]["klasse"] not in erlaubt_klassen:
            fehlt(f"waerme.json: Flaeche {f['properties']['id']} hat unbekannte Klasse {f['properties']['klasse']!r}")
        ring = f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"][0][0]
        if not all(11.2 < x < 11.62 and 48.64 < y < 48.87 for x, y in ring):
            fehlt(f"waerme.json: Flaeche {f['properties']['id']} liegt ausserhalb der Stadt")
    if not w["quelle"].get("herausgeber") or "2035.de" not in w["quelle"].get("datei", ""):
        fehlt("waerme.json: Herkunft der Flaechen fehlt (Stadt Ingolstadt, 2035.de)")
    a = w["adressen"]
    if sum(a["je_klasse"].values()) != a["gesamt"] or sum(b["adressen"] for b in w["bezirke"]) != a["gesamt"]:
        fehlt("waerme.json: Adressen je Klasse oder je Bezirk ergeben nicht die Gesamtzahl")
    if a["je_klasse"]["ohne"] > a["gesamt"] * 0.03:
        warnt(f"waerme.json: {a['je_klasse']['ohne']} Adressen liegen in keiner Flaeche; hat die Stadt die Flaechen geaendert?")
    if len(w["bezirke"]) != 12:
        fehlt(f"waerme.json: {len(w['bezirke'])} Bezirke statt 12")
    for teil in ("energietraeger_prozent", "ziel_2035_prozent", "fernwaerme_2035_prozent"):
        summe = sum(x["wert"] for x in w["bericht"][teil])
        if abs(summe - 100) > 0.6:
            fehlt(f"waerme.json: bericht.{teil} ergibt {summe:.1f} statt 100 Prozent")
    for r in w["rat"]:
        for u in (r["url"], r["niederschrift_url"]):
            if u and urllib.parse.urlparse(u).hostname != "www.ingolstadt.de":
                fehlt(f"waerme.json: Link im Abschnitt Rat fuehrt nicht zur Stadt: {u}")
    if not any(r["vorlage"] == w["beschluss"]["vorlage"] for r in w["rat"]):
        warnt("waerme.json: Der Beschluss des Waermeplans (V0651/24) steht nicht mehr im Feed")
    p_baublock()


def p_baublock():
    """Baubloecke des Energie-Atlas Bayern (baublock_bauen.py): Lage, Namensnennung und Summen."""
    if not os.path.exists(os.path.join(DATEN_VZ, "baublock.json")):
        warnt("baublock.json fehlt; waerme.html zeigt dann keine Baubloecke (baublock_bauen.py)")
        return
    b = lade("baublock.json")
    bloecke = b["bloecke"]["features"]
    if len(bloecke) < 1500:
        fehlt(f"baublock.json: nur {len(bloecke)} Bloecke, erwartet rund 2.000")
    if "Bayerisches Landesamt für Umwelt, www.lfu.bayern.de" not in b["quelle"].get("namensnennung", "") or b["quelle"].get("lizenz") != "CC BY 4.0":
        fehlt("baublock.json: Namensnennung des LfU oder Lizenz CC BY 4.0 fehlt")
    probe = b["flaechenprobe"]
    if probe["geprueft"] < 1500 or probe["abweichend"] > 0.03 * probe["geprueft"]:
        fehlt(f"baublock.json: Flaechenprobe {probe['abweichend']} von {probe['geprueft']} abweichend; Umrisse liegen vermutlich falsch")
    for f in bloecke:
        teile = [f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]
        x, y = teile[0][0][0]
        if not (11.2 < x < 11.6 and 48.65 < y < 48.85):
            fehlt(f"baublock.json: Block {f['properties']['id']} liegt ausserhalb der Stadt")
            break
    g = b["gesamt"]
    if sum(g["wohnungen_je_traeger"]) != g["wohnungen"] or sum(z["wohnungen"] for z in b["je_klasse"].values()) != g["wohnungen"]:
        fehlt("baublock.json: Wohnungen je Energietraeger oder je Klasse ergeben nicht die Gesamtzahl")
    if not 55000 < g["wohnungen"] < 90000:
        warnt(f"baublock.json: {g['wohnungen']} Wohnungen in Bloecken mit Angabe; erwartet rund 70.000")


def p_ketten(feed):
    """
    Vorgangsketten (feed_bauen.py::ketten_setzen): Eine Kette verbindet nur
    Punkte derselben Quelle (KETTEN_QUELLEN) und desselben Gremiums aus
    verschiedenen Sitzungen. Alles andere waere eine behauptete Verbindung,
    die es nicht gibt.
    """
    ketten = collections.defaultdict(list)
    for e in feed["eintraege"]:
        if e.get("kette"):
            ketten[e["kette"]].append(e)
    for kennung, gruppe in ketten.items():
        if len(gruppe) < 2:
            fehlt(f"Kette {kennung}: nur ein Eintrag")
        if any(e["quelle"] not in KETTEN_QUELLEN for e in gruppe) or len({e["gremium"] for e in gruppe}) != 1:
            fehlt(f"Kette {kennung}: verbindet Punkte verschiedener Gremien")
        if len({e["sitzung_url"] for e in gruppe}) < 2:
            fehlt(f"Kette {kennung}: alle Punkte stammen aus derselben Sitzung")
        if len(gruppe) > 8:
            warnt(f"Kette {kennung}: {len(gruppe)} Punkte; ist das ein Routinepunkt (KETTE_ROUTINE in feed_bauen.py)?")


def p_orte(feed):
    """
    Ortsschicht (orte_bauen.py): Jeder verortete Eintrag steht im Feed, jeder
    Ort liegt im Gebiet (Kreis Paderborn) und wird gebraucht, die Unfallzahlen sind in
    sich stimmig, und die Datei gehoert zum aktuellen Feed. Ohne die Datei
    zeigt die Startseite keine Orte; das ist eine Warnung, kein Fehler.
    """
    if not os.path.exists(os.path.join(DATEN_VZ, "orte.json")):
        warnt("orte.json fehlt; die Startseite zeigt dann keine Orte (orte_bauen.py)")
        return
    o = lade("orte.json")
    if o.get("stand_feed") != feed["feed_gebaut_am"]:
        fehlt(f"orte.json gehoert zum Feed vom {o.get('stand_feed')}, der Feed ist vom "
              f"{feed['feed_gebaut_am']}: orte_bauen.py nach feed_bauen.py laufen lassen")
    je_ref = {e["ref"]: e for e in feed["eintraege"]}
    benutzt = set()
    for ref, z in o["eintraege"].items():
        e = je_ref.get(ref)
        if not e:
            fehlt(f"orte.json: {ref} steht nicht im Feed")
            continue
        if e["quelle"] not in QUELLEN:
            fehlt(f"orte.json: {ref} gehoert zu einer unbekannten Quelle {e['quelle']!r}")
        if not z["o"] or any(not 0 <= i < len(o["orte"]) for i in z["o"]):
            fehlt(f"orte.json: {ref} zeigt auf einen Ort, den es nicht gibt")
            continue
        benutzt.update(z["o"])
    if len(benutzt) != len(o["orte"]):
        fehlt(f"orte.json: {len(o['orte']) - len(benutzt)} Orte ohne Eintrag")
    namen = collections.Counter(ort[1] for ort in o["orte"])
    doppelt = [n for n, k in namen.items() if k > 1]
    if doppelt:
        fehlt(f"orte.json: Ortsname mehrfach vergeben (der Name ist der Schluessel in der Adresszeile): {doppelt[:3]}")
    # Gebiet: Kreis Paderborn inklusive Büren, lat/lon in 1e-5 Grad
    for art, name, lat, lon, linien, unfall, zusatz in o["orte"]:
        if art not in "sakop" or not (5100000 < lat < 5200000 and 800000 < lon < 930000):
            fehlt(f"orte.json: {name!r} hat eine unbekannte Art oder liegt ausserhalb des Gebiets (Kreis Paderborn)")
        if art == "s" and not linien:
            fehlt(f"orte.json: Strasse {name!r} ohne Verlauf")
        if art == "p" and not (isinstance(zusatz, dict) and zusatz.get("nr")):
            fehlt(f"orte.json: Bebauungsplan {name!r} ohne Plannummer")
        if unfall and not (len(unfall) == 4 and unfall[0] >= max(unfall[1:]) and min(unfall) >= 0):
            fehlt(f"orte.json: Unfallzahlen von {name!r} passen nicht zusammen: {unfall}")
    u = o["unfall"]
    if "Statistische Ämter des Bundes und der Länder" not in u.get("vermerk", "") or u.get("lizenz") != "dl-de/by-2-0":
        fehlt("orte.json: Quellenvermerk oder Lizenz des Unfallatlas fehlt")
    if not 100 < u["anzahl"] < 60000:
        warnt(f"orte.json: {u['anzahl']} Unfaelle in {u['bis'] - u['von'] + 1} Jahren im Gebiet; Plausibilitaet pruefen")
    anteil = len(o["eintraege"]) / max(1, o["statistik"]["eintraege"])
    if not 0.15 < anteil < 0.45:
        warnt(f"orte.json: {anteil:.0%} der Eintraege verortet; erwartet etwa ein Viertel. Regeln in orte_bauen.py pruefen")

    # Verlauf jeder Strasse entpacken (wie seiten/index.js::ortInfo) und im Stadtgebiet halten
    for ort in o["orte"]:
        for linie in ort[4] or []:
            a = b = 0
            for k in range(0, len(linie), 2):
                a += linie[k]
                b += linie[k + 1]
                if not (5100000 < a < 5200000 and 800000 < b < 930000):
                    fehlt(f"orte.json: Verlauf von {ort[1]!r} liegt ausserhalb der Stadt (Kodierung der Linien?)")
                    break
    plan_ids = {p["id"] for p in lade("plaene.json")["plaene"]} if os.path.exists(os.path.join(DATEN_VZ, "plaene.json")) else None
    if plan_ids is not None:
        for ort in o["orte"]:
            if ort[0] == "p" and ort[6].get("id") not in plan_ids:
                fehlt(f"orte.json: {ort[1]!r} zeigt auf einen Plan, den plaene.html nicht kennt")
    # Das Schaubild der Startseite laedt unfaelle.js und baustellen.js fest; fehlt eine, faellt es ganz aus
    pfad = os.path.join(DATEN_VZ, "unfaelle.js")
    if not os.path.exists(pfad):
        warnt("unfaelle.js fehlt (orte_bauen.py hat keine Unfaelle geliefert oder ist nicht gelaufen)")
    else:
        with open(pfad, encoding="utf-8") as f:
            text = f.read()
        un = json.loads(text[text.index("{"):text.rindex("}") + 1])
        if len(un["punkte"]) != u["anzahl"] or "Statistische Ämter" not in un.get("quelle", "") or "dl-de/by-2-0" not in un.get("lizenz", ""):
            fehlt("unfaelle.js: Punktzahl passt nicht zu orte.json oder Quellenvermerk fehlt")
    if not os.path.exists(os.path.join(DATEN_VZ, "baustellen.json")) or not os.path.exists(os.path.join(DATEN_VZ, "baustellen.js")):
        warnt("baustellen.json/.js fehlt (kein BAUSTELLEN_URL in orte_bauen.py konfiguriert oder Abruf ohne Netz)")
        return
    b = lade("baustellen.json")
    for zeile in b["liste"]:
        lat, lon, wo, quer, beginn, ende = zeile[:6]
        if not (51.2 < lat < 51.9 and 8.1 < lon < 9.2):
            fehlt(f"baustellen.json: {wo!r} liegt ausserhalb des Gebiets (Kreis Paderborn)")
            break
        if any(d and not re.fullmatch(r"\d{4}-\d\d-\d\d", d) for d in (beginn, ende)):
            fehlt(f"baustellen.json: {wo!r} hat ein Datum, das kein ISO-Datum ist")
            break
    # Die Stadt liefert je Baustelle eine Kontaktadresse mit; sie gehoert nicht auf die Seite
    if any("@" in t for t in _texte(b["liste"])):
        fehlt("baustellen.json: enthaelt eine E-Mail-Adresse")
    alter = (date.today() - date.fromisoformat(b["stand"])).days
    if alter > 14:
        warnt(f"baustellen.json ist {alter} Tage alt; die Vorschau der Stadt reicht 14 Tage (orte_bauen.py)")


def p_nur_oeffentliche_tops(kur, index):
    """
    Nicht-oeffentliche Tagesordnungspunkte duerfen nie kuratiert werden.

    Aktuell schuetzt nur der Umstand davor, dass niemand einen 'N'-Punkt von
    Hand eingetragen hat — feed_bauen.py filtert nicht danach. Das hier macht
    es zur Zusicherung statt zum Zufall.
    """
    fehlerhaft = [
        ref for ref, (sitzung, top) in index.items()
        if ref in kur and not top["oeffentlich"]
    ]
    if fehlerhaft:
        fehlt(f"{len(fehlerhaft)} kuratierte Eintraege sind nicht oeffentlich: {fehlerhaft}")


def p_beschluesse_belegt(beschluesse, index):
    """
    Jeder mechanisch extrahierte Beschluss muss zu einem echten TOP gehoeren,
    und die im Text gefundene Vorlagen-Nummer muss mit der des TOPs
    uebereinstimmen — schuetzt gegen einen kuenftigen Regex-Fehltreffer in
    niederschriften_lesen.py, der eine Abstimmung der falschen Vorlage
    zuordnet (siehe dessen Docstring: Vorlagen-Nummer ist der Schluessel).
    """
    ohne_top = [ref for ref in beschluesse if ref not in index]
    if ohne_top:
        fehlt(f"{len(ohne_top)} Beschluesse zeigen ins Leere: {ohne_top[:5]}")

    falsche_vorlage = [
        ref for ref, b in beschluesse.items()
        if ref in index and index[ref][1].get("vorlage") != b.get("vorlage")
    ]
    if falsche_vorlage:
        fehlt(
            f"{len(falsche_vorlage)} Beschluesse nennen eine andere Vorlage "
            f"als ihr TOP: {falsche_vorlage[:5]}"
        )

    # Befunde der Kontrolle 2026-09-30 als Zusicherung: bekannte Ergebnisse,
    # keine Seitenfuesse/Sitzungsenden im Beschlusstext, und die Formel am
    # Anfang des Texts ist dieselbe, die als "formel" gespeichert ist (sonst
    # stammt sie aus einer anderen Abstimmung).
    unbekannt = [r for r, b in beschluesse.items()
                 if b.get("ergebnis") not in ("beschlossen", "abgelehnt", "teilweise")]
    if unbekannt:
        fehlt(f"{len(unbekannt)} Beschluesse mit unbekanntem Ergebnis: {unbekannt[:5]}")
    reste = [r for r, b in beschluesse.items()
             if re.search(r"Niederschrift Sitzung|Hiermit ist der (nicht)?öffentliche Teil", b["text"])]
    if reste:
        warnt(f"{len(reste)} Beschlusstexte mit Seitenfuss/Sitzungsende: {reste[:5]}")
    formel_fremd = [
        r for r, b in beschluesse.items()
        if b.get("weg") in ("abstimmung", "vorlage-block", "gemeinsame-beratung")
        and not re.match(r"\s*(?:Ziffer \d+:\s*)?" + re.escape(b["formel"]), b["text"])
    ]
    if formel_fremd:
        fehlt(f"{len(formel_fremd)} Beschluesse, deren Formel nicht den Text eroeffnet: {formel_fremd[:5]}")


BEHAUPTET_BESCHLUSS = re.compile(
    r"\b(hat beschlossen|wurde beschlossen|ist beschlossen|"
    r"hat entschieden|wurde entschieden|beschloss)\b", re.I
)


def p_kein_behaupteter_beschluss(kur):
    """
    Die Quelle belegt nur, dass beraten wurde — nicht, wie entschieden wurde.
    Ein Text, der ein Ergebnis behauptet, geht ueber die Daten hinaus.
    """
    for ref, k in kur.items():
        for feld in ("klartext", "klartext_leicht"):
            treffer = BEHAUPTET_BESCHLUSS.search(k.get(feld) or "")
            if treffer:
                fehlt(f"{ref}: {feld} behauptet ein Ergebnis ({treffer.group(0)!r})")


def p_laenge(kur, mindestens=4):
    """
    KURATION.md verlangt 4 bis 7 Saetze in normaler Sprache. Eine Warnung in
    der Summe statt je Eintrag — sonst ginge alles andere darin unter.
    """
    from feed_bauen import ist_duenn
    texte = [k["klartext"] for k in kur.values() if not ist_duenn(k)]
    kurz = sum(
        1 for t in texte
        if len([s for s in re.split(r"(?<=[.!?])\s+", t.strip()) if s]) < mindestens
    )
    if kurz:
        warnt(
            f"{kurz} von {len(texte)} Zusammenfassungen haben weniger als {mindestens} Saetze "
            "(KURATION.md nennt 4 bis 7) — Regel anpassen oder Texte nachziehen"
        )


def p_leichte_sprache(kur, grenze=14):
    """Satzlaenge ist das eine Merkmal, das sich maschinell pruefen laesst."""
    for ref, k in kur.items():
        text = k.get("klartext_leicht") or ""
        for satz in filter(None, (s.strip() for s in re.split(r"[.!?]", text))):
            n = len(satz.split())
            if n > grenze:
                warnt(f"{ref}: Satz mit {n} Woertern (Einfache Sprache) — {satz[:52]}…")


def p_haushalt_summen(haushalt):
    """
    Zweite, unabhaengige Pruefsumme fuer data/haushalt.json — schuetzt gegen
    einen kuenftigen haushalt_lesen.py, der die Pruefung beim Parsen selbst
    umgeht oder eine veraltete Datei liegen laesst, die nie neu geprueft wurde.
    """
    for jahr_str, d in haushalt["jahre"].items():
        hg = d["hauptgruppen"]
        if len(hg) != 10:
            fehlt(f"Haushalt {jahr_str}: nur {len(hg)}/10 Hauptgruppen")
            continue
        summe_e = sum(hg[c]["ansatz"] for c in "0123")
        summe_a = sum(hg[c]["ansatz"] for c in "456789")
        if round(summe_e, 2) != round(d["summe_einnahmen"], 2):
            fehlt(f"Haushalt {jahr_str}: Hauptgruppen 0-3 summieren zu {summe_e}, "
                  f"aber summe_einnahmen ist {d['summe_einnahmen']}")
        if round(summe_a, 2) != round(d["summe_ausgaben"], 2):
            fehlt(f"Haushalt {jahr_str}: Hauptgruppen 4-9 summieren zu {summe_a}, "
                  f"aber summe_ausgaben ist {d['summe_ausgaben']}")

    vwh = haushalt["verwaltungs_vermoegenshaushalt_aktuell"]
    aktuell = haushalt["jahre"][str(haushalt["aktuelles_jahr"])]
    kontrolle_e = vwh["verwaltungshaushalt_einnahmen"] + vwh["vermoegenshaushalt_einnahmen"]
    kontrolle_a = vwh["verwaltungshaushalt_ausgaben"] + vwh["vermoegenshaushalt_ausgaben"]
    if round(kontrolle_e, 2) != round(aktuell["summe_einnahmen"], 2):
        fehlt(f"Haushalt: Verwaltungs- + Vermoegenshaushalt Einnahmen ({kontrolle_e}) "
              f"stimmt nicht mit Summe Einnahmen ({aktuell['summe_einnahmen']}) ueberein")
    if round(kontrolle_a, 2) != round(aktuell["summe_ausgaben"], 2):
        fehlt(f"Haushalt: Verwaltungs- + Vermoegenshaushalt Ausgaben ({kontrolle_a}) "
              f"stimmt nicht mit Summe Ausgaben ({aktuell['summe_ausgaben']}) ueberein")


def p_oberflaeche(feed):
    """Zusagen aus dem Nutzertest 2026-09-30, die index.html voraussetzt.

    - Jeder Stand ist einer der bekannten, verstaendlichen Werte — kein
      "Ohne Vorlage" mehr, keine Paragrafentexte ("beschließend nach § 7").
    - Jede Ebene (Quelle) ist eine eigene Filterachse.
    - Keine Termine vor dem Bautag unter "Naechste Termine".
    - Jeder Eintrag traegt "ebene" und "duenn" (Buendelung je Sitzung).
    """
    eintraege = feed["eintraege"]
    fremd = collections.Counter(
        e["stand"] for e in eintraege if e["stand"] not in STAND_REIHENFOLGE
    )
    if fremd:
        fehlt(f"Unbekannte Staende auf Karten (fehlen im Filter): {dict(fremd)}")
    ohne_status = collections.Counter(
        e.get("status") for e in eintraege if e.get("status") not in STATUS_ALLE
    )
    if ohne_status:
        fehlt(f"Eintraege ohne bekannten Status (Karten-Hinweis fehlt): {dict(ohne_status)}")
    # "Entschieden" nur mit Beleg: woertlicher Beschlusstext und Link auf
    # genau das Protokoll, aus dem er stammt.
    unbelegt = [
        e["ref"] for e in eintraege
        if e.get("status") == "Entschieden" and not (e.get("beschluss") and e.get("niederschrift_url"))
    ]
    if unbelegt:
        fehlt(f"{len(unbelegt)} Eintraege 'Entschieden' ohne Beschlusstext/Protokoll: {unbelegt[:3]}")
    falsch = [b for b in feed["achsen"]["bezirk"] if b in KEIN_STADTBEZIRK]
    if falsch:
        fehlt(f"Keine Stadtbezirke in der Bezirksachse: {falsch}")
    fremd = list(_fremde_urls(t.get("tagesordnung_url") for t in feed.get("kommende_termine", [])))
    if fremd:
        fehlt(f"Termine mit Link ausserhalb der erlaubten Hosts: {fremd[:3]}")
    n = feed["statistik"].get("portale")
    if n != len(QUELLEN):
        warnt(f"Kopfzahl Portale ist {n}, erwartet {len(QUELLEN)}")
    alt = [t for t in feed.get("kommende_termine", [])
           if t["datum"] < feed["feed_gebaut_am"]]
    if alt:
        fehlt(f"{len(alt)} vergangene Termine unter 'Naechste Termine'")
    ohne = [e["ref"] for e in eintraege if "ebene" not in e or "duenn" not in e]
    if ohne:
        fehlt(f"{len(ohne)} Eintraege ohne 'ebene'/'duenn': {ohne[:3]}")


def p_abdeckung(roh, feed):
    """
    Jeder Sachpunkt ist entweder im Feed oder aus einem benannten Grund
    nicht drin. 'Faellt einfach weg' darf es nicht geben.
    """
    gruende = collections.Counter()
    im_feed_refs = {e["ref"] for e in feed}
    im_feed_themen = {e["thema"] for e in feed}
    sys.path.insert(0, HIER)
    from feed_bauen import thema_schluessel
    from referenzen import bare_positionen, top_ref

    for s in roh["sitzungen"]:
        q = s.get("quelle", HAUPT_QUELLE)
        bare_pos = bare_positionen(s)
        for t in s["tops"]:
            ref = top_ref(q, s, t, bare_pos)
            schluessel = thema_schluessel(q, t) or ref
            if ref in im_feed_refs or schluessel in im_feed_themen:
                gruende["im Feed"] += 1
            elif not t["oeffentlich"]:
                gruende["nicht oeffentlich"] += 1
            elif t["verfahren"]:
                gruende["Sitzungsroutine"] += 1
            elif ist_beteiligung(s["gremium"]):
                gruende["Aufsichtsrat/Zweckverband"] += 1
            elif len(t["titel"]) < 12:
                gruende["Titel zu kurz"] += 1
            elif ist_sammelueberschrift(t["titel"]):
                gruende["Sammelueberschrift"] += 1
            else:
                gruende["NOCH NICHT AUFBEREITET"] += 1
    return gruende


# ------------------------------------------------------------------- Ablauf

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--streng", action="store_true",
                    help="Warnungen wie Fehler behandeln")
    args = ap.parse_args()

    roh = lade("rohdaten.json")
    kuration = lade("kuration.json")
    feed = lade("feed.json")
    kur = kuration["eintraege"]

    index = {}
    for s in roh["sitzungen"]:
        q = s.get("quelle", HAUPT_QUELLE)
        bare_pos = bare_positionen(s)
        for t in s["tops"]:
            index[top_ref(q, s, t, bare_pos)] = (s, t)

    p_referenzen(kur, index)
    p_titel_anker(kur, index)
    p_kein_verlust(kur, feed["eintraege"])
    p_keine_doppelten_themen(feed["eintraege"])
    p_achsenwerte(kur, kuration["_achsen"])
    p_pflichtfelder(kur)
    p_kein_behaupteter_beschluss(kur)
    p_laenge(kur)
    p_leichte_sprache(kur)
    p_nur_erlaubte_hosts(feed["eintraege"])
    p_nur_oeffentliche_tops(kur, index)
    if os.path.exists(os.path.join(DATEN_VZ, "beschluesse.json")):
        p_beschluesse_belegt(lade("beschluesse.json"), index)
    if os.path.exists(os.path.join(DATEN_VZ, "haushalt.json")):
        haushalt = lade("haushalt.json")
        p_haushalt_summen(haushalt)
        p_haushalt_hosts(haushalt)
    if os.path.exists(os.path.join(DATEN_VZ, "hsk.json")):
        p_hsk(lade("hsk.json"))
    if os.path.exists(os.path.join(DATEN_VZ, "antraege.json")):
        p_antraege_hosts(lade("antraege.json"))
    p_wege()
    p_kein_html_in_fremddaten()
    p_plaene()
    p_waerme()
    p_ketten(feed)
    p_orte(feed)
    p_oberflaeche(feed)
    gruende = p_abdeckung(roh, feed["eintraege"])

    print("Abdeckung aller Tagesordnungspunkte")
    for grund, n in gruende.most_common():
        print(f"  {n:5}  {grund}")
    print(f"  {sum(gruende.values()):5}  gesamt\n")

    for w in warnungen:
        print(f"  warnung: {w}")
    for f in fehler:
        print(f"  FEHLER : {f}")

    print()
    if fehler:
        print(f"{len(fehler)} Fehler, {len(warnungen)} Warnungen — nicht in Ordnung.")
        return 1
    if warnungen and args.streng:
        print(f"{len(warnungen)} Warnungen, --streng — nicht in Ordnung.")
        return 1
    print(f"Alles in Ordnung ({len(warnungen)} Warnungen).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
