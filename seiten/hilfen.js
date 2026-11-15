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

  window.PP_HILFEN = {
    esc: esc, zahl: zahl, datum: datum, el: el, absatzHtml: absatzHtml,
    svgEl: svgEl, svgText: svgText
  };
})();
