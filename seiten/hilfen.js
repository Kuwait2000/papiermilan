/* Gemeinsame Hilfsfunktionen der Seitenskripte in seiten/*.js.
   Standen frueher wortgleich in bis zu sieben Dateien. Wird vor dem Skript
   der jeweiligen Seite geladen und legt genau einen Namen an: PP_HILFEN.
   Hier steht nur, was ohne Zustand der Seite auskommt. Funktionen, die vom
   Schalter fuer Einfache Sprache abhaengen (t, nl), bleiben in der Seite. */
(function () {
  "use strict";

  /* Fremden Text fuer innerHTML entschaerfen. */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* Zahl in deutscher Schreibweise, mit fester Zahl an Nachkommastellen. */
  function zahl(n, stellen) {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: stellen || 0, maximumFractionDigits: stellen || 0,
    }).format(n);
  }

  /* 2026-11-15 wird 15.11.2026. Alles andere bleibt, wie es ist. */
  function datum(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso);
  }

  /* Element mit Klasse und Text. Der Text geht ueber textContent. */
  function el(tag, klasse, text) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  /* Absatz aus eigenem Markup. Fremde Werte vorher durch esc() schicken. */
  function absatzHtml(klasse, html) {
    var p = document.createElement("p");
    p.className = klasse;
    p.innerHTML = html;
    return p;
  }

  function svgEl(tag, attrs, kinder) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    (kinder || []).forEach(function (kind) { e.appendChild(kind); });
    return e;
  }

  function svgText(x, y, inhalt, klasse, anker) {
    var t = svgEl("text", { x: x, y: y, class: klasse || "" });
    if (anker) t.setAttribute("text-anchor", anker);
    t.textContent = inhalt;
    return t;
  }

  /* Datendatei nachladen, wenn sie gebraucht wird. Jede Datei nur einmal;
     die Content-Security-Policy erlaubt Skripte nur von der eigenen Domain. */
  var geladen = {};
  function ladeSkript(src) {
    if (!geladen[src]) {
      geladen[src] = new Promise(function (ja, nein) {
        var s = document.createElement("script");
        s.src = src;
        s.onload = function () { ja(); };
        s.onerror = function () { delete geladen[src]; nein(new Error(src)); };
        document.head.appendChild(s);
      });
    }
    return geladen[src];
  }

  /* Adresssuche ueber data/wege-adressen.js (window.WEGE_ADRESSEN). Die Suche
     laeuft im Browser, die Eingabe verlaesst das Geraet nicht. Dieselbe Logik
     steht noch in seiten/waerme.js und wege.js. */
  function adressSuche(adr) {
    function norm(s) {
      return s.toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
        .replace(/str\.?(?=\s|$)/g, "strasse").replace(/[^a-z0-9]+/g, " ").trim();
    }
    var strassen = adr.strassen.map(function (s) {
      var nummern = s[1].split("|"), lat = [], lon = [], a = 0, b = 0;
      for (var i = 0; i < nummern.length; i++) { a += s[2][i]; b += s[3][i]; lat.push(a / 1e5); lon.push(b / 1e5); }
      return { name: s[0], schl: norm(s[0]), nummern: nummern,
        nkey: nummern.map(function (x) { return norm(x).replace(/ /g, ""); }), lat: lat, lon: lon };
    });
    function vorschlaege(eingabe) {
      var m = eingabe.trim().match(/^(.*?)[\s,]*(\d+\s*[a-zA-Z]?(?:\s*-\s*\d+)?)?$/);
      var strasse = norm(m ? m[1] : eingabe), nr = m && m[2] ? norm(m[2]).replace(/ /g, "") : "";
      if (strasse.length < 3) return [];
      return strassen.filter(function (s) { return s.schl.indexOf(strasse) !== -1; })
        .sort(function (a, b) {
          return ((b.schl.indexOf(strasse) === 0) - (a.schl.indexOf(strasse) === 0)) || a.name.localeCompare(b.name, "de");
        })
        .slice(0, 8).map(function (s) {
          var i = nr ? s.nkey.indexOf(nr) : -1;
          if (nr && i < 0) {   // naechstliegende Hausnummer
            var z = parseInt(nr, 10);
            i = s.nummern.reduce(function (best, x, k) {
              return Math.abs(parseInt(x, 10) - z) < Math.abs(parseInt(s.nummern[best], 10) - z) ? k : best;
            }, 0);
          }
          if (i < 0) i = Math.floor(s.nummern.length / 2);
          return { text: s.name + (nr ? " " + s.nummern[i] : ""), lat: s.lat[i], lon: s.lon[i], mitNummer: !!nr };
        });
    }
    return { vorschlaege: vorschlaege };
  }

  window.PP_HILFEN = {
    esc: esc, zahl: zahl, datum: datum, el: el, absatzHtml: absatzHtml,
    svgEl: svgEl, svgText: svgText, ladeSkript: ladeSkript, adressSuche: adressSuche
  };
})();
