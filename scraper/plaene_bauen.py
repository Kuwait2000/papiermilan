#!/usr/bin/env python3
"""
Baut die Daten der Themenseite "Baugebiete und Plaene" (plaene.html).

Liest alle Tagesordnungspunkte mit Bezug zu einem Bebauungsplan aus
  data/rohdaten.json     (ab 11/2023, alle Gremien) und
  data/plaene_alt.json   (davor, nur Stadtrat und Planungsausschuss,
                          siehe plaene_alt_holen.py),
ordnet sie nach Plannummer, erkennt je Vorlage den Verfahrensschritt und
sortiert die Anlagen (Planzeichnung, Begruendung, Gutachten nach Alltagsfragen).
Punkte ohne Plannummer (Bezirksausschuesse, Beiraete) haengt es ueber die
Stichworte der Handdatei an.

Dazu kommt data/plangebiete.json (plangebiete_holen.py, Landesdienst
"Bauleitplaene Bayern"): Umgriff, Inkrafttreten und die Links zur geltenden
Planzeichnung. Ein Bebauungsplan gilt erst mit der Bekanntmachung im
Amtsblatt, und die steht nicht im Ratsinfoportal; das Datum des
Inkrafttretens kommt deshalb allein vom Landesdienst. Plaene, die dort
stehen, im Rat seit 2014 aber nicht vorkamen, erscheinen als kurze Eintraege.

Von Hand gepflegt wird data/plaene_hand.json: Kurzname, Stichworte, Texte,
Ausschluesse und Gleichsetzungen. Was dort fehlt, kommt aus den Ratsdaten
und der Kuration.

Ergebnis: data/plaene.json, data/plaene.js (window.PLAENE)
"""

import json
import os
import re
import sys
from datetime import date

HIER = os.path.dirname(os.path.abspath(__file__))
DATEN = os.path.join(HIER, "..", "data")

PLANBEZUG = re.compile(r"bebauungs|grünordnungsplan|baugebiet", re.I)
# "…plan Nr. 178 A II", "…planes Nr. 114 M Ä II", "…plan Nr. 106 Ä XX", "Bebauungsplan Nr. 107"
PLAN_NR = re.compile(
    r"plan(?:es|s)?\s+Nr\.?\s*(\d{2,3})((?:\s?[A-Z]{1,2}\b)?(?:\s+Ä\s*[IVX]+\b)?(?:\s+[IVX]+\b)?)"
)
NAME = re.compile(r"Nr\.?\s*\d{2,3}[^„\"“”‚']{0,14}[„\"“”]\s*([^„\"“”]{3,90}?)\s*[\"“”]")

# Verfahrensschritte in ihrer Reihenfolge. "rang" ordnet den Stand eines Plans.
SCHRITTE = [
    ("satzung", 3, re.compile(r"satzungsbeschlu", re.I)),
    ("entwurf", 2, re.compile(r"entwurfsgenehmigung|billigungsbeschlu|auslegungsbeschlu", re.I)),
    ("aufstellung", 1, re.compile(r"aufstellungs|änderungsbeschlu|einleitungsbeschlu", re.I)),
    ("grundsatz", 0, re.compile(r"grundsatzbeschlu", re.I)),
]
RANG = {k: r for k, r, _ in SCHRITTE}
ROEMISCH = {"I": "01", "II": "02", "III": "03", "IV": "04", "V": "05", "VI": "06", "VII": "07",
            "VIII": "08", "IX": "09", "X": "10", "XI": "11", "XII": "12"}
VERTRAG = re.compile(r"durchführungsvertrag|städtebaulich\w* vertrag|erschließungsvertrag", re.I)

# Anlagen: was ist die Planzeichnung, was beantwortet welche Alltagsfrage
ANLAGEN = [
    ("vorlage", re.compile(r"^(vorlage|sitzungsvorlage|beschlussvorlage)\b", re.I)),
    ("beschluss", re.compile(r"^(beschluss|vorberatung|auszug|niederschrift)", re.I)),
    ("abwaegung", re.compile(r"abwägung|stellungnahmen|anregungen", re.I)),
    ("vertrag", re.compile(r"vertrag", re.I)),
    ("verkehr", re.compile(r"verkehr|stellpl|mobilit|erschließung", re.I)),
    ("laerm", re.compile(r"schall|lärm|immission|geruch|erschütter|luft", re.I)),
    ("boden", re.compile(r"baugrund|geolog|hydro|grundwasser|altlast|deponie|entwässer|niederschlag|"
                         r"boden|wasser|kampfmittel|versicker|geotechn|überflut|überschwemm|starkregen|sturzflut|hydraul", re.I)),
    ("natur", re.compile(r"umweltbericht|artenschutz|\bsap\b|habitat|grünordnung|pflege- und|eingriff|"
                         r"ausgleich|baum|biotop|fauna|flora|natur|landschaft|ffh", re.I)),
    ("klima", re.compile(r"klima|energie|besonnung|verschattung|wind|\bpv\b|photovoltaik|solar", re.I)),
    ("begruendung", re.compile(r"begründung", re.I)),
    ("plan", re.compile(r"bebauungsplan|grünordnungsplan|planzeichnung|planteil|planblatt|planentwurf|"
                        r"vorhaben-? und erschließungsplan|vorhabenplan|\bvep\b|lageplan|satzung|"
                        r"festsetzung|geltungsbereich|übersichtsplan|bplan|b-plan|plankonzept|städtebaulicher entwurf|flächennutzungsplan|\bfnp\b|\bplan\b", re.I)),
]
# Plaene der Nachbargemeinden, zu denen die Stadt nur gehoert wird
NACHBAR = re.compile(r"^\s*(\d+\.\s*Änderung[^—]*)?(Gemeinde|Markt|Stadt (?!Ingolstadt))\b|Flächennutzungsplan(es)? (der )?(Gemeinde|Markt)|, Gemeinde \w+", re.I)
PLAN_FNP = re.compile(r"flächennutzungsplan|\bfnp\b", re.I)


def lade(name, pflicht=True):
    pfad = os.path.join(DATEN, name)
    if not os.path.exists(pfad):
        if pflicht:
            sys.exit(f"{name} fehlt")
        return None
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def plan_nr(text):
    """Liefert die Bezeichnung eines Plans, z. B. '178 A II', oder ''."""
    m = PLAN_NR.search(text)
    if not m:
        return ""
    nr = re.sub(r"\s+", " ", (m.group(1) + " " + m.group(2).strip()).strip())
    # "120 A ÄI" und "120 A Ä I" sind derselbe Plan
    return re.sub(r"Ä\s*([IVX]+)", r"Ä \1", nr)


def anlage_art(titel):
    t = titel.strip()
    for art, muster in ANLAGEN:
        if muster.search(t):
            if art == "plan" and PLAN_FNP.search(t):
                return "fnp"
            if art == "begruendung" and PLAN_FNP.search(t):
                return "fnp"
            return art
    return "sonst"


def schritt_von(titel):
    """(schritt, zusatz) aus dem Titel einer Vorlage."""
    # Der Verfahrensschritt steht am Ende, hinter dem Plannamen
    ende = re.split(r"[\"“”]", titel)[-1] if re.search(r"[\"“”]", titel) else titel
    treffer = [k for k, _, m in SCHRITTE if m.search(ende)] or [k for k, _, m in SCHRITTE if m.search(titel)]
    if treffer:
        schritt = max(treffer, key=lambda k: RANG[k])
        zusatz = []
        if re.search(r"zweite erneute", titel, re.I):
            zusatz.append("zweite erneute")
        elif re.search(r"erneut", titel, re.I):
            zusatz.append("erneut")
        if schritt == "entwurf" and "aufstellung" in treffer:
            zusatz.append("zugleich Aufstellungsbeschluss")
        return schritt, ", ".join(zusatz)
    if VERTRAG.search(titel):
        return "vertrag", ""
    return "sonst", ""


def punkt_in_polygon(x, y, ring):
    drin = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            drin = not drin
        j = i
    return drin


def bezirk_von(punkt, bezirke):
    for f in bezirke["features"]:
        g = f["geometry"]
        polygone = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polygone:
            if punkt_in_polygon(punkt[0], punkt[1], poly[0]):
                return f["properties"]["beznr"]
    return ""


def mitte(geometrie):
    """Mitte der groessten Teilflaeche (kleine Teilflaechen weitab sind oft Ausgleichsflaechen)."""
    polygone = [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]

    def groesse(poly):
        xs = [p[0] for p in poly[0]]
        ys = [p[1] for p in poly[0]]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    ring = max(polygone, key=groesse)[0]
    return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)]


def plan_id(nr):
    return re.sub(r"[^0-9a-z]+", "-", nr.lower().replace("ä", "ae")).strip("-")


def main():
    roh = lade("rohdaten.json")
    alt = lade("plaene_alt.json", pflicht=False) or {"sitzungen": [], "zeitraum": None}
    hand = lade("plaene_hand.json")
    kuration = lade("kuration.json")["eintraege"]
    beschluesse = lade("beschluesse.json")
    bezirke = lade("bezirke.json")
    land = lade("plangebiete.json")
    amt = {f["properties"]["nr"]: f for f in land["features"]}
    bezname = {f["properties"]["beznr"]: f["properties"]["bezname"] for f in bezirke["features"]}
    stand = roh["abgerufen_am"]

    gleich = hand.get("gleich", {})
    aus = hand.get("ausschliessen", {})
    hp = hand.get("plaene", {})

    # ---- 1. Alle Punkte mit Planbezug einsammeln, je Vorlage zusammenfassen
    vorlagen = {}   # (plan, vorlage) -> Eintrag
    lose = []       # Punkte ohne Plannummer oder ohne Vorlage
    gesehen = set()
    for s in roh["sitzungen"] + alt["sitzungen"]:
        for t in s["tops"]:
            if not t.get("oeffentlich", True):
                continue
            text = t["titel"] + " " + t.get("zusatz", "")
            schluessel = (s["quelle"], s["id"], t["nr"])
            if schluessel in gesehen:
                continue
            if NACHBAR.search(t["titel"]):
                continue
            nr = plan_nr(t["titel"])
            if not nr and not PLANBEZUG.search(text) and not any(
                re.search(w, text, re.I) for p in hp.values() for w in p.get("stichworte", [])
            ):
                continue
            gesehen.add(schluessel)
            nr = gleich.get(nr, nr)
            punkt = {
                "datum": s["datum"], "gremium": s["gremium"], "quelle": s["quelle"],
                "titel": t["titel"], "url": s["url"], "ref": f"{s['quelle']}:{s['id']}#{t['nr']}",
                "dokumente": t["dokumente"], "vorlage": t["vorlage"], "vorlage_url": t["vorlage_url"],
                "beratungen": t.get("beratungen", []),
            }
            if nr and t["vorlage"] and s["quelle"] == "stadt":
                v = vorlagen.setdefault((nr, t["vorlage"]), {"punkte": []})
                v["punkte"].append(punkt)
            else:
                punkt["plan"] = nr
                lose.append(punkt)

    # ---- 2. Je Plan die Verfahrensschritte bauen
    plaene = {}
    for (nr, vorlage), v in vorlagen.items():
        if nr in aus:
            continue
        punkte = sorted(v["punkte"], key=lambda p: p["datum"])
        # Massgeblich ist die letzte Beratung (Stadtrat oder beschliessender Ausschuss)
        letzter = punkte[-1]
        titel = letzter["titel"]
        schritt, zusatz = schritt_von(titel)
        nur_fnp = bool(re.match(r"\s*(\d+\.\s*)?Änderung des Flächennutzungsplan", titel)) and schritt in RANG
        b = beschluesse.get(letzter["ref"], {})
        # Anlagen der Vorlage: die laengste Liste nehmen (Beschlussauszuege kommen spaeter dazu)
        doks = max((p["dokumente"] for p in punkte), key=len)
        anlagen = [{"titel": d["titel"], "url": d["url"], "art": anlage_art(d["titel"])} for d in doks]
        eintrag = {
            "schritt": "fnp" if nur_fnp else schritt,
            "zusatz": zusatz,
            "datum": letzter["datum"],
            "gremium": letzter["gremium"],
            "geplant": letzter["datum"] > stand,
            "vorlage": vorlage,
            "vorlage_url": letzter["vorlage_url"],
            "sitzung_url": letzter["url"],
            "titel": titel,
            "ergebnis": b.get("ergebnis", ""),
            "formel": b.get("formel", ""),
            "vorberatung": [{"datum": p["datum"], "gremium": p["gremium"]} for p in punkte[:-1]],
            "anlagen": anlagen,
            "ref": letzter["ref"],
        }
        plan = plaene.setdefault(nr, {"nr": nr, "schritte": [], "titel_roh": []})
        plan["schritte"].append(eintrag)
        plan["titel_roh"].append(titel)

    # ---- 3. Steckbriefe
    ergebnis = []
    for nr, plan in plaene.items():
        h = hp.get(nr, {})
        schritte = sorted(plan["schritte"], key=lambda e: (e["datum"], RANG.get(e["schritt"], -1)))
        verfahren = [e for e in schritte if e["schritt"] in RANG and not e["geplant"]]
        if not verfahren and not h:
            # Nur Erschliessung, Widmung o. Ae. und nichts von Hand: trotzdem zeigen, Stand offen
            pass
        letzter = verfahren[-1] if verfahren else None

        name = h.get("name", "")
        if not name:
            for titel in reversed(plan["titel_roh"]):
                m = NAME.search(titel)
                if m:
                    name = m.group(1).strip(" -–")
                    break
        titel_alle = " ".join(plan["titel_roh"])
        vorhaben = bool(re.search(r"vorhabenbezogen", titel_alle, re.I))
        fnp = bool(re.search(r"Flächennutzungsplan", titel_alle))

        # Planzeichnungen: neueste zuerst
        zeichnungen = []
        for e in reversed(schritte):
            if e["schritt"] not in RANG or e["geplant"]:
                continue
            for a in e["anlagen"]:
                if a["art"] == "plan":
                    zeichnungen.append({"titel": a["titel"], "url": a["url"], "datum": e["datum"],
                                        "schritt": e["schritt"], "vorlage": e["vorlage"]})

        # Texte: von Hand, sonst aus der Kuration des letzten Verfahrensschritts
        k = kuration.get(letzter["ref"], {}) if letzter else {}
        text = {
            "titel": h.get("titel") or k.get("klartext_titel", ""),
            "n": h.get("text") or k.get("klartext", ""),
            "titel_l": h.get("titel_l") or k.get("klartext_titel_leicht", ""),
            "l": h.get("text_l") or k.get("klartext_leicht", ""),
            "von_hand": bool(h.get("text")),
        }

        # Punkte ohne Vorlage: ueber Plannummer oder Stichworte
        stichworte = [re.compile(w, re.I) for w in h.get("stichworte", [])]
        dazu = []
        for p in lose:
            if p.get("plan") == nr or (not p.get("plan") and any(w.search(p["titel"]) for w in stichworte)):
                dazu.append({"datum": p["datum"], "gremium": p["gremium"], "titel": p["titel"], "url": p["url"],
                             "bza": p["quelle"] == "bza", "geplant": p["datum"] > stand,
                             "dokumente": [{"titel": d["titel"], "url": d["url"]} for d in p["dokumente"]]})
        dazu.sort(key=lambda p: p["datum"], reverse=True)

        gebiet = amt.get(nr)
        a = gebiet["properties"] if gebiet else {}
        if a.get("name") and not h.get("name"):
            name = a["name"]
        beznr = h.get("bezirk", "")
        if gebiet and not beznr:
            beznr = bezirk_von(mitte(gebiet["geometry"]), bezirke)
        if not beznr:
            # Hilfsweise der Bezirksausschuss, der den Plan auf der Tagesordnung hatte
            for p in dazu:
                m = re.match(r"Bezirksausschuss ([IVX]+)-", p["gremium"])
                if m:
                    beznr = ROEMISCH[m.group(1)]
                    break

        # Stationen des Verfahrens: Datum aus dem Rat, sonst vom Landesdienst
        stationen = {}
        for e in verfahren:
            # Aufstellung: der erste Beschluss zaehlt; Entwurf und Satzung: der letzte (erneute Runden)
            if e["schritt"] in ("entwurf", "satzung") or (e["schritt"] == "aufstellung" and "aufstellung" not in stationen):
                stationen[e["schritt"]] = {"datum": e["datum"], "quelle": "rat"}
        for k2 in ("aufstellung", "satzung"):
            if k2 not in stationen and a.get(k2):
                stationen[k2] = {"datum": a[k2], "quelle": "land"}
        if a.get("inkraft"):
            stationen["inkraft"] = {"datum": a["inkraft"], "quelle": "land"}

        # Stand in einem Wort. Gilt der Plan und hat der Rat danach nichts Neues beschlossen: "kraft".
        # Aeltere Ratsbeschluesse nach dem Inkrafttreten (vor Beginn der vollstaendigen Ratsdaten) aendern
        # daran nichts: dort fehlen die Ergebnisse, und der Landesdienst fuehrt den Plan als geltend.
        if a.get("inkraft") and (not letzter or letzter["datum"] <= a["inkraft"] or letzter["datum"] < roh["zeitraum"]["von"]):
            status = {"schritt": "kraft", "datum": a["inkraft"], "quelle": "land"}
        elif letzter:
            status = {"schritt": letzter["schritt"], "datum": letzter["datum"], "quelle": "rat"}
        elif a.get("stand") in RANG:
            status = {"schritt": a["stand"], "datum": a.get(a["stand"], ""), "quelle": "land"}
        else:
            status = {"schritt": "offen", "datum": "", "quelle": ""}

        letzte_bewegung = max([e["datum"] for e in schritte if not e["geplant"]]
                              + [p["datum"] for p in dazu if not p["geplant"]] + [a.get("inkraft", "")])
        ergebnis.append({
            "id": plan_id(nr),
            "nr": nr,
            "name": name or a.get("name", ""),
            "kurz": h.get("kurz", ""),
            "vorhabenbezogen": vorhaben,
            "fnp": fnp,
            "bezirk": beznr,
            "bezirk_name": bezname.get(beznr, ""),
            "status": status,
            "stationen": stationen,
            "stand": ({"schritt": letzter["schritt"], "zusatz": letzter["zusatz"], "datum": letzter["datum"],
                       "gremium": letzter["gremium"], "ergebnis": letzter["ergebnis"], "formel": letzter["formel"],
                       "vorlage": letzter["vorlage"]} if letzter else None),
            "amt": ({"plan_url": a["plan_url"], "text_url": a["text_url"]} if a.get("inkraft") else None),
            "hinweis": h.get("hinweis", ""),
            "hinweis_l": h.get("hinweis_l", ""),
            "letzte_bewegung": letzte_bewegung,
            "im_rat": True,
            "text": text,
            "zeichnungen": zeichnungen,
            "schritte": [{k2: v2 for k2, v2 in e.items() if k2 != "ref"} for e in schritte],
            "dazu": dazu,
            "umgriff": bool(gebiet),
        })

    # ---- 4. Plaene, die nur der Landesdienst kennt: kurzer Eintrag
    for nr, gebiet in amt.items():
        if nr in plaene or nr in aus:
            continue
        a = gebiet["properties"]
        beznr = bezirk_von(mitte(gebiet["geometry"]), bezirke)
        stationen = {k2: {"datum": a[k2], "quelle": "land"} for k2 in ("aufstellung", "satzung", "inkraft") if a.get(k2)}
        if a["stand"] == "rechtskraft":
            status = {"schritt": "kraft", "datum": a["inkraft"], "quelle": "land"}
        else:
            status = {"schritt": a["stand"], "datum": a.get(a["stand"], ""), "quelle": "land"}
        ergebnis.append({
            "id": plan_id(nr), "nr": nr, "name": a["name"], "kurz": "", "vorhabenbezogen": False, "fnp": False,
            "bezirk": beznr, "bezirk_name": bezname.get(beznr, ""),
            "status": status, "stationen": stationen, "stand": None,
            "amt": ({"plan_url": a["plan_url"], "text_url": a["text_url"]} if a.get("inkraft") else None),
            "hinweis": "", "hinweis_l": "", "letzte_bewegung": a.get("inkraft") or status["datum"], "im_rat": False,
            "text": {"titel": "", "n": "", "titel_l": "", "l": "", "von_hand": False},
            "zeichnungen": [], "schritte": [], "dazu": [], "umgriff": True,
        })

    ergebnis.sort(key=lambda p: p["letzte_bewegung"], reverse=True)

    # Plaene, die nur in der Handdatei stehen, waeren ein Pflegefehler
    fehlend = [nr for nr in hp if nr not in plaene]
    if fehlend:
        print("  ! In plaene_hand.json, aber ohne Vorlage in den Ratsdaten:", ", ".join(fehlend), file=sys.stderr)

    nicht_zugeordnet = [
        {"datum": p["datum"], "gremium": p["gremium"], "titel": p["titel"], "url": p["url"]}
        for p in lose
        if not any(p["titel"] == d["titel"] and p["datum"] == d["datum"] for e in ergebnis for d in e["dazu"])
        and p.get("plan") not in aus
    ]

    daten = {
        "erzeugt_von": "scraper/plaene_bauen.py",
        "erzeugt_am": date.today().isoformat(),
        "stand": stand,
        "zeitraum": {"alle_gremien_ab": roh["zeitraum"]["von"],
                     "stadtrat_planungsausschuss_ab": (alt.get("zeitraum") or {}).get("von", "")},
        "hinweis": "Beschluesse aus dem Ratsinfoportal der Stadt. Umgriff, Inkrafttreten und geltende "
                   "Planzeichnung vom Landesdienst Bauleitplaene Bayern (CC BY-ND 4.0), Erstinformation ohne Gewaehr.",
        "land": {"quelle": land["quelle"], "lizenz": land["lizenz"], "abgerufen_am": land["abgerufen_am"]},
        "plaene": ergebnis,
        "ohne_plan": nicht_zugeordnet,
    }
    with open(os.path.join(DATEN, "plaene.json"), "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(os.path.join(DATEN, "plaene.js"), "w", encoding="utf-8") as f:
        f.write("/* Baugebiete und Plaene; erzeugt von scraper/plaene_bauen.py aus den Ratsdaten und Bauleitplaene Bayern */\n"
                "window.PLAENE = " + json.dumps({k: v for k, v in daten.items() if k != "ohne_plan"}, ensure_ascii=False, separators=(",", ":")) + ";\n")

    je = {}
    for p in ergebnis:
        je[p["status"]["schritt"]] = je.get(p["status"]["schritt"], 0) + 1
    im_rat = [p for p in ergebnis if p["im_rat"]]
    print(f"{len(ergebnis)} Plaene ({je}), davon {len(im_rat)} mit Vorlagen im Rat, "
          f"{sum(1 for p in im_rat if not p['umgriff'])} davon ohne Umgriff, "
          f"{sum(len(p['dazu']) for p in ergebnis)} weitere Punkte zugeordnet, {len(nicht_zugeordnet)} ohne Plan")


if __name__ == "__main__":
    main()
