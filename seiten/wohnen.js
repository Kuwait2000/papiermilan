/* Skript der Seite wohnen.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  "use strict";
  var D = window.WOHNEN_DATEN;
  if (!D) {
    document.querySelectorAll(".ladehinweis").forEach(function (el) {
      el.textContent = "Die Wohndaten konnten nicht geladen werden.";
    });
    return;
  }
  var Z = D.zensus;
  var N22 = Z.nutzung[2022], N11 = Z.nutzung[2011];
  var H22 = Z.haushalte[2022], H11 = Z.haushalte[2011];
  var IN = Z.vergleich.filter(function (v) { return v.stadt === "Ingolstadt"; })[0];

  /* ---------------- Formatierung ---------------- */
  function zahl(n, stellen) {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: stellen || 0, maximumFractionDigits: stellen || 0,
    }).format(n);
  }
  function pz(n) { return zahl(n, 1) + "\u00a0%"; }
  function euro(n) { return zahl(n, 2) + "\u00a0€"; }
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
  function rund100(n) { return Math.round(n / 100) * 100; }

  /* ---------------- Einfache Sprache ---------------- */
  var LS_KEY_LEICHT = "papierpanther-leichte-sprache";
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === "1"; } catch (err) { /* Storage kann gesperrt sein */ }
  function t(normal, leichtText) { return leicht ? leichtText : normal; }
  function nl(o) { return o ? (leicht ? o.l : o.n) : ""; }

  /* Abgeleitete Zahlen fuer die Texte: alles aus data/wohnen.js, nichts von Hand. */
  var mieteAnteil = 100 - IN.haushalte_eigentum;
  var eigentumAnteil11 = Math.round(H11.eigentum / H11.gesamt * 1000) / 10;
  var mehrHaushalte = H22.gesamt - H11.gesamt;
  var mehrMiete = H22.miete - H11.miete;
  var mehrEigentum = H22.eigentum - H11.eigentum;
  var leer11 = Math.round(N11.leer / N11.gesamt * 1000) / 10;
  var kommunal = Z.eigentum.filter(function (e) { return e.id === "kommunal"; })[0];
  var genossen = Z.eigentum.filter(function (e) { return e.id === "genossenschaft"; })[0];
  var weg = Z.eigentum.filter(function (e) { return e.id === "weg"; })[0];
  var andere = Z.vergleich.filter(function (v) { return v.stadt !== "Ingolstadt"; });
  var maxAndere = andere.reduce(function (m, v) { return v.haushalte_eigentum > m.haushalte_eigentum ? v : m; });
  var hoeherMarkt = andere.filter(function (v) { return v.leer_marktaktiv > IN.leer_marktaktiv; });

  var TEXTE = {
    "hinweis": {
      n: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Die Zahlen stammen aus dem Zensus 2022 der Statistischen Ämter des Bundes und der Länder. Dies ist ein Prototyp.",
      l: "<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> " +
        "Die Zahlen kommen aus einer großen Zählung vom Staat. Die Seite ist noch ein Test.",
    },
    "h1": { n: "Wohnen in Ingolstadt", l: "Wohnen in Ingolstadt" },
    "lede": {
      n: "Wer in Ingolstadt zur Miete wohnt und wer im Eigentum, wem die Wohnungen gehören und wie viele leer stehen. " +
        "Die Antworten stammen aus dem Zensus 2022, der bisher genauesten Zählung aller Wohnungen. " +
        "Was eine Wohnung kosten darf, steht auf der <a href=\"miete.html\">Mieteseite</a>.",
      l: "Wer wohnt zur Miete? Wem gehören die Wohnungen? Wie viele Wohnungen sind leer? " +
        "Das steht auf dieser Seite. Die Zahlen kommen aus einer großen Zählung von 2022. " +
        "Wie viel Miete normal ist, steht auf der <a href=\"miete.html\">Seite zur Miete</a>.",
    },
    "sprung-wohnform": { n: "Mieten oder besitzen?", l: "Miete oder Eigentum?" },
    "sprung-eigentum": { n: "Wem gehören die Wohnungen?", l: "Wem gehören die Wohnungen?" },
    "sprung-leerstand": { n: "Leerstand", l: "Leere Wohnungen" },
    "sprung-miete": { n: "Zur Mieteseite →", l: "Zur Seite über Miete →" },
    "blick-h2": { n: "Auf einen Blick", l: "Das Wichtigste" },
    "stichtag": {
      n: "Stand aller Zahlen: Zensus-Stichtag " + Z.stichtag + ". Neuere Zählungen dieser Art gibt es nicht.",
      l: "Die Zahlen sind vom " + Z.stichtag + ". Neuere Zahlen gibt es nicht.",
    },

    "wohnform-h2": { n: "Mieten oder besitzen?", l: "Wohnen zur Miete oder im Eigentum?" },
    "wohnform-p1": {
      n: "Rund 6 von 10 Haushalten in Ingolstadt wohnen zur Miete (" + zahl(H22.miete) + "), rund 4 von 10 in der eigenen Wohnung " +
        "oder im eigenen Haus (" + zahl(H22.eigentum) + "). " + (IN.haushalte_eigentum > maxAndere.haushalte_eigentum
          ? "Damit wohnen in Ingolstadt anteilig mehr Haushalte im Eigentum als in jeder anderen bayerischen Großstadt; am nächsten kommt " +
            maxAndere.stadt + " mit " + pz(maxAndere.haushalte_eigentum) + "."
          : "Unter den bayerischen Großstädten liegt " + maxAndere.stadt + " mit " + pz(maxAndere.haushalte_eigentum) + " vorn."),
      l: "In Ingolstadt wohnen ungefähr 6 von 10 Haushalten zur Miete. " +
        "4 von 10 Haushalten wohnen in einer eigenen Wohnung. Oder in einem eigenen Haus. " +
        (IN.haushalte_eigentum > maxAndere.haushalte_eigentum ? "Das sind mehr als in allen anderen großen Städten in Bayern." : ""),
    },
    "wohnform-p2": {
      n: "Der Anteil sinkt allerdings: 2011 wohnten noch " + pz(eigentumAnteil11) + " der Haushalte im Eigentum, 2022 " + pz(IN.haushalte_eigentum) + ". " +
        "In diesen elf Jahren kamen rund " + zahl(rund100(mehrHaushalte)) + " Haushalte dazu. Davon wohnen rund " + zahl(rund100(mehrMiete)) +
        " zur Miete und rund " + zahl(rund100(mehrEigentum)) + " im Eigentum. " +
        "Warum Ingolstadt mehr Eigentum hat als andere Großstädte, lässt sich aus den Zensus-Zahlen nicht ablesen.",
      l: "2011 hatten mehr Haushalte eine eigene Wohnung als heute. " +
        "Seit 2011 sind viele Haushalte dazu-gekommen. Die meisten davon wohnen zur Miete.",
    },
    "wohnform-weiter": {
      n: "Ein Haushalt sind alle Menschen, die zusammen in einer Wohnung leben. Wohnheime und Gemeinschaftsunterkünfte zählen hier nicht mit.",
      l: "Ein Haushalt: Das sind alle Menschen, die zusammen in einer Wohnung leben.",
    },

    "eigentum-h2": { n: "Wem gehören die Wohnungen?", l: "Wem gehören die Wohnungen?" },
    "eigentum-p1": {
      n: "Der größte Teil der " + zahl(N22.gesamt) + " Wohnungen gehört Privatleuten: entweder als ganzes Haus oder als Eigentumswohnung " +
        "in einem Haus, das sich mehrere Eigentümer teilen. Zusammen sind das fast vier von fünf Wohnungen. " +
        "Gut jede neunte Wohnung gehört der Stadt oder ihrer Wohnungsgesellschaft GWG. Genossenschaften spielen in Ingolstadt kaum eine Rolle: " +
        "Ihnen gehören " + zahl(genossen.wohnungen) + " Wohnungen, etwa jede hundertste.",
      l: "Die meisten Wohnungen gehören einzelnen Menschen. " +
        "Ungefähr jede 9. Wohnung gehört der Stadt. Oder der Wohnungs-Firma der Stadt. Sie heißt GWG. " +
        "Eine Genossenschaft ist ein Verein, dem die Häuser gehören. Die Mieter sind selbst Mitglied. " +
        "In Ingolstadt gibt es nur wenige solche Wohnungen.",
    },
    "miete-h3": { n: "Was die Wohnungen im Schnitt kosten", l: "Wie viel Miete die Menschen zahlen" },
    "miete-p": {
      n: "Der Zensus hat auch die Miete erfragt: im Durchschnitt aller laufenden Mietverträge " + euro(Z.gesamt.miete) + " je Quadratmeter, netto kalt. " +
        "Je nach Eigentümer liegen die Durchschnitte weit auseinander – von " + euro(genossen.miete) + " bei Genossenschaften bis " +
        euro(weg.miete) + " bei vermieteten Eigentumswohnungen. Woran das liegt – am Alter der Verträge, an geförderten Wohnungen, an Lage " +
        "oder Ausstattung –, zeigt der Zensus nicht.",
      l: "Die Menschen haben auch gesagt, wie viel Miete sie zahlen. " +
        "Im Durchschnitt sind es " + euro(Z.gesamt.miete) + " pro Quadrat-Meter. Gemeint ist die Kalt-Miete. " +
        "Bei Genossenschaften und bei der Stadt ist die Miete am niedrigsten.",
    },

    "leer-h2": { n: "Wie viele Wohnungen stehen leer?", l: "Wie viele Wohnungen sind leer?" },
    "leer-p1": {
      n: "Am Stichtag standen " + zahl(N22.leer) + " Wohnungen leer, " + pz(N22.leer / N22.gesamt * 100) + " aller Wohnungen. " +
        "2011 waren es " + zahl(N11.leer) + " (" + pz(leer11) + "). Als leer zählt jede Wohnung, in der am Stichtag niemand gewohnt hat – " +
        "egal warum: zwischen zwei Mietern, wegen einer Renovierung, weil sie verkauft werden soll oder weil sie dauerhaft nicht genutzt wird. " +
        "Ein Teil des Leerstands gehört also einfach dazu, damit Menschen umziehen können.",
      l: "Im Mai 2022 waren " + zahl(N22.leer) + " Wohnungen leer. Das ist ungefähr jede 25. Wohnung. " +
        "Eine Wohnung kann aus vielen Gründen leer sein. Zum Beispiel: Der alte Mieter ist weg, der neue noch nicht da. " +
        "Oder die Wohnung wird gerade renoviert.",
    },
    "leer-p2": {
      n: "Deshalb weist der Zensus eine zweite Zahl aus: den „marktaktiven“ Leerstand. Gemeint sind Wohnungen, die kurzfristig vermietet werden könnten, " +
        "also ohne die, die etwa wegen Sanierung oder Abriss leer stehen. Gezählt wird nur in Häusern mit drei oder mehr Wohnungen. " +
        "In Ingolstadt sind das " + pz(Z.gesamt.leer_marktaktiv) + " – " + (hoeherMarkt.length === 0
          ? "mehr als in jeder anderen bayerischen Großstadt."
          : "mehr als in den meisten bayerischen Großstädten; höher ist der Anteil nur in " +
            hoeherMarkt.map(function (v) { return v.stadt + " (" + pz(v.leer_marktaktiv) + ")"; }).join(" und ") + "."),
      l: "Manche leeren Wohnungen kann man sofort vermieten. Andere nicht, weil sie zum Beispiel kaputt sind. " +
        "Sofort vermieten kann man in Ingolstadt ungefähr 2 von 100 Wohnungen. " +
        (hoeherMarkt.length === 0 ? "Das ist mehr als in den anderen großen Städten." : "Das ist mehr als in den meisten anderen großen Städten."),
    },
    "leer-wer-h3": { n: "Bei welchen Eigentümern Wohnungen leer stehen", l: "Wem die leeren Wohnungen gehören" },
    "leer-wer-p": {
      n: "Am häufigsten leer stehen Wohnungen privatwirtschaftlicher Wohnungsunternehmen und kirchlicher oder gemeinnütziger Organisationen – " +
        "beides kleine Gruppen. In absoluten Zahlen gehören die meisten leeren Wohnungen Privatleuten und Eigentümergemeinschaften, weil ihnen " +
        "auch die meisten Wohnungen gehören. Bei der Stadt und der GWG steht etwa jede hundertste Wohnung leer.",
      l: "Die meisten leeren Wohnungen gehören einzelnen Menschen. Denn ihnen gehören auch die meisten Wohnungen. " +
        "Bei der Stadt und der GWG sind nur sehr wenige Wohnungen leer.",
    },
    "leer-nicht-h3": { n: "Was die Zahlen nicht sagen", l: "Was wir nicht wissen" },
    "leer-nicht-p": {
      n: "Wie lange die Wohnungen leer stehen und warum, geht aus den veröffentlichten Tabellen nicht hervor. Und die Zahlen sind von 2022: " +
        "Laut " + lnk(D.fortschreibung.url, "Verwaltung") + " ist die Zahl der Wohnungen seither von rund " + zahl(D.fortschreibung.wohnungen_2022) +
        " auf rund " + zahl(D.fortschreibung.wohnungen_2025) + " (2025) gestiegen; wie viele davon leer stehen, zählt niemand. " +
        "Ferienwohnungen spielen in Ingolstadt kaum eine Rolle: " + zahl(N22.ferien) + " Wohnungen werden privat als Ferien- oder Freizeitwohnung genutzt. " +
        "Ob die Stadt gegen Leerstand vorgehen darf, hat der Stadtentwicklungsausschuss im Juli 2026 beraten – " +
        "anlässlich eines Antrags auf eine Zweckentfremdungssatzung. Das erklärt ein späterer Abschnitt dieser Seite.",
      l: "Wir wissen nicht: Wie lange sind die Wohnungen schon leer? Und warum? " +
        "Die Zahlen sind von 2022. Neuere Zahlen zu leeren Wohnungen gibt es nicht. " +
        "Ferien-Wohnungen gibt es in Ingolstadt nur sehr wenige.",
    },

    "fehlt-h2": { n: "Was hier noch fehlt", l: "Was noch fehlt" },
    "fehlt-p": {
      n: "Diese Seite wächst. Als Nächstes kommt, was die Stadt beim Wohnen tun kann und was nicht, und was Wohnen mit dem städtischen Haushalt zu tun hat. " +
        "Für einige Fragen haben wir noch keine offenen Daten gefunden:",
      l: "Diese Seite ist noch nicht fertig. Für manche Fragen haben wir noch keine Zahlen:",
    },
  };

  /* Die "fehlt"-Eintraege aus data/wohnen.js haben nur eine normale Fassung. */
  var FEHLT_LEICHT = {
    "Aktuelle Leerstandszahlen": ["Neue Zahlen zu leeren Wohnungen", "Niemand zählt das regelmäßig."],
    "Dauer und Gründe des Leerstands": ["Warum Wohnungen leer sind", "Diese Zahlen haben wir nicht gefunden."],
    "Zahlen nach Stadtbezirken": ["Zahlen für Ihren Stadt-Teil", "Diese Zahlen haben wir noch nicht."],
    "Sozialwohnungen und auslaufende Bindungen": ["Sozial-Wohnungen", "Das haben wir noch nicht geprüft."],
  };

  /* ---------------- Bausteine ---------------- */
  function kacheln() {
    var box = document.getElementById("kennzahlen");
    box.innerHTML = "";
    [
      { label: t("Wohnungen", "Wohnungen"), wert: zahl(N22.gesamt),
        unter: t("in Wohngebäuden und anderen Gebäuden mit Wohnraum", "in ganz Ingolstadt") },
      { label: t("Haushalte zur Miete", "Haushalte wohnen zur Miete"), wert: pz(mieteAnteil),
        unter: t(zahl(H22.miete) + " Haushalte; " + zahl(H22.eigentum) + " wohnen im Eigentum", "ungefähr 6 von 10 Haushalten") },
      { label: t("Leer stehend", "Leere Wohnungen"), wert: pz(N22.leer / N22.gesamt * 100),
        unter: t(zahl(N22.leer) + " Wohnungen; kurzfristig vermietbar: " + pz(Z.gesamt.leer_marktaktiv), zahl(N22.leer) + " Wohnungen") },
      { label: t("Durchschnittliche Kaltmiete", "Miete im Durchschnitt"), wert: euro(Z.gesamt.miete) + "/m²",
        unter: t("über alle laufenden Mietverträge, netto kalt", "pro Quadrat-Meter, ohne Heizung und Wasser") },
    ].forEach(function (k) {
      var d = el("div", "kachel");
      d.appendChild(absatz("kachel-label", k.label));
      d.appendChild(absatz("kachel-wert", k.wert));
      d.appendChild(absatz("kachel-unter", k.unter));
      box.appendChild(d);
    });
  }

  /* zeilen: [{ label, betont, spuren: [{ wert, klasse, anzeige }] }]; max: Skalenende */
  function balken(container, titel, zeilen, max, legende, fuss) {
    container.innerHTML = "";
    container.appendChild(el("p", "diagramm-titel", titel));
    if (legende) {
      var lg = el("div", "legende");
      legende.forEach(function (e) {
        var s = document.createElement("span");
        var i = document.createElement("i");
        i.style.background = getComputedStyle(document.documentElement).getPropertyValue(e.farbe).trim();
        s.appendChild(i);
        s.appendChild(document.createTextNode(e.text));
        lg.appendChild(s);
      });
      container.appendChild(lg);
    }
    var liste = el("div", "balken");
    liste.setAttribute("role", "list");
    zeilen.forEach(function (z) {
      var zeile = el("div", "b-zeile" + (z.betont ? " betont" : ""));
      zeile.setAttribute("role", "listitem");
      zeile.appendChild(el("span", "b-label", z.label));
      var spuren = el("div", "b-spuren");
      z.spuren.forEach(function (s) {
        var spur = el("div", "b-spur");
        var b = el("span", "b-balken " + (s.klasse || ""));
        /* Der Balken teilt sich die Zeile mit der Zahl; --skala laesst ihr Platz. */
        b.style.width = "calc(var(--skala) * " + (s.wert / max * 100) + "%)";
        b.setAttribute("aria-hidden", "true");
        spur.appendChild(b);
        var zahlEl = el("span", "b-zahl");
        zahlEl.innerHTML = s.anzeige;
        spur.appendChild(zahlEl);
        spuren.appendChild(spur);
      });
      zeile.appendChild(spuren);
      liste.appendChild(zeile);
    });
    container.appendChild(liste);
    if (fuss) container.appendChild(absatz("diagramm-fuss", fuss));
  }

  function diagrammWohnform() {
    var zeilen = Z.vergleich.slice().sort(function (a, b) { return b.haushalte_eigentum - a.haushalte_eigentum; })
      .map(function (v) {
        var istIN = v.stadt === "Ingolstadt";
        return { label: v.stadt, betont: istIN,
          spuren: [{ wert: v.haushalte_eigentum, klasse: istIN ? "ingolstadt" : "", anzeige: pz(v.haushalte_eigentum) }] };
      });
    balken(document.getElementById("diagramm-wohnform"),
      t("Anteil der Haushalte, die in der eigenen Wohnung oder im eigenen Haus wohnen, 2022",
        "So viele Haushalte wohnen im Eigentum (2022)"),
      zeilen, 40, null,
      t("Die acht bayerischen Großstädte (über 100.000 Einwohner). Quelle: Zensus 2022, Tabelle 5000H-1017.",
        "Quelle: Zensus 2022."));
  }

  function diagrammEigentum() {
    var zeilen = Z.eigentum.slice().sort(function (a, b) { return b.wohnungen - a.wohnungen; }).map(function (e) {
      var anteil = e.wohnungen / N22.gesamt * 100;
      return { label: nl(e), spuren: [{ wert: anteil, klasse: "ingolstadt",
        anzeige: zahl(e.wohnungen) + " <small>(" + (anteil < 1 ? "unter 1 %" : zahl(anteil, 1) + " %") + ")</small>" }] };
    });
    balken(document.getElementById("diagramm-eigentum"),
      t("Wohnungen in Ingolstadt nach Eigentümer des Gebäudes, 2022", "Wem gehören die Wohnungen? (2022)"),
      zeilen, 45, null,
      t("Quelle: Zensus 2022, Tabelle 4000W-1011. Die Einzelwerte ergeben zusammen " + zahl(Z.eigentum.reduce(function (s, e) { return s + e.wohnungen; }, 0)) +
        " statt " + zahl(N22.gesamt) + " Wohnungen, weil der Zensus Einzelwerte zur Geheimhaltung minimal verändert. " +
        "Ein Vergleich mit 2011 ist hier nicht sinnvoll: Damals zählte der Zensus nur " + zahl(222) + " kommunale Wohnungen, " +
        "sehr wahrscheinlich, weil die GWG anders eingeordnet wurde.",
        "Quelle: Zensus 2022."));
  }

  function kastenGWG() {
    var g = D.gwg;
    var box = document.getElementById("kasten-gwg");
    box.innerHTML = "";
    box.appendChild(el("h3", "", t("Was ist die GWG?", "Was ist die GWG?")));
    box.appendChild(absatz("", t(
      "Die " + g.name + " ist die Wohnungsgesellschaft der Stadt; die Stadt hält die Mehrheit. Sie baut und vermietet Wohnungen, " +
      "die bezahlbar sein sollen. Im Zensus steht sie unter „Kommune oder kommunales Wohnungsunternehmen“ – " +
      "zusammen mit Wohnungen, die der Stadt direkt gehören: " + zahl(kommunal.wohnungen) + " Wohnungen, Durchschnittsmiete " + euro(kommunal.miete) + " je m².",
      "Die GWG ist eine Firma. Sie gehört zum größten Teil der Stadt. " +
      "Die GWG baut Wohnungen und vermietet sie. Die Miete soll nicht zu hoch sein.")));
    box.appendChild(absatz("", t(
      "Für " + g.jahr + " weist die GWG einen " + lnk(g.url_abschluss, "Jahresüberschuss von " + zahl(g.ueberschuss_mio, 2) + " Mio. €") +
      " aus. Er bleibt im Unternehmen und fließt nicht in den städtischen Haushalt. Eine zweite, ganz städtische Wohnungsgesellschaft hat die Verwaltung " +
      lnk(g.url_gesellschaft, "2025 nach Prüfung verworfen") + ".",
      "Die GWG hat " + g.jahr + " Gewinn gemacht: " + zahl(g.ueberschuss_mio, 2) + " Millionen Euro. Das Geld bleibt in der Firma.")));
  }

  function diagrammMiete() {
    var zeilen = Z.eigentum.filter(function (e) { return e.id !== "bund_land"; })
      .slice().sort(function (a, b) { return b.miete - a.miete; })
      .map(function (e) {
        return { label: nl(e), spuren: [{ wert: e.miete, klasse: "ingolstadt", anzeige: euro(e.miete) }] };
      });
    balken(document.getElementById("diagramm-miete"),
      t("Durchschnittliche Nettokaltmiete je m² nach Eigentümer, 2022", "Miete pro Quadrat-Meter (2022)"),
      zeilen, 12, null,
      t("Durchschnitt aller laufenden Mietverträge, ohne Nebenkosten. Wohnungen von Bund oder Land (" +
        zahl(Z.eigentum.filter(function (e) { return e.id === "bund_land"; })[0].wohnungen) +
        " Stück) sind zu wenige für einen aussagekräftigen Durchschnitt. Quelle: Zensus 2022, Tabelle 4000W-0006.",
        "Quelle: Zensus 2022."));
  }

  function diagrammLeer() {
    var zeilen = Z.vergleich.slice().sort(function (a, b) { return b.leer_marktaktiv - a.leer_marktaktiv; })
      .map(function (v) {
        return { label: v.stadt, betont: v.stadt === "Ingolstadt", spuren: [
          { wert: v.leer, klasse: "leer", anzeige: pz(v.leer) + " <small>" + t("leer", "leer") + "</small>" },
          { wert: v.leer_marktaktiv, klasse: "marktaktiv", anzeige: pz(v.leer_marktaktiv) + " <small>" + t("kurzfristig vermietbar", "sofort zu vermieten") + "</small>" },
        ] };
      });
    balken(document.getElementById("diagramm-leer"),
      t("Leerstand im Städtevergleich, 2022", "Leere Wohnungen in anderen Städten (2022)"),
      zeilen, Math.max.apply(null, Z.vergleich.map(function (v) { return v.leer; })),
      [{ farbe: "--leer", text: t("alle leeren Wohnungen", "alle leeren Wohnungen") },
       { farbe: "--marktaktiv", text: t("kurzfristig vermietbar, nur Häuser ab drei Wohnungen", "sofort zu vermieten") }],
      t("Sortiert nach kurzfristig vermietbarem Leerstand. Die beiden Werte beziehen sich auf verschiedene Grundmengen: " +
        "alle Wohnungen bzw. nur Wohnungen in Häusern ab drei Wohnungen. Quelle: Zensus 2022, Tabellen 4000W-1001 und 4000W-0026.",
        "Quelle: Zensus 2022."));
  }

  function diagrammLeerWer() {
    var bl = Z.eigentum.filter(function (e) { return e.id === "bund_land"; })[0];
    var zeilen = Z.eigentum.filter(function (e) { return e.id !== "bund_land"; })
      .slice().sort(function (a, b) { return b.leer_quote - a.leer_quote; })
      .map(function (e) {
        return { label: nl(e), spuren: [{ wert: e.leer_quote, klasse: "ingolstadt",
          anzeige: pz(e.leer_quote) + " <small>(" + zahl(e.leer) + " " + t("Wohnungen", "Wohnungen") + ")</small>" }] };
      });
    balken(document.getElementById("diagramm-leer-wer"),
      t("Anteil leerer Wohnungen nach Eigentümer, Ingolstadt 2022", "So viele Wohnungen sind leer (2022)"),
      zeilen, 10, null,
      t("Nicht im Diagramm: Bund oder Land, " + zahl(bl.leer) + " von " + zahl(bl.wohnungen) + " Wohnungen leer – zu wenige für einen Vergleich. " +
        "Quelle: Zensus 2022, Tabellen 4000W-0018 (Anteil) und 4000W-2002 (Anzahl).",
        "Quelle: Zensus 2022."));
  }

  function baueFehlt() {
    var ul = document.getElementById("fehlt-liste");
    ul.innerHTML = "";
    D.fehlt.forEach(function (f) {
      var li = document.createElement("li");
      var ls = FEHLT_LEICHT[f.n];
      li.appendChild(el("strong", "", (leicht && ls ? ls[0] : f.n) + ": "));
      li.appendChild(el("span", "", leicht && ls ? ls[1] : f.d));
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
      li.innerHTML = lnk(q.url, q.text);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(absatz("", t(
      "Stand der Angaben: " + datumDE(D.stand) + ". Die Zensuszahlen sind von Hand aus der Zensusdatenbank übernommen (<code>data/wohnen.js</code>). " +
      "© Statistische Ämter des Bundes und der Länder, Deutschland, 2026, Datenlizenz Deutschland – Namensnennung – Version 2.0.",
      "Stand: " + datumDE(D.stand) + ".")));
  }

  function texteAnwenden() {
    Object.keys(TEXTE).forEach(function (id) {
      var e = document.getElementById("txt-" + id);
      if (e) e.innerHTML = TEXTE[id][leicht ? "l" : "n"];
    });
    kacheln();
    diagrammWohnform();
    diagrammEigentum();
    kastenGWG();
    diagrammMiete();
    diagrammLeer();
    diagrammLeerWer();
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
