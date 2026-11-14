/* Wärmeplan: Stadtkarte mit den Eignungsgebieten der kommunalen Wärmeplanung, gefärbt nach Klasse.
   Ein Klick auf eine Fläche oder eine gesuchte Adresse zeigt, was der Plan dort vorsieht.
   Flächen: data/waerme.js (Stadt Ingolstadt, 2035.de; scraper/waerme_bauen.py). Suche und Texte kommen
   aus waerme.html (window.WAERME_HILFE), damit Karte und Textseite dasselbe sagen. Die Grundkarte kommt
   wie auf „Deine 15 Minuten“ aus karten/ingolstadt.pmtiles von derselben Domain. */
(function (NF) {
  'use strict';
  var D = window.WAERME, H = window.WAERME_HILFE, BEZ = window.BEZIRKE;
  var FARBE = { netz: '#b8430f', netz_spaeter: '#dba23a', gas_wp: '#2f5f86', einzel: '#6b4c93' };
  var KLASSEN = ['netz', 'netz_spaeter', 'gas_wp', 'einzel'];

GRAFIK.szene({
  id: 'waerme', reiter: 'Wärmeplan', form: 'Stadtkarte', farbe: '#b8430f', seite: 'waerme.html',
  titel: 'Wo welche Wärme geplant ist',
  idee: 'Jede Fläche ist ein Gebiet aus dem Wärmeplan der Stadt. Die Farbe sagt, was der Plan dort vorsieht: Fernwärme, Fernwärme mit geringer Priorität, ein Prüfgebiet mit Gasleitung oder eine eigene Heizung für jedes Haus.',
  notizen: [
    ['Bedienung', 'Adresse in das Feld über der Karte eingeben oder auf eine Fläche klicken. Die Knöpfe blenden einzelne Klassen ein und aus.'],
    ['Daten', 'Eignungsgebiete: Stadt Ingolstadt (2035.de), Stand November 2024, ohne Lizenzangabe, Umrisse unverändert. Der Plan ist rechtlich nicht bindend. Adressen und Grundkarte: © OpenStreetMap-Mitwirkende. Stadtbezirke: Stadt Ingolstadt (CC BY 3.0 DE).']
  ],
  init: function (api) {
    if (!D || !H) { api.szene.innerHTML = '<p class="gf-laden">Die Daten zum Wärmeplan ließen sich nicht laden.</p>'; return; }
    var anzahl = {};
    D.gebiete.features.forEach(function (f) { anzahl[f.properties.klasse] = (anzahl[f.properties.klasse] || 0) + 1; });
    var features = D.gebiete.features.map(function (f) {
      return { type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id, klasse: f.properties.klasse, farbe: FARBE[f.properties.klasse] } };
    });
    var eig = {};
    D.gebiete.features.forEach(function (f) { eig[f.properties.id] = f.properties; });

    var css = document.createElement('style');
    css.textContent = '.gf-waermekarte { height: min(72vh, 680px); min-height: 440px; }' +
      '.grafik .gf-chip i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; background: var(--f); }' +
      '.grafik .gf-chip.wp[aria-pressed="true"] { background: #fff; color: var(--tinte); border-color: var(--linie-stark); }' +
      '.grafik .gf-chip.wp[aria-pressed="false"] { color: var(--grau); } .grafik .gf-chip.wp[aria-pressed="false"] i { opacity: .35; }' +
      '.gf-wsuche { position: relative; flex: 1 1 240px; max-width: 340px; }' +
      '.gf-wsuche input { width: 100%; font: inherit; font-size: .9rem; padding: 6px 10px; border: 1px solid var(--linie-stark); border-radius: 6px; }' +
      '.gf-wsuche ul { list-style: none; margin: 0; padding: 0; position: absolute; left: 0; right: 0; top: 100%; z-index: 30; background: #fff; border: 1px solid var(--linie-stark); border-top: 0; box-shadow: 0 6px 16px rgba(22,35,43,.16); }' +
      '.gf-wsuche ul button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 6px 10px; cursor: pointer; }' +
      '.gf-wsuche ul button:hover, .gf-wsuche ul button:focus-visible { background: var(--papier-warm); }' +
      '.gf-wliste { margin: 0 0 10px 1.1rem; padding: 0; font-size: .88rem; }' +
      '@media (max-width: 640px) { .grafik .leiste.wp { flex-wrap: wrap; overflow: visible; } .gf-wsuche { flex-basis: 100%; max-width: none; } }';
    document.head.appendChild(css);

    api.szene.innerHTML = '<div class="leiste wp" data-gf-frei><div class="gf-wsuche"><label class="etikett" for="gf-wadresse" style="display:block">Adresse</label>' +
      '<input id="gf-wadresse" type="search" autocomplete="off" placeholder="z. B. Theresienstraße 22"><ul id="gf-wvorschlaege" hidden></ul></div>' +
      '<span class="etikett">Zeigen</span>' + KLASSEN.map(function (k) {
        return '<button type="button" class="gf-chip wp" aria-pressed="true" data-k="' + k + '" style="--f:' + FARBE[k] + '"><i></i>' + H.KLASSE[k].n + ' (' + (anzahl[k] || 0) + ')</button>';
      }).join('') + '</div><div class="gf-waermekarte" id="gf-waermekarte" role="application" aria-label="Karte der Gebiete im Wärmeplan"></div>';

    var an = {}, karte = null, bereit = false, wartet = null;
    KLASSEN.forEach(function (k) { an[k] = true; });
    function filter() {
      if (!bereit) return;
      var f = ['in', ['get', 'klasse'], ['literal', KLASSEN.filter(function (k) { return an[k]; })]];
      ['wp-flaeche', 'wp-linie'].forEach(function (id) { karte.setFilter(id, f); });
    }
    api.szene.querySelectorAll('.gf-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k');
        an[k] = !an[k]; b.setAttribute('aria-pressed', an[k] ? 'true' : 'false');
        filter();
      });
    });

    function zeige(p, ort) {
      var k = p ? p.klasse : 'ohne', K = H.KLASSE[k];
      // Bei einer Adresse zählt ihr eigener Bezirk; eine Fläche kann über mehrere reichen
      var bez = ort && ort.lon ? H.bezirkVon(ort.lon, ort.lat) : null;
      var html = '<div class="meta">' + (ort ? NF.esc(ort.text) + (bez ? ' · Bezirk ' + NF.esc(bez.name) : '') : (p && p.bezirk_name ? 'Überwiegend im Bezirk ' + NF.esc(p.bezirk_name) : 'Wärmeplan Ingolstadt')) + '</div>' +
        '<div class="augenbraue" style="color:' + (FARBE[k] || '#566a74') + '">' + K.n + '</div>' +
        '<h3>' + (p && p.name ? NF.esc(p.name) : K.kurz[0]) + '</h3><p>' + K.heisst[0] + '</p>';
      if (p && p.hinweis) html += '<p class="meta">Anmerkung der Stadt: ' + NF.esc(p.hinweis) + '</p>';
      if (K.wege[0].length) html += '<p style="margin-bottom:4px"><strong>Diese Wege nennt der Plan:</strong></p><ul class="gf-wliste">' + K.wege[0].map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>';
      if (p && !ort) html += '<dl><dt>Adressen in dieser Fläche</dt><dd>' + NF.zahl(p.adressen) + '</dd></dl>';
      html += '<p class="gf-quelle">Stadt Ingolstadt, Eignungsgebiete der Wärmeplanung (2035.de). Der Plan verpflichtet niemanden und ist keine Zusage für einen Anschluss.</p>';
      api.karte(html);
      if (bereit) karte.setFilter('wp-auswahl', ['==', ['get', 'id'], p ? p.id : -1]);
    }

    var marke = null, mlgl = null;
    function geheZu(o) {
      if (!bereit) { wartet = o; return; }
      if (marke) marke.remove();
      marke = new mlgl.Marker({ color: '#00263a' }).setLngLat([o.lon, o.lat]).addTo(karte);
      karte.easeTo({ center: [o.lon, o.lat], zoom: Math.max(karte.getZoom(), 15) });
      zeige(H.finde(o.lon, o.lat), o);
    }
    // Von der Textseite: „Auf der Karte ansehen“
    document.addEventListener('waerme-ort', function () { if (window.WAERME_ORT) geheZu(window.WAERME_ORT); });

    var feld = document.getElementById('gf-wadresse'), liste = document.getElementById('gf-wvorschlaege'), aktuell = [];
    function waehle(v) { feld.value = v.text; liste.innerHTML = ''; liste.hidden = true; geheZu(v); }
    feld.addEventListener('input', function () {
      aktuell = H.vorschlaege(feld.value);
      liste.innerHTML = '';
      aktuell.forEach(function (v) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.textContent = v.text;
        b.addEventListener('click', function () { waehle(v); });
        li.appendChild(b); liste.appendChild(li);
      });
      liste.hidden = aktuell.length === 0;
    });
    feld.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && aktuell.length) { e.preventDefault(); waehle(aktuell[0]); }
      if (e.key === 'Escape') liste.hidden = true;
    });

    var basis = new URL('.', location.href).href;
    import(basis + 'vendor/maplibre-gl/maplibre-gl.mjs').then(function (maplibregl) {
      if (!window.pmtiles || !window.basemaps) throw new Error('Kartenbausteine fehlen');
      mlgl = maplibregl;
      maplibregl.addProtocol('pmtiles', new window.pmtiles.Protocol().tile);
      var ebenen = window.basemaps.layers('protomaps', window.basemaps.namedFlavor('light'), { lang: 'de' });
      var ersteSchrift = ebenen.filter(function (e) { return e.type === 'symbol'; })[0];
      karte = new maplibregl.Map({
        container: 'gf-waermekarte',
        style: { version: 8,
          glyphs: basis + 'vendor/protomaps/fonts/{fontstack}/{range}.pbf',
          sprite: basis + 'vendor/protomaps/sprites/light',
          sources: { protomaps: { type: 'vector', url: 'pmtiles://' + basis + 'karten/ingolstadt.pmtiles',
            attribution: 'Gebiete: Stadt Ingolstadt (2035.de) · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a> · Protomaps' } },
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
        // Wärmenetz-Gebiete zuletzt, damit sie obenauf liegen
        features.sort(function (a, b) { return KLASSEN.indexOf(b.properties.klasse) - KLASSEN.indexOf(a.properties.klasse); });
        karte.addSource('waerme', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
        karte.addLayer({ id: 'wp-flaeche', type: 'fill', source: 'waerme', paint: { 'fill-color': ['get', 'farbe'], 'fill-opacity': 0.45 } }, vor);
        karte.addLayer({ id: 'wp-linie', type: 'line', source: 'waerme', paint: { 'line-color': ['get', 'farbe'], 'line-width': 1.2 } }, vor);
        if (BEZ) {
          karte.addSource('bezirke', { type: 'geojson', data: BEZ });
          karte.addLayer({ id: 'bezirke-linie', type: 'line', source: 'bezirke',
            paint: { 'line-color': '#16232b', 'line-width': 1.4, 'line-opacity': 0.6, 'line-dasharray': [3, 2] } }, vor);
        }
        karte.addLayer({ id: 'wp-auswahl', type: 'line', source: 'waerme', filter: ['==', ['get', 'id'], -1],
          paint: { 'line-color': '#00263a', 'line-width': 3.5 } }, vor);
        karte.on('click', 'wp-flaeche', function (e) {
          var f = e.features.slice().sort(function (a, b) { return KLASSEN.indexOf(a.properties.klasse) - KLASSEN.indexOf(b.properties.klasse); })[0];
          if (f && eig[f.properties.id]) zeige(eig[f.properties.id]);
        });
        karte.on('mouseenter', 'wp-flaeche', function () { karte.getCanvas().style.cursor = 'pointer'; });
        karte.on('mouseleave', 'wp-flaeche', function () { karte.getCanvas().style.cursor = ''; });
        bereit = true; filter();
        if (wartet || window.WAERME_ORT) geheZu(wartet || window.WAERME_ORT);
      });
    }).catch(function (fehler) {
      document.getElementById('gf-waermekarte').innerHTML = '<p class="gf-laden" style="padding:2rem">Die Karte ließ sich nicht laden.</p>';
      if (window.console) console.error(fehler);
    });

    var j = D.adressen.je_klasse, g = D.adressen.gesamt;
    api.sag('Von 100 Adressen liegen ' + NF.zahl((j.netz + j.netz_spaeter) / g * 100) + ' in einem Wärmenetz-Gebiet und ' +
      NF.zahl(j.gas_wp / g * 100) + ' in einem Prüfgebiet mit Gasleitung. Wo liegt Ihre?');
  }
});
})(GRAFIK.NF);
