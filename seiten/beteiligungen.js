/* Skript der Seite beteiligungen.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  "use strict";
  var D = window.BETEILIGUNGEN_DATEN;
  if (!D) {
    document.querySelectorAll(".ladehinweis").forEach(function (el) {
      el.textContent = "Die Daten konnten nicht geladen werden.";
    });
    return;
  }
  var E = D.eckdaten, W = D.waage, JAHRE = W.jahre;
  var IST = JAHRE.filter(function (j) { return !j.prognose; });
  var LETZT = IST[IST.length - 1], PROG = JAHRE[JAHRE.length - 1];
  var FEST = W.freizeit_fest.abschreibungen + W.freizeit_fest.zinsen;

  /* ---------------- Formatierung ---------------- */
  function zahl(n, stellen) {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: stellen || 0, maximumFractionDigits: stellen || 0,
    }).format(n);
  }
  function mio(teur, stellen) {
    var s = stellen === undefined ? 1 : stellen;
    return zahl(Math.abs(teur) / 1000, s).replace(/^/, teur < 0 ? "−" : "") + " Mio. €";
  }
  function el(tag, klasse, inhalt) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (inhalt !== undefined) e.textContent = inhalt;
    return e;
  }
  function absatz(klasse, inhalt) {
    var p = document.createElement("p");
    p.className = klasse;
    p.innerHTML = inhalt;
    return p;
  }
  function lnk(url, inhalt) {
    return "<a href=\"" + url + "\" rel=\"noopener noreferrer\" target=\"_blank\">" + inhalt + "</a>";
  }
  function datumDE(iso) {
    var p = iso.split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }

  /* ---------------- Einfache Sprache ---------------- */
  var LS_KEY_LEICHT = "papierpanther-leichte-sprache";
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === "1"; } catch (err) { /* Storage kann gesperrt sein */ }
  function t(normal, leichtText) { return leicht ? leichtText : normal; }
  function nl(o) { return o ? (leicht ? o.l : o.n) : ""; }

  /* Abgeleitete Zahlen fuer die Texte: alles aus data/beteiligungen.js, nichts von Hand. */
  var einlagen = IST.map(function (j) { return j.einlage; });
  var einlageMin = Math.min.apply(null, einlagen), einlageMax = Math.max.apply(null, einlagen);
  var saldo = D.zahlungen.summe_teur - D.einnahmen.summe_teur;
  var faktor = E.kredite_teur / D.kernhaushalt.schulden_teur;
  var ART = {
    selbst: { n: "trägt sich über Gebühren, Preise oder Mieten", l: "Die Kunden bezahlen alles" },
    teils: { n: "teils, teils", l: "Die Kunden bezahlen einen Teil" },
    haushalt: { n: "braucht Geld aus dem Haushalt", l: "Die Stadt gibt Geld dazu" },
  };

  var TEXTE = {
    "hinweis": {
      n: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Die Zahlen stammen aus dem Beteiligungsbericht 2026 der Stadt. Dies ist ein Prototyp.",
      l: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Die Zahlen kommen aus einem Bericht von der Stadt. Die Seite ist noch ein Test.",
    },
    "h1": { n: "Die Unternehmen der Stadt", l: "Die Firmen der Stadt" },
    "lede": {
      n: "Wasser, Busse, Bäder, das Klinikum, Wohnungen: Vieles im Alltag erledigt nicht das Rathaus, sondern ein Unternehmen, das der Stadt ganz oder teilweise gehört. " +
        "Einmal im Jahr berichtet die Stadt darüber, zuletzt für 2025. Diese Seite zeigt, was die Unternehmen tun, wer sie bezahlt und was sie den Haushalt kosten.",
      l: "Viele Dinge macht nicht das Rat-Haus. Das machen Firmen, die der Stadt gehören. Zum Beispiel: Wasser, Busse und Schwimm-Bäder. " +
        "Hier steht: Was machen die Firmen? Wer bezahlt sie? Und was kostet das die Stadt?",
    },
    "sprung-alltag": { n: "Im Alltag", l: "Im Alltag" },
    "sprung-waage": { n: "Wer bezahlt Bus und Bad?", l: "Wer bezahlt Bus und Bad?" },
    "sprung-geld": { n: "Geld hin und zurück", l: "Geld von der Stadt" },
    "sprung-schulden": { n: "Schulden", l: "Schulden" },
    "sprung-hsk": { n: "Zum Sparplan →", l: "Zum Spar-Plan →" },
    "blick-h2": { n: "Auf einen Blick", l: "Das Wichtigste" },
    "stichtag": {
      n: "Stand: Beteiligungsbericht 2026 für das Jahr 2025. Stadtwerke und Kommunalbetriebe rechnen von Oktober bis September, ihre Zahlen gelten für 2024/25.",
      l: "Die Zahlen sind aus dem Jahr 2025.",
    },

    "alltag-h2": { n: "Ihr Alltag mit den Unternehmen der Stadt", l: "Diese Firmen kennen Sie aus dem Alltag" },
    "alltag-p1": {
      n: "Neun Bereiche, die fast jede und jeder nutzt. Die Farbe zeigt, wer am Ende bezahlt: die Kundinnen und Kunden über Gebühren, Preise und Mieten, oder zusätzlich der Haushalt der Stadt.",
      l: "Hier sehen Sie 9 Bereiche. Die Farbe zeigt: Wer bezahlt das?",
    },
    "alltag-weiter": {
      n: "Nicht in dieser Auswahl: die Sparkasse, die Müllverwertungsanlage, die Zentralkläranlage, Windparks und kleinere Beteiligungen. Der Anteil der Stadt steht jeweils in Klammern; „100 %“ heißt bei den Töchtern der Stadtwerke, dass die Stadt Gewinn und Verlust allein trägt.",
      l: "Die Stadt hat noch mehr Firmen. Zum Beispiel die Spar-Kasse. Die stehen hier nicht.",
    },

    "waage-h2": { n: "Wer bezahlt Bus und Hallenbad?", l: "Wer bezahlt den Bus und das Schwimm-Bad?" },
    "waage-p1": {
      n: "Busse, Bäder und Eishallen kosten mehr, als Fahrscheine und Eintritt einbringen. Die Stadt hat sie deshalb unter das Dach der Stadtwerke gestellt: " +
        "Dort werden ihre Verluste mit den Gewinnen aus Strom, Gas und Wärme verrechnet. Das spart Steuern, " + LETZT.jahr + " waren es " + mio(LETZT.ueberleitung.steuerersparnis) + ".",
      l: "Busse und Schwimm-Bäder kosten viel Geld. Die Fahr-Karten und der Eintritt reichen nicht. " +
        "Die Stadt-Werke verdienen Geld mit Strom, Gas und Wärme. Mit diesem Gewinn bezahlen sie einen Teil.",
    },
    "waage-p2": {
      n: "Die Gewinne reichen aber nicht. Was fehlt, müssen die Kommunalbetriebe der Stadt bei den Stadtwerken einlegen, und dafür brauchen sie Geld aus dem Haushalt. " +
        "In den letzten fünf Jahren waren das zwischen " + mio(einlageMin) + " und " + mio(einlageMax) + " im Jahr. Für " + PROG.jahr + " rechnen die Stadtwerke mit " + mio(PROG.einlage) + ".",
      l: "Der Gewinn reicht aber nicht für alles. Den Rest bezahlt die Stadt. " +
        "Das waren in den letzten Jahren zwischen " + zahl(einlageMin / 1000, 0) + " und " + zahl(einlageMax / 1000, 0) + " Millionen Euro im Jahr.",
    },
    "geld-h2": { n: "Was die Stadt zahlt und was sie bekommt", l: "So viel Geld gibt die Stadt den Firmen" },
    "geld-p1": {
      n: "2025 hat die Stadt " + mio(D.zahlungen.summe_teur) + " an ihre Unternehmen und Zweckverbände gezahlt. Zurück kamen " + mio(D.einnahmen.summe_teur) +
        " über Konzessionsabgaben, Gewerbesteuer und Zinsen. Gewinne hat keines der Unternehmen an die Stadt ausgeschüttet.",
      l: "2025 hat die Stadt den Firmen " + zahl(D.zahlungen.summe_teur / 1000, 0) + " Millionen Euro gegeben. " +
        "Die Firmen haben der Stadt " + zahl(D.einnahmen.summe_teur / 1000, 0) + " Millionen Euro gezahlt.",
    },
    "geld-p2": {
      n: "Unter dem Strich sind das " + mio(saldo) + " zulasten des Haushalts. Die Zahl ist mit Vorsicht zu lesen: Der Bericht ordnet einzelne Zahlungen dem Jahr zu, für das sie gedacht sind, nicht dem Jahr, in dem das Geld floss. Die Hinweise an den Balken sagen, wo das eine Rolle spielt.",
      l: "Die Stadt hat also " + zahl(saldo / 1000, 0) + " Millionen Euro mehr gegeben als bekommen.",
    },
    "schulden-h2": { n: "Schulden außerhalb des Haushalts", l: "Die Firmen haben Schulden" },
    "schulden-p1": {
      n: "Die Unternehmen der Stadt haben zusammen Kredite von " + mio(E.kredite_teur, 0) + ". Das ist rund das " + zahl(faktor, 0) + "-Fache der Schulden im Kernhaushalt (" +
        mio(D.kernhaushalt.schulden_teur, 0) + ", Stand " + D.kernhaushalt.stand + "). Der größte Teil steckt in Wohnungen, Leitungen und Hallen, die über Mieten, Gebühren und Preise abbezahlt werden.",
      l: "Die Firmen der Stadt haben zusammen " + zahl(E.kredite_teur / 1000, 0) + " Millionen Euro Schulden. " +
        "Mit dem Geld haben sie Wohnungen, Leitungen und Hallen gebaut. Die Mieter und Kunden zahlen das nach und nach zurück.",
    },
    "fehlt-h2": { n: "Was nicht im Bericht steht", l: "Das steht nicht im Bericht" },
    "fehlt-p": {
      n: "Der Beteiligungsbericht ist die ausführlichste öffentliche Quelle zu den Unternehmen der Stadt. Einige Fragen beantwortet er nicht:",
      l: "Der Bericht sagt viel über die Firmen. Aber manche Dinge fehlen:",
    },
  };

  function kacheln() {
    var box = document.getElementById("kennzahlen");
    box.innerHTML = "";
    [
      [t("Unternehmen", "Firmen"), zahl(E.unternehmen), t("davon " + E.mit_mehrheit + " mit Mehrheit der Stadt", E.mit_mehrheit + " gehören mehr als zur Hälfte der Stadt")],
      [t("Beschäftigte", "Mitarbeiter"), zahl(E.beschaeftigte), t("in den Unternehmen vor Ort", "arbeiten bei den Firmen")],
      [t("Kredite der Unternehmen", "Schulden der Firmen"), mio(E.kredite_teur, 0), t("Kernhaushalt: " + mio(D.kernhaushalt.schulden_teur, 0), "Die Stadt selbst: " + zahl(D.kernhaushalt.schulden_teur / 1000, 0) + " Millionen Euro")],
      [t("Von der Stadt gezahlt, 2025", "Geld von der Stadt, 2025"), mio(D.zahlungen.summe_teur), t("zurück kamen " + mio(D.einnahmen.summe_teur), "zurück: " + zahl(D.einnahmen.summe_teur / 1000, 0) + " Millionen Euro")],
    ].forEach(function (k) {
      var d = el("div", "kachel");
      d.appendChild(el("p", "kachel-label", k[0]));
      d.appendChild(el("p", "kachel-wert", k[1]));
      d.appendChild(el("p", "kachel-unter", k[2]));
      box.appendChild(d);
    });
  }

  function legendeArt(container) {
    container.innerHTML = "";
    ["selbst", "teils", "haushalt"].forEach(function (a) {
      var s = document.createElement("span"), i = document.createElement("i");
      i.style.background = "var(--" + a + ")";
      s.appendChild(i); s.appendChild(document.createTextNode(nl(ART[a])));
      container.appendChild(s);
    });
  }

  function bereiche() {
    legendeArt(document.getElementById("legende-art"));
    var box = document.getElementById("bereiche");
    box.innerHTML = "";
    D.bereiche.forEach(function (b) {
      var a = el("article", "bereich " + b.art);
      a.appendChild(el("h3", "", leicht ? b.name_l : b.name));
      a.appendChild(el("p", "firma", b.firma + " (" + t("Anteil der Stadt: ", "Der Stadt gehören: ") + b.anteil + ")"));
      a.appendChild(el("p", "", nl(b.satz)));
      var dl = document.createElement("dl");
      dl.appendChild(el("dt", "", t("Ergebnis 2025", "Gewinn oder Verlust")));
      var dd = el("dd", b.ergebnis_teur < 0 ? "minus" : "", (b.ergebnis_teur > 0 ? "+" : "") + mio(b.ergebnis_teur));
      dl.appendChild(dd);
      dl.appendChild(el("dt", "", t("Kredite", "Schulden")));
      dl.appendChild(el("dd", "", mio(b.kredite_teur)));
      a.appendChild(dl);
      var z = document.createElement("p"); z.className = "zahlt";
      z.appendChild(el("strong", "", t("Wer bezahlt", "Wer bezahlt das?")));
      z.appendChild(document.createTextNode(nl(b.zahlt)));
      a.appendChild(z);
      if (!leicht) a.appendChild(el("p", "seite", "Beteiligungsbericht 2026, S. " + b.seiten));
      box.appendChild(a);
    });
  }

  /* Balkenliste: zeilen = [{label, hinweis, betont, spuren: [{wert, klasse, anzeige}] | stapel: [...]}] */
  function balken(container, titel, zeilen, max, legende, fuss) {
    container.innerHTML = "";
    container.appendChild(absatz("diagramm-titel", titel));
    if (legende) {
      var lg = el("div", "legende");
      legende.forEach(function (l) {
        var s = document.createElement("span"), i = document.createElement("i");
        if (l.klasse) i.className = "b-balken " + l.klasse; else i.style.background = "var(" + l.farbe + ")";
        i.style.width = "12px"; i.style.height = "12px"; i.style.minWidth = "12px";
        s.appendChild(i); s.appendChild(document.createTextNode(l.text));
        lg.appendChild(s);
      });
      container.appendChild(lg);
    }
    var liste = el("div", "balken");
    zeilen.forEach(function (z) {
      var zeile = el("div", "b-zeile" + (z.betont ? " betont" : ""));
      var lab = el("div", "b-label", z.label);
      if (z.hinweis) lab.appendChild(el("span", "b-hinweis", z.hinweis));
      zeile.appendChild(lab);
      var spuren = el("div", "b-spuren");
      var spur = el("div", "b-spur");
      var stapel = el("div", "b-stapel");
      var gesamt = z.teile.reduce(function (a, s) { return a + Math.max(0, s.wert); }, 0);
      stapel.style.width = "calc(" + (gesamt / max * 100).toFixed(2) + "% * var(--skala))";
      z.teile.forEach(function (s) {
        if (s.wert <= 0) return;
        var b = el("div", "b-balken " + (s.klasse || ""));
        b.style.flex = s.wert + " 1 0"; b.style.minWidth = "2px";
        stapel.appendChild(b);
      });
      spur.appendChild(stapel);
      var zl = el("span", "b-zahl"); zl.innerHTML = z.anzeige;
      spur.appendChild(zl);
      spuren.appendChild(spur);
      zeile.appendChild(spuren);
      liste.appendChild(zeile);
    });
    container.appendChild(liste);
    if (fuss) container.appendChild(absatz("diagramm-fuss", fuss));
  }

  function diagrammWaage() {
    var max = Math.max.apply(null, JAHRE.map(function (j) { return j.verlust; }));
    var zeilen = JAHRE.map(function (j) {
      return { label: (j.prognose ? t("Prognose ", "Geplant ") : "") + j.jahr, betont: j === LETZT,
        teile: [{ wert: j.verlust - j.einlage, klasse: "selbst" }, { wert: j.einlage, klasse: "zuschuss" }],
        anzeige: mio(j.einlage) + " <small>" + t("von " + mio(j.verlust), "von " + zahl(j.verlust / 1000, 0) + " Mio. €") + "</small>" };
    });
    balken(document.getElementById("diagramm-waage"),
      t("Verluste von Bussen, Bädern und Eishallen und wer sie deckt", "So viel fehlt bei Bussen und Bädern. Und wer es bezahlt"),
      zeilen, max,
      [{ klasse: "selbst", text: t("gedeckt aus dem Gewinn der Energieversorgung", "bezahlt aus dem Gewinn von Strom, Gas und Wärme") },
       { klasse: "zuschuss", text: t("Einlage der Kommunalbetriebe, letztlich Haushalt der Stadt", "bezahlt von der Stadt") }],
      t("Geschäftsjahre der Stadtwerke von Oktober bis September. Die ganze Balkenlänge ist der Verlust des Bereichs Freizeit, Verkehr und Telekommunikation. " +
        "Quelle: Beteiligungsbericht 2026, S. " + W._seite_ueberleitung + " und " + W._seite_reihe + ".",
        "Quelle: Bericht der Stadt über ihre Firmen, 2026."));
    document.getElementById("btn-waage").textContent = t("Als Waage ansehen und selbst rechnen", "Als Waage ansehen");
    var k = document.getElementById("kasten-fest");
    k.innerHTML = "";
    k.appendChild(el("h3", "", t("Und wenn man die Bäder schließt?", "Und wenn die Bäder zu sind?")));
    k.appendChild(absatz("", t(
      "Dann fiele der Verlust nicht weg. Von den " + mio(W.freizeit_fest.verlust) + ", die Bäder und Eishallen " + W.freizeit_fest.jahr + " gekostet haben, waren " +
      mio(FEST) + " Zinsen und Abschreibungen auf Gebäude, die schon gebaut sind. Die Kredite dafür liegen bei " + mio(D.bereiche.filter(function (b) { return b.id === "freizeit"; })[0].kredite_teur) +
      " und laufen weiter. In der grafischen Fassung lässt sich das mit Reglern durchspielen.",
      "Dann kostet es trotzdem Geld. Die Bäder und Eis-Hallen sind schon gebaut. Dafür gibt es Schulden. Die Schulden bleiben.")));
    if (!leicht) k.appendChild(absatz("b-hinweis", "Beteiligungsbericht 2026, S. " + W.freizeit_fest._seite + " und 271."));
  }

  function diagrammGeld() {
    var max = Math.max.apply(null, D.zahlungen.posten.map(function (p) { return p.teur; }));
    balken(document.getElementById("diagramm-zahlungen"),
      t("Von der Stadt an ihre Unternehmen und Zweckverbände, 2025", "Das hat die Stadt 2025 gezahlt"),
      D.zahlungen.posten.map(function (p) {
        return { label: leicht ? p.name_l : p.name, hinweis: leicht ? "" : p.hinweis, teile: [{ wert: p.teur, klasse: "haushalt" }], anzeige: mio(p.teur) };
      }), max, null,
      t("Summe " + mio(D.zahlungen.summe_teur) + ". Quelle: Beteiligungsbericht 2026, S. " + D.zahlungen._seite + ", Posten zusammengefasst.", "Quelle: Bericht der Stadt, 2026."));
    balken(document.getElementById("diagramm-einnahmen"),
      t("Von den Unternehmen an die Stadt, 2025", "Das hat die Stadt 2025 bekommen"),
      D.einnahmen.posten.map(function (p) {
        return { label: leicht ? p.name_l : p.name, teile: [{ wert: p.teur, klasse: "selbst" }], anzeige: mio(p.teur) };
      }), max, null,
      t("Summe " + mio(D.einnahmen.summe_teur) + ". Gleicher Maßstab wie oben. Quelle: Beteiligungsbericht 2026, S. " + D.einnahmen._seite + ".", "Quelle: Bericht der Stadt, 2026."));
  }

  function diagrammSchulden() {
    var liste = D.bereiche.slice().sort(function (a, b) { return b.kredite_teur - a.kredite_teur; });
    var max = liste[0].kredite_teur;
    var zeilen = liste.map(function (b) {
      return { label: leicht ? b.name_l : b.name, teile: [{ wert: b.kredite_teur, klasse: b.art }], anzeige: mio(b.kredite_teur) };
    });
    zeilen.push({ label: t("Zum Vergleich: Kernhaushalt der Stadt", "Zum Vergleich: die Stadt selbst"), betont: true,
      teile: [{ wert: D.kernhaushalt.schulden_teur, klasse: "ingolstadt" }], anzeige: mio(D.kernhaushalt.schulden_teur) });
    balken(document.getElementById("diagramm-schulden"),
      t("Kredite nach Bereich, Ende 2025", "Schulden der Firmen, Ende 2025"),
      zeilen, max,
      [{ klasse: "selbst", text: nl(ART.selbst) }, { klasse: "teils", text: nl(ART.teils) }, { klasse: "haushalt", text: nl(ART.haushalt) }],
      t("Die Balken lassen sich nicht einfach addieren: Die Unternehmen leihen sich auch untereinander Geld, und die Kommunalbetriebe haben zusätzlich Kredite für den Kauf von Unternehmensanteilen. " +
        "Zusammengerechnet nennt der Bericht " + mio(E.kredite_teur, 0) + " (S. " + E._seite_kredite + "); dort sind bei den Bädern und Eishallen die Einlagen der Stadt schon abgezogen. Kernhaushalt: Haushaltssicherungskonzept, Stand " + D.kernhaushalt.stand + ".",
        "Quelle: Bericht der Stadt, 2026."));
    var r = document.getElementById("kasten-rentierlich");
    r.innerHTML = "";
    r.appendChild(el("h3", "", t("Sind das Schulden der Stadt?", "Sind das Schulden von der Stadt?")));
    r.appendChild(absatz("", t(
      "Nur zum Teil. Der Bericht unterscheidet: Kredite, die ein Unternehmen aus eigenen Einnahmen zurückzahlt, nennt er rentierlich. " +
      "Bei Bussen, Bädern und Eishallen geht das nicht. Ihre Kredite rechnet der Bericht ausdrücklich der Verschuldung der Stadt zu: " + E.kredite_stadt_zugerechnet_mio + " Mio. €, " +
      E.zugerechnet_busse_mio + " für die Busse und " + E.zugerechnet_freizeit_mio + " für Bäder und Eishallen. Bei den Bädern sind dabei 36 Mio. € abgezogen, die die Stadt schon eingelegt hat (S. " + E._seite_zugerechnet + ").",
      "Nur ein Teil. Die meisten Firmen zahlen ihre Schulden selbst zurück. Bei den Bussen und Bädern geht das nicht. Diese Schulden gehören eigentlich zur Stadt. Das sind " + E.kredite_stadt_zugerechnet_mio + " Millionen Euro.")));
    var h = document.getElementById("kasten-haftung");
    h.innerHTML = "";
    h.appendChild(el("h3", "", t("Wofür die Stadt haftet", "Wenn eine Firma nicht zahlen kann")));
    h.appendChild(absatz("", t(
      "Die Kommunalbetriebe und die IFG sind Anstalten des öffentlichen Rechts. Für ihre Verbindlichkeiten haftet die Stadt unbeschränkt (S. 46 und 123). " +
      "Bei einer GmbH haftet sie nur mit ihrer Einlage, es sei denn, sie hat gebürgt: Ende 2025 bestanden Bürgschaften und Patronatserklärungen über 36,8 Mio. €, fast alle für die Bäder (S. 12).",
      "Zwei Firmen sind besonders: die Kommunal-Betriebe und die IFG. Wenn sie ihre Schulden nicht zahlen können, muss die Stadt zahlen.")));
  }

  function baueFehlt() {
    var ul = document.getElementById("fehlt-liste");
    ul.innerHTML = "";
    D.fehlt.forEach(function (f) {
      var li = document.createElement("li");
      li.appendChild(el("strong", "", (leicht ? f.ln : f.n) + ": "));
      li.appendChild(el("span", "", leicht ? f.ld : f.d));
      ul.appendChild(li);
    });
  }

  function baueQuellen() {
    var box = document.getElementById("quellen-block");
    box.innerHTML = "";
    box.appendChild(absatz("", "<strong>" + t("Quellen", "Woher die Zahlen kommen") + "</strong>"));
    var ul = document.createElement("ul");
    [[D.quelle.url, D.quelle.titel + " (Sitzungsvorlage " + D.quelle.vorlage + ")"],
     ["hsk.html", "Haushaltssicherungskonzept der Stadt, aufbereitet auf der Sparplan-Seite"]].forEach(function (q) {
      var li = document.createElement("li");
      li.innerHTML = q[0].indexOf("http") === 0 ? lnk(q[0], q[1]) : "<a href=\"" + q[0] + "\">" + q[1] + "</a>";
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(absatz("", t(
      "Stand der Angaben: " + datumDE(D.stand) + ". " + D.quelle.hinweis + " Die Zahlen sind von Hand aus dem Bericht übertragen (<code>data/beteiligungen.json</code>), jede mit Seitenangabe, und mit dem Bericht abgeglichen; " +
      "ein Skript rechnet die Summen und Überleitungen nach. Verbindlich ist der Bericht der Stadt.",
      "Stand: " + datumDE(D.stand) + ". Es gilt immer der Bericht von der Stadt.")));
  }

  function texteAnwenden() {
    Object.keys(TEXTE).forEach(function (id) {
      var e = document.getElementById("txt-" + id);
      if (e) e.innerHTML = TEXTE[id][leicht ? "l" : "n"];
    });
    kacheln();
    bereiche();
    diagrammWaage();
    diagrammGeld();
    diagrammSchulden();
    baueFehlt();
    baueQuellen();
  }

  texteAnwenden();

  document.getElementById("btn-waage").addEventListener("click", function () {
    var g = document.getElementById("btn-grafisch");
    if (g) g.click();
  });

  var btnLeicht = document.getElementById("btn-leicht");
  btnLeicht.setAttribute("aria-pressed", leicht ? "true" : "false");
  btnLeicht.addEventListener("click", function () {
    leicht = !leicht;
    btnLeicht.setAttribute("aria-pressed", leicht ? "true" : "false");
    try { localStorage.setItem(LS_KEY_LEICHT, leicht ? "1" : "0"); } catch (err) { /* Storage kann gesperrt sein */ }
    texteAnwenden();
  });
})();
