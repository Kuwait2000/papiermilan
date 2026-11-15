/* Wärmeplan: Stadtkarte mit den Eignungsgebieten der kommunalen Wärmeplanung, gefärbt nach Klasse.
   Ein Klick auf eine Fläche oder eine gesuchte Adresse zeigt, was der Plan dort vorsieht.
   Flächen: data/waerme.js (Stadt Ingolstadt, 2035.de; scraper/waerme_bauen.py). Suche und Texte kommen
   aus waerme.html (window.WAERME_HILFE), damit Karte und Textseite dasselbe sagen. Die Grundkarte kommt
   wie auf „Deine 15 Minuten“ aus karten/ingolstadt.pmtiles von derselben Domain.
   Zweite Schicht: Baublöcke des Energie-Atlas Bayern (data/baublock.js, scraper/baublock_bauen.py) mit
   Heizung heute, Baualter und Wärmebedarf. Über „Einfärben nach“ wechselt die Karte die Füllung; die
   Gebiete des Plans bleiben dann als Umrisse stehen. */
(function (NF) {
  'use strict';
  var D = window.WAERME, H = window.WAERME_HILFE, BEZ = window.BEZIRKE;
  var FARBE = { netz: '#b8430f', netz_spaeter: '#dba23a', gas_wp: '#2f5f86', einzel: '#6b4c93' };
  var KLASSEN = ['netz', 'netz_spaeter', 'gas_wp', 'einzel'];
  var BB = window.BAUBLOCK;
  // Energieträger: feste Farben nach Stichwort, damit eine geänderte Reihenfolge der Daten nichts verschiebt
  var TRAEGER_FARBE = [['Gas', '#d9a400'], ['Fernwärme', '#c2410c'], ['Heizöl', '#5b4636'], ['Strom', '#7c3aed'],
    ['Biomasse', '#84a03c'], ['Solar', '#1f8a70'], ['Holz', '#a16207'], ['kein', '#9ca3af']];
  function traegerFarbe(name) {
    var t = TRAEGER_FARBE.filter(function (x) { return name.indexOf(x[0]) === 0; })[0];
    return t ? t[1] : '#9ca3af';
  }
  function traegerKurz(name) { return name.replace(' (verschiedene Energieträger)', '').replace(' (ohne Wärmepumpen)', '').replace(' (ohne Holz), Biogas', '').replace('kein Energieträger (keine Heizung)', 'keine Heizung'); }
  // Baualter: alt = dunkel, neu = hell
  var ALTER_FARBE = ['#4a1d0a', '#6b2c0f', '#8c3d14', '#ab5420', '#c56f35', '#d98c52', '#e6a973', '#efc498', '#f5dcc0', '#faf0e2'];
  // Wärmebedarf je Hektar und Jahr (MWh), eigene Stufen
  var DICHTE = [[0, '#fdf0d5', 'unter 150'], [150, '#f6cf8f', '150 bis 300'], [300, '#ec9a5c', '300 bis 500'], [500, '#d95f34', '500 bis 1.000'], [1000, '#a3200f', 'über 1.000']];
  var ANSICHT = { plan: 'Gebiete im Plan', e: 'Heizung heute', a: 'Baualter', d: 'Wärmebedarf' };

GRAFIK.szene({
  id: 'waerme', reiter: 'Wärmeplan', form: 'Stadtkarte', farbe: '#b8430f', seite: 'waerme.html',
  titel: 'Wo welche Wärme geplant ist',
  idee: 'Jede Fläche ist ein Gebiet aus dem Wärmeplan der Stadt. Die Farbe sagt, was der Plan dort vorsieht: Fernwärme, Fernwärme mit geringer Priorität, ein Prüfgebiet mit Gasleitung oder eine eigene Heizung für jedes Haus.',
  notizen: [
    ['Bedienung', 'Adresse in das Feld über der Karte eingeben oder auf eine Fläche klicken. Die Knöpfe blenden einzelne Klassen ein und aus. „Einfärben nach“ zeigt statt der Gebiete, womit die Baublöcke heute überwiegend heizen, wie alt die Gebäude sind oder wie viel Wärme sie brauchen.'],
    ['Baublöcke', 'Ein Baublock ist eine von Straßen umschlossene Fläche. Angegeben ist jeweils der häufigste Wert im Block, nicht der jedes Hauses. Blöcke ohne Wohngebäude oder mit gesperrten Zahlen fehlen. Der Wärmebedarf ist ein Rechenmodell des Landesamts, keine Messung.'],
    ['Daten', 'Eignungsgebiete: Stadt Ingolstadt (2035.de), Stand November 2024, ohne Lizenzangabe, Umrisse unverändert. Der Plan ist rechtlich nicht bindend. Adressen und Grundkarte: © OpenStreetMap-Mitwirkende. Stadtbezirke: Stadt Ingolstadt (CC BY 3.0 DE). Baublöcke: Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de (CC BY 4.0), auf Grundlage des Zensus 2022; Umrisse vereinfacht, eigene Zuordnung zu den Gebieten.']
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
      '.gf-wlegende { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; margin: 6px 0 8px; min-height: 1.3em; }' +
      '.gf-wlegende span { display: inline-flex; align-items: center; gap: 5px; } .gf-wlegende i { width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(22,35,43,.25); }' +
      '.gf-wblock { border-top: 1px solid var(--linie); margin-top: 10px; padding-top: 8px; }' +
      '@media (max-width: 640px) { .grafik .leiste.wp { flex-wrap: wrap; overflow: visible; } .gf-wsuche { flex-basis: 100%; max-width: none; } }';
    document.head.appendChild(css);

    api.szene.innerHTML = '<div class="leiste wp" data-gf-frei><div class="gf-wsuche"><label class="etikett" for="gf-wadresse" style="display:block">Adresse</label>' +
      '<input id="gf-wadresse" type="search" autocomplete="off" placeholder="z. B. Theresienstraße 22"><ul id="gf-wvorschlaege" hidden></ul></div>' +
      '<span class="etikett">Zeigen</span>' + KLASSEN.map(function (k) {
        return '<button type="button" class="gf-chip wp" aria-pressed="true" data-k="' + k + '" style="--f:' + FARBE[k] + '"><i></i>' + H.KLASSE[k].n + ' (' + (anzahl[k] || 0) + ')</button>';
      }).join('') + '</div>' +
      (BB ? '<div class="leiste wp" data-gf-frei><span class="etikett">Einfärben nach</span>' + Object.keys(ANSICHT).map(function (a) {
        return '<button type="button" class="gf-chip an" aria-pressed="' + (a === 'plan' ? 'true' : 'false') + '" data-a="' + a + '">' + ANSICHT[a] + '</button>';
      }).join('') + '</div><div class="gf-wlegende" id="gf-wlegende" aria-live="polite"></div>' : '') +
      '<div class="gf-waermekarte" id="gf-waermekarte" role="application" aria-label="Karte der Gebiete im Wärmeplan"></div>';

    var an = {}, karte = null, bereit = false, wartet = null;
    KLASSEN.forEach(function (k) { an[k] = true; });
    function filter() {
      if (!bereit) return;
      var f = ['in', ['get', 'klasse'], ['literal', KLASSEN.filter(function (k) { return an[k]; })]];
      ['wp-flaeche', 'wp-linie'].forEach(function (id) { karte.setFilter(id, f); });
    }
    api.szene.querySelectorAll('.gf-chip.wp').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k');
        an[k] = !an[k]; b.setAttribute('aria-pressed', an[k] ? 'true' : 'false');
        filter();
      });
    });

    // Baublock an einem Punkt: erst der Rahmen, dann die genaue Probe
    var BLOECKE = !BB ? [] : BB.bloecke.features.map(function (f) {
      var teile = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      var x0 = 999, y0 = 999, x1 = -999, y1 = -999;
      teile.forEach(function (t) { t[0].forEach(function (c) { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }); });
      return { p: f.properties, teile: teile, r: [x0, y0, x1, y1] };
    });
    function imRing(x, y, ring) {
      var innen = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if ((ring[i][1] > y) !== (ring[j][1] > y) && x < (ring[j][0] - ring[i][0]) * (y - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) innen = !innen;
      }
      return innen;
    }
    function blockBei(lon, lat) {
      for (var i = 0; i < BLOECKE.length; i++) {
        var b = BLOECKE[i];
        if (lon < b.r[0] || lon > b.r[2] || lat < b.r[1] || lat > b.r[3]) continue;
        if (b.teile.some(function (t) { return imRing(lon, lat, t[0]) && !t.slice(1).some(function (l) { return imRing(lon, lat, l); }); })) return b.p;
      }
      return null;
    }
    function blockText(b) {
      var z = [];
      if (b.e != null) z.push(['Heizung überwiegend', traegerKurz(BB.energietraeger[b.e])]);
      if (b.a != null) z.push(['Gebäude überwiegend von', BB.baualter[b.a].replace('-', '–')]);
      if (b.w != null) z.push(['Wohnungen', NF.zahl(b.w) + (b.g != null ? ' in ' + NF.zahl(b.g) + ' Gebäuden' : '')]);
      if (b.q != null) z.push(['Wärmebedarf im Jahr', NF.zahl(b.q) + ' MWh' + (b.qs != null && b.q > 0 ? ', saniert ' + NF.zahl(b.qs) + ' MWh (−' + Math.round((1 - b.qs / b.q) * 100) + ' %)' : '')]);
      return '<div class="gf-wblock"><div class="augenbraue">Der Baublock heute</div><dl>' + z.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>' +
        '<p class="gf-quelle">Häufigster Wert im Block, nicht der jedes Hauses. Wärmebedarf: Rechenmodell. Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de (Zensus 2022).</p></div>';
    }

    var ansicht = 'plan';
    function legende() {
      var el = document.getElementById('gf-wlegende');
      if (!el) return;
      var teile = [];
      if (ansicht === 'e') teile = BB.energietraeger.filter(function (n, i) { return BB.gesamt.wohnungen_je_traeger[i] > 0; }).map(function (n) { return [traegerFarbe(n), traegerKurz(n)]; });
      if (ansicht === 'a') teile = BB.baualter.map(function (n, i) { return [ALTER_FARBE[i] || '#faf0e2', n.replace('-', '–')]; });
      if (ansicht === 'd') teile = DICHTE.map(function (s) { return [s[1], s[2]]; });
      el.innerHTML = teile.map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join('') +
        (ansicht === 'd' ? '<span>MWh je Hektar und Jahr</span>' : '') + (ansicht !== 'plan' ? '<span>Umrisse: Gebiete im Plan</span>' : '');
    }
    function blockFarbe() {
      if (ansicht === 'e') return ['match', ['get', 'e']].concat(BB.energietraeger.reduce(function (l, n, i) { return l.concat([i, traegerFarbe(n)]); }, []), ['rgba(0,0,0,0)']);
      if (ansicht === 'a') return ['match', ['get', 'a']].concat(BB.baualter.reduce(function (l, n, i) { return l.concat([i, ALTER_FARBE[i] || '#faf0e2']); }, []), ['rgba(0,0,0,0)']);
      return ['case', ['!', ['has', 'd']], 'rgba(0,0,0,0)', ['step', ['get', 'd'], DICHTE[0][1]].concat(DICHTE.slice(1).reduce(function (l, s) { return l.concat([s[0], s[1]]); }, []))];
    }
    function setzeAnsicht() {
      legende();
      if (!bereit) return;
      var plan = ansicht === 'plan';
      karte.setPaintProperty('wp-flaeche', 'fill-opacity', plan ? 0.45 : 0);
      karte.setPaintProperty('wp-linie', 'line-width', plan ? 1.2 : 2.2);
      if (karte.getLayer('bb-flaeche')) {
        karte.setLayoutProperty('bb-flaeche', 'visibility', plan ? 'none' : 'visible');
        karte.setLayoutProperty('bb-linie', 'visibility', plan ? 'none' : 'visible');
        if (!plan) karte.setPaintProperty('bb-flaeche', 'fill-color', blockFarbe());
      }
    }
    api.szene.querySelectorAll('.gf-chip.an').forEach(function (b) {
      b.addEventListener('click', function () {
        ansicht = b.getAttribute('data-a');
        api.szene.querySelectorAll('.gf-chip.an').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        setzeAnsicht();
      });
    });

    function zeige(p, ort, block) {
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
      if (block) html += blockText(block);
      api.karte(html);
      if (bereit) karte.setFilter('wp-auswahl', ['==', ['get', 'id'], p ? p.id : -1]);
    }

    var marke = null, mlgl = null;
    function geheZu(o) {
      if (!bereit) { wartet = o; return; }
      if (marke) marke.remove();
      marke = new mlgl.Marker({ color: '#00263a' }).setLngLat([o.lon, o.lat]).addTo(karte);
      karte.easeTo({ center: [o.lon, o.lat], zoom: Math.max(karte.getZoom(), 15) });
      zeige(H.finde(o.lon, o.lat), o, blockBei(o.lon, o.lat));
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
            attribution: 'Gebiete: Stadt Ingolstadt (2035.de) · Baublöcke: <a href="https://www.lfu.bayern.de" target="_blank" rel="noopener noreferrer">Bayerisches Landesamt für Umwelt</a> (CC BY 4.0) · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a> · Protomaps' } },
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
        if (BB) {
          karte.addSource('baublock', { type: 'geojson', data: BB.bloecke });
          karte.addLayer({ id: 'bb-flaeche', type: 'fill', source: 'baublock', layout: { visibility: 'none' }, paint: { 'fill-color': '#ccc', 'fill-opacity': 0.8 } }, 'wp-flaeche');
          karte.addLayer({ id: 'bb-linie', type: 'line', source: 'baublock', layout: { visibility: 'none' }, paint: { 'line-color': '#16232b', 'line-width': 0.4, 'line-opacity': 0.5 } }, 'wp-flaeche');
        }
        karte.on('click', function (e) {
          var f = karte.queryRenderedFeatures(e.point, { layers: ['wp-flaeche'] })
            .sort(function (a, b) { return KLASSEN.indexOf(a.properties.klasse) - KLASSEN.indexOf(b.properties.klasse); })[0];
          var block = blockBei(e.lngLat.lng, e.lngLat.lat);
          if ((f && eig[f.properties.id]) || block) zeige(f ? eig[f.properties.id] : null, null, block);
        });
        karte.on('mouseenter', 'wp-flaeche', function () { karte.getCanvas().style.cursor = 'pointer'; });
        karte.on('mouseleave', 'wp-flaeche', function () { karte.getCanvas().style.cursor = ''; });
        bereit = true; filter(); setzeAnsicht();
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
