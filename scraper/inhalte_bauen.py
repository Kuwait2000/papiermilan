#!/usr/bin/env python3
"""
Baut den Inhaltskatalog INHALTE.md: was auf welcher Seite steht, mit den
wichtigsten Zahlen, Quellen und Lizenzen.

    python3 inhalte_bauen.py

Gedacht für Arbeit außerhalb des Repos (Social Media, Vorträge, andere
Projekte): Wer den Katalog hat, muss das Repo nicht durchsuchen. Die Texte zu
den Seiten stehen unten in SEITEN und werden von Hand gepflegt; alle Zahlen
kommen aus den Datendateien in data/, die auch die Seiten verwenden.

Nach jedem Daten-Update laufen lassen, nach themen_bauen.py (die
Kachelzahlen liest dieses Skript aus data/themen.js).

Ergebnis: ../INHALTE.md
"""

import json
import os
import re
import sys
from collections import Counter
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
from ris_ingolstadt import QUELLEN  # noqa: E402
WURZEL = os.path.dirname(HIER)
DATEN_VZ = os.path.join(WURZEL, "data")
ZIEL = os.path.join(WURZEL, "INHALTE.md")
WEB = "https://DEINE-DOMAIN.example/"  # eigene Domain eintragen
CC_BY_RAT = "CC BY 4.0, Namensnennung: „PapierPanther (Büren & Kreis Paderborn), DEINE-DOMAIN.example, CC BY 4.0“ — an eigene Domain/Name anpassen"

WARNUNGEN = []


def lade(name):
    with open(os.path.join(DATEN_VZ, name), encoding="utf-8") as f:
        return json.load(f)


def lade_js(name, var):
    """window.X = {...}; aus einer .js-Datei, die reines JSON enthält."""
    with open(os.path.join(DATEN_VZ, name), encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"window\." + var + r"\s*=\s*(.*);\s*$", text, re.S)
    return json.loads(m.group(1))


def de(zahl, nachkomma=0):
    return f"{zahl:,.{nachkomma}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def mio(euro, nachkomma=1):
    return f"{de(euro / 1e6, nachkomma)} Mio. €"


def datum_de(iso):
    if not iso or len(iso) < 10:
        return iso or ""
    j, m, t = iso[:10].split("-")
    return f"{t}.{m}.{j}"


# ---------------------------------------------------------------------------
# Zahlen je Seite. Jede Funktion gibt (stand, [zeilen]) zurück.
# ---------------------------------------------------------------------------

def z_start():
    f = lade("feed.json")
    st = f["statistik"]
    je_quelle = ", ".join(f"{k} {de(v)}" for k, v in st["je_quelle"].items())
    zeilen = [
        f"{de(st['sitzungen_ausgelesen'])} Sitzungen und {de(st['tops_ausgelesen'])} Tagesordnungspunkte ausgelesen "
        f"({f['zeitraum']['von']} bis {f['zeitraum']['bis']}) aus {de(st['portale'])} Portalen, "
        f"davon {de(st['tops_kuratiert'])} als Eintrag in Klartext",
        f"Einträge je Quelle: {je_quelle}",
        f"{de(st['leichte_sprache'])} Einträge auch in Einfacher Sprache",
        "Stand der Einträge: " + ", ".join(f"{k} {de(v)}" for k, v in
                                          sorted(st["stand"].items(), key=lambda kv: -kv[1])),
    ]
    if os.path.exists(os.path.join(DATEN_VZ, "orte.json")):
        o = lade("orte.json")["statistik"]
        u = lade("orte.json")["unfall"]
        zeilen.append(f"{de(o['mit_ort'])} von {de(o['eintraege'])} Einträge tragen einen Ort ({de(o['orte'])} verschiedene Orte)")
        zeilen.append(f"Unfallatlas {u['von']}–{u['bis']}: {de(u['anzahl'])} Unfälle mit Verletzten im Gebiet")
    return f"Daten abgerufen {datum_de(f['daten_abgerufen_am'])}, Feed gebaut {datum_de(f['feed_gebaut_am'])}", zeilen


def z_antraege():
    a = lade("antraege.json")
    st = a["statistik"]
    je = sorted(((k, len(v)) for k, v in a["parteien"].items() if v), key=lambda kv: -kv[1])
    return f"abgerufen {datum_de(a['abgerufen_am'])}", [
        f"{de(st['gesamt'])} Anträge der Stadtratsfraktionen in dieser Wahlperiode",
        f"{de(st['in_beratung'])} davon schon in Beratung, {de(st['nur_eingereicht'])} noch auf keiner Tagesordnung",
        "Je Fraktion: " + ", ".join(f"{k} {v}" for k, v in je),
    ]


def z_haushalt():
    h = lade("haushalt.json")
    v = h["verwaltungs_vermoegenshaushalt_aktuell"]
    vb = h["vorbericht_aktuell"]
    j = h["aktuelles_jahr"]
    zeilen = [
        f"Ausgaben {j} gesamt: {mio(v['verwaltungshaushalt_ausgaben'] + v['vermoegenshaushalt_ausgaben'])} "
        f"(Verwaltungshaushalt {mio(v['verwaltungshaushalt_ausgaben'])}, Vermögenshaushalt {mio(v['vermoegenshaushalt_ausgaben'])})",
        f"Lücke im Verwaltungshaushalt {j}: {mio(v['zuschussbedarf'])}",
        f"Neue Kredite für Investitionen {j}: {mio(v['kreditaufnahme_investitionen'])}",
        "Schulden Kernhaushalt: " + ", ".join(f"{s['jahr']} {mio(s['stand'])} ({s['art']})"
                                             for s in vb["schulden_kernhaushalt"]),
        "Schulden je Einwohner: " + ", ".join(f"{s['jahr']} {de(s['ingolstadt'])} € ({s['art']})"
                                             for s in vb["schulden_je_einwohner"] if s["jahr"] >= 2023),
        "Größter Zuschussbedarf je Referat: " + ", ".join(
            f"{r['name']} {mio(r['zuschussbedarf'])}"
            for r in sorted(h["referate_aktuell"], key=lambda r: -r["zuschussbedarf"])[:3]),
    ]
    return f"Haushaltsplan {j}", zeilen


def z_hsk():
    b = lade("hsk_bericht.json")
    k = b["konsolidierungsziel"]
    s = b["schulden"]
    hk = lade("hsk.json")
    alle = [x for v in hk["massnahmen"].values() if isinstance(v, list) for x in v]
    status = Counter(x.get("status") or "ohne Angabe" for x in alle)
    return f"Konzept Stand {b['stand']}", [
        f"Sparziel im Schnitt {de(-k['durchschnitt_kzv'] / 1000, 1)} Mio. € pro Jahr ({k['jahre'][0]}–{k['jahre'][-1]}), "
        f"das sind im Schnitt {de(k['anteil_prozent_durchschnitt'], 1)} % des bereinigten Verwaltungshaushalts",
        "Sparziel je Jahr: " + ", ".join(f"{j} {de(-z / 1000, 1)} Mio. €" for j, z in zip(k["jahre"], k["kzv"])),
        f"Schulden {s['bestand_stand']}: {de(s['bestand_teur'] / 1000)} Mio. €; ohne Sparen im Jahr 2036 rund "
        f"{mio(s['szenarien']['trend']['stand_2036'], 0)} (Trendszenario, S. {s['szenarien']['trend']['_seite']})",
        f"{len(alle)} Maßnahmen im Katalog, Stand: " + ", ".join(f"{k2} {v2}" for k2, v2 in status.most_common()),
        f"{len(hk['freiwillige_leistungen']['posten'])} freiwillige Leistungen einzeln aufgelistet (Anlage 5)",
    ]


def z_beteiligungen():
    b = lade("beteiligungen.json")
    e = b["eckdaten"]
    einl = [j["einlage"] / 1000 for j in b["waage"]["jahre"] if not j.get("prognose")]
    return f"{b['quelle']['titel']} ({b['quelle']['stand']})", [
        f"{e['unternehmen']} Unternehmen, an {e['mit_mehrheit']} hält die Stadt die Mehrheit",
        f"{de(e['beschaeftigte'])} Beschäftigte, Vermögen {de(e['vermoegen_mio'])} Mio. €, "
        f"Investitionen {de(e['investitionen_mio'])} Mio. €",
        f"Kredite der Unternehmen: {de(e['kredite_teur'] / 1000)} Mio. €, davon der Stadt zugerechnet "
        f"{de(e['kredite_stadt_zugerechnet_mio'])} Mio. € (Busse {e['zugerechnet_busse_mio']}, Freizeit {e['zugerechnet_freizeit_mio']})",
        f"Einlage der Stadt für Busse, Bäder, Eishallen: {de(min(einl))} bis {de(max(einl))} Mio. € im Jahr",
        "Alltagsbereiche auf der Seite: " + ", ".join(x["name"] for x in b["bereiche"]),
    ]


def z_klima():
    k = lade("klima.json")
    kb = lade("klima_bericht.json")
    s = k["solar"]["reihe"][-1]
    l = k["laden"]
    t = kb["thg"]
    return f"erzeugt {datum_de(k['erzeugt_am'])}", [
        f"{de(s['bestand_anzahl'])} Solaranlagen mit {de(s['bestand_kw'] / 1000, 1)} MW ({s['jahr']}), "
        f"Zubau {s['jahr']}: {de(s['zubau_anzahl'])} Anlagen, davon {de(s['zubau_anzahl_stecker'])} Steckersolar",
        f"{de(l['ladepunkte'])} öffentliche Ladepunkte an {de(l['einrichtungen'])} Standorten, "
        f"{de(l['schnell'])} davon Schnelllader (Stand {l['stand']})",
        f"Wetter: Station {k['klima']['station']}, Tageswerte seit {k['klima']['jahre'][0]['jahr']}",
        heisse_tage(k["klima"]),
        f"Ziel klimaneutral: Stadt {kb['ziele']['klimaneutral_stadt']}, Verwaltung {kb['ziele']['klimaneutral_verwaltung']} "
        f"({kb['ziele']['beschluss']})",
        f"CO₂-Minderung nötig {de(t['reduktion_erforderlich_t_pro_jahr'])} t/Jahr, erreicht "
        f"{de(t['reduktion_erreicht_t_pro_jahr'])} t/Jahr ({t['reduktion_bezug']}); Industrie-Anteil 2021: {t['anteil_industrie_2021']} %",
    ]


def heisse_tage(kl):
    r = kl["referenz"]
    jahre = kl["jahre"]
    voll = [j for j in jahre if j["vollstaendig"]]
    rekord = max(jahre, key=lambda j: j["heisse_tage"])
    jetzt = jahre[-1]
    teil = "" if jetzt["vollstaendig"] else f", {jetzt['jahr']} bis {jetzt['bis']}: {jetzt['heisse_tage']}"
    return (f"Heiße Tage (ab 30 °C): Mittel {r['von']}–{r['bis']} {de(r['heisse_tage'], 1)}, "
            f"{voll[-1]['jahr']}: {voll[-1]['heisse_tage']}{teil}; Höchstwert {rekord['heisse_tage']} ({rekord['jahr']}). "
            f"Mitteltemperatur {voll[-1]['jahr']}: {de(voll[-1]['mitteltemperatur'], 1)} °C "
            f"(Referenz {de(r['mitteltemperatur'], 1)} °C)")


def z_waerme():
    w = lade("waerme.json")
    a = w["adressen"]
    je = a["je_klasse"]
    g = a["gesamt"]
    anteil = lambda b: (b["je_klasse"]["netz"] + b["je_klasse"]["netz_spaeter"]) / b["adressen"] * 100
    bez = sorted(w["bezirke"], key=anteil, reverse=True)
    bs = w["beschluss"]
    return f"Adressen Stand {datum_de(a['stand'])}", [
        f"{de(g)} Hausadressen ausgewertet (eigene Auswertung, keine Zahl der Stadt)",
        f"Wärmenetz-Gebiet: {de((je['netz'] + je['netz_spaeter']) / g * 100)} % (davon später: {de(je['netz_spaeter'])} Adressen), "
        f"Prüfgebiet Gas/Wärmepumpe: {de(je['gas_wp'] / g * 100)} %, Einzelversorgung: {de(je['einzel'] / g * 100)} %",
        "Anteil Wärmenetz je Bezirk: " + ", ".join(f"{b['name']} {de(anteil(b))} %" for b in bez),
        f"Beschluss: {bs['gremium']} {datum_de(bs['datum'])}, {bs['ergebnis']} ({bs['vorlage']}), genannte Kosten {bs['kosten_genannt_mio']} Mio. €",
        "Rechtsstand: Seit 29.07.2026 gilt § 43 GModG, die 65-Prozent-Regel des alten GEG ist weg",
    ]


def z_wohnen():
    with open(os.path.join(DATEN_VZ, "wohnen.js"), encoding="utf-8") as f:
        text = f.read()
    hh = re.search(r"haushalte: \{\s*2022: \{ gesamt: (\d+), eigentum: (\d+), miete: (\d+)", text)
    g, e, m = (int(x) for x in hh.groups())
    stand = re.search(r'stand: "([^"]+)"', text).group(1)
    return f"Zensus 2022 (Stichtag 15.05.2022), abgerufen {datum_de(stand)}", [
        f"{de(g)} Haushalte, {de(m / g * 100, 1)} % wohnen zur Miete, {de(e / g * 100, 1)} % im Eigentum",
        "Weitere Zahlen der Seite (Eigentümer, Leerstand, Vergleich 2011): direkt in data/wohnen.js",
    ]


def z_miete():
    with open(os.path.join(DATEN_VZ, "miete.js"), encoding="utf-8") as f:
        text = f.read()
    bis = re.search(r'gueltig_bis: "([^"]+)"', text).group(1)
    return "Mietspiegel November 2025", [
        f"Mietspiegel gilt bis {bis}, Rechner läuft nur im Browser",
        "Mietpreisbremse und Kappungsgrenze gelten in Ingolstadt (Bayerische Mieterschutzverordnung, Anlage 1.1.1)",
        "Neuer Mietspiegel: Befragung voraussichtlich 2. Quartal 2027",
    ]


def z_plaene():
    p = lade("plaene.json")
    ab = p["zeitraum"]["alle_gremien_ab"] + "-01"
    lauf = [x for x in p["plaene"] if x["status"]["schritt"] in ("grundsatz", "aufstellung", "entwurf")
            and (x["umgriff"] or x["letzte_bewegung"] >= ab)]
    kraft = sum(1 for x in p["plaene"] if x["status"]["schritt"] == "kraft")
    zuletzt = sorted((x for x in p["plaene"] if x.get("letzte_bewegung")),
                     key=lambda x: x["letzte_bewegung"], reverse=True)[:5]
    return f"Stand {datum_de(p['stand'])}", [
        f"{len(lauf)} Bebauungspläne im Verfahren, {de(kraft)} in Kraft",
        "Zuletzt bewegt: " + "; ".join(
            f"Nr. {x['nr']} {x['name']} ({x['bezirk_name'] or 'ohne Bezirk'}, {x['status']['schritt']}, {datum_de(x['letzte_bewegung'])})"
            for x in zuletzt),
    ]


def z_wege():
    return "Zensus-Gitter 2022 und OpenStreetMap", [
        "Fünf Personen (Erwachsene, Kind, ältere Person, Rollstuhl/Kinderwagen, Besucher:in), zwei Bedingungen (Nacht, Hitze)",
        "Ziele: Apotheke, Hausarzt, Supermarkt, Bank/Post, Haltestelle, Kirche, Toilette, Drogerie",
        "Kernzahl siehe Kachel oben; Bezirkstabellen druckt scraper/wege_bauen.py",
    ]


def z_beteiligen():
    return "", ["12 Bezirksausschüsse, je einer pro Stadtbezirk"]


ZAHLEN = {
    "index.html": z_start, "antraege.html": z_antraege, "haushalt.html": z_haushalt, "hsk.html": z_hsk,
    "beteiligungen.html": z_beteiligungen, "klima.html": z_klima, "waerme.html": z_waerme,
    "wohnen.html": z_wohnen, "miete.html": z_miete, "plaene.html": z_plaene, "wege.html": z_wege,
    "beteiligen.html": z_beteiligen,
}

# ---------------------------------------------------------------------------
# Von Hand gepflegt: was die Seite ist, was sie kann, woher es kommt
# ---------------------------------------------------------------------------

SEITEN = [
    dict(href="index.html", titel="Startseite: alle Einträge aus Rat und Kreistag",
         worum="Jeder öffentliche Tagesordnungspunkt von Rat und Ausschüssen der Stadt Büren sowie Kreistag und "
               "Ausschüssen des Kreises Paderborn in Klartext und Einfacher Sprache, sortiert nach Lebenslage, Ebene "
               "und Anlass. Jeder Eintrag verlinkt Sitzung, Vorlage und Dokumente.",
         kann="Filter nach Ebene, Lebenslage, Stand und Stichwort; kommende Sitzungstermine. Optional (sobald "
              "scraper/wege_bauen.py + orte_bauen.py gelaufen sind): Orte an Einträgen anklickbar (?ort=), "
              "„In meiner Nähe“ mit Umkreis, Unfallzahlen an Verkehrsthemen.",
         grafik="In dieser Portierung deaktiviert (braucht Karten-/Ortsdaten); im Originalprojekt Szenen „start“, „orte“, „themen“.",
         quellen="Ratsinfosystem der Stadt Büren und Kreistagsinformationssystem des Kreises Paderborn (SessionNet von Somacos); "
                 f"Kurztexte teils mit Sprachmodell. Lizenz der kuratierten Ratsdaten: {CC_BY_RAT}.",
         vorsicht="Verbindlich ist immer das Originaldokument. „Nur besprochen“ heißt nicht beschlossen.",
         ideen="Wochenvorschau „Das kommt in den Rat“; Beschluss der Woche erklärt; ein Ort, viele Vorgänge."),
    dict(href="themen.html", titel="Themen im Überblick",
         worum="Kacheln je Lebenslage mit Zahl der Einträge, verlinkt auf die gefilterte Startseite.",
         kann="Schneller Überblick, worum es zuletzt ging.",
         grafik="Szene „themen“ (Originalprojekt).",
         quellen="data/feed.json (aus den beiden Portalen).",
         vorsicht="Zahlen sind der Stand beim letzten Datenlauf.",
         ideen="„Diese Woche im Rat: Wohnen“ als Shareable."),
    dict(href="so-funktionierts.html", titel="So funktioniert’s",
         worum="Fabrik: wie aus einem Tagesordnungspunkt ein Eintrag wird — von den Portalen bis zur Website, "
               "Station für Station.",
         kann="Scroll-Geschichte mit 3D-Fabrik (WebGL).",
         grafik="Die Fabrik selbst.",
         quellen="data/fabrik.js (Zahlen aus feed_bauen.py).",
         vorsicht="Beispieltexte sind fest im Skript hinterlegt.",
         ideen="„So entsteht ein Eintrag“ als Erklär-Post."),
    dict(href="impressum.html", titel="Impressum",
         worum="Anbieterkennzeichnung (§ 5 DDG) mit Platzhaltern für Name/Adresse — vor Veröffentlichung ausfüllen!",
         kann="Kontakt für Fehlerhinweise.",
         grafik="—",
         quellen="—",
         vorsicht="Ohne echte Adresse nicht live schalten.",
         ideen="—"),
    dict(href="datenschutz.html", titel="Datenschutzerklärung",
         worum="Art. 13/14 DSGVO: keine Cookies, keine externen Ressourcen, Zählung deaktiviert.",
         kann="—", grafik="—", quellen="—",
         vorsicht="Bei eingeschalteter Zählung (zaehler.js) Abschnitt 4 anpassen.",
         ideen="—"),
    dict(href="barrierefreiheit.html", titel="Erklärung zur Barrierefreiheit",
         worum="Freiwillige WCAG-2.1-AA-Erklärung mit Selbstprüfung.",
         kann="Meldemöglichkeit für Barrieren.",
         grafik="—", quellen="—",
         vorsicht="Domain-Platzhalter ersetzen.",
         ideen="—"),
]


def ratsgeschehen():
    """Kommende Termine und jüngste Beschlüsse: Stoff für aktuelle Posts."""
    f = lade("feed.json")
    zeilen = ["## Aktuell aus dem Rat", "",
              f"Stand {datum_de(f['feed_gebaut_am'])}. Veraltet schnell, vor einem Post auf der Seite gegenprüfen.", "",
              "### Kommende Sitzungen", ""]
    for t in [t for t in f["kommende_termine"] if t["datum"] >= f["feed_gebaut_am"] and t["quelle"] in QUELLEN][:12]:
        zeit = f" {t['zeit']}" if t.get("zeit") else ""
        zeilen.append(f"- {t['datum_anzeige']}{zeit}: {t['gremium']}")
    zeilen += ["", "### Zuletzt entschieden", "",
               "Ein Ergebnis steht erst fest, wenn die Niederschrift erschienen ist; das dauert oft Wochen.", ""]
    neu = sorted((e for e in f["eintraege"] if e.get("status") == "Entschieden"
                  and e.get("quelle") in QUELLEN and e.get("klartext_titel")),
                 key=lambda e: e["datum"], reverse=True)
    for e in neu[:25]:
        formel = (e.get("beschluss") or {}).get("formel", "")
        link = e.get("vorlage_url") or e.get("sitzung_url", "")
        zeilen.append(f"- {e['datum_anzeige']}, {e['gremium']}: {e['klartext_titel']}"
                      f"{' (' + formel + ')' if formel else ''} – [Quelle]({link})")
    if len(neu) > 25:
        zeilen.append(f"- … und {de(len(neu) - 25)} ältere, siehe Startseite")
    return zeilen


def main():
    try:
        kacheln = {k["href"]: k for k in lade_js("themen.js", "THEMEN_DATEN")}
    except Exception:
        kacheln = {}   # themen.js fehlt noch (erst nach themen_bauen.py da)
    heute = date.today().strftime("%d.%m.%Y")
    out = [
        "# PapierPanther: Inhaltskatalog",
        "",
        f"Erzeugt von `scraper/inhalte_bauen.py` am {heute}. Nicht von Hand ändern: Texte stehen im Skript "
        "(`SEITEN`), Zahlen kommen aus `data/`.",
        "",
        "Wozu: Wer über PapierPanther schreibt, postet oder vorträgt, findet hier jede Seite mit Kernaussage, Zahlen, "
        "Quellen, Lizenz und Fallstricken, ohne das Repository zu durchsuchen. Die Datei lässt sich in andere Projekte "
        "kopieren.",
        "",
        "## Grundsätzliches",
        "",
        f"- Website: {WEB}. Kein offizielles Angebot der Stadt Büren oder des Kreises Paderborn.",
        "- Idee: Was Rat und Kreistag in Büren und im Kreis Paderborn entscheiden, und wen es betrifft. Tagesordnungen in Klartext und "
        "Einfacher Sprache, sortiert nach Betroffenheit.",
        "- Haltung: erklärt, bewertet nicht. Parteipolitisch neutral. Verbindlich ist immer das Originaldokument, "
        "jeder Eintrag verlinkt es.",
        "- Jede Seite gibt es in Alltagssprache und in Einfacher Sprache (Umschalter oben).",
        f"- Lizenzen: Code EUPL-1.2; eigene Texte CC BY 4.0; kuratierte Ratsdaten {CC_BY_RAT}. Fremddaten behalten "
        "ihre Lizenz (bei jeder Seite genannt). Name, Wortmarke und Maskottchen „PapierPanther“ sind nicht "
        "mitlizenziert.",
        "- Kurztexte entstehen teils mit einem Sprachmodell und werden nach den Regeln in `KURATION.md` geprüft.",
        "",
        "## Seiten",
        "",
    ]
    for s in SEITEN:
        out.append(f"### {s['titel']}")
        out.append("")
        out.append(f"Adresse: {WEB}{'' if s['href'] == 'index.html' else s['href']}")
        out.append("")
        k = kacheln.get(s["href"])
        if k:
            out.append(f"**Kachel:** {k['zahl']} {k['text']}  ")
            out.append(f"*Einfache Sprache:* {k['text_l']}")
            out.append("")
        out.append(f"**Worum es geht:** {s['worum']}")
        out.append("")
        out.append(f"**Was man dort tun kann:** {s['kann']}")
        out.append("")
        fn = ZAHLEN.get(s["href"])
        if not fn:
            pass   # fuer diese Seite gibt es keine Zahlenfunktion
        else:
          try:
            stand, zahlen = fn()
            out.append(f"**Zahlen**{' (' + stand + ')' if stand else ''}:")
            out.append("")
            out += [f"- {z}" for z in zahlen]
          except Exception as fehler:  # eine kaputte Datei soll den Katalog nicht verhindern
            WARNUNGEN.append(f"{s['href']}: {fehler!r}")
            out.append(f"**Zahlen:** konnten nicht gelesen werden ({fehler!r}). Bitte Skript prüfen.")
        out.append("")
        out.append(f"**Schaubild:** {s['grafik']}")
        out.append("")
        out.append(f"**Quellen und Lizenz:** {s['quellen']}")
        out.append("")
        out.append(f"**Vorsicht:** {s['vorsicht']}")
        out.append("")
        out.append(f"**Ideen für Posts:** {s['ideen']}")
        out.append("")
    try:
        out += ratsgeschehen()
    except Exception as fehler:
        WARNUNGEN.append(f"Ratsgeschehen: {fehler!r}")
    out += ["", "## Weiterlesen im Repository", "",
            "- `README.md`: Technik, Datenwege, Skripte",
            "- `KURATION.md`: Regeln für Kurztexte und Einfache Sprache",
            "- `PROTOTYP-INGOLSTADT.md`: Datenlage und Befunde des Originalprojekts (Ingolstadt)",
            "- `NOTICE`: Lizenzen im Einzelnen", ""]
    with open(ZIEL, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"Geschrieben: {ZIEL}")
    for w in WARNUNGEN:
        print("WARNUNG", w, file=sys.stderr)
    return 1 if WARNUNGEN else 0


if __name__ == "__main__":
    sys.exit(main())
