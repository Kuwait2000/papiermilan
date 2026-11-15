/* Skript der Seite waerme.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  "use strict";
  var D = window.WAERME, ADR = window.WEGE_ADRESSEN;
  if (!D) {
    document.querySelectorAll(".ladehinweis").forEach(function (el) {
      el.textContent = "Der Wärmeplan konnte nicht geladen werden.";
    });
    return;
  }
  var B = D.bericht;
  var LS_KEY_LEICHT = "papierpanther-leichte-sprache";
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === "1"; } catch (err) { /* Storage kann gesperrt sein */ }
  function t(n, l) { return leicht ? l : n; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function lnk(url, inhalt) {
    return "<a href=\"" + esc(url) + "\" rel=\"noopener noreferrer\" target=\"_blank\">" + inhalt +
      "<span class=\"sr-only\"> (öffnet in neuem Tab)</span></a>";
  }
  function datumDE(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function zahl(n, d) { return Number(n).toLocaleString("de-DE", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function prozent(teil, ganz, d) {
    var p = ganz ? teil / ganz * 100 : 0;
    if (teil > 0 && p < 0.5 && !d) return "unter 1 %";
    return zahl(p, d === undefined ? 0 : d) + " %";
  }

  /* ---------------- Die vier Klassen ---------------- */
  var STADTWERKE = "https://sw-i.de/fernwaerme/faq-waermeplanung-kwp/";
  var KLASSE = {
    netz: {
      n: "Wärmenetz-Gebiet", l: "Gebiet für Fern-Wärme",
      kurz: ["Fernwärme ist hier gut machbar, weil das bestehende Netz in der Nähe liegt.", "Hier ist Fern-Wärme gut möglich. Das Netz ist in der Nähe."],
      heisst: ["Der Plan hält einen Anschluss an die Fernwärme hier für gut umsetzbar. Das ist eine Einschätzung, keine Zusage: Ob und wann Ihr Haus angeschlossen werden kann, sagen Ihnen die Stadtwerke.",
        "Der Plan sagt: Hier kann Fern-Wärme gut hinkommen. Das ist aber kein Versprechen. Fragen Sie die Stadt-Werke: Kann mein Haus Fern-Wärme bekommen? Und wann?"],
      wege: [["Fernwärme", "Erdwärmepumpe", "Luftwärmepumpe", "Heizkessel für Holz oder Pellets", "Solarthermie oder Wärmepumpe als Ergänzung zum bestehenden Öl- oder Gaskessel"],
        ["Fern-Wärme", "Wärme-Pumpe", "Heizung mit Holz", "Sonnen-Wärme vom Dach als Hilfe für die alte Heizung"]]
    },
    netz_spaeter: {
      n: "Wärmenetz, geringe Priorität", l: "Fern-Wärme kommt vielleicht später",
      kurz: ["Fernwärme ist technisch möglich, das Netz müsste aber erst hierher gebaut werden.", "Fern-Wärme ist hier möglich. Aber das Netz muss erst gebaut werden."],
      heisst: ["Fernwärme ist hier grundsätzlich möglich. Das Netz reicht aber noch nicht bis hierher, und der Plan gibt dem Ausbau geringe Priorität. Einen Termin gibt es nicht. Wer bald eine neue Heizung braucht, sollte nicht auf den Anschluss warten, ohne vorher bei den Stadtwerken nachzufragen.",
        "Hier gibt es noch keine Fern-Wärme. Das Netz muss erst gebaut werden. Niemand weiß, wann das passiert. Brauchen Sie bald eine neue Heizung? Dann fragen Sie vorher die Stadt-Werke."],
      wege: [["Fernwärme, sobald das Netz ausgebaut ist", "Erdwärmepumpe", "Luftwärmepumpe", "Heizkessel für Holz oder Pellets", "Solarthermie oder Wärmepumpe als Ergänzung zum bestehenden Öl- oder Gaskessel"],
        ["Fern-Wärme, wenn das Netz da ist", "Wärme-Pumpe", "Heizung mit Holz", "Sonnen-Wärme vom Dach als Hilfe für die alte Heizung"]]
    },
    gas_wp: {
      n: "Gas/Wärmepumpen-Prüfgebiet", l: "Gebiet mit Gas-Leitung",
      kurz: ["Hier liegt eine Gasleitung. Ein Wärmenetz ist nicht vorgesehen; was aus dem Gasnetz wird, ist offen.", "Hier gibt es Gas-Leitungen. Fern-Wärme ist nicht geplant."],
      heisst: ["Ein Wärmenetz hält der Plan hier nicht für wirtschaftlich. Jedes Haus heizt für sich, im Zielbild vor allem mit einer Wärmepumpe. Weil eine Gasleitung in der Nähe liegt, wollen die Stadtwerke prüfen, ob dieser Teil des Netzes künftig Gas aus erneuerbaren Quellen führen kann. Der Plan nennt das selbst unsicher und derzeit nicht absehbar.",
        "Hier ist keine Fern-Wärme geplant. Jedes Haus braucht eine eigene Heizung. Am besten eine Wärme-Pumpe. Hier liegt eine Gas-Leitung. Vielleicht kommt später anderes Gas durch die Leitung. Zum Beispiel Bio-Gas. Das weiß aber noch niemand."],
      wege: [["Erdwärmepumpe", "Luftwärmepumpe", "Heizkessel für Holz oder Pellets", "Solarthermie oder Wärmepumpe als Ergänzung zum bestehenden Öl- oder Gaskessel"],
        ["Wärme-Pumpe", "Heizung mit Holz", "Sonnen-Wärme vom Dach als Hilfe für die alte Heizung"]]
    },
    einzel: {
      n: "Individuelle Heizlösung", l: "Jedes Haus heizt für sich",
      kurz: ["Hier gibt es weder Fernwärme noch eine Gasleitung. Jedes Haus heizt für sich.", "Hier gibt es keine Fern-Wärme und kein Gas."],
      heisst: ["Dieses Gebiet liegt außerhalb der Versorgung mit Fernwärme und Erdgas, und ein Wärmenetz hält der Plan nicht für wirtschaftlich. Jedes Haus braucht eine eigene Lösung, im Zielbild vor allem eine Wärmepumpe.",
        "Hier gibt es keine Fern-Wärme. Und es gibt keine Gas-Leitung. Jedes Haus braucht eine eigene Heizung. Am besten eine Wärme-Pumpe."],
      wege: [["Erdwärmepumpe", "Luftwärmepumpe", "Heizkessel für Holz oder Pellets", "Solarthermie oder Wärmepumpe als Ergänzung zum bestehenden Ölkessel"],
        ["Wärme-Pumpe", "Heizung mit Holz", "Sonnen-Wärme vom Dach als Hilfe für die alte Heizung"]]
    },
    ohne: {
      n: "In keiner Fläche des Plans", l: "Nicht im Plan",
      kurz: ["Liegt in keiner der Flächen, die die Stadt veröffentlicht hat.", "Dazu steht nichts im Plan."],
      heisst: ["Diese Adresse liegt in keiner der Flächen, die die Stadt veröffentlicht hat. Das kommt am Rand der Bebauung, in Gewerbegebieten und bei einzelnen Höfen vor. Für eine Auskunft fragen Sie die Stadtwerke oder die Energieberatung.",
        "Zu dieser Adresse steht nichts im Plan. Fragen Sie bitte die Stadt-Werke."],
      wege: [[], []]
    }
  };

  /* ---------------- Fläche zu einem Punkt ---------------- */
  function imRing(x, y, ring) {
    var drin = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
    }
    return drin;
  }
  function inGeometrie(x, y, g) {
    var polygone = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    return polygone.some(function (p) {
      return imRing(x, y, p[0]) && !p.slice(1).some(function (loch) { return imRing(x, y, loch); });
    });
  }
  // Überlappen sich Flächen, gewinnt die Klasse, die in der Legende weiter oben steht (wie im Skript)
  var RANG = {};
  D.klassen.forEach(function (k, i) { RANG[k] = i; });
  var FLAECHEN = D.gebiete.features.slice().sort(function (a, b) { return RANG[a.properties.klasse] - RANG[b.properties.klasse]; });
  function finde(lon, lat) {
    for (var i = 0; i < FLAECHEN.length; i++) if (inGeometrie(lon, lat, FLAECHEN[i].geometry)) return FLAECHEN[i].properties;
    return null;
  }

  /* ---------------- Adressen (wie auf „Deine 15 Minuten“) ---------------- */
  function norm(s) {
    return s.toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/str\.?(?=\s|$)/g, "strasse").replace(/[^a-z0-9]+/g, " ").trim();
  }
  var STRASSEN = !ADR ? [] : ADR.strassen.map(function (s) {
    var nummern = s[1].split("|"), lat = [], lon = [], a = 0, b = 0;
    for (var i = 0; i < nummern.length; i++) { a += s[2][i]; b += s[3][i]; lat.push(a / 1e5); lon.push(b / 1e5); }
    return { name: s[0], schl: norm(s[0]), nummern: nummern, nkey: nummern.map(function (x) { return norm(x).replace(/ /g, ""); }), lat: lat, lon: lon };
  });
  function vorschlaege(eingabe) {
    var m = eingabe.trim().match(/^(.*?)[\s,]*(\d+\s*[a-zA-Z]?(?:\s*-\s*\d+)?)?$/);
    var strasse = norm(m ? m[1] : eingabe), nr = m && m[2] ? norm(m[2]).replace(/ /g, "") : "";
    if (strasse.length < 3) return [];
    return STRASSEN.filter(function (s) { return s.schl.indexOf(strasse) !== -1; })
      .sort(function (a, b) { return ((b.schl.indexOf(strasse) === 0) - (a.schl.indexOf(strasse) === 0)) || a.name.localeCompare(b.name, "de"); })
      .slice(0, 8).map(function (s) {
        var i = nr ? s.nkey.indexOf(nr) : -1, genau = i >= 0;
        if (nr && i < 0) {   // nächstliegende Hausnummer
          var z = parseInt(nr, 10);
          i = s.nummern.reduce(function (best, x, k) { return Math.abs(parseInt(x, 10) - z) < Math.abs(parseInt(s.nummern[best], 10) - z) ? k : best; }, 0);
        }
        if (i < 0) i = Math.floor(s.nummern.length / 2);
        return { text: s.name + (nr ? " " + s.nummern[i] : ""), strasse: s, i: i, lat: s.lat[i], lon: s.lon[i], mitNummer: !!nr, genau: genau };
      });
  }
  // Liegt eine Straße in mehreren Klassen, sagt die Antwort das dazu
  function klassenDerStrasse(s) {
    var z = {};
    for (var i = 0; i < s.nummern.length; i++) { var f = finde(s.lon[i], s.lat[i]); var k = f ? f.klasse : "ohne"; z[k] = (z[k] || 0) + 1; }
    return z;
  }
  // Bezirk der Adresse selbst; die Fläche kann über mehrere Bezirke reichen
  function bezirkVon(lon, lat) {
    var f = (window.BEZIRKE ? window.BEZIRKE.features : []).filter(function (b) { return inGeometrie(lon, lat, b.geometry); })[0];
    return f ? { nr: f.properties.beznr, name: f.properties.bezname } : null;
  }

  var gewaehlt = null;   // { text, lat, lon, ... } der letzten Auswahl
  function zeigeAntwort() {
    var box = document.getElementById("antwort");
    if (!gewaehlt) { box.hidden = true; return; }
    var f = finde(gewaehlt.lon, gewaehlt.lat), k = f ? f.klasse : "ohne", K = KLASSE[k], i = leicht ? 1 : 0;
    var bez = bezirkVon(gewaehlt.lon, gewaehlt.lat);
    var html = "<p class=\"wo\">" + esc(gewaehlt.text) + (bez ? " · " + t("Bezirk ", "Bezirk ") + esc(bez.name) : "") + "</p>" +
      "<span class=\"marke\">" + t(K.n, K.l) + "</span>" +
      "<h3>" + K.kurz[i] + "</h3><p>" + K.heisst[i] + "</p>";
    if (f && (f.name || f.hinweis) && !leicht) {
      html += "<p class=\"zusatz\">" + (f.name ? "Im Plan heißt die Fläche „" + esc(f.name) + "“." : "") +
        (f.hinweis ? (f.name ? " " : "") + "Anmerkung der Stadt dazu: " + esc(f.hinweis) : "") + "</p>";
    }
    if (!gewaehlt.mitNummer) {
      var z = klassenDerStrasse(gewaehlt.strasse), arten = Object.keys(z);
      html += "<p class=\"klein\">" + (arten.length > 1
        ? t("Ohne Hausnummer gilt die Antwort für die Mitte der Straße. Die Straße liegt in mehreren Gebieten: ", "Die Straße liegt in mehreren Gebieten. Bitte geben Sie auch die Haus-Nummer ein: ") +
          arten.map(function (a) { return t(KLASSE[a].n, KLASSE[a].l) + " (" + z[a] + ")"; }).join(", ") + "."
        : t("Alle " + gewaehlt.strasse.nummern.length + " Hausnummern dieser Straße liegen im selben Gebiet.", "Das gilt für die ganze Straße.")) + "</p>";
    } else if (!gewaehlt.genau) {
      html += "<p class=\"klein\">" + t("Diese Hausnummer kennen die Daten nicht; die Antwort gilt für die nächstliegende.", "Diese Haus-Nummer kennen wir nicht. Die Antwort ist für ein Haus in der Nähe.") + "</p>";
    }
    if (K.wege[i].length) {
      html += "<h4>" + t("Diese Wege nennt der Plan für hier", "Das geht hier") + "</h4><ul>" +
        K.wege[i].map(function (w) { return "<li>" + w + "</li>"; }).join("") + "</ul>";
    }
    html += "<h4>" + t("Was das für Sie heißt", "Das heißt für Sie") + "</h4><ul>" +
      "<li>" + t("Sie müssen wegen des Plans nichts tun. Er verpflichtet niemanden und gibt niemandem einen Anspruch.", "Sie müssen jetzt nichts tun. Der Plan ist keine Vorschrift.") + "</li>" +
      (k === "netz" || k === "netz_spaeter"
        ? "<li>" + t("Vor einer neuen Heizung lohnt die Frage an die Stadtwerke, ob und wann ein Anschluss möglich ist: " + lnk(STADTWERKE, "Fragen und Antworten der Stadtwerke") + ".",
            "Brauchen Sie eine neue Heizung? Fragen Sie vorher die " + lnk(STADTWERKE, "Stadt-Werke") + ".") + "</li>"
        : "<li>" + t("Vor einer neuen Heizung lohnt eine unabhängige Energieberatung. Sie rechnet für Ihr Haus durch, was passt und was gefördert wird.",
            "Brauchen Sie eine neue Heizung? Dann lassen Sie sich beraten.") + "</li>") +
      "<li>" + t("Wohnen Sie zur Miete, entscheidet die Vermieterin oder der Vermieter über die Heizung. Fragen Sie nach, was geplant ist.", "Wohnen Sie zur Miete? Dann entscheidet Ihr Vermieter über die Heizung.") + "</li>" +
      "</ul><button class=\"knopf\" type=\"button\" id=\"zur-karte\">" + t("Auf der Karte ansehen", "Auf der Karte zeigen") + "</button>";
    box.style.setProperty("--k", "var(--k-" + k + ")");
    box.innerHTML = html; box.hidden = false;
    document.getElementById("zur-karte").addEventListener("click", function () {
      window.WAERME_ORT = { lon: gewaehlt.lon, lat: gewaehlt.lat, text: gewaehlt.text };
      var knopf = document.getElementById("btn-grafisch");
      if (knopf && knopf.getAttribute("aria-pressed") !== "true") knopf.click();
      document.dispatchEvent(new CustomEvent("waerme-ort"));
    });
    // In der Bezirksgrafik den Bezirk der Adresse hervorheben
    document.querySelectorAll(".st-zeile").forEach(function (z) { z.classList.toggle("gewaehlt", !!bez && z.getAttribute("data-nr") === bez.nr); });
  }

  var feld = document.getElementById("adresse"), liste = document.getElementById("vorschlaege"), aktuell = [];
  function waehle(v) {
    feld.value = v.text; liste.innerHTML = ""; liste.hidden = true;
    gewaehlt = v; zeigeAntwort();
  }
  feld.addEventListener("input", function () {
    aktuell = vorschlaege(feld.value);
    liste.innerHTML = "";
    aktuell.forEach(function (v) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = v.text;
      b.addEventListener("click", function () { waehle(v); });
      li.appendChild(b); liste.appendChild(li);
    });
    liste.hidden = aktuell.length === 0;
  });
  feld.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && aktuell.length) { e.preventDefault(); waehle(aktuell[0]); }
    if (e.key === "Escape") liste.hidden = true;
  });

  // Die grafische Fassung nutzt dieselbe Suche und dieselben Texte
  window.WAERME_HILFE = { finde: finde, vorschlaege: vorschlaege, bezirkVon: bezirkVon, KLASSE: KLASSE };

  /* ---------------- Zahlen ---------------- */
  var A = D.adressen, J = A.je_klasse;
  var netzAnteil = (J.netz + J.netz_spaeter) / A.gesamt * 100;
  var gasAnteil = J.gas_wp / A.gesamt * 100;
  var gas = B.energietraeger_prozent[0], oel = B.energietraeger_prozent[1];

  function kacheln() {
    var k = document.getElementById("kennzahlen");
    k.textContent = "";
    [[zahl(gas.wert, 1) + " %", t("der Heizenergie kommen heute aus Erdgas", "der Wärme kommt heute aus Erd-Gas"), t("dazu " + zahl(oel.wert, 1) + " % aus Heizöl", "und " + zahl(oel.wert, 0) + " % aus Heiz-Öl")],
     [zahl(netzAnteil, 0) + " %", t("der Adressen liegen in einem Wärmenetz-Gebiet", "der Häuser liegen in einem Gebiet für Fern-Wärme"), t("eigene Zählung; die Stadt nennt etwa 13 % der Gebäude", "so haben wir es gezählt")],
     [zahl(gasAnteil, 0) + " %", t("liegen in einem Gas/Wärmepumpen-Prüfgebiet", "liegen in einem Gebiet mit Gas-Leitung"), t("hier ist offen, was aus dem Gasnetz wird", "dort ist noch vieles offen")],
     [datumDE(D.beschluss.datum), t("hat der Stadtrat den Plan beschlossen", "hat der Stadt-Rat Ja gesagt"), t("gegen vier Stimmen", "4 Stadt-Räte waren dagegen")]
    ].forEach(function (z) {
      var d = document.createElement("div"); d.className = "kachel";
      d.innerHTML = "<p class=\"kachel-label\">" + z[1] + "</p><p class=\"kachel-wert\">" + z[0] + "</p><p class=\"kachel-unter\">" + z[2] + "</p>";
      k.appendChild(d);
    });
  }

  function baueGebiete() {
    document.getElementById("gebiete-liste").innerHTML = ["netz", "netz_spaeter", "gas_wp", "einzel"].map(function (k) {
      var K = KLASSE[k], n = D.gebiete.features.filter(function (f) { return f.properties.klasse === k; }).length;
      return "<div class=\"gebiet\" style=\"--k:var(--k-" + k + ")\"><h3>" + t(K.n, K.l) + "</h3>" +
        "<p class=\"anteil\">" + prozent(J[k], A.gesamt) + " <small>" + t("der Adressen · " + n + " Flächen", "der Häuser") + "</small></p>" +
        "<p>" + K.heisst[leicht ? 1 : 0] + "</p></div>";
    }).join("");
  }

  var NICHT = [
    ["Er ist keine Vorschrift.", "Nach § 23 Absatz 4 des Wärmeplanungsgesetzes hat ein Wärmeplan keine rechtliche Außenwirkung. Er begründet keine einklagbaren Rechte oder Pflichten. Die Gebiete sind laut Bericht „als Orientierung und nicht als verpflichtende Anweisungen zu verstehen“.",
      "Der Plan ist keine Vorschrift.", "Niemand muss wegen dem Plan seine Heizung ändern."],
    ["Er ist keine Zusage für einen Anschluss.", "Ein Wärmenetz-Gebiet heißt: grundsätzlich geeignet. Der Bericht verlangt für jedes Gebiet weitere Untersuchungen zu Wirtschaftlichkeit und Machbarkeit; Ausbaupläne sollen danach folgen. Im Zielbild rechnet der Plan selbst damit, dass 70 Prozent der Gebäude in diesen Gebieten angeschlossen werden, nicht alle.",
      "Der Plan ist kein Versprechen.", "Auch in einem Gebiet für Fern-Wärme bekommt nicht jedes Haus Fern-Wärme."],
    ["Er nennt keinen Termin.", "Wann wo gebaut wird, steht nicht im Plan. Für die Netze sollen zuerst Transformationspläne und Machbarkeitsstudien entstehen.",
      "Der Plan nennt kein Datum.", "Niemand weiß, wann die Fern-Wärme kommt."],
    ["Er zwingt niemanden an die Fernwärme.", "Einen Anschluss- und Benutzungszwang gibt es durch den Plan nicht. Der Stadtrat könnte ihn nur mit einem eigenen Beschluss für ein förmlich ausgewiesenes Gebiet einführen; der Plan schlägt lediglich vor, eine solche Ausweisung zu prüfen (Maßnahme 5). Auch eine Ausweisung allein verpflichtet nach § 27 des Wärmeplanungsgesetzes niemanden, eine bestimmte Wärmeversorgung zu nutzen.",
      "Niemand muss Fern-Wärme nehmen.", "Dafür müsste der Stadt-Rat extra einen Beschluss machen."]
  ];
  function baueNicht() {
    document.getElementById("nicht-liste").innerHTML = NICHT.concat(GEG).map(function (g) {
      return "<li><strong>" + t(g[0], g[2]) + "</strong>" + t(g[1], g[3]) + "</li>";
    }).join("");
  }
  /* Rechtsstand am Gesetzestext geprüft am 14.11.2026 (gesetze-im-internet.de: § 71 GModG weggefallen, § 43 GModG, § 23 und § 27 WPG).
     Ändert sich das Gesetz, diesen Eintrag und das Datum anpassen. */
  var GESETZ = "https://www.gesetze-im-internet.de/geg/__43.html";
  var GEG = [
    ["Er löst keine Pflicht beim Heizungstausch aus.", "Der Bericht von 2024 und die Seiten von Stadt und Stadtwerken beschreiben noch die 65-Prozent-Regel des Gebäudeenergiegesetzes, die in Großstädten ab Juli 2026 greifen sollte. Diese Regel gibt es nicht mehr: Seit dem 29. Juli 2026 heißt das Gesetz Gebäudemodernisierungsgesetz, der frühere § 71 ist weggefallen. Wer seither eine Gas- oder Ölheizung in ein bestehendes Haus einbaut, muss ab 2029 einen steigenden Anteil klimafreundlicher Brennstoffe nutzen: mindestens 10 Prozent ab 2029, 15 ab 2030, 30 ab 2035 und 60 ab 2040 (" + lnk(GESETZ, "§ 43 GModG") + "). Das gilt in ganz Deutschland gleich, egal in welchem Gebiet des Wärmeplans das Haus steht. Stand: 14.11.2026, keine Rechtsberatung.",
      "Für neue Heizungen gilt ein Gesetz für ganz Deutschland.", "Das Gesetz ist seit Juli 2026 neu. Es hat nichts mit dem Gebiet im Plan zu tun. Der Plan von 2024 beschreibt noch das alte Gesetz."]
  ];

  function baueBezirke() {
    var klassen = ["netz", "netz_spaeter", "gas_wp", "einzel", "ohne"];
    document.getElementById("bezirke-legende").innerHTML = klassen.map(function (k) {
      return "<span><i style=\"background:var(--k-" + k + ")\"></i>" + t(KLASSE[k].n, KLASSE[k].l) + "</span>";
    }).join("");
    document.getElementById("bezirke-stapel").innerHTML = D.bezirke.map(function (b) {
      var z = b.je_klasse, teile = [];
      if (z.netz) teile.push(t("Wärmenetz ", "Fern-Wärme ") + prozent(z.netz, b.adressen));
      if (z.netz_spaeter) teile.push(t("geringe Priorität ", "später ") + prozent(z.netz_spaeter, b.adressen));
      if (z.gas_wp) teile.push(t("Gas/Wärmepumpe ", "Gas-Leitung ") + prozent(z.gas_wp, b.adressen));
      if (z.einzel) teile.push(t("individuell ", "eigene Heizung ") + prozent(z.einzel, b.adressen));
      return "<div class=\"st-zeile\" data-nr=\"" + b.nr + "\"><span class=\"st-name\">" + esc(b.name) + "</span>" +
        "<span class=\"st-balken\" role=\"img\" aria-label=\"" + esc(b.name + ": " + teile.join(", ")) + "\">" +
        klassen.map(function (k) { return z[k] ? "<i style=\"--k:var(--k-" + k + ");width:" + (z[k] / b.adressen * 100).toFixed(2) + "%\"></i>" : ""; }).join("") +
        "</span><span class=\"st-text\">" + teile.join(" · ") + t(" · " + zahl(b.adressen) + " Adressen", "") + "</span></div>";
    }).join("");
  }

  function balken(id, reihen, max) {
    document.getElementById(id).innerHTML = reihen.map(function (r) {
      return "<div class=\"b-zeile\"><span class=\"b-label\">" + esc(t(r.name, r.name_l || r.name)) + "</span><span class=\"b-spuren\"><span class=\"b-spur\">" +
        "<span class=\"b-balken " + (r.fossil ? "fossil" : "ingolstadt") + "\" style=\"width:calc(" + (r.wert / max * 100).toFixed(1) + "% * var(--skala))\"></span>" +
        "<span class=\"b-zahl\">" + zahl(r.wert, 1) + " %" + (r.gebaeude && !leicht ? " <small>" + zahl(r.gebaeude) + " Gebäude</small>" : "") + "</span></span></span></div>";
    }).join("");
  }

  function baueRat() {
    document.getElementById("rat-liste").innerHTML = D.rat.slice().reverse().map(function (r) {
      var txt = t(r.text, r.text_l || "");
      return "<li><time datetime=\"" + r.datum + "\">" + datumDE(r.datum) + "</time> <span class=\"wer\">· " + esc(r.gremium) +
        (r.stand ? " · " + esc(r.stand) : "") + "</span><strong>" + esc(t(r.titel, r.titel_l)) + "</strong>" + (txt ? esc(txt) + " " : "") +
        "<span class=\"wer\">" + lnk(r.url, t(r.vorlage ? "Vorlage " + esc(r.vorlage) : "Sitzung im Ratsinfoportal", "Papier bei der Stadt")) +
        (r.niederschrift_url && !leicht ? " · " + lnk(r.niederschrift_url, "Niederschrift") : "") + "</span></li>";
    }).join("");
  }

  var GRENZEN = [
    ["Wie viel Wärme Ihr Haus braucht.", "Der Plan hat für jedes Gebäude Wärmebedarf, Baualter und Heizung erfasst. Veröffentlicht sind diese Daten nicht, im Bericht stehen sie nur als Kartenbilder je Baublock. Diese Seite kennt deshalb nur das Gebiet, nicht das Haus.",
      "Wie viel Wärme Ihr Haus braucht.", "Das steht nicht in den Daten von der Stadt."],
    ["Ob und wann die Fernwärme in Ihre Straße kommt.", "Das entscheiden die Stadtwerke mit ihren Ausbauplänen. Der Plan zeigt nur, wo ein Netz grundsätzlich in Frage kommt.",
      "Wann die Fern-Wärme kommt.", "Das wissen nur die Stadt-Werke."],
    ["Die genaue Grenze am Grundstück.", "Die Flächen sind mit dem Mittelpunkt des Gebäudes aus OpenStreetMap verglichen. Liegt ein Haus an der Grenze zweier Gebiete, kann die Zuordnung falsch sein. Maßgeblich ist die Karte der Stadt.",
      "Die genaue Grenze.", "Liegt Ihr Haus am Rand von einem Gebiet? Dann kann die Antwort falsch sein."],
    ["Wie viele Gebäude es genau sind.", "Die Anteile je Bezirk zählen Hausnummern aus OpenStreetMap, nicht Gebäude aus dem Kataster. Ein Wohnblock mit vier Eingängen zählt hier vierfach, eine Halle ohne Hausnummer gar nicht. Der Bericht selbst zählt " + zahl(B.gebaeude.wert) + " Gebäude und nennt keine Zahlen je Bezirk.",
      "Wie viele Häuser es genau sind.", "Wir haben Haus-Nummern gezählt. Das ist nicht ganz genau."],
    ["Ob der Plan noch aktuell ist.", "Der Bericht ist vom " + datumDE(B.datum) + ", die Flächen der Stadt vom November 2024. Ein Wärmeplan muss regelmäßig fortgeschrieben werden; ändert die Stadt die Flächen, zieht diese Seite erst beim nächsten Abruf nach.",
      "Ob der Plan noch stimmt.", "Der Plan ist von 2024. Die Stadt kann ihn ändern."]
  ];
  function baueGrenzen() {
    document.getElementById("grenzen-liste").innerHTML = GRENZEN.map(function (g) {
      return "<li><strong>" + t(g[0], g[2]) + "</strong> <span>" + t(g[1], g[3]) + "</span></li>";
    }).join("");
  }
  function baueQuellen() {
    document.getElementById("quellen-block").innerHTML = "<p><strong>" + t("Quellen", "Woher die Angaben kommen") + "</strong></p><ul>" +
      "<li>" + lnk(D.quelle.seite, t("Karte der Eignungsgebiete auf 2035.de", "Karte von der Stadt")) +
      t(" (" + esc(D.quelle.herausgeber) + "): Umrisse, Namen und Anmerkungen der 141 Flächen, abgerufen am " + datumDE(D.quelle.abgerufen_am) + ". Die Datei trägt keine Lizenzangabe; die Umrisse sind bis auf das Runden der Koordinaten unverändert.", "") + "</li>" +
      "<li>" + lnk(B.url, t("Energienutzungsplan Ingolstadt, Abschlussbericht (PDF, 139 Seiten)", "Der Wärme-Plan (PDF)")) +
      t(", " + esc(B.verfasser) + ", " + datumDE(B.datum) + ": alle Zahlen zu Wärmebedarf, Energieträgern und Zielbild, aus dem Fließtext der Seiten " +
        [B.gebaeude.s, B.waermebedarf_gwh.s, B.energietraeger_s, B.fernwaerme_abwaerme_prozent.s, B.ziel_anschlussquote_prozent.s + "–" + B.sanierungsrate_bund_prozent.s].join(", ") + ".", "") + "</li>" +
      "<li>" + lnk("https://www.ingolstadt.de/sessionnet/", t("Ratsinfoportal der Stadt Ingolstadt", "Papiere vom Stadt-Rat")) +
      t(": Vorlagen und Niederschriften, Stand " + datumDE(D.stand_ratsdaten) + ".", "") + "</li>" +
      "<li>" + lnk("https://www.openstreetmap.org/copyright", t("OpenStreetMap-Mitwirkende", "OpenStreetMap")) +
      t(" (ODbL 1.0): Hausadressen für die Suche und die Zählung je Bezirk. Stadtbezirke: Stadt Ingolstadt (CC BY 3.0 DE).", "") + "</li>" +
      "<li>" + t("Zusammengeführt von scraper/waerme_bauen.py am " + datumDE(D.erzeugt_am) + ". Ihre Eingabe bleibt in Ihrem Browser und wird nicht übertragen.", "Ihre Adresse bleibt auf Ihrem Gerät.") + "</li></ul>";
  }

  /* ---------------- Texte ---------------- */
  var TEXTE = {
    "hinweis": {
      n: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Die Flächen stammen von der Stadt, die Auswertung ist unsere eigene. Verbindlich sind allein der Wärmeplan der Stadt und die Auskunft der Stadtwerke. Dies ist ein Prototyp und keine Energie- oder Rechtsberatung.",
      l: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Die Angaben kommen aus dem Wärme-Plan von der Stadt. Es gilt nur, was die Stadt selbst schreibt. Die Seite ist noch ein Test."
    },
    "h1": { n: "Wärmeplan", l: "Der Wärme-Plan" },
    "lede": {
      n: "Wie heizt Ingolstadt, wenn Öl und Erdgas auslaufen? Der Wärmeplan der Stadt teilt das Stadtgebiet in Gebiete für Fernwärme und Gebiete, in denen jedes Haus für sich heizt. Hier sehen Sie, was für Ihre Adresse drinsteht und was daraus folgt.",
      l: "Viele Häuser heizen mit Öl oder Gas. Das soll sich ändern. Die Stadt hat dafür einen Plan gemacht. Hier sehen Sie: Was steht im Plan für Ihr Haus?"
    },
    "sprung-adresse": { n: "Meine Adresse", l: "Meine Adresse" },
    "sprung-gebiete": { n: "Die vier Gebiete", l: "Die 4 Gebiete" },
    "sprung-bezirke": { n: "Je Bezirk", l: "Mein Bezirk" },
    "sprung-zahlen": { n: "Heute und 2035", l: "Heute und 2035" },
    "sprung-seither": { n: "Seit dem Beschluss", l: "Was seitdem passiert ist" },
    "sprung-grenzen": { n: "Was die Seite nicht weiß", l: "Das wissen wir nicht" },
    "blick-h2": { n: "Auf einen Blick", l: "Das Wichtigste" },
    "stichtag": {
      n: "Bericht vom " + datumDE(B.datum) + ", Flächen der Stadt abgerufen am " + datumDE(D.quelle.abgerufen_am) + ". Anteile: eigene Zählung von " + zahl(A.gesamt) + " Hausnummern.",
      l: "Der Plan ist von 2024."
    },
    "adresse-h2": { n: "Was gilt für meine Adresse?", l: "Was steht im Plan für mein Haus?" },
    "adresse-p": {
      n: "Geben Sie Straße und Hausnummer ein. Die Antwort sagt, in welchem Gebiet des Wärmeplans das Haus liegt und was der Plan dort vorsieht.",
      l: "Schreiben Sie Ihre Straße und Ihre Haus-Nummer in das Feld."
    },
    "adresse-label": { n: "Straße und Hausnummer", l: "Ihre Adresse" },
    "adresse-klein": {
      n: "Nichts verlässt Ihr Gerät: Die Suche läuft in Ihrem Browser.",
      l: "Ihre Adresse bleibt auf Ihrem Gerät."
    },
    "gebiete-h2": { n: "Die vier Gebiete des Plans", l: "Die 4 Gebiete im Plan" },
    "gebiete-p": {
      n: "Der Plan ordnet jede bebaute Fläche einer von vier Klassen zu. Die Texte geben wieder, was Stadt und Bericht dazu schreiben.",
      l: "Im Plan gibt es 4 Arten von Gebieten."
    },
    "nicht-h3": { n: "Was der Plan nicht ist", l: "Das ist der Plan nicht" },
    "bezirke-h2": { n: "Was heißt das für meinen Bezirk?", l: "Wie ist es in meinem Bezirk?" },
    "bezirke-p": {
      n: "Die Fernwärme-Gebiete liegen dort, wo das Netz der Stadtwerke heute schon ist: vor allem in der Mitte und im Norden, südlich der Donau nur in Teilen von Südost und an der Münchener Straße. In fünf der zwölf Stadtbezirke liegt keine oder fast keine Adresse in einem Wärmenetz-Gebiet. Diese Auswertung gibt es weder im Bericht noch auf der Karte der Stadt.",
      l: "Fern-Wärme gibt es vor allem in der Mitte und im Norden von der Stadt. In vielen Bezirken ist keine Fern-Wärme geplant."
    },
    "bezirke-titel": { n: "Anteil der Adressen je Gebietsklasse, nach Stadtbezirk", l: "So viele Häuser liegen in welchem Gebiet" },
    "bezirke-fuss": {
      n: "Eigene Zählung: Hausnummern aus OpenStreetMap, der Fläche der Stadt zugeordnet. Grau: Adressen außerhalb aller Flächen.",
      l: "Das haben wir selbst gezählt."
    },
    "zahlen-h2": { n: "Heute und im Zielbild 2035", l: "Heute und im Jahr 2035" },
    "zahlen-p": {
      n: "Ingolstadt braucht laut Bericht rund " + zahl(B.waermebedarf_gwh.wert) + " Gigawattstunden Wärme im Jahr, knapp die Hälfte davon in Wohnungen. Mehr als " + B.anteil_vor_1979_prozent.wert + " Prozent der " + zahl(B.gebaeude.wert) + " Gebäude wurden vor 1979 gebaut, also vor der ersten Wärmeschutzverordnung.",
      l: "In Ingolstadt gibt es etwa " + zahl(B.gebaeude.wert) + " Gebäude. Die meisten sind alt. Sie brauchen viel Wärme."
    },
    "heute-titel": { n: "Womit Ingolstadt heute heizt (Anteil an der Endenergie)", l: "Damit heizt Ingolstadt heute" },
    "heute-fuss": {
      n: "Ocker: fossil. Die Fernwärme stammt zu über " + B.fernwaerme_abwaerme_prozent.wert + " Prozent aus Abwärme der Raffinerie und der Müllverwertung. Bericht S. " + B.energietraeger_s + " und " + B.fernwaerme_abwaerme_prozent.s + ", einschließlich Audi.",
      l: "Braun heißt: Das schadet dem Klima."
    },
    "ziel-titel": { n: "Womit die Gebäude 2035 heizen sollen (Anteil der Gebäude)", l: "Damit sollen die Häuser im Jahr 2035 heizen" },
    "ziel-fuss": {
      n: "Ein Rechenmodell, keine Vorhersage. Die Balken zählen Gebäude, die Grafik darüber zählt Energie; sie lassen sich nicht direkt vergleichen. Bericht S. " + B.ziel_s + "–" + (B.ziel_s + 1) + ".",
      l: "Das ist ein Ziel. Ob es so kommt, weiß niemand."
    },
    "zahlen-p2": {
      n: "Das Zielbild ist nach den Worten des Berichts ein „Extremfall“: Es nimmt an, dass jedes Jahr " + B.sanierungsrate_angenommen_prozent.wert + " Prozent der Gebäude saniert werden (bundesweit sind es derzeit " + zahl(B.sanierungsrate_bund_prozent.wert, 1) + " Prozent), dass in den Wärmenetz-Gebieten " + B.ziel_anschlussquote_prozent.wert + " Prozent der Gebäude ans Netz gehen (heute " + B.fernwaerme_anschlussquote.von + " bis " + B.fernwaerme_anschlussquote.bis + " Prozent) und dass alle übrigen auf Wärmepumpe oder Biomasse umstellen. Selbst dann sinken die Treibhausgase der Wärmeversorgung bis 2035 um etwa " + B.thg_minderung_2035_prozent.wert + " Prozent, nicht um 100. Der Bericht schlägt " + B.massnahmen.wert + " Maßnahmen vor.",
      l: "Der Plan sagt selbst: Das Ziel ist sehr schwer zu schaffen. Dafür müssen sehr viele Häuser umgebaut werden."
    },
    "seither-h2": { n: "Seit dem Beschluss", l: "Was seitdem passiert ist" },
    "seither-p": {
      n: "Ein Plan ist nur so viel wert wie das, was ihm folgt. Hier steht, was der Stadtrat seit Oktober 2024 zur Wärmeversorgung beraten und beschlossen hat. Das Neueste steht oben.",
      l: "Das hat der Stadt-Rat seitdem zum Heizen besprochen."
    },
    "seither-klein": {
      n: "Ausgewählt von Hand aus den Ratsdaten. Ein Gebiet zum Neu- oder Ausbau von Wärmenetzen nach § 26 Wärmeplanungsgesetz hat der Stadtrat in den ausgewerteten Sitzungen nicht ausgewiesen. Was die Stadtwerke in ihren eigenen Gremien entscheiden, steht nicht im Ratsinfoportal.",
      l: ""
    },
    "grenzen-h2": { n: "Was diese Seite nicht weiß", l: "Das wissen wir nicht" }
  };

  function texteAnwenden() {
    Object.keys(TEXTE).forEach(function (id) {
      var e = document.getElementById("txt-" + id);
      if (e) e.innerHTML = TEXTE[id][leicht ? "l" : "n"];
    });
    feld.placeholder = t("z. B. Theresienstraße 22", "zum Beispiel: Theresienstraße 22");
    kacheln(); baueGebiete(); baueNicht(); baueBezirke();
    balken("heute-balken", B.energietraeger_prozent, 71);
    balken("ziel-balken", B.ziel_2035_prozent, 71);
    baueRat(); baueGrenzen(); baueQuellen(); zeigeAntwort();
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
