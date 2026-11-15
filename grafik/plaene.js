/* Baugebiete und Pläne: Stadtkarte mit den Umgriffen aller Bebauungspläne, gefärbt nach dem Stand
   des Verfahrens. Ein Klick öffnet den Weg des Plans als Strecke mit Stationen.
   Umgriffe: data/plangebiete.js (Bauleitpläne Bayern, CC BY-ND 4.0, unverändert).
   Stand und Stationen: data/plaene.js (scraper/plaene_bauen.py). Die Karte kommt wie auf
   „Deine 15 Minuten“ aus karten/ingolstadt.pmtiles von derselben Domain. */
(function (NF) {
  'use strict';
  var D = window.PLAENE, G = window.PLANGEBIETE, BEZ = window.BEZIRKE;

  var FARBE = { grundsatz: '#7b7466', aufstellung: '#c2820f', entwurf: '#2f5f86', satzung: '#3f8f5f', kraft: '#14532d', offen: '#8f8779' };
  var NAME = { grundsatz: 'Grundsatzbeschluss', aufstellung: 'Aufstellung beschlossen', entwurf: 'Entwurf genehmigt',
    satzung: 'Beschlossen, noch nicht in Kraft', kraft: 'In Kraft', offen: 'Stand offen' };
  // Gruppen der Legende: was sie zeigt und welche Pläne dazugehören
  var GRUPPEN = [
    ['lauf', 'Im Verfahren', '#2f5f86'],
    ['satzung', 'Beschlossen, noch nicht in Kraft', FARBE.satzung],
    ['neu', 'Neu in Kraft', FARBE.kraft],
    ['alt', 'Ältere geltende Pläne', '#9db3a4']
  ];

  function datumDE(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

GRAFIK.szene({
  id: 'plaene', reiter: 'Pläne', form: 'Stadtkarte', farbe: '#2f5f86', seite: 'plaene.html',
  titel: 'Wo Ingolstadt plant',
  idee: 'Jede Fläche ist das Gebiet eines Bebauungsplans. Die Farbe sagt, wie weit er ist: noch im Verfahren, vom Stadtrat beschlossen oder schon in Kraft. Die blassen Flächen sind ältere Pläne, die längst gelten.',
  notizen: [
    ['Bedienung', 'Auf eine Fläche klicken: Die Karte zeigt den Weg des Plans von der Aufstellung bis zum Inkrafttreten. Die Knöpfe über der Karte blenden Gruppen ein und aus.'],
    ['Daten', 'Umrisse und Inkrafttreten: Bauleitpläne Bayern, Landesamt für Digitalisierung, Breitband und Vermessung (CC BY-ND 4.0), unverändert, ohne Gewähr. Beschlüsse: Ratsinfoportal der Stadt Ingolstadt. Grundkarte: © OpenStreetMap-Mitwirkende.']
  ],
  init: function (api) {
    if (!D || !G) { api.szene.innerHTML = '<p class="gf-laden">Die Plandaten ließen sich nicht laden.</p>'; return; }
    var altAb = D.zeitraum.alle_gremien_ab + '-01';
    var plan = {};
    D.plaene.forEach(function (p) { plan[p.nr] = p; });
    function gruppe(p) {
      var s = p.status.schritt;
      if (s === 'kraft') return p.status.datum >= altAb ? 'neu' : 'alt';
      return s === 'satzung' ? 'satzung' : 'lauf';
    }
    // Eigenschaften für die Darstellung an eine Kopie hängen; die Geometrie bleibt, wie sie geliefert wurde
    var features = G.features.filter(function (f) { return plan[f.properties.nr]; }).map(function (f) {
      var p = plan[f.properties.nr];
      return { type: 'Feature', geometry: f.geometry,
        properties: { nr: p.nr, schritt: p.status.schritt, gruppe: gruppe(p), farbe: gruppe(p) === 'alt' ? '#9db3a4' : FARBE[p.status.schritt] } };
    });
    var anzahl = {};
    features.forEach(function (f) { anzahl[f.properties.gruppe] = (anzahl[f.properties.gruppe] || 0) + 1; });

    var css = document.createElement('style');
    css.textContent = '.gf-plankarte { height: min(72vh, 680px); min-height: 440px; }' +
      '.gf-planweg { list-style: none; margin: 10px 0 12px; padding: 0; }' +
      '.gf-planweg li { position: relative; padding: 0 0 12px 26px; font-size: .86rem; line-height: 1.35; color: var(--grau); }' +
      '.gf-planweg li::before { content: ""; position: absolute; left: 6px; top: 14px; bottom: -2px; width: 2px; background: var(--linie-stark); }' +
      '.gf-planweg li:last-child::before { display: none; }' +
      '.gf-planweg li::after { content: ""; position: absolute; left: 0; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid var(--linie-stark); box-sizing: border-box; }' +
      '.gf-planweg li.fertig::after, .gf-planweg li.jetzt::after { background: var(--s); border-color: var(--s); }' +
      '.gf-planweg li.fertig::before { background: var(--s); }' +
      '.gf-planweg li.jetzt::after { box-shadow: 0 0 0 4px color-mix(in srgb, var(--s) 25%, transparent); }' +
      '.gf-planweg li.unklar::after { border-style: dashed; }' +
      '.gf-planweg strong { display: block; color: var(--tinte); }' +
      '.grafik .gf-chip i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; background: var(--f); }' +
      '.grafik .gf-chip[aria-pressed="false"] { color: var(--grau); } .grafik .gf-chip[aria-pressed="false"] i { opacity: .35; }' +
      '.grafik .gf-chip.plan[aria-pressed="true"] { background: #fff; color: var(--tinte); border-color: var(--linie-stark); }';
    document.head.appendChild(css);

    api.szene.innerHTML = '<div class="leiste" data-gf-frei><span class="etikett">Zeigen</span>' + GRUPPEN.map(function (g) {
      return '<button type="button" class="gf-chip plan" aria-pressed="true" data-g="' + g[0] + '" style="--f:' + g[2] + '"><i></i>' + g[1] + ' (' + (anzahl[g[0]] || 0) + ')</button>';
    }).join('') + '</div><div class="gf-plankarte" id="gf-plankarte" role="application" aria-label="Karte der Bebauungspläne"></div>';

    var an = { lauf: true, satzung: true, neu: true, alt: true };
    var karte = null;
    function filter() {
      if (!karte || !karte.getLayer('plan-flaeche')) return;
      var f = ['in', ['get', 'gruppe'], ['literal', Object.keys(an).filter(function (k) { return an[k]; })]];
      ['plan-flaeche', 'plan-linie'].forEach(function (id) { karte.setFilter(id, f); });
    }
    api.szene.querySelectorAll('.gf-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.getAttribute('data-g');
        an[g] = !an[g]; b.setAttribute('aria-pressed', an[g] ? 'true' : 'false');
        filter();
      });
    });

    function weg(p) {
      var rang = { offen: -1, grundsatz: 0, aufstellung: 1, entwurf: 2, satzung: 3, kraft: 4 };
      var hoch = rang[p.status.schritt], sta = p.stationen;
      function st(name, nr, k, sonst) {
        var d = sta[k], kl = hoch > nr ? 'fertig' : (hoch === nr ? 'jetzt' : '');
        return '<li class="' + kl + '"><strong>' + name + '</strong>' +
          (d ? datumDE(d.datum) + (d.quelle === 'land' ? ' (laut Landesportal)' : '') : (hoch >= nr ? 'Datum nicht in den Daten' : sonst || 'steht noch aus')) + '</li>';
      }
      return '<ol class="gf-planweg" style="--s:' + FARBE[p.status.schritt] + '">' +
        st('Aufstellung beschlossen', 1, 'aufstellung') + st('Entwurf genehmigt', 2, 'entwurf') +
        '<li class="' + (hoch >= 3 ? 'fertig' : (hoch === 2 ? 'unklar' : '')) + '"><strong>Öffentliche Auslegung</strong>' +
        (hoch >= 3 ? 'abgeschlossen' : (hoch === 2 ? 'folgt auf den Entwurf, Termin im Amtsblatt' : 'steht noch aus')) + '</li>' +
        st('Als Satzung beschlossen', 3, 'satzung') + st('In Kraft', 4, 'inkraft', hoch === 3 ? 'noch nicht verzeichnet' : '') + '</ol>';
    }
    function zeige(p) {
      var name = NF.esc(p.kurz || p.name);
      var html = '<div class="meta">Bebauungsplan Nr. ' + NF.esc(p.nr) + (p.bezirk_name ? ' · Bezirk ' + NF.esc(p.bezirk_name) : '') + '</div><h3>' + name + '</h3>' +
        '<div class="augenbraue" style="color:' + FARBE[p.status.schritt] + '">' + NAME[p.status.schritt] +
        (p.status.datum ? (p.status.schritt === 'kraft' ? ' seit ' : ', ') + datumDE(p.status.datum) : '') + '</div>' + weg(p);
      if (p.text.n) html += '<p>' + NF.esc(p.text.n) + '</p>';
      var z = p.amt && p.amt.plan_url ? [p.amt.plan_url, 'Geltende Planzeichnung (PDF)'] : (p.zeichnungen[0] ? [p.zeichnungen[0].url, NF.esc(p.zeichnungen[0].titel) + ' (PDF)'] : null);
      if (z) html += '<p><a href="' + NF.esc(z[0]) + '" target="_blank" rel="noopener noreferrer">' + z[1] + '</a></p>';
      html += '<p><a href="plaene.html#plan-' + p.id + '" data-steckbrief="' + p.id + '">Steckbrief mit allen Unterlagen →</a></p>' +
        '<p class="gf-quelle">Bauleitpläne Bayern (CC BY-ND 4.0), ohne Gewähr; Ratsinfoportal der Stadt Ingolstadt</p>';
      api.karte(html);
      if (karte && karte.getLayer('plan-auswahl')) karte.setFilter('plan-auswahl', ['==', ['get', 'nr'], p.nr]);
    }
    // „Steckbrief“ führt aus der grafischen Fassung zurück in die Liste
    api.buehne.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-steckbrief]') : null;
      if (!a) return;
      e.preventDefault();
      var knopf = document.getElementById('btn-text');
      if (knopf) knopf.click();
      if (location.hash === '#plan-' + a.getAttribute('data-steckbrief')) window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = 'plan-' + a.getAttribute('data-steckbrief');
    });

    var basis = new URL('.', location.href).href;
    import(basis + 'vendor/maplibre-gl/maplibre-gl.mjs').then(function (maplibregl) {
      if (!window.pmtiles || !window.basemaps) throw new Error('Kartenbausteine fehlen');
      maplibregl.addProtocol('pmtiles', new window.pmtiles.Protocol().tile);
      var ebenen = window.basemaps.layers('protomaps', window.basemaps.namedFlavor('light'), { lang: 'de' });
      var ersteSchrift = ebenen.filter(function (e) { return e.type === 'symbol'; })[0];
      karte = new maplibregl.Map({
        container: 'gf-plankarte',
        style: { version: 8,
          glyphs: basis + 'vendor/protomaps/fonts/{fontstack}/{range}.pbf',
          sprite: basis + 'vendor/protomaps/sprites/light',
          sources: { protomaps: { type: 'vector', url: 'pmtiles://' + basis + 'karten/ingolstadt.pmtiles',
            attribution: 'Umrisse: Bauleitpläne Bayern (CC BY-ND 4.0) · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a> · Protomaps' } },
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
        // Ältere Pläne zuerst, damit laufende Verfahren obenauf liegen
        features.sort(function (a, b) { return (a.properties.gruppe === 'alt' ? 0 : 1) - (b.properties.gruppe === 'alt' ? 0 : 1); });
        karte.addSource('plaene', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
        karte.addLayer({ id: 'plan-flaeche', type: 'fill', source: 'plaene',
          paint: { 'fill-color': ['get', 'farbe'], 'fill-opacity': ['case', ['==', ['get', 'gruppe'], 'alt'], 0.3, 0.6] } }, vor);
        karte.addLayer({ id: 'plan-linie', type: 'line', source: 'plaene',
          paint: { 'line-color': ['get', 'farbe'], 'line-width': ['case', ['==', ['get', 'gruppe'], 'alt'], 0.8, 1.8] } }, vor);
        karte.addLayer({ id: 'plan-auswahl', type: 'line', source: 'plaene', filter: ['==', ['get', 'nr'], ''],
          paint: { 'line-color': '#00263a', 'line-width': 3.5 } }, vor);
        karte.on('click', 'plan-flaeche', function (e) {
          // Liegen Pläne übereinander, gewinnt der, der nicht „alt“ ist
          var f = e.features.slice().sort(function (a, b) { return (a.properties.gruppe === 'alt' ? 1 : 0) - (b.properties.gruppe === 'alt' ? 1 : 0); })[0];
          if (f && plan[f.properties.nr]) zeige(plan[f.properties.nr]);
        });
        karte.on('mouseenter', 'plan-flaeche', function () { karte.getCanvas().style.cursor = 'pointer'; });
        karte.on('mouseleave', 'plan-flaeche', function () { karte.getCanvas().style.cursor = ''; });
        filter();
      });
    }).catch(function (fehler) {
      document.getElementById('gf-plankarte').innerHTML = '<p class="gf-laden" style="padding:2rem">Die Karte ließ sich nicht laden.</p>';
      if (window.console) console.error(fehler);
    });

    api.sag(NF.zahl(anzahl.lauf || 0) + ' Pläne sind im Verfahren, ' + NF.zahl(anzahl.satzung || 0) + ' beschlossen und noch nicht in Kraft. ' +
      NF.zahl((anzahl.neu || 0) + (anzahl.alt || 0)) + ' gelten bereits.');
  }
});
})(GRAFIK.NF);
