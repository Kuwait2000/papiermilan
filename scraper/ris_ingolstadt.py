#!/usr/bin/env python3
"""
Liest Ratsinformationssysteme auf Basis von SessionNet / Somacos "Session" aus.

Zwei Quellen, gleiche Software (SessionNet), aber zwei Hoster mit
unterschiedlicher Auslieferungsvariante, deshalb derselbe Parser mit
Basis-URL und Dateiendung als Konfigurationswerte je Quelle:
  stadt_bueren    — Rat und Ausschuesse der Stadt Bueren (gremien.info, .php)
  kreis_paderborn — Kreistag und Ausschuesse des Kreises Paderborn (OWL-IT, .asp)

(Adaptiert von der Ingolstadt-Fassung dieses Skripts; siehe README.md.)

Nur oeffentlich zugaengliche Seiten, keine Anmeldung, kein Verwaltungszugang.
Vor dem ersten Lauf robots.txt der Quelle pruefen, z. B.:
    curl -s https://bueren.gremien.info/robots.txt

Verwendung:
    python3 ris_ingolstadt.py                        # alle Quellen, letzte 3 Monate
    python3 ris_ingolstadt.py --von 2026-01 --bis 2026-07
    python3 ris_ingolstadt.py --quelle stadt_bueren    # nur Rat/Ausschuesse Bueren
    python3 ris_ingolstadt.py --quelle kreis_paderborn # nur Kreistag Paderborn
    python3 ris_ingolstadt.py --ohne-beratungen      # Beratungsweg nicht laden
    python3 ris_ingolstadt.py --no-cache             # Cache ignorieren (alles neu)

Ohne --no-cache veralten nur die Seiten, die sich noch aendern koennen:
Kalender ab dem Vormonat, Sitzungen der letzten 70 Tage und alle kommenden,
Beratungswege laufender Vorlagen. Siehe FRISCH_STUNDEN.

Ergebnis: ../data/rohdaten.json
"""

import argparse
import html
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import date

# IPv4 zuerst versuchen. Manche Hosts haben auch eine IPv6-Adresse, die von
# manchen Anschluessen aus nicht antwortet; urllib probiert sie zuerst und
# wartet dann den vollen Timeout ab, bevor es auf IPv4 ausweicht. IPv6 bleibt
# als Ausweichadresse erhalten. Gilt fuer alle Skripte, die dieses Modul
# importieren, also auch fuer die PDF-Abrufe in niederschriften_lesen.py und
# vorlagen_holen.py.
_getaddrinfo = socket.getaddrinfo


def _ipv4_zuerst(*args, **kwargs):
    adressen = _getaddrinfo(*args, **kwargs)
    return sorted(adressen, key=lambda a: a[0] != socket.AF_INET)


socket.getaddrinfo = _ipv4_zuerst

QUELLEN = {
    "stadt_bueren": {
        "name": "Ratsinformationssystem der Stadt Bueren — Rat und Ausschuesse",
        "software": "SessionNet (Somacos GmbH & Co. KG, gehostet auf gremien.info)",
        "basis_url": "https://bueren.gremien.info",
        "endung": "php",
    },
    "kreis_paderborn": {
        "name": "Kreistagsinformationssystem des Kreises Paderborn — Kreistag und Ausschuesse",
        "software": "SessionNet (Somacos GmbH & Co. KG, gehostet bei der OWL-IT)",
        "basis_url": "https://sessionnet.owl-it.de/kreis_paderborn/bi",
        "endung": "asp",
    },
}

# Die Quelle, deren Gremien den Hauptteil der Seite bilden (Rat bzw. Kreistag).
HAUPT_QUELLE = "stadt_bueren"

USER_AGENT = (
    "PapierPanther-Bueren-KreisPaderborn/1.0 (Buergerinformation; "
    "+https://DEINE-DOMAIN.example/impressum.html)"
)
PAUSE_SEKUNDEN = 1.2  # hoeflich bleiben

HIER = os.path.dirname(os.path.abspath(__file__))
CACHE_VZ = os.path.join(HIER, ".cache")
DATEN_VZ = os.path.join(os.path.dirname(HIER), "data")

sys.path.insert(0, HIER)
from referenzen import ist_beteiligung  # noqa: E402

MONATSNAMEN = {
    1: "Januar", 2: "Februar", 3: "Maerz", 4: "April", 5: "Mai", 6: "Juni",
    7: "Juli", 8: "August", 9: "September", 10: "Oktober", 11: "November",
    12: "Dezember",
}

# Tagesordnungspunkte, die reine Sitzungsroutine sind. Sie bleiben in den
# Rohdaten, werden aber als "verfahren" markiert und nicht aufbereitet.
# Vor allem die BZA-Tagesordnungen bestehen zur Haelfte daraus.
VERFAHREN_MUSTER = [
    r"^Er(ö|oe)ffnung",
    r"^Begr(ü|ue)ßung",
    r"Feststellung der Beschlussf(ä|ae)higkeit",
    r"Genehmigung des letzten Sitzungsprotokolls",
    r"Genehmigung der Niederschrift",
    r"(Best(ä|ae)tigung|Erg(ä|ae)nzung).{0,30}letzten Protokolls",
    r"^Wahlen?\b.{0,40}Sprecher",
    r"Beschluss der Tagesordnung",
    r"^Verschiedenes",
    r"^W(ü|ue)nsche",
    r"^Anfragen$",
    r"Offene Anfragen und Antr(ä|ae)ge",
    r"Weitere Anliegen der B(ü|ue)rgerschaft",
    # reine Sammelueberschriften; die Unterpunkte darunter sind der Inhalt
    r"^Antr(ä|ae)ge an die Verwaltung",
    r"^Anfragen aus dem Stadtteil$",
    r"Informationen zu den Bezirksaussch(ü|ue)ssen",
    r"^Allgemeine Aufgaben$",
    r"^Rechtliche Grundlagen$",
    r"^Ratsinformationssystem$",
    r"^Abl(ä|ae)ufe bei Antr(ä|ae)gen$",
    r"^Informationen und Unterrichtung",
    # "Miteilungen" ist im Portal so getippt — Muster deckt beides ab
    r"^Mit+eilungen\b.{0,60}(Stadt|Verwaltung)",
    # "Stellungnahme der Verwaltung" steht bewusst NICHT hier: der Titel sagt
    # nichts, aber alle 88 Vorkommen haengen an einem Dokument. Der Inhalt ist
    # echt, er steckt nur im PDF — solche Punkte gehoeren kuratiert, nicht
    # gefiltert. Ihr Klartext-Titel muss aus der Vorlage kommen.
    r"^Stellungnahmen der (Stadt|Verwaltung|Stadtverwaltung)\s*$",
    r"^(Neu-? ?und )?Umbesetzung(en)? in den (Aussch|Gremien)",
    r"^Neu- und Umbesetzungen",
    r"^B(ü|ue)rgeranliegen und Antr(ä|ae)ge",
    r"^Antr(ä|ae)ge der (B(ü|ue)rger|BZA|Bezirksaussch)",
    r"^B(ü|ue)rgerantr(ä|ae)ge$",
    r"^Umgesetzte Ma(ß|ss)nahmen$",
    # Sitzungsformalien und Aemterbesetzung im Bezirksausschuss
    r"Feststellung der ordnungsgem(ä|ae)(ß|ss)en Ladung",
    r"^Genehmigung des Protokolls",
    # Stadtratsformalien, erst beim Zwei-Jahres-Lauf aufgefallen
    r"^Fragestunde",
    # Reine Sitzungspausen ohne jeden Inhalt — kein Dokument, keine Sache
    r"^Sitzungspause\b",
    r"^Sitzungsunterbrechung\b",
    r"^Dringlichkeitsantr(ä|ae)ge$",
    r"^Genehmigung von Sitzungsniederschriften",
    r"^Bekanntgaben?$",
    r"^Sonstiges$",
    r"^Niederschrift(en)?$",
    r"^Antr(ä|ae)ge$",
    r"^Protokolle der BZA-Sitzungen",
    r"^Nicht (ö|oe)ffentliche Beratung",
    r"^Termin n(ä|ae)chste",
    r"^Weitere Positionen im Bezirksausschuss",
    r"^Behindertenbeauftragt",
    # Aemterbesetzung im Ausschuss selbst — Gremienorganisation, kein Thema
    # fuer Buergerinnen. "Jugendbeauftragter", "Bestellung einer/s
    # Inklusionsbeauftragten", "Behinderten- und Jugendbeauftragter des BZA".
    r"^(Bestellung|Wahl)\s+.{0,40}beauftragte",
    r"^[\w\s/,-]{0,45}beauftragte[rn]?( des \w+)?$",
    r"\(je \d+ Person",
]


# ---------------------------------------------------------------- HTTP + Cache

# Wie lange eine Cache-Seite gilt, wenn sich ihr Inhalt noch aendern kann.
# Bis November 2026 galt jede Seite fuer immer: der Kalender des laufenden
# Monats zeigte dann nie neue Sitzungen, eine Tagesordnung nie ihren Nachtrag
# und eine Sitzung nie ihre Niederschrift — ausser mit --no-cache, das alles
# (ueber 2000 Seiten) neu laedt. Jetzt veralten genau die Seiten, die sich
# noch bewegen; alles Aeltere bleibt im Cache.
FRISCH_STUNDEN = 20          # aelter als das wird neu geladen ...
SITZUNG_FRISCH_TAGE = 70     # ... bei Sitzungen bis so viele Tage zurueck
                             #     (Niederschriften kommen 4 bis 8 Wochen spaeter)
VORLAGE_FRISCH_TAGE = 21     # ... bei Beratungswegen bis so viele Tage zurueck


def cache_pfad(pfad, basis):
    # Die Quelle muss in den Cache-Schluessel, sonst ueberschreiben sich
    # gleichnamige Seiten verschiedener Instanzen gegenseitig (OWL-IT und
    # gremien.info liefern beide z. B. eine si0040.<endung>).
    kennung = re.sub(r"[^A-Za-z0-9_.-]", "_", basis.replace("https://", "").replace("http://", ""))[:60]
    schluessel = kennung + "_" + re.sub(r"[^A-Za-z0-9_.-]", "_", pfad)[:140] + ".html"
    return os.path.join(CACHE_VZ, schluessel)


def cache_veraltet(pfad, basis, stunden=FRISCH_STUNDEN):
    """True, wenn die Cache-Datei fehlt oder aelter als `stunden` ist."""
    datei = cache_pfad(pfad, basis)
    if not os.path.exists(datei):
        return True
    return time.time() - os.path.getmtime(datei) > stunden * 3600


def tage_her(iso_datum):
    """Tage seit `iso_datum` (negativ = liegt in der Zukunft). Unlesbares
    Datum gilt als weit zurueck, also als abgeschlossen."""
    try:
        return (date.today() - date.fromisoformat(iso_datum)).days
    except (TypeError, ValueError):
        return 10 ** 6


def hole(pfad, basis, cache=True, frisch=False):
    """
    Laedt eine Seite relativ zu `basis`, mit Dateicache und Pause.

    frisch=True: Die Seite kann sich noch aendern. Ist die Cache-Datei aelter
    als FRISCH_STUNDEN, wird neu geladen. Scheitert das, gilt die alte Fassung
    weiter — lieber ein Tag alt als eine Sitzung, die aus den Daten faellt.
    """
    os.makedirs(CACHE_VZ, exist_ok=True)
    cache_datei = cache_pfad(pfad, basis)
    vorhanden = os.path.exists(cache_datei)

    def aus_cache():
        with open(cache_datei, encoding="utf-8") as f:
            return f.read()

    if cache and vorhanden and not (frisch and cache_veraltet(pfad, basis)):
        return aus_cache()

    url = f"{basis}/{pfad}"
    anfrage = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(anfrage, timeout=30) as antwort:
            rohdaten = antwort.read()
    except urllib.error.URLError as fehler:
        print(f"  ! Fehler bei {url}: {fehler}", file=sys.stderr)
        return aus_cache() if vorhanden else ""

    text = rohdaten.decode("utf-8", errors="replace")
    # Voruebergehende Fehlerseite des Portals (HTTP 200, aber "SessionNet
    # Fehlermeldung") nicht cachen -- sonst bleibt sie fuer immer und der
    # Antrag oder die Sitzung faellt bei jedem Lauf heraus (2026-10-26:
    # Antrag 19916 verschwand so von der Seite).
    if "SessionNet Fehlermeldung" in text:
        print(f"  ! Fehlerseite statt Inhalt bei {url} (nicht gecacht)", file=sys.stderr)
        time.sleep(PAUSE_SEKUNDEN)
        return aus_cache() if vorhanden else ""
    with open(cache_datei, "w", encoding="utf-8") as f:
        f.write(text)
    time.sleep(PAUSE_SEKUNDEN)
    return text


# ------------------------------------------------------------------- Hilfsteil

def sauber(rohtext):
    """HTML-Fragment zu lesbarem Text."""
    text = re.sub(r"<br\s*/?>", " — ", rohtext)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def absolut(url, basis):
    if url.startswith("http"):
        return url
    return f"{basis}/{url.lstrip('/')}"


def ist_verfahren(titel):
    return any(re.search(m, titel, re.I) for m in VERFAHREN_MUSTER)


def dokumente_aus(fragment, basis):
    """Extrahiert Dokumentlinks (getfile.php / externe Links) aus einem Block."""
    gefunden = []
    gesehen = set()
    muster = r'<div class="smc-el-h[^"]*">\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>'
    for url, titel in re.findall(muster, fragment, re.S):
        titel = sauber(titel)
        url = absolut(html.unescape(url), basis)
        if not titel or url in gesehen:
            continue
        gesehen.add(url)
        gefunden.append({"titel": titel, "url": url})
    return gefunden


# ------------------------------------------------------------------- Parser

def parse_kalender(seite, endung="php"):
    """Liefert Sitzungs-IDs aus einer Monatsansicht (si0040.<endung>)."""
    ids = []
    for treffer in re.findall(rf"si0056\.{endung}\?__ksinr=(\d+)", seite):
        if treffer not in ids:
            ids.append(treffer)
    return ids


def parse_kalender_ohne_tagesordnung(seite, jahr, monat, endung="php"):
    """
    Liefert Sitzungstermine aus einer Monatsansicht (si0040.<endung>), fuer
    die noch keine Tagesordnung veroeffentlicht ist.

    Erkennungsmerkmal: das Gremium steht als reiner Text in der Zelle
    ('<div class="smc-el-h ">GREMIUM<!--SMCINFO...--></div>'), waehrend eine
    veroeffentlichte Tagesordnung denselben Text als Link auf
    si0056.<endung>?__ksinr=... einpackt. Nur der zuerst gesehene Kalendertag
    fuellt die Tageszelle; Folgezeilen fuer denselben Tag lassen sie leer —
    der Tag wird deshalb ueber die Zeilen hinweg fortgefuehrt.
    """
    if not seite:
        return []
    start = seite.find('id="smc_page_si0040_contenttable1"')
    if start == -1:
        return []
    ende = seite.find("</table>", start)
    tabelle = seite[start:ende]

    ergebnis = []
    tag = None
    for zeile in re.findall(r"<tr>.*?</tr>", tabelle, re.S):
        tag_treffer = re.search(r'<span class="weekday">(\d+)</span>', zeile)
        if tag_treffer:
            tag = int(tag_treffer.group(1))
        if not tag:
            continue

        sitz = re.search(r'class="[^"]*\bsilink\b[^"]*">(.*?)</td>', zeile, re.S)
        if not sitz:
            continue
        div = re.search(r'<div class="smc-el-h\s*">(.*?)</div>', sitz.group(1), re.S)
        if not div:
            continue
        innen = div.group(1)
        if f"si0056.{endung}" in innen:
            continue  # Tagesordnung schon da — kein "kommender" Termin mehr

        gremium = sauber(re.sub(r"<!--.*?-->", "", innen, flags=re.S))
        if not gremium or ist_beteiligung(gremium):
            continue
        # Rein nicht-oeffentliche Sitzungen ausgenommen — man kaeme ohnehin
        # nicht hinein. "oeffentliche/nicht oeffentliche" (gemischt) bleibt,
        # weil dort ein oeffentlicher Teil existiert.
        if gremium.startswith("nicht öffentliche"):
            continue
        # Die Floskel "oeffentliche(/nicht oeffentliche) Sitzung des/der"
        # steht vor praktisch jedem Eintrag — in einer Liste wiederholt sie
        # sich staendig, deshalb weg damit. Der Gremienname bleibt im
        # Genitiv stehen (Portal-Originaltext), statt ihn falsch zu raten —
        # der Artikel wird mitgespeichert, damit die Oberflaeche daraus
        # wieder "Sitzung des Ausschusses ..." machen kann.
        floskel = re.match(
            r"^(öffentliche(/nicht öffentliche)?|nicht öffentliche)\s+"
            r"Sitzung\s+(des|der)\s+",
            gremium,
        )
        artikel = floskel.group(3) if floskel else ""
        if floskel:
            gremium = gremium[floskel.end():]

        details = [sauber(d) for d in re.findall(
            r'<li class="list-inline-item">(.*?)</li>', sitz.group(1), re.S
        )]
        zeit = details[0] if details and "Uhr" in details[0] else ""
        ort = ", ".join(details[1:] if zeit else details)

        try:
            datum_iso = date(jahr, monat, tag).isoformat()
        except ValueError:
            continue

        ergebnis.append(
            {
                "gremium": gremium,
                "artikel": artikel,
                "datum": datum_iso,
                "datum_anzeige": f"{tag:02d}.{monat:02d}.{jahr:04d}",
                "zeit": zeit,
                "ort": ort,
            }
        )
    return ergebnis


def parse_beratungen(seite, basis, endung="php"):
    """
    Liest den Beratungsweg einer Vorlage (vo0053.<endung>).

    Jede Station ist eine Karte, deren Kopfzeile so aussieht:
        01.07.2026 Ausschuss fuer Sport ... TOP 3 oeffentlich - Vorberatung
    Die Rolle ("Vorberatung", "Entscheidung", "Bekanntgabe", ...) wird als
    Rohstring uebernommen — unbekannte Rollen sollen nicht verlorengehen.
    """
    if not seite:
        return []

    kopf_muster = re.compile(
        r'aria-controls="smcacchead\d+"\s*>\s*'
        r"(\d{2}\.\d{2}\.\d{4})\s+(.*?)\s+TOP\s+([\w.]+)\s+"
        r"(nicht öffentlich|öffentlich)\s*-\s*([^<\n]+?)\s*(?:<|$)",
        re.S,
    )

    stationen = []
    for block in re.split(r'<div id="smcpanel', html.unescape(seite))[1:]:
        treffer = kopf_muster.search(block)
        if not treffer:
            continue
        datum_de, gremium, top_nr, sichtbarkeit, rolle = treffer.groups()
        tag, monat, jahr = datum_de.split(".")

        sitzung_url = ""
        link = re.search(rf'href="(si0056\.{endung}\?__ksinr=\d+[^"]*)"', block)
        if link:
            sitzung_url = absolut(link.group(1), basis)

        stationen.append(
            {
                "datum": f"{jahr}-{monat}-{tag}",
                "datum_anzeige": datum_de,
                "gremium": re.sub(r"\s+", " ", gremium).strip(),
                "top_nr": top_nr,
                "oeffentlich": sichtbarkeit == "öffentlich",
                "rolle": re.sub(r"\s+", " ", rolle).strip(),
                "sitzung_url": sitzung_url,
            }
        )

    stationen.sort(key=lambda s: s["datum"])
    return stationen


def parse_sitzung(sitzungs_id, seite, basis, endung="php"):
    """Baut ein Sitzungsobjekt inkl. Tagesordnungspunkten."""
    if not seite:
        return None

    def feld(css_klasse):
        treffer = re.search(
            rf'<div class="smc-table-cell {css_klasse}">(.*?)</div>', seite, re.S
        )
        return sauber(treffer.group(1)) if treffer else ""

    datum_de = feld("sidat")
    datum_iso = ""
    if re.match(r"\d{2}\.\d{2}\.\d{4}$", datum_de):
        tag, monat, jahr = datum_de.split(".")
        datum_iso = f"{jahr}-{monat}-{tag}"

    sitzung = {
        "id": sitzungs_id,
        "kennung": feld("siname"),
        "gremium": feld("sigrname"),
        "raum": feld("siort"),
        "datum": datum_iso,
        "datum_anzeige": datum_de,
        "zeit": feld("yytime"),
        "url": f"{basis}/si0056.{endung}?__ksinr={sitzungs_id}",
        "dokumente": [],
        "tops": [],
    }

    # Sitzungsdokumente (Bekanntmachung, Livestream ...) liegen vor dem Accordion
    kopf = seite.split('id="smcaccordion"')[0]
    dokumentblock = re.search(r'<div class="smc-dg-c-1-10 smc-documents.*', kopf, re.S)
    if dokumentblock:
        sitzung["dokumente"] = dokumente_aus(dokumentblock.group(0), basis)

    # Tagesordnungspunkte: jede .card im Accordion mit badge + Titel
    accordion = seite.split('id="smcaccordion"')
    if len(accordion) < 2:
        return sitzung
    accordion = accordion[1]

    karten = re.split(r'<div class="card card-light', accordion)
    for karte in karten[1:]:
        badge = re.search(r'<span class="badge">(.*?)</span>', karte, re.S)
        titel_treffer = re.search(
            r'<div class="smc-card-text-title">(.*?)</div>', karte, re.S
        )
        if not badge or not titel_treffer:
            continue

        nummer = sauber(badge.group(1))
        volltitel = sauber(titel_treffer.group(1))

        # "Ö 1.7 Nachtrag: 28.07.2026" -> Nummer und Nachtragsdatum trennen
        nachtrag = ""
        nachtrag_treffer = re.search(r"\s*Nachtrag:\s*(.*)$", nummer)
        if nachtrag_treffer:
            nachtrag = nachtrag_treffer.group(1).strip()
            nummer = nummer[: nachtrag_treffer.start()].strip()

        # Klammerzusatz (Referent / Berichtsform) abtrennen
        titel, zusatz = volltitel, ""
        zusatz_treffer = re.search(r"—\s*\((.*?)\)\s*$", volltitel)
        if zusatz_treffer:
            zusatz = zusatz_treffer.group(1).strip()
            titel = volltitel[: zusatz_treffer.start()].strip(" — ").strip()

        # Antragsteller-Zeile nach dem <br/> ("— - Antrag der Fraktion ...")
        antragsteller = ""
        antrag_treffer = re.search(r"—\s*-?\s*(Antrag[^—]*)$", titel)
        if antrag_treffer:
            antragsteller = antrag_treffer.group(1).strip()
            titel = titel[: antrag_treffer.start()].strip()
        titel = re.sub(r"\s*—\s*-?\s*$", "", titel).strip()

        vorlage = re.search(
            rf'href="(vo0050\.{endung}\?__kvonr=\d+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]+?)\s*<',
            karte,
            re.S,
        )

        top = {
            "nr": nummer,
            "titel": titel,
            "zusatz": zusatz,
            "antragsteller": antragsteller,
            "nachtrag": nachtrag,
            "oeffentlich": nummer.startswith("Ö"),
            "verfahren": ist_verfahren(titel),
            "vorlage": sauber(vorlage.group(2)) if vorlage else "",
            "vorlage_url": absolut(vorlage.group(1), basis) if vorlage else "",
            "dokumente": dokumente_aus(karte, basis),
            "beratungen": [],
        }
        sitzung["tops"].append(top)

    return sitzung


# ------------------------------------------------------------------- Ablauf

def monate(von, bis):
    """Liste von (Jahr, Monat) inklusive Grenzen. Format 'YYYY-MM'."""
    vj, vm = (int(x) for x in von.split("-"))
    bj, bm = (int(x) for x in bis.split("-"))
    ergebnis = []
    jahr, monat = vj, vm
    while (jahr, monat) <= (bj, bm):
        ergebnis.append((jahr, monat))
        monat += 1
        if monat > 12:
            monat, jahr = 1, jahr + 1
    return ergebnis


def quelle_auslesen(kuerzel, zeitraum, cache, mit_beratungen):
    """Liest eine komplette Instanz aus und liefert die Sitzungsliste."""
    basis = QUELLEN[kuerzel]["basis_url"]
    endung = QUELLEN[kuerzel].get("endung", "php")
    print(f"\n=== Quelle '{kuerzel}' ({basis}) ===")

    sitzungs_ids = []
    for jahr, monat in zeitraum:
        pfad = f"si0040.{endung}?__cjahr={jahr}&__cmonat={monat}&__canz=1&__cselect=0"
        print(f"  Kalender {MONATSNAMEN[monat]} {jahr} ...", end=" ", flush=True)
        # Vormonat, laufender Monat und alles danach: dort kommen noch
        # Sitzungen dazu oder werden verlegt.
        heute = date.today()
        bewegt_sich = (jahr, monat) >= ((heute.year, heute.month - 1) if heute.month > 1
                                        else (heute.year - 1, 12))
        seite = hole(pfad, basis, cache=cache, frisch=bewegt_sich)
        neu = [i for i in parse_kalender(seite, endung) if i not in sitzungs_ids]
        sitzungs_ids.extend(neu)
        print(f"{len(neu)} Sitzungen")

    print(f"  {len(sitzungs_ids)} Sitzungen, lade Tagesordnungen ...")
    sitzungen = []
    for nummer, sitzungs_id in enumerate(sitzungs_ids, 1):
        sitzungs_pfad = f"si0056.{endung}?__ksinr={sitzungs_id}"
        seite = hole(sitzungs_pfad, basis, cache=cache)
        sitzung = parse_sitzung(sitzungs_id, seite, basis, endung)
        # Kommende und juengere Sitzungen aendern sich noch (Nachtraege,
        # Umnummerierung, spaeter die Niederschrift). Ob eine Sitzung dazu
        # gehoert, steht erst in der Seite selbst — deshalb erst lesen, dann
        # bei Bedarf frisch holen.
        if (cache and sitzung and tage_her(sitzung["datum"]) <= SITZUNG_FRISCH_TAGE
                and cache_veraltet(sitzungs_pfad, basis)):
            seite = hole(sitzungs_pfad, basis, cache=cache, frisch=True)
            sitzung = parse_sitzung(sitzungs_id, seite, basis, endung) or sitzung
        if not sitzung:
            continue
        sitzung["quelle"] = kuerzel
        sitzungen.append(sitzung)
        oeff = sum(1 for t in sitzung["tops"] if t["oeffentlich"])
        print(
            f"    [{nummer}/{len(sitzungs_ids)}] {sitzung['datum_anzeige']} "
            f"{sitzung['gremium'][:44]:44} {oeff} oeff. TOPs"
        )

    if mit_beratungen:
        vorlagen = [
            (t, tage_her(s["datum"]) <= VORLAGE_FRISCH_TAGE)
            for s in sitzungen
            for t in s["tops"]
            if t["vorlage_url"] and not t["verfahren"]
        ]
        print(f"  Beratungswege zu {len(vorlagen)} Vorlagen ...", end=" ", flush=True)
        for top, bewegt_sich in vorlagen:
            kvonr = re.search(r"__kvonr=(\d+)", top["vorlage_url"])
            if not kvonr:
                continue
            # Der Beratungsweg einer Vorlage, die gerade beraten wird, bekommt
            # noch Stationen dazu.
            seite = hole(f"vo0053.{endung}?__kvonr={kvonr.group(1)}", basis, cache=cache,
                         frisch=bewegt_sich)
            top["beratungen"] = parse_beratungen(seite, basis, endung)
        stationen = sum(len(t["beratungen"]) for t, _ in vorlagen)
        print(f"{stationen} Stationen")

    return sitzungen


def kommende_termine_auslesen(kuerzel, cache):
    """
    Sitzungstermine ohne veroeffentlichte Tagesordnung, aktueller Monat plus
    zwei Folgemonate — dort kann man als Buerger:in noch einwirken (siehe
    PROTOTYP-INGOLSTADT.md, "Was aus den Plänen wurde"). Nur Termine ab heute:
    ein Termin ohne Link in der Vergangenheit wurde meist einfach nie
    veroeffentlicht (z.B. eine formlos gebliebene Aufsichtsratssitzung),
    nicht "kommend".
    """
    basis = QUELLEN[kuerzel]["basis_url"]
    endung = QUELLEN[kuerzel].get("endung", "php")
    heute = date.today()
    # monate() braucht Start UND Ende — hier immer "aktueller Monat + 2",
    # deshalb direkt hochgezaehlt statt monate() zu bemuehen.
    jahr, monat = heute.year, heute.month
    monate_liste = []
    for _ in range(3):
        monate_liste.append((jahr, monat))
        monat += 1
        if monat > 12:
            monat, jahr = 1, jahr + 1

    ergebnis = []
    for jahr, monat in monate_liste:
        pfad = f"si0040.{endung}?__cjahr={jahr}&__cmonat={monat}&__canz=1&__cselect=0"
        seite = hole(pfad, basis, cache=cache, frisch=True)
        for termin in parse_kalender_ohne_tagesordnung(seite, jahr, monat, endung):
            if termin["datum"] < heute.isoformat():
                continue
            termin["quelle"] = kuerzel
            ergebnis.append(termin)
    return ergebnis


def main():
    heute = date.today()
    standard_bis = f"{heute.year:04d}-{heute.month:02d}"
    start_monat = heute.month - 2
    start_jahr = heute.year
    if start_monat < 1:
        start_monat += 12
        start_jahr -= 1
    standard_von = f"{start_jahr:04d}-{start_monat:02d}"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--von", default=standard_von, help="Startmonat YYYY-MM")
    parser.add_argument("--bis", default=standard_bis, help="Endmonat YYYY-MM")
    parser.add_argument(
        "--quelle",
        default="alle",
        choices=[*QUELLEN, "alle"],
        help="Welche Instanz auslesen (Standard: alle)",
    )
    parser.add_argument(
        "--ohne-beratungen",
        action="store_true",
        help="Beratungsweg (vo0053.php) nicht laden",
    )
    parser.add_argument("--no-cache", action="store_true", help="Cache ignorieren")
    args = parser.parse_args()

    cache = not args.no_cache
    zeitraum = monate(args.von, args.bis)
    gewaehlt = list(QUELLEN) if args.quelle == "alle" else [args.quelle]
    print(f"Zeitraum: {args.von} bis {args.bis} ({len(zeitraum)} Monate)")
    print(f"Quellen:  {', '.join(gewaehlt)}")

    sitzungen = []
    for kuerzel in gewaehlt:
        sitzungen += quelle_auslesen(
            kuerzel, zeitraum, cache, not args.ohne_beratungen
        )

    sitzungen.sort(key=lambda s: (s["datum"], s["kennung"]), reverse=True)

    print("\n=== Kommende Termine ohne Tagesordnung ===")
    kommende_termine = []
    for kuerzel in gewaehlt:
        neu = kommende_termine_auslesen(kuerzel, cache)
        print(f"  {kuerzel:10} {len(neu)} Termine")
        kommende_termine += neu
    kommende_termine.sort(key=lambda t: t["datum"])

    je_quelle = {}
    for kuerzel in gewaehlt:
        eigene = [s for s in sitzungen if s["quelle"] == kuerzel]
        je_quelle[kuerzel] = dict(
            QUELLEN[kuerzel],
            anzahl_sitzungen=len(eigene),
            anzahl_tops=sum(len(s["tops"]) for s in eigene),
        )

    ausgabe = {
        "quellen": je_quelle,
        "hinweis": "Oeffentlich zugaengliche Seiten, ohne Anmeldung abgerufen.",
        "abgerufen_am": date.today().isoformat(),
        "zeitraum": {"von": args.von, "bis": args.bis},
        "anzahl_sitzungen": len(sitzungen),
        "anzahl_tops": sum(len(s["tops"]) for s in sitzungen),
        "anzahl_verfahren": sum(
            1 for s in sitzungen for t in s["tops"] if t["verfahren"]
        ),
        "sitzungen": sitzungen,
        "kommende_termine": kommende_termine,
    }

    os.makedirs(DATEN_VZ, exist_ok=True)
    ziel = os.path.join(DATEN_VZ, "rohdaten.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(ausgabe, f, ensure_ascii=False, indent=2)

    print(f"\nGeschrieben: {ziel}")
    for kuerzel, info in je_quelle.items():
        print(
            f"  {kuerzel:6} {info['anzahl_sitzungen']:3} Sitzungen, "
            f"{info['anzahl_tops']:4} TOPs"
        )
    print(
        f"  gesamt {ausgabe['anzahl_sitzungen']:3} Sitzungen, "
        f"{ausgabe['anzahl_tops']:4} TOPs "
        f"({ausgabe['anzahl_verfahren']} davon Sitzungsroutine)"
    )
    print(f"  {len(kommende_termine)} kommende Termine ohne Tagesordnung")


if __name__ == "__main__":
    main()
