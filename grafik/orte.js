/* Startseite: Stadtkarte mit den Orten, die in Tagesordnungen vorkommen. Je mehr Einträge einen Ort
   nennen, desto kräftiger ist er gezeichnet. Ein Klick zeigt, worum es dort ging. Zuschaltbar sind die
   Unfälle mit Verletzten aus dem Unfallatlas und die Baustellen, die die Stadt gemeldet hat.
   Orte und Zuordnung: data/orte.js (scraper/orte_bauen.py). Unfälle: data/unfaelle.js. Baustellen:
   data/baustellen.js. Die Karte kommt wie auf „Deine 15 Minuten“ aus karten/ingolstadt.pmtiles. */
(function (NF) {
  'use strict';
  var O = window.ORTE, F = window.FEED, U = window.UNFAELLE, B = window.BAUSTELLEN, BEZ = window.BEZIRKE;
  var ART = { s: 'Straße', k: 'Kreuzung', a: 'Adresse', o: 'Einrichtung', p: 'Bebauungsplan' };

  function datumDE(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function unfallSatz(u) {
    if (!u[0]) return 'keine Unfälle mit Verletzten verzeichnet';
    var teile = [];
    if (u[1]) teile.push(u[1] + ' mit Fahrrad');
    if (u[2]) teile.push(u[2] + ' mit Fußgängerinnen oder Fußgängern');
    if (u[3]) teile.push(u[3] + ' mit Schwerverletzten oder Getöteten');
    return u[0] + (u[0] === 1 ? ' Unfall' : ' Unfälle') + ' mit Verletzten' + (teile.length ? ', davon ' + teile.join(', ') : '');
  }

GRAFIK.szene({
  id: 'orte', reiter: 'Orte', form: 'Stadtkarte', farbe: '#00695c', seite: 'index.html',
  titel: 'Wo es um was geht',
  idee: 'Jede Linie und jeder Punkt ist ein Ort, den Stadtrat oder Bezirksausschüsse in einem Tagesordnungspunkt genannt haben: eine Straße, eine Kreuzung, eine Schule, ein Baugebiet. Je öfter ein Ort vorkommt, desto kräftiger ist er gezeichnet.',
  notizen: [
    ['Bedienung', 'Auf einen Ort klicken: Die Karte zeigt, worum es dort ging. Die Knöpfe über der Karte blenden Unfälle mit Verletzten und gemeldete Baustellen ein.'],
    ['Daten', 'Orte: von einem Programm in Titel und Kurztext gefunden, das gelingt bei etwa jedem vierten Eintrag und kann danebenliegen. Straßen und Einrichtungen: © OpenStreetMap-Mitwirkende. Unfälle: Unfallatlas, © Statistische Ämter des Bundes und der Länder (Datenlizenz Deutschland – Namensnennung 2.0). Baustellen: Stadt Ingolstadt (CC BY 4.0).']
  ],
  init: function (api) {
    if (!O || !F) { api.szene.innerHTML = '<p class="gf-laden">Die Ortsdaten ließen sich nicht laden.</p>'; return; }
    var jeRef = {};
    F.eintraege.forEach(function (e) { jeRef[e.ref] = e; });
    var jeOrt = O.orte.map(function () { return []; });
    Object.keys(O.eintraege).forEach(function (ref) {
      if (!jeRef[ref]) return;
      O.eintraege[ref].o.forEach(function (i) { jeOrt[i].push(jeRef[ref]); });
    });
    jeOrt.forEach(function (l) { l.sort(function (a, b) { return a.datum < b.datum ? 1 : -1; }); });

    var linien = [], punkte = [];
    O.orte.forEach(function (o, i) {
      var n = jeOrt[i].length;
      if (!n) return;
      if (o[4]) {
        var teile = o[4].map(function (flach) {
          var a = 0, b = 0, pts = [];
          for (var k = 0; k < flach.length; k += 2) { a += flach[k]; b += flach[k + 1]; pts.push([b / 1e5, a / 1e5]); }
          return pts;
        });
        linien.push({ type: 'Feature', properties: { i: i, n: n }, geometry: { type: 'MultiLineString', coordinates: teile } });
      } else {
        punkte.push({ type: 'Feature', properties: { i: i, n: n, art: o[0] }, geometry: { type: 'Point', coordinates: [o[3] / 1e5, o[2] / 1e5] } });
      }
    });

    var unfaelle = [];
    if (U) {
      var ua = 0, ub = 0;
      U.punkte.forEach(function (p) {
        ua += p[0]; ub += p[1];
        unfaelle.push({ type: 'Feature', properties: { schwer: p[3] <= 2 ? 1 : 0 }, geometry: { type: 'Point', coordinates: [ub / 1e5, ua / 1e5] } });
      });
    }
    var heute = new Date(), iso = heute.getFullYear() + '-' + ('0' + (heute.getMonth() + 1)).slice(-2) + '-' + ('0' + heute.getDate()).slice(-2);
    var baustellen = !B ? [] : B.liste.filter(function (b) { return !b[5] || b[5] >= iso; }).map(function (b, k) {
      return { type: 'Feature', properties: { k: k, wo: b[2], quer: b[3], von: b[4], bis: b[5], was: b[6], verkehr: b[7] }, geometry: { type: 'Point', coordinates: [b[1], b[0]] } };
    });

    var css = document.createElement('style');
    css.textContent = '.gf-ortekarte { height: min(72vh, 680px); min-height: 440px; }' +
      '.gf-orteliste { list-style: none; margin: 8px 0 10px; padding: 0; font-size: .86rem; line-height: 1.35; }' +
      '.gf-orteliste li { padding: 5px 0; border-bottom: 1px solid var(--linie); }' +
      '.gf-orteliste small { display: block; color: var(--grau); }' +
      '.gf-karte button.gf-zurliste { border: 1px solid var(--farbe); background: #fff; color: var(--farbe); border-radius: 999px; padding: 5px 12px; font-size: .84rem; font-weight: 600; cursor: pointer; }' +
      '.grafik .gf-chip i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; background: var(--f); }' +
      '.grafik .gf-chip.ebene[aria-pressed="true"] { background: #fff; color: var(--tinte); border-color: var(--linie-stark); }' +
      '.grafik .gf-chip.ebene[aria-pressed="false"] { color: var(--grau); } .grafik .gf-chip.ebene[aria-pressed="false"] i { opacity: .35; }';
    document.head.appendChild(css);

    var EBENEN = [
      ['orte', 'Orte der Einträge (' + NF.zahl(linien.length + punkte.length) + ')', '#00695c', true],
      ['unfaelle', 'Unfälle mit Verletzten ' + (U ? U.von + ' bis ' + U.bis + ' (' + NF.zahl(unfaelle.length) + ')' : ''), '#b00e2b', false],
      ['baustellen', 'Gemeldete Baustellen (' + NF.zahl(baustellen.length) + ')', '#c2820f', false]
    ].filter(function (e) { return e[0] === 'orte' || (e[0] === 'unfaelle' ? unfaelle.length : baustellen.length); });
    var an = {};
    EBENEN.forEach(function (e) { an[e[0]] = e[3]; });

    api.szene.innerHTML = '<div class="leiste" data-gf-frei><span class="etikett">Zeigen</span>' + EBENEN.map(function (e) {
      return '<button type="button" class="gf-chip ebene" aria-pressed="' + (e[3] ? 'true' : 'false') + '" data-e="' + e[0] + '" style="--f:' + e[2] + '"><i></i>' + NF.esc(e[1]) + '</button>';
    }).join('') + '</div><div class="gf-ortekarte" id="gf-ortekarte" role="application" aria-label="Karte der Orte aus den Tagesordnungen"></div>';

    var karte = null;
    var LAYER = { orte: ['ort-linie', 'ort-linie-klick', 'ort-auswahl', 'ort-punkt'], unfaelle: ['unfall-punkt'], baustellen: ['baustelle-punkt'] };
    function sichtbar() {
      if (!karte) return;
      Object.keys(LAYER).forEach(function (e) {
        LAYER[e].forEach(function (id) { if (karte.getLayer(id)) karte.setLayoutProperty(id, 'visibility', an[e] ? 'visible' : 'none'); });
      });
    }
    api.szene.querySelectorAll('.gf-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = b.getAttribute('data-e');
        an[e] = !an[e]; b.setAttribute('aria-pressed', an[e] ? 'true' : 'false');
        sichtbar();
      });
    });

    function zeigeOrt(i) {
      var o = O.orte[i], liste = jeOrt[i];
      var html = '<div class="meta">' + ART[o[0]] + '</div><h3>' + NF.esc(o[1]) + '</h3>' +
        '<div class="augenbraue">' + (liste.length === 1 ? 'Ein Eintrag' : NF.zahl(liste.length) + ' Einträge') + '</div><ul class="gf-orteliste">' +
        liste.slice(0, 5).map(function (e) {
          return '<li>' + NF.esc(e.klartext_titel) + '<small>' + NF.esc(e.datum_anzeige) + ' · ' + NF.esc(e.gremium) + '</small></li>';
        }).join('') + '</ul>';
      if (o[5]) {
        html += '<p><strong>Unfälle ' + O.unfall.von + ' bis ' + O.unfall.bis + ':</strong> ' + unfallSatz(o[5]) +
          (o[0] === 's' ? ' (ganze Straße)' : ' (Umkreis ' + (o[0] === 'k' ? O.unfall.kreuzung_m : O.unfall.adresse_m) + ' m)') + '.</p>';
      }
      html += '<p><button type="button" class="gf-zurliste" data-ort="' + i + '">' +
        (liste.length > 5 ? 'Alle ' + NF.zahl(liste.length) + ' in der Liste zeigen' : 'In der Liste zeigen') + ' →</button></p>' +
        '<p class="gf-quelle">Ratsinfoportal der Stadt Ingolstadt; Ort automatisch zugeordnet' + (o[5] ? '; Unfallatlas der Statistischen Ämter' : '') + '</p>';
      api.karte(html);
      if (karte && karte.getLayer('ort-auswahl')) karte.setFilter('ort-auswahl', ['==', ['get', 'i'], i]);
    }
    function zeigeBaustelle(p) {
      api.karte('<div class="meta">Baustelle oder Sperrung</div><h3>' + NF.esc(p.wo) + (p.quer ? ' <small>(' + NF.esc(p.quer) + ')</small>' : '') + '</h3>' +
        '<p>' + NF.esc(p.was) + '</p>' + (p.verkehr ? '<p>' + NF.esc(p.verkehr) + '</p>' : '') +
        '<dl><dt>Beginn</dt><dd>' + NF.esc(datumDE(p.von)) + '</dd><dt>Ende</dt><dd>' + NF.esc(datumDE(p.bis)) + '</dd></dl>' +
        '<p class="gf-quelle">Stadt Ingolstadt (open.bydata), CC BY 4.0, Stand ' + NF.esc(datumDE(B.stand)) + '. Vorschau für 14 Tage.</p>');
    }
    // „In der Liste zeigen“ führt aus der grafischen Fassung zurück in die Textfassung
    api.buehne.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-ort]') : null;
      if (!b) return;
      var knopf = document.getElementById('btn-text');
      if (knopf) knopf.click();
      if (window.PP_START) window.PP_START.zeigeOrt(Number(b.getAttribute('data-ort')));
    });

    var basis = new URL('.', location.href).href;
    import(basis + 'vendor/maplibre-gl/maplibre-gl.mjs').then(function (maplibregl) {
      if (!window.pmtiles || !window.basemaps) throw new Error('Kartenbausteine fehlen');
      maplibregl.addProtocol('pmtiles', new window.pmtiles.Protocol().tile);
      var ebenen = window.basemaps.layers('protomaps', window.basemaps.namedFlavor('light'), { lang: 'de' });
      var ersteSchrift = ebenen.filter(function (e) { return e.type === 'symbol'; })[0];
      karte = new maplibregl.Map({
        container: 'gf-ortekarte',
        style: { version: 8,
          glyphs: basis + 'vendor/protomaps/fonts/{fontstack}/{range}.pbf',
          sprite: basis + 'vendor/protomaps/sprites/light',
          sources: { protomaps: { type: 'vector', url: 'pmtiles://' + basis + 'karten/ingolstadt.pmtiles',
            attribution: 'Unfälle: © Statistische Ämter des Bundes und der Länder · Baustellen: Stadt Ingolstadt · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a> · Protomaps' } },
          layers: ebenen },
        bounds: [[11.30, 48.70], [11.52, 48.82]], minZoom: 10, maxZoom: 18,
        maxBounds: [[11.20, 48.64], [11.62, 48.87]],
        attributionControl: { compact: true },
        cooperativeGestures: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
        locale: {
          'CooperativeGesturesHandler.MobileHelpText': 'Karte mit zwei Fingern verschieben',
          'CooperativeGesturesHandler.WindowsHelpText': 'Strg + Mausrad zum Zoomen',
          'CooperativeGesturesHandler.MacHelpText': '⌘ + Mausrad zum Zoomen',
          'NavigationControl.ZoomIn': 'Vergrößern', 'NavigationControl.ZoomOut': 'Verkleinern',
          'AttributionControl.ToggleAttribution': 'Quellen anzeigen'
        }
      });
      karte.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      karte.on('load', function () {
        var vor = ersteSchrift ? ersteSchrift.id : undefined;
        if (BEZ) {
          karte.addSource('bezirke', { type: 'geojson', data: BEZ });
          karte.addLayer({ id: 'bezirke-linie', type: 'line', source: 'bezirke',
            paint: { 'line-color': '#3d4f59', 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [3, 2] } }, vor);
        }
        var staerke = ['interpolate', ['linear'], ['get', 'n'], 1, 2, 5, 3.5, 15, 5.5, 40, 8];
        karte.addSource('unfaelle', { type: 'geojson', data: { type: 'FeatureCollection', features: unfaelle } });
        karte.addLayer({ id: 'unfall-punkt', type: 'circle', source: 'unfaelle', layout: { visibility: 'none' },
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.6, 15, 4],
            'circle-color': ['case', ['==', ['get', 'schwer'], 1], '#6d0718', '#b00e2b'], 'circle-opacity': 0.55 } }, vor);
        karte.addSource('ort-linien', { type: 'geojson', data: { type: 'FeatureCollection', features: linien } });
        karte.addSource('ort-punkte', { type: 'geojson', data: { type: 'FeatureCollection', features: punkte } });
        karte.addLayer({ id: 'ort-linie', type: 'line', source: 'ort-linien', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#00695c', 'line-width': staerke, 'line-opacity': 0.75 } }, vor);
        // Breite, unsichtbare Linie darüber: dünne Straßen lassen sich sonst kaum treffen
        karte.addLayer({ id: 'ort-linie-klick', type: 'line', source: 'ort-linien',
          paint: { 'line-color': '#000', 'line-width': 16, 'line-opacity': 0 } }, vor);
        karte.addLayer({ id: 'ort-auswahl', type: 'line', source: 'ort-linien', filter: ['==', ['get', 'i'], -1],
          paint: { 'line-color': '#00263a', 'line-width': 7 } }, vor);
        karte.addLayer({ id: 'ort-punkt', type: 'circle', source: 'ort-punkte',
          paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 5, 5, 8, 15, 12, 40, 17],
            'circle-color': ['match', ['get', 'art'], 'p', '#2f5f86', 'k', '#00263a', '#00695c'],
            'circle-opacity': 0.8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
        karte.addSource('baustellen', { type: 'geojson', data: { type: 'FeatureCollection', features: baustellen } });
        karte.addLayer({ id: 'baustelle-punkt', type: 'circle', source: 'baustellen', layout: { visibility: 'none' },
          paint: { 'circle-radius': 6, 'circle-color': '#c2820f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });

        // Ein Klick, ein Ziel: Punkte liegen über den Linien, Baustellen über allem
        karte.on('click', function (e) {
          var treffer = karte.queryRenderedFeatures(e.point, { layers: ['baustelle-punkt', 'ort-punkt', 'ort-linie-klick'].filter(function (id) {
            return karte.getLayoutProperty(id, 'visibility') !== 'none';
          }) });
          if (!treffer.length) return;
          var f = treffer[0];
          if (f.layer.id === 'baustelle-punkt') zeigeBaustelle(f.properties);
          else zeigeOrt(f.properties.i);
        });
        ['baustelle-punkt', 'ort-punkt', 'ort-linie-klick'].forEach(function (id) {
          karte.on('mouseenter', id, function () { karte.getCanvas().style.cursor = 'pointer'; });
          karte.on('mouseleave', id, function () { karte.getCanvas().style.cursor = ''; });
        });
        sichtbar();
      });
    }).catch(function (fehler) {
      var platz = document.getElementById('gf-ortekarte');
      if (platz) platz.innerHTML = '<p class="gf-laden" style="padding:2rem">Die Karte ließ sich nicht laden.</p>';
      if (window.console) console.error(fehler);
    });

    var oben = O.orte.map(function (o, i) { return [jeOrt[i].length, o[1]]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 3);
    api.sag(NF.zahl(O.statistik.mit_ort) + ' von ' + NF.zahl(O.statistik.eintraege) + ' Einträgen nennen einen Ort. Am häufigsten: ' +
      oben.map(function (x) { return NF.esc(x[1]) + ' (' + x[0] + ')'; }).join(', ') + '.');
  }
});
})(GRAFIK.NF);
