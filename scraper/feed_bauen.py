#!/usr/bin/env python3
"""
Fuehrt rohdaten.json (aus den Ratsinfoportalen) und kuration.json (Klartext,
Schlagworte) zu data/feed.json zusammen und setzt die Daten in index.html ein.

Verwendung:
    python3 feed_bauen.py

Leitet zusaetzlich den Bearbeitungsstand aus dem Beratungsweg ab. Wichtig:
Die Rolle einer Station in vo0053.php ist die *geplante* Rolle. "Entscheidung"
an einem vergangenen Datum belegt NICHT, dass der Beschluss gefasst wurde — er
kann vertagt worden sein. Deshalb heisst der Stand "Entscheidung angesetzt" und
nicht "entschieden".
"""

import collections
import hashlib
import json
import os
import re
import sys
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN_VZ = os.path.join(os.path.dirname(HIER), "data")

sys.path.insert(0, HIER)
from entwuerfe_bauen import ist_sammelueberschrift  # noqa: E402
import anker_setzen  # noqa: E402
from referenzen import bare_positionen, ist_beteiligung, top_ref  # noqa: E402
from ris_ingolstadt import HAUPT_QUELLE, QUELLEN  # noqa: E402

# Frueher "Ohne Vorlage" — ein Verwaltungsbegriff, der nichts ueber das
# Ergebnis sagt. Gemeint sind muendliche Berichte und alle BZA-Punkte: Dazu
# gibt es keine Beschlussvorlage, also auch keinen Beschluss. Das soll man
# sehen (Nutzertest 2026-09-30). Oberflaeche und antraege.html zeigen genau
# diesen Wortlaut, deshalb nur hier aendern.
STAND_OHNE_ENTSCHEIDUNG = "Nur besprochen, nichts entschieden"

# Drei Faelle, die frueher alle unter STAND_OHNE_ENTSCHEIDUNG liefen und dort
# falsch standen:
#  - Die Sitzung liegt noch in der Zukunft. "Nur besprochen" stimmt dann
#    schon in der Zeitform nicht.
#  - Bezirksausschuss, Sitzung steht noch bevor: Die Sitzung ist oeffentlich,
#    hier kann man hingehen — also "Noch offen" statt "Nur zur Information".
#  - Bezirksausschuss, Sitzung vorbei: BZA-Punkte haben keine Vorlage, aber
#    die Ausschuesse beschliessen durchaus (Buergerhaushalt, Antraege an die
#    Stadt). Ob etwas beschlossen wurde, wissen wir nicht — "nichts
#    entschieden" war eine Behauptung ohne Beleg.
STAND_ANGEKUENDIGT = "Steht auf der Tagesordnung"
STAND_BZA_KOMMT = "Kommt im Bezirksausschuss"
STAND_BZA_BEHANDELT = "Im Bezirksausschuss behandelt"

# Reihenfolge bestimmt die Sortierung der Filterachse "Stand"
STAND_REIHENFOLGE = [
    "Noch nicht terminiert",  # siehe antraege_offen.py — noch keiner Sitzung zugeteilt
    "Entscheidung geplant",
    "Wird noch beraten",
    "Entscheidung angesetzt",
    "Beschlossen",   # aus scraper/niederschriften_lesen.py::beschluesse.json
    "Teilweise beschlossen",  # einzelne Ziffern abgelehnt, andere genehmigt
    "Abgelehnt",     # — der Nachfolgezustand von "Entscheidung angesetzt"
    "Bekanntgabe",
    STAND_BZA_KOMMT,
    STAND_ANGEKUENDIGT,
    STAND_BZA_BEHANDELT,
    STAND_OHNE_ENTSCHEIDUNG,
]

# Was Buergerinnen vom Stand wissen wollen, sind zwei Fragen: "Kann ich noch
# mitreden?" und "Was kam heraus?". Die sieben Verfahrensstaende oben bleiben
# in den Daten (fein genug fuer pruefen.py und die Anträge-Seite), die
# Oberflaeche zeigt nur diese vier (Nutzerfeedback 2026-09-30). Gefiltert
# wird nur nach den ersten beiden — die anderen beiden beantworten keine
# Frage, nach der jemand suchen wuerde.
STATUS_OFFEN = "Noch offen"
STATUS_ENTSCHIEDEN = "Entschieden"
STATUS_PROTOKOLL = "Ergebnis steht im Protokoll"
STATUS_INFO = "Nur zur Information"
STATUS_FILTER = [STATUS_OFFEN, STATUS_ENTSCHIEDEN]
STATUS_ALLE = [STATUS_OFFEN, STATUS_ENTSCHIEDEN, STATUS_PROTOKOLL, STATUS_INFO]


def status_aus_stand(stand):
    if stand in ("Noch nicht terminiert", "Wird noch beraten", "Entscheidung geplant",
                 STAND_BZA_KOMMT):
        return STATUS_OFFEN
    if stand in ("Beschlossen", "Teilweise beschlossen", "Abgelehnt"):
        return STATUS_ENTSCHIEDEN
    if stand == "Entscheidung angesetzt":
        # Die Sitzung ist vorbei, das Ergebnis steht in der Niederschrift —
        # oder kommt mit ihr (4 bis 8 Wochen Verzug). Die Oberflaeche
        # unterscheidet beides anhand von niederschrift_url.
        return STATUS_PROTOKOLL
    return STATUS_INFO


# Der Bezirk Oberbayern (aelteres .asp-Portal) benennt die Rollen im
# Beratungsweg nach seiner Geschaeftsordnung ("beschließend nach § 7 Abs. 1
# GeschO", "vorberatend nach ...", "Kenntnisnahme"). Ohne diese Zuordnung
# landeten sie als Paragrafentext auf der Karte und fielen aus dem Stand-
# Filter heraus.
def rolle_art(rolle):
    r = (rolle or "").lower()
    if "entscheidung" in r or r.startswith("beschließend"):
        return "entscheidung"
    if "vorberatung" in r or r.startswith("vorberatend"):
        return "vorberatung"
    if "bekanntgabe" in r or "kenntnisnahme" in r:
        return "bekanntgabe"
    return ""


# Karten, deren Text nur den amtlichen Titel wiederholt: kein Klartext, oder
# die Schablone "Im Bezirksausschuss X war folgendes Thema: <Titel>." aus
# frueheren Massen-Kurationen. Die Oberflaeche zeigt sie nicht als volle
# Karte, sondern gebuendelt je Sitzung ("Weitere Themen dieser Sitzung").
# Wer so einen Eintrag richtig aufbereitet, muss nichts umstellen — sobald
# der Text die Schablone verlaesst, wird er wieder eine eigene Karte.
SCHABLONE_DUENN = re.compile(r"^Im .{1,120}? (war|waren|ging es um) folgendes Thema: ", re.S)


def ist_duenn(kur):
    text = (kur.get("klartext") or "").strip()
    return not text or bool(SCHABLONE_DUENN.match(text))


# Wer berät? Eigene Filterachse je Quelle (Rat der Stadt, Kreistag des
# Kreises) — zwei Verwaltungsebenen, die nebeneinander stehen.
EBENE = {
    "stadt_bueren": "Stadt Büren — Rat & Ausschüsse",
    "kreis_paderborn": "Kreis Paderborn — Kreistag & Ausschüsse",
}
KEIN_STADTBEZIRK = set()
# Quellen, deren Punkte keine Vorlagen tragen und deshalb über Aktenzeichen
# und Titel zu Vorgängerketten verbunden werden (in Ingolstadt waren das die
# Bezirksausschüsse). Hier leer: Rat und Kreistag arbeiten mit Vorlagen.
KETTEN_QUELLEN = set()


def termin_artikel(termin):
    """
    ris_ingolstadt.py schneidet "Sitzung des/der" vom Gremiennamen ab, der
    Rest steht im Genitiv ("Ausschusses fuer Sport"). Neue Rohdaten tragen
    den abgeschnittenen Artikel mit; fuer aeltere wird er hier nachgetragen:
    Stadt- und BZA-Termine ohne Artikel hatten die Floskel, ausser
    Buergerversammlungen und Eintraege, die schon im Nominativ stehen.
    """
    if "artikel" in termin:
        return termin["artikel"]
    if termin.get("quelle") not in EBENE:
        return ""
    g = termin.get("gremium", "")
    if g.startswith("Bürgerversammlung"):
        return ""
    erstes = g.split(" ")[0]
    return "des" if erstes.endswith("s") else ""


def lade(dateiname):
    pfad = os.path.join(DATEN_VZ, dateiname)
    if not os.path.exists(pfad):
        sys.exit(f"Fehlt: {pfad}\nZuerst ris_ingolstadt.py laufen lassen.")
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def thema_schluessel(quelle, top):
    """
    Ein Thema, nicht ein Tagesordnungspunkt.

    Dieselbe Vorlage steht nacheinander in mehreren Gremien auf der
    Tagesordnung — der Schulcampus Nord-Ost etwa sechsmal: vier Ausschuesse
    zur Vorberatung, der Finanzausschuss, zuletzt der Stadtrat zur
    Entscheidung. Ueber zwei Jahre sind 1.079 Punkte nur 698 Themen.

    Deshalb gruppiert der Feed nach Vorlagennummer. Wer keine hat — alle
    BZA-Punkte und die muendlichen Berichte — bleibt fuer sich.
    """
    kvonr = re.search(r"__kvonr=(\d+)", top.get("vorlage_url") or "")
    if kvonr:
        return f"{quelle}:vorlage:{kvonr.group(1)}"
    return None


# Aktenzeichen der Bezirksausschuesse: Jahr-Bezirk-Nummer, mit "B" fuer den
# Buergerhaushalt (eigene Nummernreihe).
AKTENZEICHEN = re.compile(r"(?<![\d/-])(20\d\d)\s?-\s?(\d{2})\s?-\s?(\d{3})(?![\d-])(\s?B\b)?")
# Titel, die in jeder Sitzung wiederkehren und kein Vorgang sind
KETTE_ROUTINE = re.compile(
    r"stellungnahme|information|verschiedenes|protokoll|bürgerhaushalt|\bbhh\b|geschwindigkeits|"
    r"antwortschreiben|sachst[aä]nd|laufende|bürgeranliegen|e-?mails|umgesetzte|beiträge|anträge|bekanntgabe|"
    r"termine|bürgerversammlung|unterrichtung|mängelmelder|aktuelles|bericht", re.I)
# Woerter, die zwei Titel nicht zum selben Vorgang machen
KETTE_FUELLWORT = {
    "antrag", "antraege", "stellungnahme", "schreiben", "stadt", "verwaltung", "referat", "bezirksausschuss",
    "sitzung", "zuschuss", "buergerhaushalt", "anschaffung", "oeffentlich", "nicht", "strasse", "bueren", "paderborn",
    "bereich", "errichtung", "aufstellung", "sanierung", "aufwertung", "situation", "betreffend", "hoehe",
    "zwischen", "sowie", "einer", "eines", "einem", "durch", "ueber", "unter", "neben", "wegen",
    "strassen", "bezirk", "bericht", "stadtrat", "aenderung", "massnahme", "pruefung", "ortstermin"}


def _glatt(text):
    text = (text or "").lower()
    for a, b in (("ß", "ss"), ("ä", "ae"), ("ö", "oe"), ("ü", "ue")):
        text = text.replace(a, b)
    return text


def titel_kern(titel):
    """Titel ohne Aktenzeichen und Satzzeichen, fuer den Vergleich ueber Sitzungen hinweg."""
    az = r"(az\.?:?\s*)?20\d\d\s?-\s?\d{2}\s?-\s?\d{2,3}(\s?b\b)?"
    # mit Klammer samt Zusatz darin ("(Ref. II; Az: 2024-12-025 nicht öffentlich)"), sonst nur die Nummer
    t = re.sub(r"\([^()]{0,40}?" + az + r"[^()]{0,40}\)|" + az, " ", _glatt(titel))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def titel_stichworte(titel):
    """Wortanfaenge (fuenf Buchstaben) der tragenden Woerter eines Titels."""
    fuell = {w[:5] for w in KETTE_FUELLWORT}
    return {w[:5] for w in titel_kern(titel).split() if len(w) >= 5 and w[:5] not in fuell}


def ketten_setzen(feed):
    """
    Derselbe Vorgang in mehreren Sitzungen eines Bezirksausschusses.

    Bezirksausschuss-Punkte haben keine Vorlage, ueber die thema_schluessel
    sie buendeln koennte. Zwei Merkmale verbinden sie trotzdem:

    1. Dasselbe Aktenzeichen im Titel (2024-05-001). Das allein reicht nicht:
       Die Nummern werden doppelt vergeben (2024-07-005 steht fuer ein Holztipi
       im Kindergarten und fuer E-Scooter-Stellplaetze). Deshalb muessen die
       Titel zusaetzlich ein tragendes Wort teilen.
    2. Derselbe Titel, wenn er kein Routinepunkt ist ("Stellungnahmen der
       Stadt") und hoechstens sechsmal vorkommt.

    Verbunden wird nur innerhalb eines Bezirksausschusses und nur ueber
    verschiedene Sitzungen. Jeder Eintrag einer Kette bekommt dasselbe Feld
    "kette"; die Seite zeigt daraus den Verlauf.
    """
    bza = [e for e in feed if e["quelle"] in KETTEN_QUELLEN]
    eltern = {e["ref"]: e["ref"] for e in bza}

    def wurzel(r):
        while eltern[r] != r:
            eltern[r] = eltern[eltern[r]]
            r = eltern[r]
        return r

    name = {}
    # Sitzungen je Gruppe: Zwei Punkte derselben Sitzung sind nie derselbe Vorgang,
    # auch nicht ueber einen dritten Punkt.
    sitzungen = {e["ref"]: {e["sitzung_url"]} for e in bza}
    je_az = collections.defaultdict(list)
    je_titel = collections.defaultdict(list)
    for e in bza:
        for m in AKTENZEICHEN.finditer(e["amtlicher_titel"]):
            az = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" + ("B" if m.group(4) else "")
            je_az[(e["gremium"], az)].append(e)
        kern = titel_kern(e["amtlicher_titel"])
        if len(kern) >= 12 and not KETTE_ROUTINE.search(e["amtlicher_titel"]):
            je_titel[(e["gremium"], kern)].append(e)

    def verbinde(a, b, kennung):
        ra, rb = wurzel(a["ref"]), wurzel(b["ref"])
        if ra != rb:
            if sitzungen[ra] & sitzungen[rb]:
                return
            eltern[rb] = ra
            sitzungen[ra] |= sitzungen.pop(rb)
        # Ein Aktenzeichen ist die bessere Kennung als der Titel-Hash ("t...")
        kandidaten = [n for n in (name.pop(ra, None), name.pop(rb, None), kennung) if n]
        name[ra] = next((n for n in kandidaten if not n.startswith("t")), kandidaten[0])

    for (gremium, az), gruppe in je_az.items():
        for i, a in enumerate(gruppe):
            for b in gruppe[i + 1:]:
                if titel_stichworte(a["amtlicher_titel"]) & titel_stichworte(b["amtlicher_titel"]):
                    verbinde(a, b, az)
    for (gremium, kern), gruppe in je_titel.items():
        if 2 <= len(gruppe) <= 6:
            for i, a in enumerate(gruppe):
                for b in gruppe[i + 1:]:
                    verbinde(a, b, "t" + hashlib.sha1(kern.encode()).hexdigest()[:8])

    gruppen = collections.defaultdict(list)
    for e in bza:
        gruppen[wurzel(e["ref"])].append(e)
    ketten, vergeben = 0, collections.Counter()
    for w, gruppe in gruppen.items():
        if len(gruppe) < 2:
            continue
        ketten += 1
        m = re.search(r"Bezirksausschuss ([IVX]+)\b", gruppe[0]["gremium"])
        kennung = f"{m.group(1) if m else 'BZA'}:{name[wurzel(w)]}"
        # Dasselbe Aktenzeichen fuer zwei verschiedene Vorgaenge: zwei Kennungen
        vergeben[kennung] += 1
        if vergeben[kennung] > 1:
            kennung += f"-{vergeben[kennung]}"
        for e in gruppe:
            e["kette"] = kennung
    return ketten


def leitstation(auftritte):
    """
    Welcher Auftritt vertritt das Thema?

    Die Entscheidungssitzung, wenn es eine gibt — dort faellt die Sache.
    Sonst der spaeteste Auftritt, weil der den aktuellen Stand zeigt.
    """
    mit_entscheidung = [
        (s, t) for s, t in auftritte
        if any(rolle_art(b["rolle"]) == "entscheidung" for b in t.get("beratungen") or [])
    ]
    kandidaten = mit_entscheidung or auftritte
    return max(kandidaten, key=lambda st: st[0]["datum"] or "")


def stand_ohne_vorlage(sitzung, heute_iso):
    """Stand fuer Punkte ohne Vorlage: muendliche Berichte und alle BZA-Punkte.
    Haengt an Quelle und Sitzungsdatum, siehe Kommentar bei STAND_ANGEKUENDIGT."""
    bza = sitzung.get("quelle", "") in KETTEN_QUELLEN
    kommt_noch = (sitzung.get("datum") or "") > heute_iso
    if bza:
        return STAND_BZA_KOMMT if kommt_noch else STAND_BZA_BEHANDELT
    return STAND_ANGEKUENDIGT if kommt_noch else STAND_OHNE_ENTSCHEIDUNG


def stand_ableiten(top, heute_iso, sitzung=None):
    """Liefert (stand, datum_der_station) aus dem Beratungsweg."""
    beratungen = top.get("beratungen") or []

    if not top.get("vorlage"):
        stand = stand_ohne_vorlage(sitzung or {}, heute_iso)
        # Bei kommenden Sitzungen das Datum mitgeben, damit die Oberflaeche
        # "am 18.11.2026" sagen kann.
        kommt = stand in (STAND_ANGEKUENDIGT, STAND_BZA_KOMMT)
        return stand, (sitzung or {}).get("datum_anzeige", "") if kommt else ""

    entscheidungen = [s for s in beratungen if rolle_art(s["rolle"]) == "entscheidung"]
    if entscheidungen:
        letzte = max(entscheidungen, key=lambda s: s["datum"])
        stand = (
            "Entscheidung angesetzt"
            if letzte["datum"] <= heute_iso
            else "Entscheidung geplant"
        )
        return stand, letzte["datum_anzeige"]

    vorberatungen = [s for s in beratungen if rolle_art(s["rolle"]) == "vorberatung"]
    if vorberatungen:
        return "Wird noch beraten", max(
            vorberatungen, key=lambda s: s["datum"]
        )["datum_anzeige"]

    bekanntgaben = [s for s in beratungen if rolle_art(s["rolle"]) == "bekanntgabe"]
    if bekanntgaben:
        return "Bekanntgabe", max(
            bekanntgaben, key=lambda s: s["datum"]
        )["datum_anzeige"]

    if beratungen:
        # Unbekannte Rolle (etwa "Anhoerung"): unveraendert durchreichen,
        # damit sie sichtbar wird statt im Sammelstand zu verschwinden.
        letzte = max(beratungen, key=lambda s: s["datum"])
        return letzte["rolle"], letzte["datum_anzeige"]

    # Vorlage vorhanden, aber kein Beratungsweg gelesen (--ohne-beratungen)
    return STAND_OHNE_ENTSCHEIDUNG, ""


def anker_nachziehen(roh, kuration):
    """Neue Kurationseintraege bekommen hier ihren Titel-Anker (siehe
    anker_setzen.py). Laeuft bei jedem Feed-Bau mit, damit niemand daran
    denken muss; geschrieben wird nur, wenn sich etwas geaendert hat."""
    index = anker_setzen.top_index(roh)
    eintraege = kuration["eintraege"]
    gesetzt = anker_setzen.fehlende_setzen(eintraege, index)
    if gesetzt:
        anker_setzen.speichere(kuration, os.path.join(DATEN_VZ, "kuration.json"))
        print(f"  {gesetzt} neue Titel-Anker in kuration.json gesetzt")
    verrutscht = anker_setzen.abweichungen(eintraege, index)
    if verrutscht:
        print(
            f"\n  ACHTUNG: {len(verrutscht)} Zusammenfassungen passen nicht mehr zum "
            "amtlichen Titel unter ihrem Schluessel (Tagesordnung umnummeriert?).\n"
            "  Ansehen:   python3 scraper/anker_setzen.py --zeigen\n"
            "  Reparieren: python3 scraper/anker_setzen.py --umhaengen\n",
            file=sys.stderr,
        )


def main():
    roh = lade("rohdaten.json")
    kuration = lade("kuration.json")
    anker_nachziehen(roh, kuration)
    eintraege_kuration = kuration["eintraege"]
    heute_iso = date.today().isoformat()

    # Mechanisch aus Niederschriften extrahiert (scraper/niederschriften_lesen.py),
    # bewusst getrennt von kuration.json — siehe pruefen.py::
    # p_kein_behaupteter_beschluss. Optional: die Datei existiert erst, wenn
    # niederschriften_lesen.py einmal gelaufen ist.
    beschluesse_pfad = os.path.join(DATEN_VZ, "beschluesse.json")
    beschluesse = {}
    if os.path.exists(beschluesse_pfad):
        with open(beschluesse_pfad, encoding="utf-8") as f:
            beschluesse = json.load(f)

    # Index ueber alle Tagesordnungspunkte, Schluessel mit Quellen-Praefix.
    # top_ref() loest dabei blosse "Ö"-TOPs (Aenderungsantraege, "hierzu"-
    # Stellungnahmen) ueber ihre Position auf, siehe referenzen.py — sonst
    # ueberschreiben sich mehrere davon in derselben Sitzung gegenseitig.
    index = {}
    for sitzung in roh["sitzungen"]:
        quelle = sitzung.get("quelle", HAUPT_QUELLE)
        bare_pos = bare_positionen(sitzung)
        for top in sitzung["tops"]:
            index[top_ref(quelle, sitzung, top, bare_pos)] = (sitzung, top)

    # Alle Auftritte je Thema sammeln — auch die, die niemand kuratiert hat.
    # Sonst kennt die Karte nur die eine Sitzung, in der jemand zufaellig
    # kuratiert hat, statt den ganzen Weg der Vorlage.
    # Niederschriften je Sitzung. Sie sind der einzige oeffentliche Beleg
    # dafuer, wie tatsaechlich entschieden wurde — die Tagesordnung sagt nur,
    # worueber beraten werden sollte. Sie erscheinen erst nach Genehmigung in
    # der Folgesitzung, also mit rund 4 bis 8 Wochen Verzug.
    niederschrift_je_sitzung = {}
    for sitzung in roh["sitzungen"]:
        for dokument in sitzung.get("dokumente", []):
            if re.search(r"niederschrift", dokument["titel"], re.I):
                niederschrift_je_sitzung[sitzung["url"]] = dokument["url"]
                break
    # Das Portal haengt manchmal das Protokoll der VORHERIGEN Sitzung an.
    # niederschriften_lesen.py prueft Datum/Nummer im PDF und schreibt die
    # richtige Zuordnung — liegt sie vor, gilt nur sie (lieber kein Link als
    # einer aufs falsche Protokoll).
    zuordnung_pfad = os.path.join(DATEN_VZ, "niederschriften.json")
    if os.path.exists(zuordnung_pfad):
        with open(zuordnung_pfad, encoding="utf-8") as f:
            geprueft = json.load(f)
        gelesen = set(niederschrift_je_sitzung.values())
        niederschrift_je_sitzung = {
            s_url: n_url for s_url, n_url in niederschrift_je_sitzung.items()
            if n_url not in gelesen or geprueft.get(s_url) == n_url
        }
        niederschrift_je_sitzung.update(geprueft)

    auftritte_je_thema = collections.defaultdict(list)
    for sitzung in roh["sitzungen"]:
        quelle = sitzung.get("quelle", HAUPT_QUELLE)
        for top in sitzung["tops"]:
            schluessel = thema_schluessel(quelle, top)
            if schluessel:
                auftritte_je_thema[schluessel].append((sitzung, top))

    # Kuratierte Eintraege nach Thema buendeln. Sind mehrere Auftritte
    # derselben Vorlage kuratiert, gewinnt die vollstaendigere Fassung —
    # nicht die zufaellig zuerst eingetragene. Sonst verschwindet stillschweigend
    # eine Einfache-Sprache-Fassung, nur weil ein anderer Auftritt frueher
    # in der Datei steht.
    def guete(kur):
        return (
            0 if kur.get("entwurf", False) else 1,
            1 if kur.get("klartext_leicht") else 0,
            1 if kur.get("klartext") else 0,
            len(kur.get("lebenslage", [])) + len(kur.get("anlass", [])),
        )

    je_thema = collections.OrderedDict()
    fehlend = []
    doppelt = []
    for ref, kur in eintraege_kuration.items():
        if ":antrag:" in ref:
            continue  # eigener Pfad weiter unten — hat keinen Sitzungs-TOP
        if ref not in index:
            fehlend.append(ref)
            continue
        sitzung, top = index[ref]
        schluessel = thema_schluessel(sitzung.get("quelle", HAUPT_QUELLE), top) or ref
        if schluessel in je_thema:
            alt_ref, alt_kur = je_thema[schluessel]
            if guete(kur) <= guete(alt_kur):
                doppelt.append((schluessel, ref))
                continue
            doppelt.append((schluessel, alt_ref))
        je_thema[schluessel] = (ref, kur)

    feed = []
    for schluessel, (ref, kur) in je_thema.items():
        sitzung, top = index[ref]
        # Die Karte haengt an der Leitstation, nicht an der kuratierten Sitzung
        alle = auftritte_je_thema.get(schluessel) or [(sitzung, top)]
        sitzung, top = leitstation(alle)
        stand, stand_datum = stand_ableiten(top, heute_iso, sitzung)

        # Liegt ein aus der Niederschrift extrahierter Beschluss zu genau
        # dieser Station vor, ersetzt er den abgeleiteten Stand — er ist die
        # eigentliche Beobachtung, "Entscheidung angesetzt" nur die Vermutung
        # aus dem Beratungsweg davor.
        beschluss_ref = top_ref(
            sitzung.get("quelle", HAUPT_QUELLE), sitzung, top, bare_positionen(sitzung)
        )
        beschluss = beschluesse.get(beschluss_ref)
        # Nur ein Beschluss aus der Entscheidungssitzung selbst entscheidet
        # den Stand. Die Empfehlung eines vorberatenden Ausschusses
        # ("befuerwortet") ist keiner, und eine Leitstation, die nicht die
        # angesetzte Entscheidungssitzung ist, auch nicht.
        # Ausnahme: Vorlage ohne gelesenen Beratungsweg — dann gibt es keine
        # "Entscheidungssitzung" zum Vergleichen, und die Abstimmung in genau
        # dieser Sitzung ist der einzige Beleg. Sonst stuende dort "keine
        # Entscheidung", obwohl das Protokoll eine nennt.
        # Datum allein reicht nicht: beim Bezirk Oberbayern beraten
        # Personalausschuss (vorberatend) und Bezirksausschuss (entscheidend)
        # oft am selben Tag. Die Entscheidungsstation muss auch das Gremium
        # dieser Sitzung sein.
        def gleiches_gremium(a, b):
            a, b = re.sub(r"\W", "", a or "").lower(), re.sub(r"\W", "", b or "").lower()
            return bool(a) and bool(b) and (a == b or a.startswith(b) or b.startswith(a))

        entscheidungssitzung = (
            stand == "Entscheidung angesetzt"
            and stand_datum == sitzung["datum_anzeige"]
            and any(
                rolle_art(b["rolle"]) == "entscheidung"
                and b["datum_anzeige"] == sitzung["datum_anzeige"]
                and gleiches_gremium(b["gremium"], sitzung["gremium"])
                for b in top.get("beratungen") or []
            )
        ) or (
            stand == STAND_OHNE_ENTSCHEIDUNG and top.get("vorlage") and not top.get("beratungen")
        )
        if beschluss and (beschluss.get("empfehlung") or not entscheidungssitzung):
            beschluss = None
        if beschluss:
            stand = {
                "beschlossen": "Beschlossen",
                "teilweise": "Teilweise beschlossen",
                "abgelehnt": "Abgelehnt",
            }[beschluss["ergebnis"]]
            stand_datum = sitzung["datum_anzeige"]

        stationen = sorted(
            (
                {
                    "datum": s["datum"],
                    "datum_anzeige": s["datum_anzeige"],
                    "gremium": s["gremium"],
                    "top_nr": t["nr"],
                    "sitzung_url": s["url"],
                }
                for s, t in alle
            ),
            key=lambda x: x["datum"] or "",
        )

        # Beleg fuer das Ergebnis: die Niederschrift der Sitzung, in der die
        # Entscheidung angesetzt war. Fehlt sie, ist das keine Luecke im
        # Datensatz, sondern der uebliche Verzug — die Oberflaeche sagt das.
        niederschrift = niederschrift_je_sitzung.get(sitzung["url"], "")

        feed.append(
            {
                "ref": ref,
                "thema": schluessel,
                "auftritte": stationen,
                "klartext_titel": kur["klartext_titel"],
                "klartext": kur["klartext"],
                # Einfache Sprache, optional. Leer heisst: fuer diesen Eintrag
                # liegt noch keine Fassung vor — die Oberflaeche faellt dann
                # sichtbar auf die normale Fassung zurueck, statt zu raten.
                "klartext_titel_leicht": kur.get("klartext_titel_leicht", ""),
                "klartext_leicht": kur.get("klartext_leicht", ""),
                "lebenslage": kur.get("lebenslage", []),
                "bezirk": [b for b in kur.get("bezirk", []) if b not in KEIN_STADTBEZIRK],
                "ebene": [EBENE.get(sitzung.get("quelle", ""), "Sonstiges Gremium")],
                "anlass": kur.get("anlass", []),
                "ort": kur.get("ort", []),          # freier Vermerk, kein Filter
                "entwurf": kur.get("entwurf", False),
                "duenn": ist_duenn(kur),
                # --- abgeleitet ---
                "stand": stand,
                "stand_datum": stand_datum,
                "status": status_aus_stand(stand),
                "niederschrift_url": niederschrift,
                # Wörtlicher Beschlusstext, nur wenn beschluss_ref oben einen
                # Treffer hatte — siehe niederschriften_lesen.py.
                "beschluss": (
                    {"formel": beschluss["formel"], "text": beschluss["text"]}
                    if beschluss else None
                ),
                # --- unveraenderte Angaben aus der Quelle ---
                "quelle": sitzung.get("quelle", HAUPT_QUELLE),
                "amtlicher_titel": top["titel"],
                "top_nr": top["nr"],
                "vorlage": top["vorlage"],
                "vorlage_url": top["vorlage_url"],
                "antragsteller": top.get("antragsteller", ""),
                "gremium": sitzung["gremium"],
                "sitzung_kennung": sitzung["kennung"],
                "datum": sitzung["datum"],
                "datum_anzeige": sitzung["datum_anzeige"],
                "sitzung_url": sitzung["url"],
                "dokumente": top["dokumente"],
                "beratungsweg": top.get("beratungen") or [],
            }
        )

    # Offene Stadtratsantraege ohne Sitzungstermin (siehe antraege_offen.py).
    # Eigener, einfacherer Pfad statt durch thema_schluessel()/leitstation():
    # ohne Sitzung gibt es weder einen Beratungsweg zum Gruppieren noch eine
    # "Leitstation", von der sich Datum oder Gremium ableiten liessen.
    offene_antraege_pfad = os.path.join(DATEN_VZ, "offene_antraege.json")
    if os.path.exists(offene_antraege_pfad):
        with open(offene_antraege_pfad, encoding="utf-8") as f:
            offene_antraege = json.load(f)["antraege"]
    else:
        offene_antraege = []

    bekannte_kvonr = {
        m.group(1)
        for sitzung in roh["sitzungen"]
        for top in sitzung["tops"]
        for m in [re.search(r"__kvonr=(\d+)", top.get("vorlage_url") or "")]
        if m
    }
    for antrag in offene_antraege:
        if antrag["kvonr"] in bekannte_kvonr:
            continue  # inzwischen terminiert, antraege_offen.py nur noch nicht neu gelaufen
        ref = f"{antrag['quelle']}:antrag:{antrag['kvonr']}"
        kur = eintraege_kuration.get(ref)
        if not kur:
            continue  # noch nicht mal ein Entwurf -- entwuerfe_bauen.py erst laufen lassen
        gremium = (
            f"Antrag an {antrag['ziel_gremium']}" if antrag["ziel_gremium"]
            else "Antrag, Gremium noch offen"
        )
        feed.append(
            {
                "ref": ref,
                "thema": ref,
                "auftritte": [],
                "klartext_titel": kur["klartext_titel"],
                "klartext": kur["klartext"],
                "klartext_titel_leicht": kur.get("klartext_titel_leicht", ""),
                "klartext_leicht": kur.get("klartext_leicht", ""),
                "lebenslage": kur.get("lebenslage", []),
                "bezirk": [b for b in kur.get("bezirk", []) if b not in KEIN_STADTBEZIRK],
                "ebene": [EBENE.get(antrag["quelle"], "Sonstiges Gremium")],
                "anlass": kur.get("anlass", []),
                "ort": kur.get("ort", []),
                "entwurf": kur.get("entwurf", False),
                "duenn": ist_duenn(kur),
                # --- abgeleitet ---
                # Termin angesetzt, Tagesordnung aber noch nicht online
                # (antraege_offen.py, Feld "termin").
                "stand": "Entscheidung geplant" if antrag.get("termin") else "Noch nicht terminiert",
                "stand_datum": (
                    ".".join(reversed(antrag["termin"].split("-"))) if antrag.get("termin") else ""
                ),
                "status": STATUS_OFFEN,
                "niederschrift_url": "",
                "beschluss": None,
                # --- unveraenderte Angaben aus der Quelle ---
                "quelle": antrag["quelle"],
                "amtlicher_titel": antrag["titel"],
                "top_nr": "",
                "vorlage": antrag["vorlage"],
                "vorlage_url": antrag["vorlage_url"],
                "antragsteller": antrag["antragsteller"],
                "gremium": gremium,
                "sitzung_kennung": "",
                "datum": antrag["antragsdatum"],
                "datum_anzeige": antrag["antragsdatum_anzeige"],
                # Ohne Sitzung ist die Vorlage selbst die Quelle.
                "sitzung_url": antrag["vorlage_url"],
                "dokumente": antrag["dokumente"],
                "beratungsweg": [],
            }
        )

    feed.sort(key=lambda e: e["datum"], reverse=True)

    def achse(name):
        werte = []
        for eintrag in feed:
            for wert in eintrag[name]:
                if wert not in werte:
                    werte.append(wert)
        return sorted(werte)

    # Bezirksachse in amtlicher Reihenfolge, nicht alphabetisch
    bezirk_ordnung = kuration.get("_achsen", {}).get("bezirk", [])
    vorhanden = {w for e in feed for w in e["bezirk"]}
    bezirke = [b for b in bezirk_ordnung if b in vorhanden]
    bezirke += sorted(vorhanden - set(bezirke))

    staende = [s for s in STAND_REIHENFOLGE if any(e["stand"] == s for e in feed)]
    ebenen = [w for w in EBENE.values() if any(w in e["ebene"] for e in feed)]

    # Termine: nur ab dem Bautag (die Oberflaeche filtert zusaetzlich nach dem
    # Tag des Besuchs — die Seite ist statisch und wird nicht taeglich gebaut).
    kommende_termine = []
    for t in roh.get("kommende_termine", []):
        if (t.get("datum") or "") < heute_iso:
            continue
        kommende_termine.append({**t, "artikel": termin_artikel(t)})
    # Sitzungen MIT Tagesordnung gehoeren ebenso dazu: wer wissen will, was als
    # Naechstes ansteht, will auch die Sitzung von heute oder uebermorgen sehen
    # (Hinweis Nutzer 2026-10-13). Sie tragen den Link zur Tagesordnung.
    for s in roh["sitzungen"]:
        if (s.get("datum") or "") < heute_iso or ist_beteiligung(s["gremium"]):
            continue
        if not any(t["oeffentlich"] for t in s["tops"]):
            continue
        kommende_termine.append({
            "gremium": s["gremium"],
            "artikel": "",
            "datum": s["datum"],
            "datum_anzeige": s["datum_anzeige"],
            "zeit": s.get("zeit") or "",
            "ort": re.sub(r"\s*—\s*$", "", s.get("raum") or ""),
            "quelle": s["quelle"],
            "tagesordnung_url": s["url"],
        })
    kommende_termine.sort(key=lambda t: (t["datum"], t.get("zeit") or ""))

    ketten = ketten_setzen(feed)

    stand_verteilung = {}
    for e in feed:
        stand_verteilung[e["stand"]] = stand_verteilung.get(e["stand"], 0) + 1

    # Abdeckung ehrlich ausweisen: "1712 Themen" ist nicht dieselbe Zahl wie
    # "1712 Tagesordnungspunkte" — dieselbe Vorlage laeuft oft durch mehrere
    # Gremien (siehe thema_schluessel oben). Die Fusszeile soll die tatsaechliche
    # TOP-Abdeckung nennen, nicht die kleinere Themenzahl, und alle Gruende fuer
    # die Luecke nennen statt nur "Sitzungsroutine" — siehe pruefen.py::p_abdeckung,
    # dieselbe Zaehlung (TOP-fuer-TOP ueber die Rohdaten, nicht ueber die
    # "auftritte"-Listen: mehrere TOPs koennen sich denselben bloßen "Ö"-Nummer
    # teilen und dann als Duplikat verschwinden, wenn man stattdessen die
    # Listenlaengen aufsummiert).
    im_feed_themen = set(je_thema.keys())
    im_feed_refs = {e["ref"] for e in feed}
    gruende = collections.Counter()
    # Jahre mit noch offenem Rueckstand vs. bereits durcharbeiteten Jahren —
    # die Fusszeile soll ehrlich sagen, fuer welchen Zeitraum "aufbereitet"
    # tatsaechlich (fast) vollstaendig ist, statt den Gesamt-Zeitraum
    # foelschlich als gleichmaessig bearbeitet erscheinen zu lassen.
    alle_jahre = set()
    offene_jahre = collections.Counter()
    for sitzung in roh["sitzungen"]:
        q = sitzung.get("quelle", HAUPT_QUELLE)
        jahr = (sitzung["datum"] or "")[:4]
        if jahr:
            alle_jahre.add(jahr)
        bare_pos = bare_positionen(sitzung)
        for top in sitzung["tops"]:
            ref = top_ref(q, sitzung, top, bare_pos)
            schluessel = thema_schluessel(q, top) or ref
            if ref in im_feed_refs or schluessel in im_feed_themen:
                gruende["abgedeckt"] += 1
            elif not top["oeffentlich"]:
                gruende["nicht_oeffentlich"] += 1
            elif top["verfahren"]:
                gruende["sitzungsroutine"] += 1
            elif ist_beteiligung(sitzung["gremium"]):
                gruende["beteiligung"] += 1
            elif len(top["titel"]) < 12 or ist_sammelueberschrift(top["titel"]):
                gruende["sonstige"] += 1
            else:
                gruende["offen"] += 1
                if jahr:
                    offene_jahre[jahr] += 1
    tops_abgedeckt = gruende["abgedeckt"]
    jahre_vollstaendig = sorted(alle_jahre - set(offene_jahre))
    jahre_rueckstand = sorted(offene_jahre)

    ausgabe = {
        "stadt": "Büren und der Kreis Paderborn",
        "quellen": roh["quellen"],
        "hinweis": roh.get("hinweis", ""),
        "daten_abgerufen_am": roh["abgerufen_am"],
        "feed_gebaut_am": date.today().isoformat(),
        "zeitraum": roh["zeitraum"],
        "statistik": {
            "sitzungen_ausgelesen": roh["anzahl_sitzungen"],
            "portale": len(roh["quellen"]),
            "tops_ausgelesen": roh["anzahl_tops"],
            "tops_verfahren": roh.get("anzahl_verfahren", 0),
            "tops_kuratiert": len(feed),          # Themen — nach Vorlage entdoppelt
            "tops_abgedeckt": tops_abgedeckt,      # tatsaechliche TOP-Abdeckung
            # Die folgenden vier plus tops_abgedeckt ergeben zusammen genau
            # tops_ausgelesen — anders als tops_verfahren oben (das zaehlt ALLE
            # Sitzungsroutine-TOPs, auch die drei, die zufaellig trotzdem in
            # einem kuratierten Thema mitlaufen).
            "tops_sitzungsroutine_offen": gruende["sitzungsroutine"],
            "tops_beteiligung": gruende["beteiligung"],
            "tops_sonstige": gruende["sonstige"],
            "tops_nicht_oeffentlich": gruende["nicht_oeffentlich"],
            "tops_offen": gruende["offen"],        # noch nicht kuratiert
            "jahre_vollstaendig": jahre_vollstaendig,  # kein Rueckstand mehr
            "jahre_rueckstand": jahre_rueckstand,      # noch offene TOPs
            "entwuerfe": sum(1 for e in feed if e["entwurf"]),
            # nur echte Texte — die Titel-Schablone zaehlt nicht als Uebersetzung
            "leichte_sprache": sum(1 for e in feed if e["klartext_leicht"] and not e["duenn"]),
            "je_quelle": {
                k: sum(1 for e in feed if e["quelle"] == k) for k in roh["quellen"]
            },
            "stand": stand_verteilung,
            "status": dict(collections.Counter(e["status"] for e in feed)),
            # Echte Stadtbezirke (I bis XII) — ohne "stadtweit"; die Kopfzahl
            # hiess vorher "14 Stadtbezirke", weil beides mitgezaehlt wurde.
            "stadtbezirke": sum(1 for b in bezirke if re.match(r"^[IVX]+-", b)),
            "duenn": sum(1 for e in feed if e["duenn"]),
        },
        "achsen": {
            "lebenslage": achse("lebenslage"),
            "bezirk": bezirke,
            "anlass": achse("anlass"),
            "ebene": ebenen,
            "status": [w for w in STATUS_FILTER if any(e["status"] == w for e in feed)],
            "stand": staende,
        },
        "eintraege": feed,
        # Sitzungstermine: ohne veroeffentlichte Tagesordnung reine Fakten
        # (siehe ris_ingolstadt.py::kommende_termine_auslesen), mit
        # Tagesordnung zusaetzlich "tagesordnung_url".
        "kommende_termine": kommende_termine,
    }

    ziel = os.path.join(DATEN_VZ, "feed.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(ausgabe, f, ensure_ascii=False, indent=2)
    print(f"Geschrieben: {ziel}")

    # Die Daten liegen als eigene Skriptdatei neben der Seite, nicht mehr in ihr.
    # Bewusst .js mit window.FEED statt .json per fetch(): ein klassisches
    # <script src> laedt auch ueber file://, fetch() nicht. Damit laesst sich
    # index.html weiterhin per Doppelklick oeffnen, ohne Webserver.
    js_pfad = os.path.join(DATEN_VZ, "feed.js")
    with open(js_pfad, "w", encoding="utf-8") as f:
        f.write("/* Automatisch erzeugt von scraper/feed_bauen.py — nicht haendisch aendern. */\n")
        f.write("window.FEED = " + json.dumps(ausgabe, ensure_ascii=False) + ";\n")
    print(f"Geschrieben: {js_pfad} ({os.path.getsize(js_pfad) // 1024} KB)")
    fabrik_js_schreiben(ausgabe)

    st = ausgabe["statistik"]
    print(
        f"  {st['tops_kuratiert']} aufbereitete Eintraege "
        f"von {st['tops_ausgelesen']} TOPs "
        f"({st['tops_verfahren']} davon Sitzungsroutine), "
        f"{st['entwuerfe']} noch Entwurf, "
        f"{st['duenn']} nur mit Titel (gebuendelt angezeigt)"
    )
    print(f"  je Quelle: {st['je_quelle']}")
    print(f"  Stand:     {st['stand']}")
    print(f"  Status:    {st['status']}")
    print(
        f"  Vollstaendig kuratiert: {', '.join(st['jahre_vollstaendig']) or '(keine)'} "
        f"· Rueckstand: {', '.join(st['jahre_rueckstand']) or '(keiner)'}"
    )
    print(
        f"  Achsen: {len(ausgabe['achsen']['lebenslage'])} Lebenslagen, "
        f"{len(ausgabe['achsen']['bezirk'])} Bezirke, "
        f"{len(ausgabe['achsen']['anlass'])} Anlaesse, "
        f"{len(ausgabe['achsen']['stand'])} Staende"
    )

    print(f"  Vorgangsketten: {ketten} "
          f"({sum(1 for e in feed if e.get('kette'))} Eintraege)")
    mehrfach = sum(1 for e in feed if len(e["auftritte"]) > 1)
    print(
        f"  Themen: {len(feed)} Karten aus {len(eintraege_kuration)} "
        f"Kurationseintraegen; {mehrfach} Themen liefen durch mehrere Gremien"
    )

    if fehlend:
        print(f"\n  ! {len(fehlend)} Kurationseintraege ohne Rohdaten-TOP:")
        for ref in fehlend:
            print(f"    - {ref}")

    if doppelt:
        print(
            f"\n  {len(doppelt)} Kurationseintraege betreffen ein bereits "
            f"erfasstes Thema und wurden zusammengefasst:"
        )
        for schluessel, verworfen in doppelt:
            print(f"    - {verworfen}  ({schluessel})")

    # Die Bezirk-Achse existiert nur, wenn _achsen.bezirk Eintraege hat
    # (Stadtbezirke). Ohne solche Eintraege waere die Liste endlos lang.
    ohne_bezirk = (
        [e["ref"] for e in feed if not e["bezirk"]] if bezirk_ordnung else []
    )
    if ohne_bezirk:
        print(
            f"\n  {len(ohne_bezirk)} Eintraege ohne Stadtbezirk "
            f"(von Hand zuordnen in kuration.json):"
        )
        for ref in ohne_bezirk:
            print(f"    - {ref}")

    unkuratiert = [
        ref
        for ref, (_, top) in index.items()
        if ref not in eintraege_kuration and top["oeffentlich"] and not top["verfahren"]
    ]
    print(
        f"\n  {len(unkuratiert)} oeffentliche TOPs sind noch nicht aufbereitet "
        f"— 'python3 entwuerfe_bauen.py' erzeugt Vorschlaege dafuer."
    )


def fabrik_js_schreiben(ausgabe):
    """Die Zahlen fuer die Fabrik auf so-funktionierts.html als eigene kleine
    Datei: die Seite soll nicht die ganze feed.js (mehrere MB) laden, nur um
    neun Zahlen anzuzeigen."""
    st = ausgabe["statistik"]
    feed = ausgabe["eintraege"]
    zahlen = {
        "stand": ausgabe["daten_abgerufen_am"],
        "tops": st["tops_ausgelesen"],
        "sitzungen": st["sitzungen_ausgelesen"],
        "routine": st["tops_verfahren"],
        "mit_dokument": sum(1 for e in feed if e.get("dokumente")),
        "leichte_sprache": sum(1 for e in feed if e.get("klartext_leicht") and not e["duenn"]),
        "entschieden": st["status"].get("Entschieden", 0),
        "stadtbezirke": st["stadtbezirke"],
        "portale": st["portale"],
        "themen": st["tops_kuratiert"],
    }
    pfad = os.path.join(DATEN_VZ, "fabrik.js")
    with open(pfad, "w", encoding="utf-8") as f:
        f.write("/* Automatisch erzeugt von scraper/feed_bauen.py — nicht haendisch aendern. */\n")
        f.write("window.FABRIK_ZAHLEN = " + json.dumps(zahlen, ensure_ascii=False) + ";\n")
    print(f"Geschrieben: {pfad}")


if __name__ == "__main__":
    main()
