/* Skript der Seite antraege.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  'use strict';
  var H = window.PP_HILFEN;
  var el = H.el, datumDe = H.datum;

  var D = window.ANTRAEGE_DATEN;
  var listeEl = document.getElementById('antraege-liste');

  if (!D || !D.parteien) {
    listeEl.innerHTML =
      '<p><strong>Die Daten konnten nicht geladen werden.</strong></p>' +
      '<p>Fehlt <code>data/antraege.js</code> ganz, erzeugt ' +
      '<code>cd scraper &amp;&amp; python3 antraege_holen_lesen.py</code> sie neu.</p>';
  }

  var LS_KEY_LEICHT = 'papierpanther-leichte-sprache';
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === '1'; } catch (err) { /* Storage kann gesperrt sein */ }



  var TEXTE = {
    lede: {
      n: 'Was die Ingolstädter Stadtratsfraktionen beantragen — von der Einreichung bis zur ' +
        'Entscheidung. Status und Zusammenfassung stammen, wo vorhanden, aus der laufenden ' +
        'Aufbereitung dieser Seite.',
      l: 'Was die Parteien im Stadtrat beantragen. Und was daraus wird.',
    },
    sucheLabel:       { n: 'Suchen', l: 'Wort suchen' },
    suchePlaceholder: { n: 'z. B. Tempo 30, Radweg, Kita', l: 'zum Beispiel: Kita' },
    hinweis: {
      n: '<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> Die Anträge ' +
        'stammen aus dem Ratsinfoportal der Stadt Ingolstadt. Verbindlich ist immer das ' +
        'Originaldokument — jeder Antrag verlinkt seine Quelle.',
      l: '<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> Die Anträge ' +
        'stehen im Rats-Info-Portal der Stadt. Das Original-Dokument gilt immer. Jeder Antrag ' +
        'verlinkt dorthin.',
    },
  };

  function txt(schluessel) {
    var e = TEXTE[schluessel];
    return e ? (leicht ? e.l : e.n) : '';
  }

  /* Die sieben Verfahrensstaende aus feed.json in dieselben vier Hinweise
     wie auf der Startseite uebersetzen (feed_bauen.py::status_aus_stand). */
  var STATUS_TEXT = {
    offen:       { n: 'Noch offen – Sie können mitreden', l: 'Noch nicht entschieden. Sie können mitreden.' },
    angenommen:  { n: 'Entschieden: angenommen', l: 'Das ist entschieden: Ja.' },
    abgelehnt:   { n: 'Entschieden: abgelehnt', l: 'Das ist entschieden: Nein.' },
    teilweise:   { n: 'Entschieden: teilweise angenommen', l: 'Das ist entschieden: zum Teil Ja, zum Teil Nein.' },
    protokoll:   { n: 'Ergebnis steht im Protokoll', l: 'Das Ergebnis steht im Protokoll.' },
    info:        { n: 'Nur zur Information, keine Entscheidung', l: 'Nur eine Information. Es gibt keine Entscheidung.' }
  };
  var STAND_ZU_STATUS = {
    'Noch nicht terminiert': ['offen', 'status-offen'],
    'Wird noch beraten': ['offen', 'status-offen'],
    'Entscheidung geplant': ['offen', 'status-offen'],
    'Beschlossen': ['angenommen', 'status-entschieden'],
    'Abgelehnt': ['abgelehnt', 'status-entschieden abgelehnt'],
    'Teilweise beschlossen': ['teilweise', 'status-entschieden'],
    'Entscheidung angesetzt': ['protokoll', 'status-protokoll'],
    'Bekanntgabe': ['info', 'status-info']
  };

  function standBadge(a) {
    var st = a.ref && STAND_ZU_STATUS[a.stand];
    if (st) {
      return el('div', 'stand ' + st[1], STATUS_TEXT[st[0]][leicht ? 'l' : 'n']);
    }
    if (a.in_beratung) {
      return el('div', 'stand stand-unaufbereitet',
        leicht ? 'Steht auf einer Tagesordnung' : 'Im Ratsinfoportal, noch nicht aufbereitet');
    }
    return el('div', 'stand stand-eingereicht',
      leicht ? 'Eingereicht' : 'Eingereicht, noch nicht auf einer Tagesordnung');
  }

  function antragKarte(a) {
    var c = el('article', 'antrag');

    var kopf = el('div', 'antrag-kopf');
    if (a.antragsart) kopf.appendChild(el('span', 'antrag-art', a.antragsart));
    if (a.datum_anzeige) kopf.appendChild(el('span', 'antrag-datum', a.datum_anzeige));
    c.appendChild(kopf);

    c.appendChild(standBadge(a));

    var titelLeicht = leicht && a.klartext_titel_leicht;
    var titel = titelLeicht ? a.klartext_titel_leicht : (a.klartext_titel || a.titel);
    c.appendChild(el('h3', null, titel));

    var textLeicht = leicht && a.klartext_leicht;
    if (textLeicht) {
      c.appendChild(el('p', 'antrag-text', a.klartext_leicht));
    } else if (a.klartext) {
      c.appendChild(el('p', 'antrag-text', a.klartext));
    } else {
      c.appendChild(el('p', 'antrag-hinweis-amtlich',
        leicht ? 'Dazu gibt es noch keine einfache Erklärung. Das ist der amtliche Titel.'
               : 'Noch keine Zusammenfassung — das ist der amtliche Titel aus dem Ratsinfoportal.'));
    }

    var links = el('div', 'antrag-links');
    var l1 = el('a', null, leicht ? 'Im Rats-Info-Portal ansehen' : 'Im Ratsinfoportal prüfen');
    l1.href = a.vorlage_url;
    l1.target = '_blank';
    l1.rel = 'noopener';
    links.appendChild(l1);
    if (a.pdf_url) {
      var l2 = el('a', null, leicht ? 'Original-Dokument' : 'Antragstext (PDF)');
      l2.href = a.pdf_url;
      l2.target = '_blank';
      l2.rel = 'noopener';
      links.appendChild(l2);
    }
    c.appendChild(links);

    return c;
  }

  var aktivePartei = null;
  var suchwoerter = [];

  /* Suchtext je Antrag einmalig vorberechnen: normale und leichte Fassung,
     amtlicher Titel, Partei, Vorlagennummer — unabhaengig vom Sprachmodus. */
  if (D && D.parteien) {
    Object.keys(D.parteien).forEach(function (partei) {
      D.parteien[partei].forEach(function (a) {
        a._suchtext = [
          partei, a.klartext_titel, a.klartext, a.klartext_titel_leicht, a.klartext_leicht,
          a.titel, a.antragsart, a.vorlage
        ].filter(Boolean).join(' ').toLowerCase();
      });
    });
  }

  /* Mehrere Suchwoerter gelten zusammen (UND), in beliebiger Reihenfolge. */
  function passt(a) {
    for (var i = 0; i < suchwoerter.length; i++) {
      if (a._suchtext.indexOf(suchwoerter[i]) === -1) return false;
    }
    return true;
  }

  function treffer(partei) {
    return (D.parteien[partei] || []).filter(passt);
  }

  function baueFilter() {
    var box = document.getElementById('partei-filter');
    box.textContent = '';
    var alle = el('button', 'chip-btn', 'Alle Parteien');
    alle.type = 'button';
    alle.setAttribute('aria-pressed', aktivePartei === null ? 'true' : 'false');
    alle.addEventListener('click', function () { aktivePartei = null; baueFilter(); baueListe(); });
    box.appendChild(alle);

    Object.keys(D.parteien).forEach(function (partei) {
      var anzahl = treffer(partei).length;
      if (!anzahl && aktivePartei !== partei) return;
      var btn = el('button', 'chip-btn');
      btn.type = 'button';
      btn.appendChild(document.createTextNode(partei));
      btn.appendChild(el('span', 'count', ' ' + anzahl));
      btn.setAttribute('aria-pressed', aktivePartei === partei ? 'true' : 'false');
      btn.addEventListener('click', function () {
        aktivePartei = aktivePartei === partei ? null : partei;
        baueFilter();
        baueListe();
      });
      box.appendChild(btn);
    });
  }

  var ERSTE_JE_PARTEI = 5;
  var offen = {};   // Parteien, deren ganze Liste aufgeklappt wurde

  function baueListe() {
    listeEl.textContent = '';
    var parteien = aktivePartei ? [aktivePartei] : Object.keys(D.parteien);
    var irgendwas = false;
    var summe = 0;
    parteien.forEach(function (partei) {
      var antraege = treffer(partei);
      if (!antraege.length) return;
      irgendwas = true;
      summe += antraege.length;
      var gruppe = el('section', 'partei-gruppe');
      gruppe.setAttribute('data-partei', partei);
      gruppe.appendChild(el('h2', null, partei + ' (' + antraege.length + ')'));
      /* In der Uebersicht aller Parteien zuerst nur die neuesten je Partei.
         Vorher standen alle rund 400 Antraege untereinander — am Handy eine
         Seite von 150.000 Pixeln Hoehe, in der die naechste Partei nicht mehr
         zu finden war. Wer eine Partei waehlt oder sucht, sieht alles. */
      var alleZeigen = aktivePartei || suchwoerter.length || offen[partei];
      var sichtbar = alleZeigen ? antraege : antraege.slice(0, ERSTE_JE_PARTEI);
      sichtbar.forEach(function (a) { gruppe.appendChild(antragKarte(a)); });
      if (sichtbar.length < antraege.length) {
        var mehr = el('button', 'mehr-knopf',
          (leicht ? 'Alle {n} Anträge zeigen: ' : 'Alle {n} Anträge anzeigen: ').replace('{n}', antraege.length) + partei);
        mehr.type = 'button';
        mehr.addEventListener('click', function () {
          offen[partei] = true;
          baueListe();
          /* Fokus auf den ersten neu erschienenen Antrag, damit Tastatur und
             Screenreader dort weitermachen, wo die Liste laenger wurde. */
          var gruppen = listeEl.querySelectorAll('.partei-gruppe');
          for (var i = 0; i < gruppen.length; i++) {
            if (gruppen[i].getAttribute('data-partei') !== partei) continue;
            var ziel = gruppen[i].querySelectorAll('.antrag')[ERSTE_JE_PARTEI];
            if (ziel) { ziel.setAttribute('tabindex', '-1'); ziel.focus(); }
          }
        });
        gruppe.appendChild(mehr);
      }
      listeEl.appendChild(gruppe);
    });
    if (!irgendwas) {
      listeEl.appendChild(el('p', 'ladehinweis', 'Keine Anträge gefunden.'));
    }
    document.getElementById('such-status').textContent = suchwoerter.length
      ? (summe === 1 ? '1 Antrag passt zur Suche.' : summe + ' Anträge passen zur Suche.')
      : '';
  }

  function baueStatRow() {
    var box = document.getElementById('stat-row');
    box.textContent = '';
    var st = D.statistik;
    [
      [st.gesamt, 'Anträge gesamt'],
      [st.in_beratung, 'auf einer Tagesordnung'],
      [st.kuratiert, 'davon aufbereitet'],
      [st.nur_eingereicht, 'nur eingereicht'],
    ].forEach(function (paar) {
      var s = el('div');
      s.appendChild(el('div', 'stat-num', String(paar[0])));
      s.appendChild(el('div', 'stat-label', paar[1]));
      box.appendChild(s);
    });
  }

  function texteAnwenden() {
    document.getElementById('txt-lede').textContent = txt('lede');
    document.getElementById('txt-hinweis').innerHTML = txt('hinweis');
    document.getElementById('suche-label').textContent = txt('sucheLabel');
    document.getElementById('suche').setAttribute('placeholder', txt('suchePlaceholder'));
    document.getElementById('quellen-block').textContent =
      (D.quelle_hinweis || '') + ' Abgerufen am ' + datumDe(D.abgerufen_am) + '.';
  }

  if (D && D.parteien) {
    baueStatRow();
    baueFilter();
    baueListe();
  }
  texteAnwenden();

  var sucheInput = document.getElementById('suche');
  var sucheTimer = null;
  sucheInput.addEventListener('input', function () {
    var wert = sucheInput.value;
    clearTimeout(sucheTimer);
    sucheTimer = setTimeout(function () {
      var begriff = wert.trim().toLowerCase();
      suchwoerter = begriff ? begriff.split(/\s+/) : [];
      if (D && D.parteien) { baueFilter(); baueListe(); }
    }, 120);
  });

  var btnLeicht = document.getElementById('btn-leicht');
  btnLeicht.setAttribute('aria-pressed', leicht ? 'true' : 'false');
  btnLeicht.addEventListener('click', function () {
    leicht = !leicht;
    btnLeicht.setAttribute('aria-pressed', leicht ? 'true' : 'false');
    try { localStorage.setItem(LS_KEY_LEICHT, leicht ? '1' : '0'); } catch (err) { /* Storage kann gesperrt sein */ }
    texteAnwenden();
    if (D && D.parteien) { baueFilter(); baueListe(); }
  });
})();
