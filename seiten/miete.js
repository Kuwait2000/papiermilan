/* Skript der Seite miete.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  "use strict";
  var D = window.MIETE_DATEN;
  if (!D) {
    document.querySelectorAll(".ladehinweis").forEach(function (el) {
      el.textContent = "Die Mietdaten konnten nicht geladen werden.";
    });
    return;
  }
  var MS = D.mietspiegel;
  var BR = D.bremse;

  /* ---------------- Formatierung ---------------- */
  function zahl(n, stellen) {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: stellen || 0, maximumFractionDigits: stellen || 0,
    }).format(n);
  }
  function euro(n, stellen) { return zahl(n, stellen === undefined ? 2 : stellen) + " €"; }
  function proz(n) { return (n > 0 ? "+" : n < 0 ? "−" : "±") + zahl(Math.abs(n)) + " %"; }
  function svgEl(tag, attrs, kinder) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    (kinder || []).forEach(function (kind) { el.appendChild(kind); });
    return el;
  }
  function text(x, y, inhalt, klasse, anker) {
    var t = svgEl("text", { x: x, y: y, class: klasse || "" });
    if (anker) t.setAttribute("text-anchor", anker);
    t.textContent = inhalt;
    return t;
  }
  function titel(inhalt) { var t = svgEl("title", {}); t.textContent = inhalt; return t; }
  function absatz(klasse, inhalt) {
    var p = document.createElement("p");
    p.className = klasse;
    p.innerHTML = inhalt;
    return p;
  }
  function el(tag, klasse, inhalt) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (inhalt !== undefined) e.textContent = inhalt;
    return e;
  }
  function legende(eintraege) {
    var div = el("div", "legende");
    eintraege.forEach(function (e) {
      var span = document.createElement("span");
      var i = document.createElement("i");
      if (e.klasse) i.className = e.klasse;
      if (e.farbe) {
        if (e.klasse === "linie" || e.klasse === "strich") i.style.borderTopColor = e.farbe;
        else i.style.backgroundColor = e.farbe;
      }
      span.appendChild(i);
      span.appendChild(document.createTextNode(e.text));
      div.appendChild(span);
    });
    return div;
  }
  function farbe(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function schraffur(id, f) {
    return svgEl("pattern", { id: id, width: 6, height: 6, patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)" }, [
      svgEl("rect", { width: 6, height: 6, fill: f }),
      svgEl("rect", { width: 2.2, height: 6, fill: "rgba(255,255,255,.6)" }),
    ]);
  }
  function datumDE(iso) {
    var p = iso.split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function lnk(url, inhalt) {
    var a = document.createElement("a");
    a.href = url; a.rel = "noopener noreferrer"; a.target = "_blank";
    a.textContent = inhalt;
    return a;
  }

  /* ---------------- Einfache Sprache ---------------- */
  var LS_KEY_LEICHT = "papierpanther-leichte-sprache";
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === "1"; } catch (err) { /* Storage kann gesperrt sein */ }
  function t(normal, leichtText) { return leicht ? leichtText : normal; }
  function nl(o) { return o ? (leicht ? o.l : o.n) : ""; }

  var TEXTE = {
    "hinweis": {
      n: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt und keine Rechtsberatung.</strong> " +
        "Der Rechner nutzt die Tabellen des qualifizierten Mietspiegels 2025–2027. Er ersetzt weder den " +
        "offiziellen Mietspiegel noch eine Beratung, etwa beim Mieterverein. Dies ist ein Prototyp.",
      l: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Der Rechner ist nur eine Hilfe. Bei Fragen zu Ihrer Miete: Fragen Sie den Mieter-Verein. Die Seite ist noch ein Test.",
    },
    "h1": { n: "Miete in Ingolstadt", l: "Miete in Ingolstadt" },
    "lede": {
      n: "Wie viel Miete ist üblich, und wie viel darf ein Vermieter bei einer neuen Wohnung verlangen? " +
        "In Ingolstadt gilt die Mietpreisbremse, und seit 2023 gibt es einen qualifizierten Mietspiegel. " +
        "Diese Seite rechnet mit den offiziellen Tabellen, erklärt, wie die Zahlen entstehen, und zeigt, wo die Regeln Lücken haben.",
      l: "Wie viel Miete ist normal? Wie viel darf ein Vermieter verlangen? " +
        "Dafür gibt es in Ingolstadt zwei Dinge: den Mietspiegel und die Miet-Bremse. " +
        "Hier können Sie Ihre Miete ausrechnen. Und Sie erfahren, wo die Regeln nicht gut funktionieren.",
    },
    "sprung-rechner": { n: "Rechner", l: "Rechner" },
    "sprung-ablauf": { n: "So entsteht der Mietspiegel", l: "So entsteht der Mietspiegel" },
    "sprung-profitiert": { n: "Wer profitiert?", l: "Wem hilft es?" },
    "sprung-zahlen": { n: "Ingolstädter Zahlen", l: "Zahlen" },
    "rechner-h2": { n: "Was darf meine Wohnung kosten?", l: "Was darf meine Wohnung kosten?" },
    "rechner-p": {
      n: "Geben Sie Größe, Baujahr, Lage und Ausstattung ein. Der Rechner ermittelt die ortsübliche Vergleichsmiete " +
        "(netto kalt, ohne Nebenkosten) nach dem Mietspiegel und daraus die Obergrenze der Mietpreisbremse. " +
        "Ihre Eingaben bleiben bei Ihnen im Browser und werden nicht gespeichert oder übermittelt.",
      l: "Geben Sie ein: Wie groß ist die Wohnung? Wann wurde das Haus gebaut? Was gibt es in der Wohnung? " +
        "Der Rechner zeigt: So viel Miete ist üblich. Gemeint ist die Kalt-Miete. Das ist die Miete ohne Heizung und Wasser. " +
        "Ihre Angaben bleiben bei Ihnen. Sie werden nicht gespeichert und nicht verschickt.",
    },
    "f-modus": { n: "Worum geht es?", l: "Was möchten Sie wissen?" },
    "f-flaeche": { n: "Wohnfläche", l: "Wie groß ist die Wohnung?" },
    "f-baujahr": { n: "Baujahr des Gebäudes", l: "Wann wurde das Haus gebaut?" },
    "f-lage": { n: "Wohnlage", l: "Wo liegt die Wohnung?" },
    "f-lage-hilfe": {
      n: "Die Lage jeder Adresse steht im <a href=\"https://www.ingolstadt.de/mietspiegel\" rel=\"noopener noreferrer\" target=\"_blank\">Straßenverzeichnis der Stadt</a>.",
      l: "Das steht in einer Liste der Stadt: <a href=\"https://www.ingolstadt.de/mietspiegel\" rel=\"noopener noreferrer\" target=\"_blank\">Straßen-Verzeichnis</a>.",
    },
    "f-haus": { n: "Gebäudeart", l: "Was für ein Haus?" },
    "f-merkmale": { n: "Ausstattung und Modernisierung", l: "Was gibt es in der Wohnung?" },
    "f-miete-einheit": { n: "€ im Monat, kalt", l: "Euro im Monat, kalt" },
    "check-h3": { n: "Greift die Bremse überhaupt?", l: "Gilt die Bremse für meine Wohnung?" },
    "check-p": {
      n: "Die Obergrenze gilt nicht für jede Wohnung. Beantworten Sie die Fragen, um zu sehen, an welcher Stelle eine Ausnahme greift.",
      l: "Die Bremse gilt nicht für jede Wohnung. Beantworten Sie die Fragen mit Ja oder Nein.",
    },
    "raus-h3": { n: "Wie viele Wohnungen fallen raus?", l: "Für wie viele Wohnungen gilt die Bremse nicht?" },
    "raus-p": {
      n: "Wie viele Wohnungen unter eine Ausnahme fallen, zählt niemand. Für eine einzige Ausnahme, den Neubau, " +
        "erlaubt die amtliche Statistik eine Annäherung. Für alle anderen gibt es in Ingolstadt keine Daten.",
      l: "Das zählt niemand genau. Nur für neue Häuser gibt es Zahlen.",
    },
    "ablauf-h2": { n: "Vom Fragebogen zur Obergrenze", l: "So entsteht der Mietspiegel" },
    "ablauf-p": {
      n: "Der Mietspiegel ist die Grundlage für fast alles: für Mieterhöhungen im laufenden Vertrag und für die Grenze bei neuen Verträgen. " +
        "So entsteht er, Schritt für Schritt, und an jeder Stelle hakt es.",
      l: "Der Mietspiegel ist sehr wichtig. Mit ihm wird entschieden: Wie viel darf die Miete steigen? " +
        "Hier steht Schritt für Schritt, wie er entsteht. Und was dabei nicht gut ist.",
    },
    "zeit-h3": { n: "Zeitleiste", l: "Wann ist was passiert?" },
    "profit-h2": { n: "Wer profitiert: Mieter oder Rendite?", l: "Wem hilft die Miet-Bremse?" },
    "profit-p": {
      n: "Die Bremse soll Mieter schützen. Ob sie das tut, hängt davon ab, wer man ist und wie man vermietet.",
      l: "Die Bremse soll Mietern helfen. Aber sie hilft nicht allen gleich.",
    },
    "forschung-h3": { n: "Was Forschung und Verbände sagen", l: "Was Fach-Leute sagen" },
    "profit-fazit": {
      n: "<strong>Zusammengefasst:</strong> Die Bremse begrenzt nur einen Teil des Marktes, und durchsetzen müssen sie die Mieter selbst. " +
        "Wer professionell vermietet, findet in den Ausnahmen Spielraum. Der Mietspiegel, an dem alles hängt, " +
        "wird durch seine Bauweise (nur jüngere Mieten, Fortschreibung mit der Inflation) eher nach oben getragen.",
      l: "<strong>Kurz gesagt:</strong> Die Bremse gilt nicht für alle Wohnungen. Mieter müssen sich selbst wehren. " +
        "Große Vermieter nutzen die Ausnahmen. Und der Mietspiegel steigt von selbst.",
    },
    "zahlen-h2": { n: "Was die Ingolstädter Zahlen zeigen", l: "Zahlen aus Ingolstadt" },
    "zahlen-p": {
      n: "Alle Werte stammen aus dem offiziellen Mietspiegel. Was neue Wohnungen in Inseraten kosten, ist nicht als offene Daten verfügbar " +
        "und fehlt deshalb hier.",
      l: "Die Zahlen kommen aus dem Mietspiegel der Stadt. Was Wohnungen in Anzeigen kosten, wissen wir nicht.",
    },
    "tab-flaeche": { n: "Nach Größe", l: "Nach Größe" },
    "tab-baujahr": { n: "Nach Baujahr", l: "Nach Baujahr" },
    "tab-merkmale": { n: "Lage und Ausstattung", l: "Lage und Ausstattung" },
    "stadtrat-h3": { n: "Was der Stadtrat dazu beraten hat", l: "Was der Stadtrat dazu gesagt hat" },
    "stadtrat-p": {
      n: "Vorgänge zu Mietspiegel und Wohnraum aus dem Ratsinformationssystem. Mehr dazu in der " +
        "<a href=\"index.html?q=Wohn\">Übersicht mit dem Suchwort „Wohn“</a>.",
      l: "Hier steht, was der Stadtrat zum Wohnen besprochen hat. <a href=\"index.html?q=Wohn\">Mehr dazu</a>.",
    },
    "fehlt-h2": { n: "Was hier noch fehlt", l: "Was noch fehlt" },
    "fehlt-p": {
      n: "Für eine ehrliche Bilanz der Bremse fehlen wichtige Zahlen. Diese Themen kommen dazu, sobald es offene Daten gibt:",
      l: "Manche Zahlen gibt es nicht öffentlich. Diese Themen kommen später dazu:",
    },
  };

  /* ---------------- Zustand ---------------- */
  /* Die Eingaben werden bewusst nirgends gespeichert. Den Schluessel einer
     frueheren Fassung, die sie im localStorage abgelegt hat, raeumen wir weg. */
  try { localStorage.removeItem("papierpanther-mietrechner"); } catch (err) { /* Storage kann gesperrt sein */ }
  var zustand = { modus: "neu", flaeche: 65, baujahr: "b1980", lage: "normal", haus: "mfh", merkmale: {}, miete: "" };
  var antworten = {};

  /* ---------------- Berechnung ---------------- */
  function basismiete(flaeche) {
    var f = Math.floor(Math.max(MS.flaeche_min, Math.min(MS.flaeche_max, flaeche)));
    for (var i = 0; i < MS.basismiete.length; i++) {
      var z = MS.basismiete[i];
      if (f >= z[0] && f <= z[1]) return z[2];
    }
    return null;
  }
  function finde(liste, id) {
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return liste[0];
  }
  function aktiveMerkmale() {
    return MS.merkmale.filter(function (m) {
      if (!zustand.merkmale[m.id]) return false;
      if (m.gruppe === "mfh" && zustand.haus !== "mfh") return false;
      return true;
    });
  }
  function rechne() {
    var fl = Number(zustand.flaeche);
    var basis = basismiete(fl);
    var posten = [];
    var bj = finde(MS.baujahr, zustand.baujahr);
    var lage = finde(MS.lage, zustand.lage);
    var haus = finde(MS.haustyp, zustand.haus);
    posten.push({ n: t("Baujahr " + bj.n, "Baujahr " + bj.l), wert: bj.wert });
    posten.push({ n: nl(lage), wert: lage.wert });
    posten.push({ n: nl(haus), wert: haus.wert });
    aktiveMerkmale().forEach(function (m) { posten.push({ n: nl(m), wert: m.wert }); });
    var summe = posten.reduce(function (s, p) { return s + p.wert; }, 0);
    var ovm = Math.round(basis * (1 + summe / 100) * 100) / 100;
    var r = {
      flaeche: fl, basis: basis, posten: posten, summe: summe, ovm: ovm,
      unten: ovm * (1 + MS.spanne.unten / 100), oben: ovm * (1 + MS.spanne.oben / 100),
      grenze: ovm * (1 + BR.aufschlag / 100),
      grenzeMax: ovm * (1 + MS.spanne.oben / 100) * (1 + BR.aufschlag / 100),
      neubau: bj.neubau || null,
      miete: zustand.miete === "" ? null : Number(zustand.miete),
      ausserhalb: fl < MS.flaeche_min || fl > MS.flaeche_max,
    };
    r.mieteQm = r.miete && fl ? r.miete / fl : null;
    return r;
  }

  /* ---------------- Formular aufbauen ---------------- */
  function wahlGruppe(container, name, optionen, wert, beiAenderung) {
    container.innerHTML = "";
    optionen.forEach(function (o) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "radio"; input.name = name; input.value = o.id;
      input.checked = o.id === wert;
      input.addEventListener("change", function () { beiAenderung(o.id); });
      var span = el("span", "", o.text);
      label.appendChild(input); label.appendChild(span);
      container.appendChild(label);
    });
  }

  function baueFormular() {
    wahlGruppe(document.getElementById("wahl-modus"), "modus", [
      { id: "neu", text: t("Neue Wohnung (Mietpreisbremse)", "Neue Wohnung") },
      { id: "bestand", text: t("Mieterhöhung im laufenden Vertrag", "Meine Miete soll steigen") },
    ], zustand.modus, function (v) { zustand.modus = v; aktualisiere(); });

    var sel = document.getElementById("baujahr");
    sel.innerHTML = "";
    MS.baujahr.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.id;
      o.textContent = nl(b) + " (" + proz(b.wert) + ")";
      o.selected = b.id === zustand.baujahr;
      sel.appendChild(o);
    });

    wahlGruppe(document.getElementById("wahl-lage"), "lage", MS.lage.map(function (l) {
      return { id: l.id, text: nl(l) + " " + proz(l.wert) };
    }), zustand.lage, function (v) { zustand.lage = v; aktualisiere(); });
    wahlGruppe(document.getElementById("wahl-haus"), "haus", MS.haustyp.map(function (h) {
      return { id: h.id, text: nl(h) + " " + proz(h.wert) };
    }), zustand.haus, function (v) { zustand.haus = v; aktualisiere(); });

    var box = document.getElementById("merkmale");
    box.innerHTML = "";
    var gruppen = [
      { id: "aus", n: "Ausstattung", l: "Ausstattung" },
      { id: "mod", n: "Modernisierung", l: "Erneuert" },
      { id: "mfh", n: "Nur im Mehrfamilienhaus", l: "Nur im Haus mit vielen Wohnungen" },
    ];
    gruppen.forEach(function (g) {
      var spalte = el("div", "haekchen");
      spalte.appendChild(el("p", "gruppe-titel", nl(g)));
      MS.merkmale.filter(function (m) { return m.gruppe === g.id; }).forEach(function (m) {
        var label = document.createElement("label");
        var input = document.createElement("input");
        input.type = "checkbox"; input.dataset.id = m.id;
        input.checked = !!zustand.merkmale[m.id];
        input.addEventListener("change", function () {
          if (input.checked) zustand.merkmale[m.id] = true; else delete zustand.merkmale[m.id];
          aktualisiere();
        });
        label.appendChild(input);
        label.appendChild(el("span", "", nl(m)));
        label.appendChild(el("span", "pz " + (m.wert > 0 ? "plus" : "minus"), proz(m.wert)));
        if (m.gruppe === "mfh") label.dataset.mfh = "1";
        spalte.appendChild(label);
      });
      box.appendChild(spalte);
    });

    document.getElementById("txt-f-miete").textContent = zustand.modus === "neu"
      ? t("Verlangte Kaltmiete (optional)", "Wie viel Kalt-Miete soll ich zahlen? (freiwillig)")
      : t("Ihre jetzige Kaltmiete (optional)", "Wie viel Kalt-Miete zahlen Sie jetzt? (freiwillig)");
    document.getElementById("txt-f-miete-hilfe").textContent = zustand.modus === "neu"
      ? t("Netto kalt: ohne Heizung, Wasser und andere Nebenkosten. Ohne Stellplatz, wenn er extra vermietet wird.",
        "Ohne Heizung und Wasser.")
      : t("Netto kalt. Der Rechner nimmt an, dass es in den letzten drei Jahren keine Erhöhung gab.",
        "Ohne Heizung und Wasser.");
  }

  var regler = document.getElementById("flaeche-regler");
  var flaecheFeld = document.getElementById("flaeche");
  regler.addEventListener("input", function () { zustand.flaeche = Number(regler.value); flaecheFeld.value = regler.value; aktualisiere(true); });
  flaecheFeld.addEventListener("input", function () {
    var v = parseFloat(String(flaecheFeld.value).replace(",", "."));
    if (isNaN(v) || v <= 0) return;
    zustand.flaeche = v;
    regler.value = Math.max(25, Math.min(160, Math.floor(v)));
    aktualisiere(true);
  });
  document.getElementById("baujahr").addEventListener("change", function (ev) { zustand.baujahr = ev.target.value; aktualisiere(); });
  document.getElementById("miete").addEventListener("input", function (ev) {
    var v = String(ev.target.value).replace(",", ".");
    zustand.miete = v === "" || isNaN(parseFloat(v)) ? "" : parseFloat(v);
    aktualisiere(true);
  });

  function formularWerteSetzen() {
    regler.value = Math.max(25, Math.min(160, Math.floor(zustand.flaeche)));
    flaecheFeld.value = zustand.flaeche;
    document.getElementById("miete").value = zustand.miete === "" ? "" : zustand.miete;
    document.querySelectorAll("#merkmale label[data-mfh]").forEach(function (l) {
      var aus = zustand.haus !== "mfh";
      l.classList.toggle("aus", aus);
      l.querySelector("input").disabled = aus;
    });
  }

  /* ---------------- Ergebnis ---------------- */
  function kacheln(container, liste) {
    container.innerHTML = "";
    liste.forEach(function (k) {
      var d = el("div", "kachel" + (k.betont ? " betont" : ""));
      d.appendChild(absatz("kachel-label", k.label));
      d.appendChild(absatz("kachel-wert", k.wert));
      d.appendChild(absatz("kachel-unter", k.unter));
      container.appendChild(d);
    });
  }

  function baueErgebnis(r) {
    var fl = r.flaeche;
    var liste = [
      { label: t("Ortsübliche Vergleichsmiete", "Übliche Miete"), wert: euro(r.ovm) + "/m²",
        unter: t("= " + euro(r.ovm * fl, 0) + " im Monat für " + zahl(fl, fl % 1 ? 1 : 0) + " m²", "Das sind " + euro(r.ovm * fl, 0) + " im Monat") },
      { label: t("Spanne laut Mietspiegel", "Erlaubter Bereich"), wert: zahl(r.unten, 2) + "–" + zahl(r.oben, 2) + " €",
        unter: t("je m², −" + Math.abs(MS.spanne.unten) + " % bis +" + MS.spanne.oben + " %", "pro Quadrat-Meter") },
    ];
    if (zustand.modus === "neu") {
      liste.push({ label: t("Obergrenze Mietpreisbremse", "So viel darf die Miete höchstens sein"), wert: euro(r.grenze) + "/m²", betont: true,
        unter: t("= " + euro(r.grenze * fl, 0) + " im Monat (Vergleichsmiete + 10 %)", "Das sind " + euro(r.grenze * fl, 0) + " im Monat") });
    } else {
      var max = r.miete ? Math.min(r.ovm * fl, r.miete * (1 + BR.kappung / 100)) : null;
      liste.push({ label: t("Höchstens nach Erhöhung", "So hoch darf die Miete höchstens werden"),
        wert: max !== null ? euro(Math.max(max, r.miete), 0) : euro(r.ovm * fl, 0), betont: true,
        unter: max !== null
          ? t("Vergleichsmiete, aber höchstens +" + BR.kappung + " % in " + BR.kappung_jahre + " Jahren", "Höchstens " + BR.kappung + " Prozent mehr in " + BR.kappung_jahre + " Jahren")
          : t("bis zur Vergleichsmiete; Kappungsgrenze +" + BR.kappung + " % in " + BR.kappung_jahre + " Jahren", "Aber höchstens " + BR.kappung + " Prozent mehr in " + BR.kappung_jahre + " Jahren") });
    }
    kacheln(document.getElementById("ergebnis-kacheln"), liste);

    var txt = document.getElementById("ergebnis-text");
    var teile = [];
    if (r.ausserhalb) {
      teile.push(t("<strong>Hinweis:</strong> Der Mietspiegel gilt nur für Wohnungen von " + MS.flaeche_min + " bis " + MS.flaeche_max +
        " m². Für diese Fläche gerechnet wurde mit dem nächstgelegenen Tabellenwert.",
        "<strong>Achtung:</strong> Der Mietspiegel gilt nur für Wohnungen von " + MS.flaeche_min + " bis " + MS.flaeche_max + " Quadrat-Metern."));
    }
    if (zustand.modus === "neu") {
      if (r.neubau === "ja") {
        teile.push(t("<strong>Wichtig:</strong> Bei Baujahr ab 2016 ist die Wohnung fast sicher ein Neubau im Sinne der Bremse " +
          "(erstmals genutzt und vermietet nach dem 1.10.2014). Dann gilt die Obergrenze nicht, die Miete ist frei.",
          "<strong>Wichtig:</strong> Neue Häuser ab 2016 sind von der Bremse ausgenommen. Der Vermieter darf jede Miete verlangen."));
      } else if (r.neubau === "teils") {
        teile.push(t("<strong>Wichtig:</strong> Wurde die Wohnung erst nach dem 1.10.2014 erstmals genutzt und vermietet, gilt die Bremse nicht.",
          "<strong>Wichtig:</strong> Wurde die Wohnung nach Oktober 2014 das erste Mal vermietet? Dann gilt die Bremse nicht."));
      }
      if (r.mieteQm) {
        var q = r.mieteQm;
        var lage;
        if (q <= r.ovm) lage = t("liegt <strong>unter der Vergleichsmiete</strong>.", "ist <strong>nicht zu hoch</strong>.");
        else if (q <= r.grenze) lage = t("liegt über der Vergleichsmiete, aber <strong>innerhalb der Grenze</strong> der Mietpreisbremse.",
          "ist <strong>erlaubt</strong>. Sie liegt unter der Grenze.");
        else {
          var zuviel = (q - r.grenze) * r.flaeche;
          lage = t("liegt <strong>" + euro(zuviel, 0) + " im Monat über der Grenze</strong>. " +
            (q <= r.grenzeMax ? "Ein Teil davon kann zulässig sein, wenn der Vermieter besondere Merkmale nennt, die den Wert innerhalb der Spanne nach oben schieben. " : "") +
            "Prüfen Sie unten, ob eine Ausnahme greift. Wenn nicht, können Sie die Miete rügen; wer das in den ersten 30 Monaten tut, " +
            "bekommt zu viel Gezahltes ab Vertragsbeginn zurück. Beratung gibt es beim Mieterverein.",
            "ist <strong>" + euro(zuviel, 0) + " im Monat zu hoch</strong>. Vielleicht gibt es eine Ausnahme. Das können Sie unten prüfen. " +
            "Wenn nicht: Sie können sich beim Vermieter beschweren. Hilfe gibt es beim Mieter-Verein.");
        }
        teile.push(t("Die verlangte Miete von " + euro(r.miete, 0) + " (" + euro(q) + "/m²) ", "Die Miete von " + euro(r.miete, 0) + " ") + lage);
      }
    } else if (r.miete) {
      var obergrenze = Math.min(r.ovm * r.flaeche, r.miete * (1 + BR.kappung / 100));
      if (r.miete >= r.ovm * r.flaeche) {
        teile.push(t("Ihre Miete liegt schon <strong>auf oder über der Vergleichsmiete</strong>. Eine Erhöhung nach Mietspiegel (§ 558 BGB) ist dann nicht möglich. " +
          "Möglich bleiben Erhöhungen nach einer Modernisierung oder bei einer Index- oder Staffelmiete.",
          "Ihre Miete ist schon so hoch wie üblich. Der Vermieter darf sie mit dem Mietspiegel <strong>nicht weiter erhöhen</strong>."));
      } else {
        teile.push(t("Ihre Miete darf auf höchstens <strong>" + euro(obergrenze, 0) + "</strong> steigen, also um " + euro(obergrenze - r.miete, 0) + " im Monat. " +
          (obergrenze < r.ovm * r.flaeche ? "Hier bremst die Kappungsgrenze (+" + BR.kappung + " % in " + BR.kappung_jahre + " Jahren), nicht der Mietspiegel. " : "Hier bremst der Mietspiegel. ") +
          "Eine Erhöhung ist frühestens 15 Monate nach Einzug oder der letzten Erhöhung wirksam.",
          "Ihre Miete darf auf höchstens <strong>" + euro(obergrenze, 0) + "</strong> steigen. Das sind " + euro(obergrenze - r.miete, 0) + " mehr im Monat."));
      }
    } else if (zustand.modus === "bestand") {
      teile.push(t("Im laufenden Vertrag darf die Miete bis zur Vergleichsmiete steigen, in Ingolstadt aber höchstens um " + BR.kappung +
        " % in " + BR.kappung_jahre + " Jahren (abgesenkte Kappungsgrenze laut Mieterschutzverordnung). Geben Sie Ihre jetzige Miete ein, um die Grenze zu sehen.",
        "Die Miete darf langsam steigen. Höchstens " + BR.kappung + " Prozent in " + BR.kappung_jahre + " Jahren. Geben Sie Ihre Miete ein."));
    }
    txt.innerHTML = teile.map(function (s) { return "<p>" + s + "</p>"; }).join("");
  }

  /* Skala: Spanne, Vergleichsmiete, Grenze, eigene Miete */
  function baueSkala(r) {
    var box = document.getElementById("diagramm-skala");
    box.innerHTML = "";
    box.appendChild(absatz("diagramm-titel", t("Wo liegt die Miete? In € pro m², netto kalt", "Wo liegt die Miete? In Euro pro Quadrat-Meter")));
    var eintr = [
      { klasse: "", farbe: farbe("--spanne"), text: t("Spanne des Mietspiegels", "Erlaubter Bereich") },
      { klasse: "linie", farbe: farbe("--vergleich"), text: t("Vergleichsmiete", "Übliche Miete") },
    ];
    if (zustand.modus === "neu") eintr.push({ klasse: "linie", farbe: farbe("--grenze"), text: t("Grenze der Bremse (+10 %)", "Grenze der Bremse") });
    if (r.mieteQm) eintr.push({ klasse: "", farbe: farbe("--text"), text: zustand.modus === "neu" ? t("verlangte Miete", "Ihre Miete") : t("Ihre Miete", "Ihre Miete") });
    box.appendChild(legende(eintr));

    var W = 760, H = 120, L = 20, R = 20, Y = 40, BH = 34;
    var werte = [r.unten, r.grenzeMax];
    if (r.mieteQm) werte.push(r.mieteQm);
    var lo = Math.floor(Math.min.apply(null, werte) * 0.92);
    var hi = Math.ceil(Math.max.apply(null, werte) * 1.05);
    function x(v) { return L + (v - lo) / (hi - lo) * (W - L - R); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": t("Vergleichsmiete " + euro(r.ovm) + " pro m², Spanne " + euro(r.unten) + " bis " + euro(r.oben) +
        (zustand.modus === "neu" ? ", Grenze der Bremse " + euro(r.grenze) : "") + (r.mieteQm ? ", Ihre Miete " + euro(r.mieteQm) : ""),
        "Übliche Miete " + euro(r.ovm) + " pro Quadrat-Meter") });
    for (var v = lo; v <= hi; v++) {
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: Y - 6, y2: Y + BH + 6, class: "gitter" }));
      svg.appendChild(text(x(v), Y + BH + 22, zahl(v) + " €", "achse-text", "middle"));
    }
    svg.appendChild(svgEl("rect", { x: x(r.unten), y: Y, width: x(r.oben) - x(r.unten), height: BH, rx: 4, fill: farbe("--spanne") }, [
      titel(t("Spanne: ", "Bereich: ") + euro(r.unten) + " – " + euro(r.oben)) ]));
    function marke(wert, f, beschr, oben, gestrichelt) {
      svg.appendChild(svgEl("line", { x1: x(wert), x2: x(wert), y1: Y - 4, y2: Y + BH + 4, stroke: f, "stroke-width": 3,
        "stroke-dasharray": gestrichelt ? "4 3" : "none" }));
      var tx = text(x(wert), oben ? Y - 10 : Y + BH + 36, beschr, "wert-text halo", "middle");
      tx.setAttribute("fill", f);
      svg.appendChild(tx);
    }
    marke(r.ovm, farbe("--vergleich"), euro(r.ovm), true);
    if (zustand.modus === "neu") {
      marke(r.grenze, farbe("--grenze"), euro(r.grenze), true);
      svg.appendChild(svgEl("line", { x1: x(r.grenzeMax), x2: x(r.grenzeMax), y1: Y, y2: Y + BH, stroke: farbe("--grenze"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, [
        titel(t("Grenze, wenn die Spanne voll nach oben ausgereizt wird: ", "Höchste Grenze: ") + euro(r.grenzeMax)) ]));
    }
    if (r.mieteQm) {
      var mx = x(r.mieteQm);
      svg.appendChild(svgEl("path", { d: "M" + (mx - 8) + "," + (Y + BH + 4) + " L" + (mx + 8) + "," + (Y + BH + 4) + " L" + mx + "," + (Y + BH - 8) + " Z", fill: farbe("--text") }));
      svg.appendChild(svgEl("line", { x1: mx, x2: mx, y1: Y, y2: Y + BH, stroke: farbe("--text"), "stroke-width": 2 }));
      var mt = text(mx, Y + BH + 36, euro(r.mieteQm), "wert-text halo", "middle");
      svg.appendChild(mt);
    }
    box.appendChild(svg);
    if (zustand.modus === "neu") {
      box.appendChild(absatz("diagramm-fuss", t(
        "Die gestrichelte rote Linie zeigt die Grenze, wenn der Vermieter den Wert mit zusätzlichen Merkmalen bis an den oberen Rand der Spanne schiebt (" + euro(r.grenzeMax) + "/m²). Ob das zulässig ist, entscheidet im Streitfall ein Gericht.",
        "Die gestrichelte Linie: So hoch kann die Grenze im besten Fall für den Vermieter sein.")));
    }
  }

  /* Rechenkette (Wasserfall) */
  function baueKette(r) {
    var box = document.getElementById("diagramm-kette");
    box.innerHTML = "";
    box.appendChild(absatz("diagramm-titel", t("So setzt sich der Wert zusammen, in € pro m²", "So wird gerechnet, in Euro pro Quadrat-Meter")));
    box.appendChild(legende([
      { farbe: farbe("--basis"), text: t("Basismiete nach Größe", "Grund-Miete") },
      { farbe: farbe("--zuschlag"), text: t("Zuschlag", "mehr") },
      { farbe: farbe("--abschlag"), text: t("Abschlag", "weniger") },
      { farbe: farbe("--vergleich"), text: t("Ergebnis", "Ergebnis") },
    ]));
    var zeilen = [{ n: t("Basismiete für " + zahl(Math.floor(r.flaeche)) + " m²", "Grund-Miete für " + zahl(Math.floor(r.flaeche)) + " m²"), von: 0, bis: r.basis, art: "basis", wert: euro(r.basis) }];
    var lauf = r.basis;
    r.posten.forEach(function (p) {
      if (p.wert === 0) return;
      var d = r.basis * p.wert / 100;
      zeilen.push({ n: p.n, von: lauf, bis: lauf + d, art: d > 0 ? "zuschlag" : "abschlag", wert: proz(p.wert) + "  (" + (d > 0 ? "+" : "−") + zahl(Math.abs(d), 2) + " €)" });
      lauf += d;
    });
    zeilen.push({ n: t("Ortsübliche Vergleichsmiete", "Übliche Miete"), von: 0, bis: r.ovm, art: "vergleich", wert: euro(r.ovm), fett: true });
    if (zustand.modus === "neu") {
      zeilen.push({ n: t("+ 10 % Mietpreisbremse", "+ 10 Prozent"), von: r.ovm, bis: r.grenze, art: "grenze", wert: "+" + zahl(r.grenze - r.ovm, 2) + " €" });
      zeilen.push({ n: t("Obergrenze bei Neuvermietung", "Höchste Miete"), von: 0, bis: r.grenze, art: "grenze", wert: euro(r.grenze), fett: true });
    }
    var W = 760, LBL = 300, ZH = 26, OBEN = 6;
    var H = OBEN + zeilen.length * ZH + 26;
    var max = Math.max.apply(null, zeilen.map(function (z) { return Math.max(z.von, z.bis); })) * 1.08;
    var schritt = max > 14 ? 4 : 2;
    var WERTBREITE = 130;
    function x(v) { return LBL + v / max * (W - LBL - WERTBREITE); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": t("Rechenweg: Basismiete " + euro(r.basis) + ", Zu- und Abschläge zusammen " + proz(r.summe) + ", Vergleichsmiete " + euro(r.ovm),
        "Rechnung: Grund-Miete " + euro(r.basis) + ", Ergebnis " + euro(r.ovm)) });
    for (var g = 0; g <= max; g += schritt) {
      svg.appendChild(svgEl("line", { x1: x(g), x2: x(g), y1: OBEN, y2: H - 22, class: "gitter" }));
      svg.appendChild(text(x(g), H - 6, zahl(g) + " €", "achse-text", "middle"));
    }
    var farben = { basis: farbe("--basis"), zuschlag: farbe("--zuschlag"), abschlag: farbe("--abschlag"), vergleich: farbe("--vergleich"), grenze: farbe("--grenze") };
    zeilen.forEach(function (z, i) {
      var y = OBEN + i * ZH;
      var a = Math.min(z.von, z.bis), b = Math.max(z.von, z.bis);
      svg.appendChild(text(LBL - 10, y + ZH / 2 + 4, z.n.length > 44 ? z.n.slice(0, 42) + "…" : z.n, "label-text" + (z.fett ? " fett" : ""), "end"));
      svg.appendChild(svgEl("rect", { x: x(a), y: y + 4, width: Math.max(1.5, x(b) - x(a)), height: ZH - 8, rx: 2, fill: farben[z.art] }, [titel(z.n + ": " + z.wert)]));
      if (i > 0 && z.von !== 0) {
        svg.appendChild(svgEl("line", { x1: x(z.von), x2: x(z.von), y1: y - 4, y2: y + 4, stroke: farbe("--border-strong"), "stroke-width": 1 }));
      }
      svg.appendChild(text(x(b) + 6, y + ZH / 2 + 4, z.wert, "wert-text"));
    });
    box.appendChild(svg);
    box.appendChild(absatz("diagramm-fuss", t(
      "Die Zu- und Abschläge werden addiert (zusammen " + proz(r.summe) + ") und dann auf die Basismiete angewendet. Quelle: Mietspiegel Ingolstadt 2025, Tabellen 1 und 2.",
      "Alle Prozente werden zusammengezählt: " + proz(r.summe) + ".")));
  }

  /* ---------------- Ausnahme-Check ---------------- */
  function baueCheck() {
    var box = document.getElementById("check");
    box.innerHTML = "";
    var entschieden = null;
    D.ausnahmen.forEach(function (a, i) {
      var antw = antworten[a.id];
      var zeile = el("div", "check-zeile");
      if (entschieden) zeile.classList.add("gedimmt");
      var status = "";
      if (antw !== undefined) {
        var trifft = a.nein ? antw === false : antw === true;
        status = trifft ? (a.folge === "teil" ? "teil" : "aus") : "ok";
      }
      var nr = el("span", "check-nr " + status, String(i + 1));
      nr.setAttribute("aria-hidden", "true");
      zeile.appendChild(nr);
      var frage = el("span", "", nl(a.frage));
      frage.id = "frage-" + a.id;
      zeile.appendChild(frage);
      var jn = el("div", "jn");
      jn.setAttribute("role", "group");
      jn.setAttribute("aria-labelledby", frage.id);
      [[true, t("Ja", "Ja")], [false, t("Nein", "Nein")]].forEach(function (paar) {
        var b = el("button", "", paar[1]);
        b.type = "button";
        b.setAttribute("aria-pressed", antw === paar[0] ? "true" : "false");
        b.addEventListener("click", function () {
          antworten[a.id] = paar[0];
          baueCheck();
          var neu = document.querySelector("#check .check-zeile:nth-child(" + (i + 1) + ") .jn button:" + (paar[0] ? "first-child" : "last-child"));
          if (neu) neu.focus();
        });
        jn.appendChild(b);
      });
      zeile.appendChild(jn);
      if (status === "aus" || status === "teil") {
        zeile.appendChild(el("p", "check-erkl", nl(a.erklaerung)));
      }
      box.appendChild(zeile);
      if (status === "aus" && !entschieden) entschieden = a;
    });

    var erg = document.getElementById("check-ergebnis");
    erg.innerHTML = "";
    var teil = D.ausnahmen.filter(function (a) { return a.folge === "teil" && antworten[a.id] === true; });
    var alleBeantwortet = D.ausnahmen.every(function (a) { return antworten[a.id] !== undefined; });
    var div;
    if (entschieden && entschieden.folge === "bestand") {
      div = el("div", "ampel neutral");
      div.appendChild(absatz("", t("<strong>Keine Neuvermietung:</strong> Die Bremse spielt keine Rolle. Für Mieterhöhungen gelten Mietspiegel und Kappungsgrenze; " +
        "stellen Sie oben „Mieterhöhung im laufenden Vertrag“ ein.",
        "<strong>Kein neuer Vertrag:</strong> Die Bremse gilt nicht. Oben können Sie „Meine Miete soll steigen“ wählen.")));
    } else if (entschieden) {
      div = el("div", "ampel aus");
      div.appendChild(absatz("", t("<strong>Die Bremse greift nicht.</strong> " + nl(entschieden.erklaerung),
        "<strong>Die Bremse gilt hier nicht.</strong> " + nl(entschieden.erklaerung))));
      if (entschieden.id === "neubau" || entschieden.id === "modernisiert") div.appendChild(absatz("", t("Aber: Der Vermieter muss Sie vor Vertragsschluss unaufgefordert über die Ausnahme informieren (§ 556g Abs. 1a BGB). " +
        "Hat er das nicht getan, kann er sich zunächst nicht darauf berufen.",
        "Der Vermieter muss Ihnen das vorher sagen. Sonst gilt die Ausnahme erst einmal nicht.")));
    } else if (teil.length) {
      div = el("div", "ampel teil");
      div.appendChild(absatz("", t("<strong>Die Bremse greift, aber mit Einschränkungen:</strong>", "<strong>Die Bremse gilt. Aber:</strong>")));
      teil.forEach(function (a) { div.appendChild(absatz("", "– " + nl(a.erklaerung))); });
    } else if (alleBeantwortet) {
      div = el("div", "ampel ok");
      div.appendChild(absatz("", t("<strong>Die Bremse greift.</strong> Die Miete darf höchstens 10 % über der Vergleichsmiete liegen. " +
        "Liegt sie darüber, können Sie das schriftlich rügen (Textform, also auch per E-Mail). Wer in den ersten 30 Monaten rügt, bekommt zu viel Gezahltes ab Mietbeginn zurück.",
        "<strong>Die Bremse gilt.</strong> Ist die Miete zu hoch? Dann schreiben Sie dem Vermieter. Sie bekommen dann Geld zurück.")));
    } else {
      div = el("div", "ampel neutral");
      div.appendChild(absatz("", t("Beantworten Sie die Fragen der Reihe nach.", "Bitte beantworten Sie die Fragen.")));
    }
    erg.appendChild(div);
    document.getElementById("check-zuruecksetzen").textContent = t("Antworten zurücksetzen", "Noch mal von vorn");
  }
  document.getElementById("check-zuruecksetzen").addEventListener("click", function () { antworten = {}; baueCheck(); });

  /* ---------------- Wie viele fallen raus? ---------------- */
  /* Gezaehlt werden kann nur die Neubau-Ausnahme. Segmente mit offen: true
     enthalten weitere, nicht gezaehlte Ausnahmen und bekommen einen
     gestrichelten Rand, damit sie nicht als "hier greift die Bremse" lesen. */
  function gestapelt(titelText, segmente, fuss, musterId) {
    var teil = el("div", "raus-teil");
    teil.appendChild(absatz("diagramm-titel", titelText));
    teil.appendChild(legende(segmente.map(function (s) {
      return { farbe: s.farbe, klasse: s.schraffur ? "schraffur" : (s.offen ? "offen" : ""), text: s.text };
    })));
    var W = 760, H = 54, BH = 36;
    var summe = segmente.reduce(function (a, s) { return a + s.wert; }, 0);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": segmente.map(function (s) { return s.text + ": " + zahl(s.wert / summe * 100) + " %"; }).join(", ") });
    var defs = svgEl("defs", {});
    svg.appendChild(defs);
    var x = 0;
    segmente.forEach(function (s, i) {
      var w = s.wert / summe * W;
      var fill = s.farbe;
      if (s.schraffur) {
        var id = musterId + "-" + i;
        defs.appendChild(schraffur(id, s.farbe));
        fill = "url(#" + id + ")";
      }
      var attrs = { x: x + 1, y: 5, width: Math.max(w - 3, 1), height: BH - 2, rx: 3, fill: fill };
      if (s.offen) { attrs.stroke = farbe("--border-strong"); attrs["stroke-width"] = 1.5; attrs["stroke-dasharray"] = "5 4"; }
      svg.appendChild(svgEl("rect", attrs, [ titel(s.text + ": " + zahl(s.wert) + " (" + zahl(s.wert / summe * 100) + " %)") ]));
      if (w > 60) {
        var inhalt = zahl(s.wert / summe * 100) + " %" + (s.offen && w > 300 ? t(" – darin weitere Ausnahmen, Anteil unbekannt", " – davon einige mit anderen Ausnahmen") : "");
        svg.appendChild(text(x + w / 2, 4 + BH / 2 + 5, inhalt, "wert-text halo", "middle"));
      }
      x += w;
    });
    teil.appendChild(svg);
    if (fuss) teil.appendChild(absatz("diagramm-fuss", fuss));
    return teil;
  }

  function baueRaus() {
    var Z = D.ausnahmen_zahlen;
    var box = document.getElementById("diagramm-raus");
    box.innerHTML = "";

    var warn = el("div", "ampel teil");
    warn.appendChild(absatz("", t(
      "<strong>Nur eine der sechs Ausnahmen lässt sich zählen: der Neubau.</strong> Für Vormiete, umfassende Modernisierung, " +
      "Möblierung, Kurzzeitvermietung und Indexmiete gibt es für Ingolstadt keine Zahlen. Der helle Teil der Balken heißt deshalb " +
      "<em>nicht</em>, dass dort die Bremse greift – nur, dass dort keine Neubau-Ausnahme vorliegt. Wie viele dieser Wohnungen " +
      "unter eine andere Ausnahme fallen, weiß niemand.",
      "<strong>Nur eine Ausnahme kann man zählen: neue Häuser.</strong> Für die anderen Ausnahmen gibt es keine Zahlen. " +
      "Der helle Teil heißt also nicht: Hier gilt die Bremse sicher.")));
    box.appendChild(warn);

    var IN = Z.ingolstadt;
    var neu = IN.fertig.reduce(function (a, z) { return a + z[1]; }, 0);
    var von = IN.fertig[0][0], bis = IN.fertig[IN.fertig.length - 1][0];
    box.appendChild(gestapelt(
      t("Ingolstadt: alle Wohnungen, Stand " + IN.bestand_stand, "Ingolstadt: alle Wohnungen"),
      [
        { wert: neu, farbe: farbe("--zuschlag"), schraffur: true,
          text: t("gebaut " + von + "–" + bis + " (" + zahl(neu) + "): Neubau-Ausnahme", "neu gebaut seit " + von + ": Bremse gilt nicht") },
        { wert: IN.bestand - neu, farbe: farbe("--spanne"), offen: true,
          text: t("vor " + von + " gebaut (" + zahl(IN.bestand - neu) + "): Bremse gilt nur ohne weitere Ausnahme – nicht gezählt",
            "ältere Wohnungen: Bremse gilt nur, wenn es keine andere Ausnahme gibt") },
      ],
      t("Etwa jede siebte Wohnung ist seit " + von + " fertig geworden und bei jeder Vermietung ausgenommen. Mitgezählt sind auch selbst " +
        "genutzte Eigenheime und Umbauten in bestehenden Gebäuden. Für selbst genutzte Wohnungen spielt die Bremse ohnehin keine Rolle: " +
        "Laut Zensus 2022 waren in Ingolstadt rund " + zahl(Math.round(IN.vermietet_2022 / 100) * 100) + " Wohnungen vermietet, und auch bei ihnen greift die Bremse nur beim Mieterwechsel.",
        "Etwa jede siebte Wohnung ist neu. Für neue Wohnungen gilt die Bremse nicht."),
      "muster-ing"));

    var M = Z.muenchen;
    var mSumme = M.moebliert + M.erstbezug + M.wiedervermietung;
    box.appendChild(gestapelt(
      t("München: Mietwohnungen in Online-Anzeigen " + M.jahr + " (rund " + zahl(mSumme) + ")", "München: Wohnungs-Anzeigen " + M.jahr),
      [
        { wert: M.erstbezug, farbe: farbe("--zuschlag"), schraffur: true,
          text: t("Neubau, Erstbezug unmöbliert: Neubau-Ausnahme", "Neubau: Bremse gilt nicht") },
        { wert: M.moebliert, farbe: farbe("--zuschlag"),
          text: t("möbliert, oft auf Zeit: Bremse kaum prüfbar", "mit Möbeln: schwer zu prüfen") },
        { wert: M.wiedervermietung, farbe: farbe("--spanne"), offen: true,
          text: t("unmöbliert, Wiedervermietung: weitere Ausnahmen nicht ausgewiesen", "ohne Möbel, schon vorher vermietet: andere Ausnahmen nicht gezählt") },
      ],
      t("Fast jede zweite Mietanzeige in München ist möbliert oder ein Neubau. Möblierte Bestandswohnungen wurden " + M.jahr +
        " rund 28 % teurer angeboten als unmöblierte. Portale zeigen eher den teureren Teil des Marktes. Unter den Wiedervermietungen " +
        "stecken Wohnungen ab 2015, Wohnungen mit hoher Vormiete, frisch modernisierte Wohnungen und Indexmieten – wie viele, weist die Auswertung nicht aus.",
        "Fast jede zweite Anzeige in München ist eine neue Wohnung oder eine Wohnung mit Möbeln."),
      "muster-muc"));

    /* Was ueber die anderen Ausnahmen bekannt ist */
    var bekannt = el("div", "raus-teil");
    bekannt.appendChild(absatz("diagramm-titel", t("Was über die anderen Ausnahmen bekannt ist", "Was man über die anderen Ausnahmen weiß")));
    var tab = el("ul", "bekannt-liste");
    Z.andere.forEach(function (a) {
      var li = document.createElement("li");
      li.appendChild(el("strong", "", nl(a.name)));
      var p = el("span", "");
      p.appendChild(document.createTextNode(nl(a.text) + " "));
      if (a.url) p.appendChild(lnk(a.url, t("Quelle", "Quelle")));
      li.appendChild(p);
      tab.appendChild(li);
    });
    bekannt.appendChild(tab);
    box.appendChild(bekannt);

    var B = Z.befragung;
    var ul = el("ul", "stimmen");
    var li1 = document.createElement("li");
    var w1 = el("span", "wer"); w1.appendChild(lnk(B.url, t("Und selbst wo sie greift: Befragung in München " + B.jahr, "Umfrage in München")));
    li1.appendChild(w1);
    li1.appendChild(document.createTextNode(t(
      "Von rund " + zahl(B.befragte) + " befragten Münchner Mieterinnen und Mietern hatten nur " + zahl(B.anteil, 1) +
      " % die Mietpreisbremse geltend gemacht; viele fürchteten Ärger mit dem Vermieter. (Quelle: " + B.quelle + ".)",
      "Nur etwa 2 von 100 Mietern haben sich auf die Bremse berufen. Viele haben Angst vor Ärger.")));
    ul.appendChild(li1);
    box.appendChild(ul);

    var q = el("p", "diagramm-fuss");
    q.appendChild(document.createTextNode(t("Quellen: ", "Woher die Zahlen kommen: ")));
    q.appendChild(lnk(IN.url, IN.quelle));
    q.appendChild(document.createTextNode("; Zensus 2022 (Zensusdatenbank, siehe "));
    var aw = document.createElement("a"); aw.href = "wohnen.html"; aw.textContent = t("Seite Wohnen", "Seite Wohnen");
    q.appendChild(aw);
    q.appendChild(document.createTextNode("); "));
    q.appendChild(lnk(M.url, M.quelle));
    box.appendChild(q);
  }

  /* ---------------- Ablauf, Zeitleiste, Akteure ---------------- */
  function baueStationen() {
    var ol = document.getElementById("stationen");
    ol.innerHTML = "";
    D.stationen.forEach(function (s) {
      var li = document.createElement("li");
      li.appendChild(el("h3", "", nl(s.titel)));
      li.appendChild(el("p", "", nl(s.text)));
      li.appendChild(absatz("haken", "<strong>" + t("Hier hakt es:", "Das Problem:") + "</strong> " + nl(s.haken)));
      ol.appendChild(li);
    });
  }
  function baueZeitleiste() {
    var ul = document.getElementById("zeitleiste");
    ul.innerHTML = "";
    var heute = D.stand;
    var namen = { bund: t("Bund", "Bund"), land: t("Bayern", "Bayern"), stadt: t("Stadt", "Stadt") };
    D.zeitleiste.forEach(function (z) {
      var li = el("li", z.datum > heute ? "zukunft" : "");
      li.appendChild(el("span", "datum", datumDE(z.datum)));
      li.appendChild(el("span", "ebene " + z.ebene, namen[z.ebene]));
      li.appendChild(el("span", "", (leicht ? z.l : z.n) + (z.datum > heute ? t(" (geplant)", " (später)") : "")));
      ul.appendChild(li);
    });
  }
  function baueAkteure() {
    var box = document.getElementById("akteure");
    box.innerHTML = "";
    D.akteure.forEach(function (a) {
      var d = el("div", "akteur");
      d.appendChild(el("h3", "", nl(a.wer)));
      d.appendChild(el("p", "plus", nl(a.plus)));
      d.appendChild(el("p", "minus", nl(a.minus)));
      box.appendChild(d);
    });
    var ul = document.getElementById("forschung");
    ul.innerHTML = "";
    D.forschung.forEach(function (f) {
      var li = document.createElement("li");
      var wer = el("span", "wer");
      wer.appendChild(lnk(f.url, f.quelle));
      li.appendChild(wer);
      li.appendChild(document.createTextNode(leicht ? f.l : f.n));
      ul.appendChild(li);
    });
  }

  /* ---------------- Kennzahlen oben ---------------- */
  function baueKennzahlen() {
    kacheln(document.getElementById("kennzahlen"), [
      { label: t("Basismiete für 70 m²", "Grund-Miete für 70 m²"), wert: euro(basismiete(70)),
        unter: t("pro m², vor Zu- und Abschlägen", "pro Quadrat-Meter") },
      { label: t("Mietpreisbremse", "Miet-Bremse"), wert: "+" + BR.aufschlag + " %",
        unter: t("über Vergleichsmiete, gilt bis " + BR.laeuft_bis, "mehr als üblich. Gilt bis " + BR.laeuft_bis.slice(-4)) },
      { label: t("Fortschreibung 2025", "Erhöhung 2025"), wert: "+" + zahl(MS.fortschreibung.prozent, 2) + " %",
        unter: t("pauschal nach Verbraucherpreisindex", "wie alle Preise gestiegen sind") },
      { label: t("Kappungsgrenze", "Erhöhung im alten Vertrag"), wert: BR.kappung + " %",
        unter: t("höchstens in " + BR.kappung_jahre + " Jahren", "höchstens in " + BR.kappung_jahre + " Jahren") },
      { label: t("Mietspiegel gilt bis", "Mietspiegel gilt bis"), wert: MS.gueltig_bis,
        unter: t("Neuer Mietspiegel 2027 geplant", "Dann kommt ein neuer") },
    ]);
  }

  /* ---------------- C: Diagramme ---------------- */
  function baueFlaeche(r) {
    var box = document.getElementById("diagramm-flaeche");
    box.innerHTML = "";
    box.appendChild(absatz("diagramm-titel", t("Basismiete nach Wohnungsgröße, in € pro m²", "Grund-Miete nach Größe, in Euro pro Quadrat-Meter")));
    box.appendChild(legende([
      { klasse: "linie", farbe: farbe("--vergleich"), text: t("Mietspiegel 2025–2027", "Mietspiegel jetzt") },
      { klasse: "strich", farbe: farbe("--basis"), text: t("Mietspiegel 2023 (zurückgerechnet)", "Mietspiegel 2023") },
      { farbe: farbe("--grenze"), text: t("Ihre Wohnung aus dem Rechner", "Ihre Wohnung") },
    ]));
    var W = 760, H = 300, L = 48, R = 20, O = 16, U = 40;
    var xmin = 25, xmax = 160, ymin = 6, ymax = 12;
    function x(v) { return L + (v - xmin) / (xmax - xmin) * (W - L - R); }
    function y(v) { return O + (ymax - v) / (ymax - ymin) * (H - O - U); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": t("Basismiete sinkt von " + euro(basismiete(25)) + " bei 25 m² auf " + euro(basismiete(100)) + " bei 100 m²",
        "Kleine Wohnungen kosten pro Quadrat-Meter mehr") });
    for (var g = ymin; g <= ymax; g++) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: "gitter" }));
      svg.appendChild(text(L - 8, y(g) + 4, zahl(g) + " €", "achse-text", "end"));
    }
    [25, 40, 60, 80, 100, 120, 140, 160].forEach(function (v) {
      svg.appendChild(text(x(v), H - U + 18, v + " m²", "achse-text", "middle"));
    });
    function linie(faktor) {
      var d = "";
      for (var f = 25; f <= 160; f++) {
        var w = basismiete(f) * faktor;
        d += (f === 25 ? "M" : "L") + x(f).toFixed(1) + "," + y(w).toFixed(1);
        if (f < 160) d += " L" + x(f + 1).toFixed(1) + "," + y(w).toFixed(1);
      }
      return d;
    }
    svg.appendChild(svgEl("path", { d: linie(1 / MS.fortschreibung.faktor), fill: "none", stroke: farbe("--basis"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
    svg.appendChild(svgEl("path", { d: linie(1), fill: "none", stroke: farbe("--vergleich"), "stroke-width": 2.5 }));
    var fl = Math.max(25, Math.min(160, Math.floor(r.flaeche)));
    var b = basismiete(fl);
    svg.appendChild(svgEl("circle", { cx: x(fl + 0.5), cy: y(b), r: 6, fill: farbe("--grenze"), stroke: "#fff", "stroke-width": 2 }, [
      titel(zahl(fl) + " m²: " + euro(b)) ]));
    var lx = x(fl + 0.5) + (fl > 130 ? -10 : 10);
    svg.appendChild(text(lx, y(b) - 10, zahl(fl) + " m²: " + euro(b), "wert-text halo", fl > 130 ? "end" : "start"));
    box.appendChild(svg);
    box.appendChild(absatz("diagramm-fuss", t(
      "Kleine Wohnungen sind pro m² deutlich teurer: 25 m² kosten " + euro(basismiete(25)) + ", ab rund 100 m² sind es " + euro(basismiete(100)) + ". " +
      "Die gestrichelte Linie zeigt die Werte vor der Fortschreibung 2025; sie ist aus den heutigen Werten zurückgerechnet (÷ " + zahl(MS.fortschreibung.faktor, 4) + "), " +
      "denn die Fortschreibung hat jeden Wert um denselben Faktor angehoben.",
      "Kleine Wohnungen kosten pro Quadrat-Meter mehr. Die gestrichelte Linie zeigt die Werte vor 2025.")));
  }

  function baueBaujahr(r) {
    var box = document.getElementById("diagramm-baujahr");
    box.innerHTML = "";
    box.appendChild(absatz("diagramm-titel", t("Zu- und Abschlag nach Baujahr, in Prozent", "Mehr oder weniger Miete nach Baujahr, in Prozent")));
    box.appendChild(legende([
      { farbe: farbe("--zuschlag"), text: t("Zuschlag", "mehr") },
      { farbe: farbe("--abschlag"), text: t("Abschlag", "weniger") },
      { klasse: "schraffur", farbe: farbe("--zuschlag"), text: t("von der Bremse ganz oder teils ausgenommen (Erstbezug nach 1.10.2014)", "Bremse gilt (oft) nicht") },
    ]));
    var W = 760, H = 300, L = 48, R = 12, O = 22, U = 56;
    var ymin = -15, ymax = 40;
    var n = MS.baujahr.length, slot = (W - L - R) / n, bw = slot * 0.66;
    function y(v) { return O + (ymax - v) / (ymax - ymin) * (H - O - U); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": t("Zuschläge nach Baujahr von −11 % bis +36 %", "Neue Häuser haben die höchsten Zuschläge") });
    svg.appendChild(svgEl("defs", {}, [schraffur("schraffur-zu", farbe("--zuschlag"))]));
    for (var g = -10; g <= ymax; g += 10) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: g === 0 ? "achse-linie" : "gitter" }));
      svg.appendChild(text(L - 8, y(g) + 4, (g > 0 ? "+" : "") + g + " %", "achse-text", "end"));
    }
    MS.baujahr.forEach(function (b, i) {
      var cx = L + slot * i + slot / 2;
      var f = b.wert >= 0 ? farbe("--zuschlag") : farbe("--abschlag");
      var fill = b.neubau ? "url(#schraffur-zu)" : f;
      var hoehe = Math.abs(y(b.wert) - y(0));
      var aktiv = b.id === zustand.baujahr;
      svg.appendChild(svgEl("rect", { x: cx - bw / 2, y: Math.min(y(b.wert), y(0)), width: bw, height: Math.max(hoehe, 1.5), rx: 2, fill: fill,
        stroke: aktiv ? farbe("--text") : "none", "stroke-width": aktiv ? 2 : 0 }, [ titel(nl(b) + ": " + proz(b.wert)) ]));
      svg.appendChild(text(cx, b.wert >= 0 ? y(b.wert) - 6 : y(b.wert) + 14, proz(b.wert), "wert-text", "middle"));
      var beschr = b.n.replace(" und später", "+").split(" – ");
      svg.appendChild(text(cx, H - U + 18, beschr[0], "achse-text" + (aktiv ? " fett" : ""), "middle"));
      if (beschr[1]) svg.appendChild(text(cx, H - U + 31, "–" + beschr[1], "achse-text", "middle"));
    });
    box.appendChild(svg);
    box.appendChild(absatz("diagramm-fuss", t(
      "Nachkriegs- und 70er-Jahre-Bauten liegen unter der Basismiete, Neubauten weit darüber. Gerade die teuersten Jahrgänge sind von der Bremse ausgenommen, " +
      "wenn sie nach dem 1. Oktober 2014 erstmals vermietet wurden – ihre hohen Mieten fließen aber in den Mietspiegel ein und heben die Vergleichsmiete für alle. " +
      "Der dunkle Rahmen markiert das Baujahr aus dem Rechner.",
      "Alte Häuser aus den 1970er Jahren haben niedrige Mieten. Neue Häuser haben hohe Mieten. Für neue Häuser gilt die Bremse oft nicht.")));
  }

  function baueMerkmale() {
    var box = document.getElementById("diagramm-merkmale");
    box.innerHTML = "";
    box.appendChild(absatz("diagramm-titel", t("Zu- und Abschläge für Lage und Ausstattung, in Prozent", "Mehr oder weniger Miete, in Prozent")));
    var liste = MS.lage.filter(function (l) { return l.wert !== 0; })
      .concat(MS.haustyp.filter(function (h) { return h.wert !== 0; }))
      .concat(MS.merkmale)
      .slice().sort(function (a, b) { return b.wert - a.wert; });
    var W = 760, ZH = 24, L = 380, R = 20, O = 6;
    var H = O + liste.length * ZH + 24;
    var xmin = -16, xmax = 14;
    function x(v) { return L + (v - xmin) / (xmax - xmin) * (W - L - R); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": t("Größter Zuschlag: Gute Wohnlage und Ein- oder Zweifamilienhaus je +12 %, größter Abschlag: keine Zentralheizung −14 %",
        "Gute Lage gibt am meisten mehr. Keine Heizung gibt am meisten weniger.") });
    [-15, -10, -5, 0, 5, 10].forEach(function (g) {
      svg.appendChild(svgEl("line", { x1: x(g), x2: x(g), y1: O, y2: H - 22, class: g === 0 ? "achse-linie" : "gitter" }));
      svg.appendChild(text(x(g), H - 6, (g > 0 ? "+" : "") + g + " %", "achse-text", "middle"));
    });
    liste.forEach(function (m, i) {
      var yy = O + i * ZH;
      var name = nl(m);
      svg.appendChild(text(L - 10, yy + ZH / 2 + 4, name.length > 52 ? name.slice(0, 50) + "…" : name, "label-text", "end"));
      var a = Math.min(0, m.wert), b = Math.max(0, m.wert);
      svg.appendChild(svgEl("rect", { x: x(a), y: yy + 4, width: x(b) - x(a), height: ZH - 8, rx: 2,
        fill: m.wert > 0 ? farbe("--zuschlag") : farbe("--abschlag") }, [titel(name + ": " + proz(m.wert))]));
      svg.appendChild(text(m.wert > 0 ? x(b) + 5 : x(0) + 5, yy + ZH / 2 + 4, proz(m.wert), "wert-text", "start"));
    });
    box.appendChild(svg);
    box.appendChild(absatz("diagramm-fuss", t(
      "Modernisierungen zählen dauerhaft: Eine nach 1999 gedämmte Fassade bringt +10 %, ein nach 2009 erneuertes Bad +8 %. " +
      "Zusätzlich darf der Vermieter nach einer Modernisierung die Kosten anteilig auf die Miete umlegen.",
      "Wer das Haus erneuert, darf mehr Miete verlangen.")));
  }

  function baueStadtrat() {
    var ul = document.getElementById("stadtrat");
    ul.innerHTML = "";
    D.stadtrat.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; }).forEach(function (s) {
      var li = document.createElement("li");
      var links = el("div");
      links.appendChild(el("span", "datum", datumDE(s.datum)));
      links.appendChild(el("span", "gremium", s.gremium));
      li.appendChild(links);
      var rechts = el("div");
      rechts.appendChild(lnk(s.url, leicht ? s.l : s.n));
      li.appendChild(rechts);
      ul.appendChild(li);
    });
  }

  function baueFehlt() {
    var ul = document.getElementById("fehlt-liste");
    ul.innerHTML = "";
    D.fehlt.forEach(function (f) {
      var li = document.createElement("li");
      li.appendChild(el("strong", "", nl(f) + ": "));
      li.appendChild(el("span", "", nl(f.d)));
      ul.appendChild(li);
    });
  }

  function baueQuellen() {
    var box = document.getElementById("quellen-block");
    box.innerHTML = "";
    box.appendChild(absatz("", "<strong>" + t("Quellen", "Woher die Zahlen kommen") + "</strong>"));
    var ul = document.createElement("ul");
    D.quellen.forEach(function (q) {
      var li = document.createElement("li");
      li.appendChild(lnk(q.url, q.text));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(absatz("", t("Stand der Angaben: " + datumDE(D.stand) + ". Die Mietspiegel-Werte sind von Hand aus dem Bericht übernommen (<code>data/miete.js</code>); " +
      "gerechnet wird nur im Browser, Eingaben werden weder gespeichert noch übermittelt.",
      "Stand: " + datumDE(D.stand) + ".")));
  }

  /* ---------------- Tabs ---------------- */
  document.querySelectorAll('[role="tablist"]').forEach(function (leiste) {
    var tabs = Array.prototype.slice.call(leiste.querySelectorAll('[role="tab"]'));
    function aktiviere(tab, fokus) {
      tabs.forEach(function (x) {
        var an = x === tab;
        x.setAttribute("aria-selected", an ? "true" : "false");
        x.tabIndex = an ? 0 : -1;
        document.getElementById(x.getAttribute("aria-controls")).hidden = !an;
      });
      if (fokus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { aktiviere(tab); });
      tab.addEventListener("keydown", function (ev) {
        var ziel = null;
        if (ev.key === "ArrowRight") ziel = tabs[(i + 1) % tabs.length];
        if (ev.key === "ArrowLeft") ziel = tabs[(i - 1 + tabs.length) % tabs.length];
        if (ev.key === "Home") ziel = tabs[0];
        if (ev.key === "End") ziel = tabs[tabs.length - 1];
        if (ziel) { ev.preventDefault(); aktiviere(ziel, true); }
      });
    });
  });

  /* Der Rechner rechnet bei jeder Eingabe; Absenden (Enter im Zahlenfeld)
     darf die Seite nicht neu laden. Stand frueher als onsubmit="return false"
     im HTML — Inline-Handler erlaubt die Content-Security-Policy nicht mehr. */
  document.getElementById("formular").addEventListener("submit", function (ev) {
    ev.preventDefault();
  });

  /* ---------------- Zusammenspiel ---------------- */
  /* nurWerte: Formular nicht neu aufbauen (sonst verliert ein Textfeld beim
     Tippen den Fokus). */
  function aktualisiere(nurWerte) {
    if (!nurWerte) baueFormular();
    formularWerteSetzen();
    var r = rechne();
    baueErgebnis(r);
    baueSkala(r);
    baueKette(r);
    baueFlaeche(r);
    baueBaujahr(r);
  }

  function texteAnwenden() {
    Object.keys(TEXTE).forEach(function (id) {
      var e = document.getElementById("txt-" + id);
      if (e) e.innerHTML = TEXTE[id][leicht ? "l" : "n"];
    });
    baueKennzahlen();
    aktualisiere();
    baueCheck();
    baueRaus();
    baueStationen();
    baueZeitleiste();
    baueAkteure();
    baueMerkmale();
    baueStadtrat();
    baueFehlt();
    baueQuellen();
  }

  texteAnwenden();

  var btnLeicht = document.getElementById("btn-leicht");
  btnLeicht.setAttribute("aria-pressed", leicht ? "true" : "false");
  btnLeicht.addEventListener("click", function () {
    leicht = !leicht;
    btnLeicht.setAttribute("aria-pressed", leicht ? "true" : "false");
    try { localStorage.setItem(LS_KEY_LEICHT, leicht ? "1" : "0"); } catch (err) { /* Storage kann gesperrt sein */ }
    texteAnwenden();
  });
})();
