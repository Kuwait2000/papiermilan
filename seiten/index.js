/* Skript der Seite index.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  'use strict';

  var daten = window.FEED;

  // Fehlt data/feed.js, ist die Seite nicht kaputt — sie sagt, was los ist.
  // Haeufigster Fall: per Doppelklick geoeffnet und der Browser laesst keine
  // lokalen Unterdateien zu (Safari ist da streng).
  if (!daten || !daten.eintraege) {
    document.getElementById('feed').innerHTML =
      '<div class="leer"><p><strong>Die Daten konnten nicht geladen werden.</strong></p>' +
      '<p>Falls die Seite per Doppelklick geöffnet wurde: manche Browser ' +
      'verbieten das Nachladen lokaler Dateien. Dann hilft ein kleiner ' +
      'Server im Projektordner:</p>' +
      '<p><code>python3 -m http.server 8000</code><br>' +
      'und dann <code>http://localhost:8000</code> aufrufen.</p>' +
      '<p>Fehlt <code>data/feed.js</code> ganz, erzeugt ' +
      '<code>cd scraper &amp;&amp; python3 feed_bauen.py</code> sie neu.</p></div>';
    return;
  }

  // Beim ersten Aufschlagen bewusst wenige Karten: die Seite soll zum Filtern
  // einladen, nicht mit einer endlosen Liste empfangen. Nach dem Nachladen
  // dann groessere Schritte.
  var ERSTE_SEITE = 8;
  var SEITE = 20;
  var gezeigt = ERSTE_SEITE;
  /* Eintraege ohne Zusammenfassung (nur Titel) blendet die Liste standardmaessig
     aus -- ausser in der Bezirksansicht, wo sie bei den BZA der Grossteil sind.
     null = automatisch, true/false = vom Nutzer umgeschaltet. */
  var mitTiteln = null;

  var ACHSEN = [
    { key: 'bezirk',     textId: 'achseBezirk' },
    { key: 'status',     textId: 'achseStatus' },
    /* oben: eigener Schalter direkt unter dem Seitenkopf (baueEbenen), nicht
       in der Filterliste — siehe dort. */
    { key: 'ebene',      textId: 'achseEbene', oben: true },
    { key: 'lebenslage', textId: 'achseLebenslage', mehr: true },
    { key: 'anlass',     textId: 'achseAnlass', mehr: true }
  ];
  var mehrFilterOffen = false;
  var aktiv = { status: [], lebenslage: [], bezirk: [], anlass: [], ebene: [] };
  var suchbegriff = '';

  /* ---------------- Einfache Sprache ----------------
     Ein Schalter stellt die ganze Seite um, nicht nur die Kartentexte —
     siehe KURATION.md, Abschnitt "Der Umschalter fuer die ganze Seite".
     Texte liegen paarweise (normal/leicht) in TEXTE, damit sie nicht ueber
     das Markup verstreut sind. */
  var LS_KEY_LEICHT = 'papierpanther-leichte-sprache';
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === '1'; } catch (err) { /* Storage kann gesperrt sein */ }

  var TEXTE = {
    disclaimer: {
      n: '<strong>Privates Projekt, kein Angebot der Stadt.</strong> Die Zusammenfassungen entstehen mit KI-Unterstützung und können Fehler enthalten – verbindlich ist das verlinkte Original. <a href="#transparenz">Mehr dazu</a>',
      l: '<strong>Diese Seite ist nicht von der Stadt.</strong> Ein Computer schreibt die Texte. Dabei können Fehler passieren. Das Original ist immer verlinkt. <a href="#transparenz">Mehr dazu</a>'
    },
    heroH1: {
      n: 'Schanzer Stadtpolitik —<br><em>mit einem Klick. Auf einen Blick.</em>',
      l: 'Stadt-Politik in Ingolstadt — <em>leicht erklärt.</em>'
    },
    heroP: {
      n: 'Ob Fahrradbügel, Kita-Plätze oder Gebühren: Der Stadtrat und die zwölf Bezirksausschüsse behandeln jede Woche Themen, die den Alltag in Ingolstadt betreffen. Alles steht öffentlich im Ratsinfoportal — nur eben verteilt über hunderte Einzelpunkte in Amtssprache. Der PapierPanther sammelt sie ein, fasst sie zusammen und sortiert sie danach, wen sie betreffen. Suchen Sie einfach Ihren Stadtbezirk.',
      l: 'Der Stadt-Rat trifft viele Entscheidungen. Die 12 Bezirks-Ausschüsse entscheiden mit. Es geht um Rad-Wege, Kita-Plätze oder Gebühren. Alle Infos stehen im Rats-Info-Portal der Stadt. Aber der Text dort ist schwer zu lesen. Der PapierPanther sammelt die Infos. Er schreibt sie einfacher auf. Er sortiert sie nach Thema. Suchen Sie einfach Ihren Stadt-Bezirk.'
    },
    bezirkStadtweit: { n: 'Ganz Ingolstadt', l: 'Ganz Ingolstadt' },
    bezirkKopfTitel: { n: '{b}: Das ist hier los', l: '{b}: Das passiert hier' },
    bezirkKopfAnzahl: {
      n: '{n} Themen aus Ihrem Stadtbezirk, die neuesten zuerst.',
      l: 'Hier gibt es {n} Themen. Die neuesten stehen oben.'
    },
    bezirkKopfTermin: {
      n: 'Nächste Sitzung des Bezirksausschusses: ',
      l: 'Der Bezirks-Ausschuss trifft sich wieder am: '
    },
    bezirkKopfKeinTermin: {
      n: 'Der nächste Sitzungstermin des Bezirksausschusses ist noch nicht veröffentlicht.',
      l: 'Der nächste Termin vom Bezirks-Ausschuss steht noch nicht fest.'
    },
    bezirkStadtweitDazu: { n: '+ Themen für ganz Ingolstadt', l: '+ Themen für ganz Ingolstadt' },
    bezirkStadtweitWeg: { n: '− Nur mein Bezirk', l: '− Nur mein Bezirk' },
    bezirkAlle: { n: 'Alle Bezirke', l: 'Alle Bezirke' },
    bezirkMitmachen: { n: 'Bezirksausschuss ansprechen', l: 'Mit dem Bezirks-Ausschuss reden' },
    sammelTitel: { n: 'Themen dieser Sitzung', l: 'Diese Themen gab es in der Sitzung' },
    sammelTitelEins: { n: 'Thema dieser Sitzung', l: 'Dieses Thema gab es in der Sitzung' },
    sammelHinweis: {
      n: 'Zu diesen Punkten gibt es noch keine Zusammenfassung — nur den Titel aus der Tagesordnung. Der Link führt zum Original.',
      l: 'Diese Themen sind noch nicht erklärt. Hier steht nur der Name. Der Link führt zum Original.'
    },
    sammelLink: { n: 'Original', l: 'Original' },
    blickTermine: { n: 'Demnächst', l: 'Bald gibt es diese Treffen' },
    blickTermineU: { n: 'Die nächsten Sitzungen', l: 'Hier wird beraten' },
    blickOffen: { n: 'Hier können Sie mitreden', l: 'Hier können Sie mitreden' },
    blickOffenU: { n: 'Noch nicht entschieden – die nächsten zuerst', l: 'Das ist noch nicht entschieden' },
    blickEnt: { n: 'Zuletzt entschieden', l: 'Das wurde entschieden' },
    blickEntU: { n: 'Aus den Protokollen – die erscheinen 4 bis 8 Wochen nach der Sitzung', l: 'Das Protokoll kommt erst einige Wochen nach dem Treffen' },
    blickAlleTermine: { n: 'Alle Termine ({n})', l: 'Alle Termine ({n})' },
    blickAlleOffen: { n: 'Alle offenen Punkte ({n})', l: 'Alle offenen Themen ({n})' },
    blickAlleEnt: { n: 'Alle Entscheidungen ({n})', l: 'Alle Entscheidungen ({n})' },
    blickTO: { n: 'Tagesordnung', l: 'Die Themen' },
    blickTOfolgt: { n: 'Tagesordnung folgt', l: 'Themen kommen noch' },
    blickOriginal: { n: 'Original ansehen', l: 'Original ansehen' },
    mehrFilterAn: { n: 'Mehr Filter: Gremium, Lebenslage, Anlass ▾', l: 'Mehr Auswahl zeigen ▾' },
    mehrFilterAus: { n: 'Weniger Filter ▴', l: 'Weniger Auswahl zeigen ▴' },
    listeTitel: { n: 'Alle Einträge', l: 'Alle Themen' },
    listeUnter: { n: 'Nach Stadtbezirk, Stand oder Stichwort filtern – die neuesten zuerst.', l: 'Hier können Sie suchen. Zum Beispiel nach Ihrem Stadt-Bezirk.' },
    themenTitel: { n: 'Themen im Überblick', l: 'Themen' },
    titelZeigen: { n: 'Auch {n} Punkte ohne Zusammenfassung zeigen (nur Titel)', l: 'Auch {n} Themen ohne Erklärung zeigen' },
    titelVerbergen: { n: 'Nur Einträge mit Zusammenfassung zeigen', l: 'Nur Themen mit Erklärung zeigen' },
    filtersHeadH2: { n: 'Wonach möchten Sie schauen?', l: 'Was möchten Sie sehen?' },
    filtersHint:   { n: 'Mehreres auswählbar', l: 'Sie können mehrere Themen wählen.' },
    filterToggleAn:  { n: 'Filter anzeigen', l: 'Filter zeigen' },
    filterToggleAus: { n: 'Filter ausblenden', l: 'Filter verstecken' },
    filterAktiv:     { n: 'Aktiv: ', l: 'Ausgewählt: ' },
    btnReset:      { n: 'Auswahl zurücksetzen', l: 'Alles löschen' },
    sucheLabel:       { n: 'Suchen', l: 'Wort suchen' },
    suchePlaceholder: { n: 'z. B. Kita, Radweg, Piuspark', l: 'zum Beispiel: Kita' },
    leerFilter: {
      n: 'Keine Einträge für diese Kombination. Filter weiter fassen?',
      l: 'Keine Einträge gefunden. Wählen Sie weniger Filter oder ein anderes Wort.'
    },
    amtlicherWortlaut: { n: 'Amtlicher Wortlaut und Quellen', l: 'Mehr Infos und Links' },
    origLabelTitel: { n: 'Titel im Ratsinfoportal', l: 'So heißt das offiziell' },
    origLabelAntrag: { n: 'Antrag', l: 'Antrag von' },
    origLabelOffenerAntrag: {
      n: 'Antrag, noch keiner Sitzung zugeteilt',
      l: 'Der Antrag hat noch keinen Termin.'
    },
    origLabelWeg: { n: 'Beratungsweg', l: 'Diese Gruppen reden mit' },
    wegHinweis: {
      n: 'Die Rolle ist die geplante Rolle der Sitzung. Ob der Beschluss tatsächlich gefasst oder vertagt wurde, steht nicht in diesen Daten — das ergibt erst die Niederschrift.',
      l: 'Das ist der Plan für die Sitzung. Er kann sich noch ändern. Ob der Stadt-Rat wirklich entschieden hat, steht erst im Protokoll.'
    },
    quelleSitzung: { n: 'Sitzung im Ratsinfoportal', l: 'Zur Sitzung' },
    pruefen: { n: 'Im Ratsinfoportal prüfen', l: 'Beim Stadt-Rat nachlesen' },
    beschlussLink: { n: 'Beschluss in der Niederschrift nachlesen', l: 'Ergebnis im Protokoll lesen' },
    beschlussOffen: {
      n: 'Wie abgestimmt wurde, steht in der Niederschrift der Sitzung. Sie erscheint meist vier bis acht Wochen später.',
      l: 'Wie der Stadt-Rat abgestimmt hat, steht im Protokoll. Das Protokoll kommt meist erst nach 4 bis 8 Wochen.'
    },
    beschlussOriginalLabel: {
      n: 'Amtlicher Beschlusstext (Niederschrift)',
      l: 'So steht es im Protokoll',
    },
    herkunftStadt:   { n: 'Stadtrat/Ausschuss', l: 'Stadt-Rat' },
    herkunftBza:     { n: 'Bezirksausschuss', l: 'Bezirks-Ausschuss' },
    herkunftBezirkObb: { n: 'Bezirk Oberbayern', l: 'Bezirk Oberbayern' },
    herkunftEntwurf: { n: 'automatisch verschlagwortet', l: 'automatisch sortiert' },
    ort: { n: 'Ort: ', l: 'Ort: ' },
    keineLeichteFassung: {
      n: '', l: 'Für dieses Thema gibt es noch keine Einfache-Sprache-Fassung. Hier steht der normale Text.'
    },
    footerH2: { n: 'Wie das hier funktioniert', l: 'So funktioniert diese Seite' },
    footerP1: {
      n: 'Alles auf dieser Seite stammt aus dem Ratsinfoportal der Stadt Ingolstadt — den öffentlich einsehbaren Sitzungskalendern, Tagesordnungen und Vorlagen. Ein Programm liest sie regelmäßig aus, fasst die Punkte mit KI-Unterstützung zusammen und ordnet ihnen Schlagworte zu: für wen es interessant ist, wo es passiert, worum es geht.',
      l: 'Alle Infos kommen vom Rats-Info-Portal der Stadt Ingolstadt. Dort stehen Sitzungs-Termine, Themen-Listen und Dokumente. Das darf jede und jeder lesen. Ein Computer-Programm liest diese Seiten regelmäßig. Es fasst jedes Thema kurz zusammen. Es ordnet jedes Thema: Für wen ist es wichtig? Wo passiert es? Worum geht es?'
    },
    footerP2: {
      n: '<strong>Ich sehe nur einen Teil davon durch, deshalb können Fehler vorkommen.</strong> Was auf den Unterseiten steht, habe ich durchgesehen; die Einträge in der Liste entstehen automatisch und sind nicht einzeln geprüft. Die Zusammenfassungen ersetzen deshalb nicht das Originaldokument, sondern führen dorthin. Bei jedem Eintrag ist die Quelle einen Klick entfernt.',
      l: '<strong>Ich lese nur einen Teil der Texte durch. Darum können Fehler drin sein.</strong> Die Unterseiten habe ich gelesen. Die Einträge in der Liste schreibt ein Computer-Programm. Die lese ich nicht alle einzeln. Darum ersetzt dieser Text nicht das Original-Dokument. Der Text zeigt nur den Weg dorthin. Bei jedem Eintrag gibt es einen Link zur Quelle.'
    },
    footerP3: {
      n: '<strong>Wie aus einem Tagesordnungspunkt ein Eintrag wird,</strong> zeigt eine Fabrik Station für Station: <a href="so-funktionierts.html">So funktioniert’s</a>.',
      l: '<strong>Wie kommt ein Thema auf diese Seite?</strong> Das zeigt eine Fabrik. Schritt für Schritt: <a href="so-funktionierts.html">So geht diese Seite</a>.'
    },
    footerP4: {
      n: '<strong>Etwas gefunden, das nicht stimmt?</strong> Über <a href="impressum.html">das Impressum</a> erreichen Sie mich — Hinweise auf Fehler sind ausdrücklich erwünscht und helfen mir, die Seite zu verbessern.',
      l: 'Haben Sie einen Fehler gefunden? Schreiben Sie mir. Meine Kontakt-Daten stehen im <a href="impressum.html">Impressum</a>. Über Hinweise freue ich mich.'
    },
    footerDank: {
      n: 'PapierPanther folgt der Idee von <a href="https://igorschwarzmann.com/meinbezirk/toolkit/" rel="noopener noreferrer" target="_blank">MeinBezirk<span class="sr-only"> (öffnet in neuem Tab)</span></a>, einem Toolkit von Igor Schwarzmann für kommunale Transparenz.',
      l: 'Der PapierPanther nutzt eine Idee von <a href="https://igorschwarzmann.com/meinbezirk/toolkit/" rel="noopener noreferrer" target="_blank">MeinBezirk<span class="sr-only"> (öffnet in neuem Tab)</span></a>. Das ist ein Werkzeug von Igor Schwarzmann für offene Kommunal-Politik.'
    },
    footerDatenschutz: { n: 'Datenschutz', l: 'Daten-Schutz' },
    footerQuellcode:   { n: 'Quellcode', l: 'Programm-Code' },
    statSitzungen: { n: 'Sitzungen ausgelesen', l: 'Sitzungen gelesen' },
    statTops:      { n: 'Tagesordnungspunkte', l: 'Themen' },
    statKuratiert: { n: 'mit Zusammenfassung', l: 'mit Erklärung' },
    statBezirke:   { n: 'Stadtbezirke', l: 'Stadt-Bezirke' },
    achseLebenslage: { n: 'Lebenslage', l: 'Ihr Leben' },
    achseBezirk:     { n: 'Stadtbezirk', l: 'Ihr Stadt-Bezirk' },
    achseAnlass:     { n: 'Anlass', l: 'Das Thema' },
    achseEbene:      { n: 'Wer berät', l: 'Wer redet darüber?' },
    ebenenTitel:     { n: 'Anzeigen:', l: 'Zeigen:' },
    ebenenOhneObb:   { n: 'Der Bezirk Oberbayern ist ausgeblendet. Er ist eine eigene Ebene neben Stadt und Landkreis und zuständig für Soziales, Kliniken und Kultur in ganz Oberbayern.',
                       l: 'Der Bezirk Oberbayern ist nicht dabei. Er ist größer als die Stadt. Sie können ihn dazu schalten.' },
    ebenenNurObb:    { n: 'Sie sehen nur den Bezirk Oberbayern, nichts aus Ingolstadt.',
                       l: 'Sie sehen nur den Bezirk Oberbayern. Die Stadt Ingolstadt ist nicht dabei.' },
    achseStatus:     { n: 'Stand', l: 'Wie weit ist es?' }
  };

  /* Schlagwortlisten in Einfacher Sprache. Die Werte selbst (aus daten.achsen)
     bleiben die massgeblichen Filterschluessel — nur die Anzeige wechselt. */
  var LEBENSLAGE_LEICHT = {
    'Eltern & Kinder': 'Eltern und Kinder',
    'Jugend': 'Jugend',
    'Studierende': 'Studentinnen und Studenten',
    'Arbeit & Beruf': 'Arbeit und Beruf',
    'Senior:innen': 'Ältere Menschen',
    'Gesundheit & Pflege': 'Gesundheit und Pflege',
    'Geld & Soziales': 'Geld vom Staat',
    'Zuwanderung & Integration': 'Menschen, die neu in Ingolstadt sind',
    'Wohnen & Miete': 'Wohnen und Miete',
    'Gewerbe & Gastro': 'Geschäfte und Restaurants',
    'Unterwegs': 'Verkehr',
    'Freizeit & Sport': 'Freizeit und Sport',
    'Ehrenamt & Vereine': 'Ehren-Amt und Vereine'
  };
  var ANLASS_LEICHT = {
    'Gebühren & Preise': 'Gebühren und Preise',
    'Kinderbetreuung': 'Kinder-Betreuung',
    'Schulbau': 'Schule bauen',
    'Kultur & Bildung': 'Kultur und Bildung',
    'Bauleitplanung': 'Bau-Planung',
    'Verkehrsplanung': 'Verkehrs-Planung',
    'Baustelle': 'Baustelle',
    'Klima & Umwelt': 'Klima und Umwelt',
    'Grün & Sauberkeit': 'Grün-Flächen und Sauberkeit',
    'Sicherheit': 'Sicherheit',
    'Satzung & Regeln': 'Regeln von der Stadt',
    'Konzept & Planung': 'Plan für die Zukunft'
  };
  var BEZIRK_LEICHT = { 'stadtweit': 'in ganz Ingolstadt' };
  var EBENE_LEICHT = {
    'Stadtrat & Ausschüsse': 'Stadt-Rat',
    'Bezirksausschüsse': 'Bezirks-Ausschüsse',
    'Bezirk Oberbayern': 'Bezirk Oberbayern'
  };
  /* Filterchips der Achse "status": nur die zwei Fragen, nach denen man
     sucht (feed_bauen.py::STATUS_FILTER). */
  var STATUS_CHIP = {
    'Noch offen': { n: 'Noch offen – hier können Sie mitreden', l: 'Noch nicht entschieden. Sie können mitreden.' },
    'Entschieden': { n: 'Entschieden', l: 'Schon entschieden' }
  };

  function txt(id) { return TEXTE[id][leicht ? 'l' : 'n']; }

  function achsenwertText(achse, wert) {
    if (achse === 'status' && STATUS_CHIP[wert]) return STATUS_CHIP[wert][leicht ? 'l' : 'n'];
    if (!leicht) return wert;
    if (achse === 'lebenslage') return LEBENSLAGE_LEICHT[wert] || wert;
    if (achse === 'anlass') return ANLASS_LEICHT[wert] || wert;
    if (achse === 'bezirk') return BEZIRK_LEICHT[wert] || wert;
    if (achse === 'ebene') return EBENE_LEICHT[wert] || wert;
    if (achse === 'status' && STATUS_CHIP[wert]) return STATUS_CHIP[wert][leicht ? 'l' : 'n'];
    return wert;
  }

  /* Der Hinweis auf der Karte: einer von vier Zustaenden, mit Datum, wo
     es eins gibt. Die feinen Verfahrensstaende (e.stand) bleiben in den
     Daten, erscheinen aber nicht mehr als Text. */
  function statusHinweis(e) {
    var d = e.stand_datum;
    var klasse = 'stand status-', text;
    if (e.status === 'Noch offen' && e.stand === 'Kommt im Bezirksausschuss') {
      /* Bezirksausschuss, Sitzung steht bevor: oeffentlich, man kann hingehen.
         "Noch nicht entschieden" waere hier zu viel gesagt — die meisten
         BZA-Punkte sind Berichte und Anliegen, kein Beschluss. */
      klasse += 'offen';
      text = leicht ? 'Der Bezirks-Ausschuss spricht darüber' + (d ? ' am ' + d : '') + '. Sie können hingehen.'
                    : 'Kommt im Bezirksausschuss' + (d ? ' am ' + d : '') + ' – die Sitzung ist öffentlich';
    } else if (e.status === 'Noch offen') {
      klasse += 'offen';
      text = leicht ? 'Noch nicht entschieden. Sie können mitreden.'
                    : 'Noch offen – Sie können mitreden';
    } else if (e.status === 'Entschieden') {
      var nein = e.stand === 'Abgelehnt';
      var teils = e.stand === 'Teilweise beschlossen';
      klasse += 'entschieden' + (nein ? ' abgelehnt' : '');
      text = leicht
        ? 'Das ist entschieden: ' + (nein ? 'Nein.' : teils ? 'zum Teil Ja, zum Teil Nein.' : 'Ja.') + (d ? ' (' + d + ')' : '')
        : 'Entschieden: ' + (nein ? 'abgelehnt' : teils ? 'teilweise angenommen' : 'angenommen') + (d ? ' am ' + d : '');
    } else if (e.status === 'Ergebnis steht im Protokoll') {
      klasse += 'protokoll';
      if (e.niederschrift_url) {
        text = leicht ? 'Das Ergebnis steht im Protokoll.' + (d ? ' (Sitzung: ' + d + ')' : '')
                      : 'Ergebnis steht im Protokoll' + (d ? ' (Sitzung am ' + d + ')' : '');
      } else {
        text = leicht ? 'Das Ergebnis steht bald im Protokoll.' + (d ? ' (Sitzung: ' + d + ')' : '')
                      : 'Ergebnis kommt mit dem Protokoll' + (d ? ' (Sitzung am ' + d + ')' : '');
      }
    } else if (e.stand === 'Im Bezirksausschuss behandelt') {
      /* Zu BZA-Punkten gibt es keine Vorlage und kein ausgelesenes Protokoll.
         Ob der Ausschuss etwas beschlossen hat (Buergerhaushalt, Antrag an
         die Stadt), wissen wir nicht — also behaupten wir es auch nicht. */
      klasse += 'info';
      text = leicht ? 'Der Bezirks-Ausschuss hat darüber gesprochen. Das Ergebnis steht hier nicht.'
                    : 'Im Bezirksausschuss behandelt – ein Ergebnis ist hier nicht erfasst';
    } else if (e.stand === 'Steht auf der Tagesordnung') {
      klasse += 'info';
      text = leicht ? 'Darüber wird gesprochen' + (d ? ' am ' + d : '') + '. Eine Entscheidung ist nicht geplant.'
                    : 'Steht auf der Tagesordnung' + (d ? ' am ' + d : '') + ', keine Entscheidung vorgesehen';
    } else {
      klasse += 'info';
      text = leicht ? 'Nur eine Information. Es gibt keine Entscheidung.'
                    : 'Nur zur Information, keine Entscheidung';
    }
    return el('div', klasse, text);
  }

  function el(tag, klasse, text) {
    var n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  }

  /* An jeden target="_blank"-Link gehaengt: das sichtbare ↗-Symbol reicht
     fuer Sehende, Screenreader brauchen eine eigene Ansage. */
  function neuerTabHinweis(a) {
    a.appendChild(el('span', 'sr-only', ' (öffnet in neuem Tab)'));
  }

  /* 'status' ist ein Einzelwert, die anderen Achsen sind Listen. */
  function werte(eintrag, key) {
    var v = eintrag[key];
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  /* ---------------- Kein Datenfile geladen ---------------- */
  if (!daten || !daten.eintraege) {
    document.getElementById('feed').appendChild(
      el('div', 'leer',
        'Keine Daten geladen. Bitte im Ordner scraper/ erst ' +
        'ris_ingolstadt.py und dann feed_bauen.py ausführen.')
    );
    return;
  }

  /* Suchtext je Eintrag einmalig vorberechnen: normale und leichte Fassung,
     Titel, Gremium, Schlagworte — die Suche soll unabhaengig vom Sprach-
     modus alle passenden Eintraege finden. */
  daten.eintraege.forEach(function (e) {
    e._suchtext = [
      e.klartext_titel, e.klartext, e.klartext_titel_leicht, e.klartext_leicht,
      e.amtlicher_titel, e.gremium, e.vorlage, e.antragsteller,
      (e.ort || []).join(' '),
      werte(e, 'lebenslage').join(' '), werte(e, 'bezirk').join(' '), werte(e, 'anlass').join(' ')
    ].filter(Boolean).join(' ').toLowerCase();
  });

  /* Aeltere feed.js ohne diese Felder (vor dem Nutzertest 2026-09-30):
     Achse und Buendelung aus dem vorhandenen ableiten, damit die Seite
     nicht bricht, bis feed_bauen.py wieder gelaufen ist. */
  if (!daten.achsen.status) {
    daten.eintraege.forEach(function (e) {
      e.status = /^(Noch nicht terminiert|Wird noch beraten|Entscheidung geplant|Kommt im Bezirksausschuss)$/.test(e.stand) ? 'Noch offen'
        : /^(Beschlossen|Teilweise beschlossen|Abgelehnt)$/.test(e.stand) ? 'Entschieden'
        : e.stand === 'Entscheidung angesetzt' ? 'Ergebnis steht im Protokoll' : 'Nur zur Information';
    });
    daten.achsen.status = ['Noch offen', 'Entschieden'];
  }
  if (!daten.achsen.ebene) {
    var EBENE_AUS_QUELLE = { stadt: 'Stadtrat & Ausschüsse', bza: 'Bezirksausschüsse', bezirk_obb: 'Bezirk Oberbayern' };
    daten.eintraege.forEach(function (e) { e.ebene = [EBENE_AUS_QUELLE[e.quelle] || EBENE_AUS_QUELLE.stadt]; });
    daten.achsen.ebene = ['Stadtrat & Ausschüsse', 'Bezirksausschüsse', 'Bezirk Oberbayern'];
  }

  /* Die zwoelf Stadtbezirke (I-Mitte ... XII-Muenchener Strasse), ohne
     "stadtweit". Erkennbar an der roemischen Ziffer vorne. */
  function stadtbezirke() {
    return daten.achsen.bezirk.filter(function (b) { return /^[IVX]+-/.test(b); });
  }
  function bezirkNr(b) { var m = /^([IVX]+)-/.exec(b); return m ? m[1] : ''; }
  function bezirkName(b) { return b.replace(/^[IVX]+-/, ''); }

  /* Die Seite ist statisch und wird nicht taeglich neu gebaut — "heute"
     ist deshalb der Tag des Besuchs, nicht der Bautag. */
  function heuteIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ---------------- Auswahl in der Adresse ----------------
     Filter und Suche stehen in der URL (?bezirk=II&lebenslage=Jugend&q=Kita),
     damit man "meinen Bezirk" als Lesezeichen speichern und weiterschicken
     kann. Stadtbezirke kurz als roemische Ziffer; alles andere mit vollem
     Wert, mehrfach wiederholt statt Komma-getrennt (Werte enthalten Kommas). */
  /* ---------------- Ebenen-Schalter ----------------
     Stadtrat, Bezirksausschuesse und Bezirk Oberbayern sind drei verschiedene
     Ebenen. Der Schalter sitzt direkt unter dem Seitenkopf und gilt fuer die
     ganze Seite: Termine, "mitreden", "entschieden" und die Liste. Der Bezirk
     Oberbayern ist anfangs aus — er ist fuer die meisten Besucher nicht das,
     was sie unter "Stadtpolitik" suchen, fuellte aber Termine und Liste. */
  var QUELLE_EBENE = { stadt: 'Stadtrat & Ausschüsse', bza: 'Bezirksausschüsse', bezirk_obb: 'Bezirk Oberbayern' };
  var EBENE_OBB = 'Bezirk Oberbayern';
  function ebeneStandard() {
    var ohne = daten.achsen.ebene.filter(function (w) { return w !== EBENE_OBB; });
    return ohne.length ? ohne : daten.achsen.ebene.slice();
  }
  function gleicheMenge(a, b) {
    return a.length === b.length && a.every(function (w) { return b.indexOf(w) !== -1; });
  }
  function ebeneAn(quelle) {
    return aktiv.ebene.indexOf(QUELLE_EBENE[quelle] || QUELLE_EBENE.stadt) !== -1;
  }
  function baueEbenen() {
    var box = document.getElementById('ebenen-schalter');
    if (!box) return;
    document.getElementById('ebenen-titel').textContent = txt('ebenenTitel');
    box.textContent = '';
    daten.achsen.ebene.forEach(function (wert) {
      var b = el('button', 'chip-btn');
      b.type = 'button';
      var an = aktiv.ebene.indexOf(wert) !== -1;
      b.setAttribute('aria-pressed', an ? 'true' : 'false');
      b.appendChild(document.createTextNode(achsenwertText('ebene', wert)));
      b.addEventListener('click', function () {
        var i = aktiv.ebene.indexOf(wert);
        if (i === -1) aktiv.ebene.push(wert);
        else if (aktiv.ebene.length > 1) aktiv.ebene.splice(i, 1);
        else return;   // die letzte Ebene bleibt an, sonst waere die Seite leer
        gezeigt = ERSTE_SEITE;
        baueEbenen();
        baueFilter();      // Zahlen an den Filterchips haengen an der Ebene
        baueDemnaechst();
        zeichne();
        /* Fokus bleibt auf dem Knopf, obwohl die Leiste neu gebaut wurde */
        var neu = box.querySelectorAll('button')[daten.achsen.ebene.indexOf(wert)];
        if (neu) neu.focus();
      });
      box.appendChild(b);
    });
    var hinweis = document.getElementById('ebenen-hinweis');
    hinweis.textContent = aktiv.ebene.indexOf(EBENE_OBB) === -1 ? txt('ebenenOhneObb')
      : aktiv.ebene.length === 1 ? txt('ebenenNurObb') : '';
  }

  function urlLesen() {
    var p;
    try { p = new URLSearchParams(location.search); } catch (err) { return; }
    ACHSEN.forEach(function (a) {
      var erlaubt = daten.achsen[a.key] || [];
      aktiv[a.key] = [];
      p.getAll(a.key).forEach(function (w) {
        if (a.key === 'bezirk' && /^[IVX]+$/.test(w)) {
          var voll = stadtbezirke().filter(function (b) { return bezirkNr(b) === w; })[0];
          if (voll) w = voll;
        }
        if (erlaubt.indexOf(w) !== -1 && aktiv[a.key].indexOf(w) === -1) aktiv[a.key].push(w);
      });
    });
    /* Ebene: ohne Angabe gilt die Voreinstellung (Stadt und Bezirksausschuesse),
       "ebene=alle" schaltet den Bezirk Oberbayern dazu. */
    if (p.getAll('ebene').indexOf('alle') !== -1) aktiv.ebene = daten.achsen.ebene.slice();
    else if (!aktiv.ebene.length) aktiv.ebene = ebeneStandard();
    var q = p.get('q');
    if (q) { suchbegriff = q.trim().toLowerCase(); document.getElementById('suche').value = q; }
  }

  function urlSchreiben() {
    if (!window.history || !history.replaceState) return;
    var teile = [];
    ACHSEN.forEach(function (a) {
      if (a.key === 'ebene') {
        /* Voreinstellung steht nicht in der Adresse, alles zusammen als "alle" */
        if (gleicheMenge(aktiv.ebene, ebeneStandard())) return;
        if (aktiv.ebene.length === daten.achsen.ebene.length) { teile.push('ebene=alle'); return; }
      }
      aktiv[a.key].forEach(function (w) {
        var v = (a.key === 'bezirk' && bezirkNr(w)) ? bezirkNr(w) : w;
        teile.push(a.key + '=' + encodeURIComponent(v));
      });
    });
    var q = document.getElementById('suche').value.trim();
    if (q) teile.push('q=' + encodeURIComponent(q));
    var neu = location.pathname + (teile.length ? '?' + teile.join('&') : '') + location.hash;
    try { history.replaceState(null, '', neu); } catch (err) { /* file:// o. ae. */ }
  }

  /* ---------------- Kopfzahlen ---------------- */
  var st = daten.statistik;

  function baueHeroStats() {
    var box = document.getElementById('hero-stats');
    box.textContent = '';
    [
      [st.sitzungen_ausgelesen, txt('statSitzungen')],
      [st.tops_ausgelesen, txt('statTops')],
      /* Nur Eintraege mit echtem Text. Bis November 2026 stand hier
         tops_kuratiert als "davon aufbereitet" — darin steckten aber auch
         alle Eintraege, die nur den amtlichen Titel wiederholen. */
      [st.tops_kuratiert - (st.duenn || 0), txt('statKuratiert')],
      [st.stadtbezirke || stadtbezirke().length, txt('statBezirke')]
    ].forEach(function (paar) {
      var box2 = el('div', 'stat');
      box2.appendChild(el('div', 'stat-num', String(paar[0])));
      box2.appendChild(el('div', 'stat-label', paar[1]));
      box.appendChild(box2);
    });
  }

  /* "2023-11" -> "November 2023" */
  function monatText(jm) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(jm));
    var namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
                 'September', 'Oktober', 'November', 'Dezember'];
    return m && namen[+m[2] - 1] ? namen[+m[2] - 1] + ' ' + m[1] : jm;
  }

  function datumDe(iso) {
    var t = String(iso).split('-');
    return t.length === 3 ? t[2] + '.' + t[1] + '.' + t[0] : iso;
  }

  /* Jahresliste als Text: "2025" · "2025 und 2026" · "2023–2024" bei
     durchgehender Folge · sonst "2023, 2024 und 2026". */
  function jahreText(jahre) {
    if (!jahre || !jahre.length) return '';
    if (jahre.length === 1) return jahre[0];
    var zahlen = jahre.map(Number);
    var durchgehend = zahlen.every(function (j, i) {
      return i === 0 || j === zahlen[i - 1] + 1;
    });
    if (durchgehend) return jahre[0] + '–' + jahre[jahre.length - 1];
    return jahre.slice(0, -1).join(', ') + ' und ' + jahre[jahre.length - 1];
  }

  function baueFooterMeta() {
    var quellnamen = Object.keys(daten.quellen).map(function (k) {
      return daten.quellen[k].name;
    });
    /* tops_kuratiert zaehlt Themen (nach Vorlage entdoppelt), tops_abgedeckt
       die tatsaechlich erfassten Tagesordnungspunkte — dieselbe Vorlage laeuft
       oft durch mehrere Gremien. Die Fusszeile nennt beides plus alle Gruende
       fuer die Luecke, nicht nur "Sitzungsroutine" (siehe scraper/pruefen.py). */
    var pct = Math.round((st.tops_abgedeckt / st.tops_ausgelesen) * 100);
    var sonstige = st.tops_sonstige + st.tops_nicht_oeffentlich;
    /* "Erfasst" heisst: steht als Eintrag auf der Seite. Eine echte
       Zusammenfassung hat nur ein Teil davon; der Rest wiederholt den
       amtlichen Titel. Bis November 2026 hiess beides zusammen
       "aufbereitet" — das klang nach mehr, als es war. */
    var nurTitel = st.duenn || 0;
    var mitText = st.tops_kuratiert - nurTitel;
    /* "Aufbereitet: 84 %" klingt gleichmaessig ueber den ganzen Zeitraum —
       ist es nicht: der Rueckstand steckt fast vollstaendig in den aeltesten
       Jahren (siehe scraper/feed_bauen.py::jahre_vollstaendig/jahre_rueckstand).
       Ohne diesen Hinweis wirkt die Luecke wie ein laufendes Problem statt
       ein historischer Nachholbedarf aus der Rueckwaerts-Ausweitung der
       Rohdaten bis November 2023. */
    var jahreHinweis = '';
    if (st.jahre_vollstaendig && st.jahre_vollstaendig.length) {
      jahreHinweis = ' (' + jahreText(st.jahre_vollstaendig) + ' vollständig erfasst';
      if (st.jahre_rueckstand && st.jahre_rueckstand.length) {
        jahreHinweis += ', Rückstand noch bei ' + jahreText(st.jahre_rueckstand);
      }
      jahreHinweis += ')';
    }
    var txt2;
    if (!leicht) {
      txt2 = 'Quellen: ' + quellnamen.join(' · ') +
        ' · Software: Session (Somacos GmbH & Co. KG)' +
        ' · Daten abgerufen am ' + datumDe(daten.daten_abgerufen_am) +
        ' · Zeitraum ' + monatText(daten.zeitraum.von) + ' bis ' + monatText(daten.zeitraum.bis) + jahreHinweis +
        ' · Erfasst: ' + st.tops_abgedeckt + ' von ' + st.tops_ausgelesen +
        ' Tagesordnungspunkten (' + pct + ' %), zusammengefasst zu ' +
        st.tops_kuratiert + ' Themen. Davon haben ' + mitText +
        ' eine Zusammenfassung, ' + nurTitel + ' zeigen nur den amtlichen Titel' +
        ' · Nicht erfasst: ' + st.tops_sitzungsroutine_offen + ' Sitzungsroutine, ' +
        st.tops_beteiligung + ' Aufsichtsrat/Zweckverband, ' +
        st.tops_offen + ' noch offen, ' + sonstige + ' sonstige.';
    } else {
      txt2 = 'Diese Infos kommen von: ' + quellnamen.join(' und ') + '. ' +
        'Die Technik heißt Session (Somacos GmbH & Co. KG). ' +
        'Die Daten sind vom ' + datumDe(daten.daten_abgerufen_am) + '. ' +
        'Der Zeitraum ist ' + monatText(daten.zeitraum.von) + ' bis ' + monatText(daten.zeitraum.bis) + '. ' +
        'Von ' + st.tops_ausgelesen + ' Themen im Rats-Info-Portal stehen ' +
        st.tops_abgedeckt + ' auf dieser Seite (' + pct + ' Prozent), als ' +
        st.tops_kuratiert + ' Karten. ' +
        mitText + ' Karten haben eine Erklärung. ' +
        nurTitel + ' Karten zeigen nur den Titel vom Amt. ' +
        st.tops_sitzungsroutine_offen + ' Themen waren nur Formalie. ' +
        st.tops_beteiligung + ' Themen gehören zu Aufsichtsräten oder Zweckverbänden. ' +
        st.tops_offen + ' Themen sind noch nicht bearbeitet. ' +
        (st.jahre_vollstaendig && st.jahre_vollstaendig.length
          ? 'Für ' + jahreText(st.jahre_vollstaendig) + ' ist schon alles erfasst. '
          : '') +
        (st.jahre_rueckstand && st.jahre_rueckstand.length
          ? 'Bei ' + jahreText(st.jahre_rueckstand) + ' fehlt noch etwas.'
          : '');
    }
    document.getElementById('footer-meta').textContent = txt2;
  }

  /* "Auf einen Blick" (Nutzerfeedback 2026-10-22): drei Fragen statt einer
     langen Liste -- Was steht an? (Termine, siehe ris_ingolstadt.py::
     kommende_termine_auslesen und feed_bauen.py), Wo kann ich mitreden?
     Was wurde entschieden? Die beiden letzten nur Stadt und Bezirks-
     ausschuesse; Bezirk-Oberbayern-Themen haetten sie sonst gefuellt. */
  function herkunftLabel(quelle) {
    if (quelle === 'bza') return txt('herkunftBza');
    if (quelle === 'bezirk_obb') return txt('herkunftBezirkObb');
    return txt('herkunftStadt');
  }

  /* Der Scraper schneidet "Sitzung des/der" ab; der Rest steht im Genitiv
     ("Ausschusses fuer Sport"). Mit dem mitgelieferten Artikel wird daraus
     wieder ein vollstaendiger Name. */
  /* Das Portal setzt bei noch unbestaetigten Terminen "- geplanter
     Sitzungstermin -" in das Ortsfeld — das ist kein Ort. */
  function terminEinzelheiten(t) {
    var ort = /^\s*-.*-\s*$/.test(t.ort || '') ? '' : t.ort;
    return [t.zeit, ort].filter(Boolean);
  }

  function sitzungName(t) {
    return t.artikel ? 'Sitzung ' + t.artikel + ' ' + t.gremium : t.gremium;
  }

  function naechsterBzaTermin(bezirk) {
    var heute = heuteIso();
    return (daten.kommende_termine || []).filter(function (t) {
      return t.quelle === 'bza' && t.datum >= heute && t.gremium.indexOf(bezirk) !== -1;
    })[0] || null;
  }

  function isoAus(d) { var m = /(\d\d)\.(\d\d)\.(\d{4})/.exec(d || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; }
  var WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function kurzDatum(iso) {
    var d = new Date(iso + 'T12:00:00');
    return WOCHENTAG[d.getDay()] + ' ' + iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.';
  }
  function zeigeAlle(status) {
    aktiv.status = [status];
    mitTiteln = null;
    gezeigt = ERSTE_SEITE;
    baueFilter();
    zeichne();
    scrolleZu(document.getElementById('feed-count'));
  }
  function spaltenKopf(box, titel, unter) {
    box.textContent = '';
    box.appendChild(el('h2', null, titel));
    box.appendChild(el('p', 'blick-unter', unter));
  }
  function eintragDetails(e, meta, metaKlasse) {
    var li = el('li');
    var d = el('details');
    d.appendChild(el('summary', null, (leicht && e.klartext_titel_leicht) || e.klartext_titel));
    var text = (leicht && e.klartext_leicht) || e.klartext;
    if (text) d.appendChild(el('p', null, text));
    var a = el('a', null, txt('blickOriginal'));
    a.href = e.vorlage_url || e.sitzung_url; a.target = '_blank'; a.rel = 'noopener';
    neuerTabHinweis(a);
    d.appendChild(a);
    li.appendChild(d);
    if (meta) li.appendChild(el('span', 'blick-meta ' + (metaKlasse || ''), meta));
    return li;
  }

  function baueDemnaechst() {
    var sektion = document.getElementById('demnaechst');
    sektion.hidden = false;
    var heute = heuteIso();

    /* 1. Termine */
    var tb = document.getElementById('blick-termine');
    spaltenKopf(tb, txt('blickTermine'), txt('blickTermineU'));
    var termine = (daten.kommende_termine || []).filter(function (t) { return t.datum >= heute && ebeneAn(t.quelle); });
    function terminLi(t) {
      var li = el('li', 'blick-termin');
      li.appendChild(el('span', 'tag', kurzDatum(t.datum)));
      li.appendChild(el('span', 'wer', sitzungName(t)));
      if (t.tagesordnung_url) {
        var a = el('a', 'to', txt('blickTO'));
        a.href = t.tagesordnung_url; a.target = '_blank'; a.rel = 'noopener';
        neuerTabHinweis(a);
        li.appendChild(a);
      } else {
        li.appendChild(el('span', 'to blick-meta', txt('blickTOfolgt')));
      }
      return li;
    }
    var ul = el('ul', 'blick-liste');
    termine.slice(0, 5).forEach(function (t) { ul.appendChild(terminLi(t)); });
    tb.appendChild(ul);
    if (termine.length > 5) {
      var mb = el('button', 'blick-mehr', txt('blickAlleTermine').replace('{n}', termine.length));
      mb.type = 'button';
      mb.addEventListener('click', function () {
        termine.slice(5).forEach(function (t) { ul.appendChild(terminLi(t)); });
        mb.remove();
      });
      tb.appendChild(mb);
    }

    /* 2. Noch offen: mit festem Termin zuerst, naechster zuerst */
    var ob = document.getElementById('blick-offen');
    spaltenKopf(ob, txt('blickOffen'), txt('blickOffenU'));
    var offen = daten.eintraege.filter(function (e) { return e.status === 'Noch offen' && !e.duenn && ebeneAn(e.quelle); });
    var mitTermin = offen.filter(function (e) { return isoAus(e.stand_datum) >= heute; })
      .sort(function (a, b) { return isoAus(a.stand_datum) < isoAus(b.stand_datum) ? -1 : 1; });
    var auswahl = mitTermin.concat(offen.filter(function (e) { return mitTermin.indexOf(e) === -1; })).slice(0, 4);
    var ul2 = el('ul', 'blick-liste');
    auswahl.forEach(function (e) {
      var d = isoAus(e.stand_datum);
      var meta = d >= heute
        ? (e.stand === 'Entscheidung geplant' ? 'Entscheidung am ' : (leicht ? 'Besprechung am ' : 'Beratung am ')) + e.stand_datum + ' · ' + e.gremium
        : e.gremium;
      ul2.appendChild(eintragDetails(e, meta));
    });
    ob.appendChild(ul2);
    var b2 = el('button', 'blick-mehr', txt('blickAlleOffen').replace('{n}', offen.length));
    b2.type = 'button';
    b2.addEventListener('click', function () { zeigeAlle('Noch offen'); });
    ob.appendChild(b2);

    /* 3. Zuletzt entschieden */
    var eb = document.getElementById('blick-entschieden');
    spaltenKopf(eb, txt('blickEnt'), txt('blickEntU'));
    var ent = daten.eintraege.filter(function (e) { return e.status === 'Entschieden' && !e.duenn && ebeneAn(e.quelle); })
      .sort(function (a, b) { return isoAus(a.stand_datum) > isoAus(b.stand_datum) ? -1 : 1; });
    var ul3 = el('ul', 'blick-liste');
    ent.slice(0, 4).forEach(function (e) {
      var nein = e.stand === 'Abgelehnt';
      var teils = e.stand === 'Teilweise beschlossen';
      var meta = (leicht ? (nein ? 'Nein' : teils ? 'Zum Teil Ja' : 'Ja') : (nein ? 'Abgelehnt' : teils ? 'Teilweise angenommen' : 'Angenommen'))
        + ' am ' + e.stand_datum;
      ul3.appendChild(eintragDetails(e, meta, nein ? 'nein' : 'ja'));
    });
    eb.appendChild(ul3);
    var b3 = el('button', 'blick-mehr', txt('blickAlleEnt').replace('{n}', ent.length));
    b3.type = 'button';
    b3.addEventListener('click', function () { zeigeAlle('Entschieden'); });
    eb.appendChild(b3);
  }

  function texteAnwenden() {
    document.getElementById('disclaimer-text').innerHTML = txt('disclaimer');
    document.getElementById('hero-h1').innerHTML = txt('heroH1');
    document.getElementById('hero-p').textContent = txt('heroP');
    document.getElementById('liste-titel').textContent = txt('listeTitel');
    document.getElementById('liste-unter').textContent = txt('listeUnter');
    document.getElementById('themen-titel').textContent = txt('themenTitel');
    document.getElementById('filters-head-h2').textContent = txt('filtersHeadH2');
    document.getElementById('filters-hint').textContent = txt('filtersHint');
    document.getElementById('btn-reset').textContent = txt('btnReset');
    document.getElementById('filter-toggle-label').textContent =
      txt(btnFilterToggle.getAttribute('aria-expanded') === 'true' ? 'filterToggleAus' : 'filterToggleAn');
    document.getElementById('suche-label').textContent = txt('sucheLabel');
    document.getElementById('suche').setAttribute('placeholder', txt('suchePlaceholder'));
    document.getElementById('footer-h2').textContent = txt('footerH2');
    document.getElementById('footer-p1').textContent = txt('footerP1');
    document.getElementById('footer-p2').innerHTML = txt('footerP2');
    document.getElementById('footer-p3').innerHTML = txt('footerP3');
    document.getElementById('footer-p4').innerHTML = txt('footerP4');
    document.getElementById('footer-dank').innerHTML = txt('footerDank');
    document.getElementById('footer-link-datenschutz').textContent = txt('footerDatenschutz');
    /* textContent wuerde den sr-only-Hinweis "(neuer Tab)" mitloeschen,
       darum hier bewusst Text + Hinweis-Span neu zusammensetzen. */
    var qc = document.getElementById('footer-link-quellcode');
    qc.textContent = txt('footerQuellcode');
    qc.appendChild(el('span', 'sr-only', ' (öffnet in neuem Tab)'));
  }

  /* ---------------- Filter aufbauen ---------------- */
  function anzahlFuer(achse, wert) {
    /* Zaehlt nur, was der Ebenen-Schalter oben gerade zulaesst — sonst stuende
       neben "Jugend" eine Zahl, die die Liste nie zeigt. */
    return daten.eintraege.filter(function (e) {
      return ebeneAn(e.quelle) && werte(e, achse).indexOf(wert) !== -1;
    }).length;
  }

  function baueFilter() {
    var grid = document.getElementById('filter-grid');
    grid.textContent = '';
    var mehrAktiv = ACHSEN.some(function (a) { return a.mehr && aktiv[a.key].length; });
    var mehrBox = el('div', 'filter-mehr');
    mehrBox.id = 'filter-mehr';
    mehrBox.hidden = !(mehrFilterOffen || mehrAktiv);
    ACHSEN.forEach(function (achse) {
      if (achse.oben) return;   // hat seinen eigenen Schalter oben
      var gruppe = el('div', 'filter-group');
      var ueberschrift = el('h3', null, txt(achse.textId));
      ueberschrift.id = 'achse-titel-' + achse.key;
      gruppe.appendChild(ueberschrift);
      /* role="group" + aria-labelledby: Screenreader nennen beim Eintauchen
         in die Chip-Liste die Achse ("Ihr Leben, Gruppe"), nicht nur eine
         Folge namenloser Knoepfe. */
      var opts = el('div', 'filter-opts');
      opts.setAttribute('role', 'group');
      opts.setAttribute('aria-labelledby', ueberschrift.id);

      var werteListe = daten.achsen[achse.key].slice();
      if (achse.key === 'bezirk') {
        /* "Ganz Ingolstadt" ans Ende, wie frueher bei der Bezirkswahl */
        werteListe.sort(function (x, y) { return (x === 'stadtweit') - (y === 'stadtweit'); });
      }
      werteListe.forEach(function (wert) {
        var b = el('button', 'chip-btn');
        b.type = 'button';
        var gedrueckt = aktiv[achse.key].indexOf(wert) !== -1;
        b.setAttribute('aria-pressed', gedrueckt ? 'true' : 'false');
        if (achse.key === 'bezirk' && wert === 'stadtweit') {
          b.appendChild(document.createTextNode(txt('bezirkStadtweit')));
        } else if (achse.key === 'bezirk' && bezirkNr(wert)) {
          /* Leerzeichen als eigener Text: der zugaengliche Name lautet dann
             "II Nordwest" wie sichtbar. Ein aria-label "II-Nordwest" wich davon
             ab, und Sprachsteuerung fand den Knopf nicht (WCAG 2.5.3). */
          b.appendChild(el('span', 'nr', bezirkNr(wert)));
          b.appendChild(document.createTextNode(' ' + bezirkName(wert) + ' '));
        } else {
          b.appendChild(document.createTextNode(achsenwertText(achse.key, wert)));
        }
        b.appendChild(el('span', 'count', String(anzahlFuer(achse.key, wert))));
        b.addEventListener('click', function () {
          var liste = aktiv[achse.key];
          var i = liste.indexOf(wert);
          if (i === -1) { liste.push(wert); b.setAttribute('aria-pressed', 'true'); }
          else { liste.splice(i, 1); b.setAttribute('aria-pressed', 'false'); }
          gezeigt = ERSTE_SEITE;   // neue Auswahl faengt wieder oben an
          aktualisiereFilterZusammenfassung();
          zeichne();
        });
        opts.appendChild(b);
      });

      gruppe.appendChild(opts);
      (achse.mehr ? mehrBox : grid).appendChild(gruppe);
    });
    var mb = el('button', 'btn-mehr-filter', txt(mehrBox.hidden ? 'mehrFilterAn' : 'mehrFilterAus'));
    mb.type = 'button';
    mb.setAttribute('aria-expanded', mehrBox.hidden ? 'false' : 'true');
    mb.setAttribute('aria-controls', 'filter-mehr');
    mb.addEventListener('click', function () {
      mehrFilterOffen = mehrBox.hidden;
      mehrBox.hidden = !mehrBox.hidden;
      mb.setAttribute('aria-expanded', mehrBox.hidden ? 'false' : 'true');
      mb.textContent = txt(mehrBox.hidden ? 'mehrFilterAn' : 'mehrFilterAus');
    });
    grid.appendChild(mb);
    grid.appendChild(mehrBox);
    aktualisiereFilterZusammenfassung();
  }

  /* ---------------- Filter-Umschalter (mobil) ----------------
     Bei 42 Chips beginnt der Feed sonst erst nach drei Bildschirmhoehen
     Scrollen. Auf schmalen Breiten startet die Filterliste eingeklappt;
     eine Zusammenfassung zeigt, was gerade ausgewaehlt ist, auch wenn die
     Liste selbst zu ist. Auf dem Desktop greift die Klasse nicht — dort
     blendet CSS den Umschalter komplett aus. */
  var filterSpalte = document.querySelector('.filter-spalte');
  var btnFilterToggle = document.getElementById('btn-filter-toggle');

  function aktualisiereFilterZusammenfassung() {
    var namen = [];
    ACHSEN.forEach(function (a) {
      if (a.oben) return;
      aktiv[a.key].forEach(function (w) { namen.push(achsenwertText(a.key, w)); });
    });
    var box = document.getElementById('filter-aktiv-zusammenfassung');
    box.textContent = namen.length ? txt('filterAktiv') + namen.join(', ') : '';
    var zaehler = btnFilterToggle.querySelector('.toggle-count');
    if (zaehler) zaehler.remove();
    if (namen.length) {
      var span = el('span', 'toggle-count count', ' (' + namen.length + ')');
      btnFilterToggle.insertBefore(span, btnFilterToggle.querySelector('.chevron'));
    }
  }

  btnFilterToggle.addEventListener('click', function () {
    var offen = filterSpalte.classList.toggle('offen');
    btnFilterToggle.setAttribute('aria-expanded', offen ? 'true' : 'false');
    document.getElementById('filter-toggle-label').textContent =
      txt(offen ? 'filterToggleAus' : 'filterToggleAn');
  });

  var sucheInput = document.getElementById('suche');
  var sucheTimer = null;
  sucheInput.addEventListener('input', function () {
    var wert = sucheInput.value;
    clearTimeout(sucheTimer);
    sucheTimer = setTimeout(function () {
      suchbegriff = wert.trim().toLowerCase();
      gezeigt = ERSTE_SEITE;
      zeichne();
    }, 120);
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    ACHSEN.forEach(function (a) { aktiv[a.key] = []; });
    aktiv.ebene = ebeneStandard();
    baueEbenen();
    baueDemnaechst();
    suchbegriff = '';
    sucheInput.value = '';
    gezeigt = ERSTE_SEITE;
    baueFilter();   // ruft aktualisiereFilterZusammenfassung() mit auf
    zeichne();
  });

  var btnLeicht = document.getElementById('btn-leicht');
  btnLeicht.setAttribute('aria-pressed', leicht ? 'true' : 'false');
  btnLeicht.addEventListener('click', function () {
    leicht = !leicht;
    btnLeicht.setAttribute('aria-pressed', leicht ? 'true' : 'false');
    try { localStorage.setItem(LS_KEY_LEICHT, leicht ? '1' : '0'); } catch (err) { /* Storage kann gesperrt sein */ }
    texteAnwenden();
    baueHeroStats();
    baueEbenen();
    baueFilter();
    baueFooterMeta();
    baueDemnaechst();
    gezeigt = ERSTE_SEITE;
    zeichne();
  });

  /* ---------------- Karten ---------------- */
  /* Mehrere Suchwoerter gelten zusammen (UND): "gruene tempo 30" findet
     Eintraege, in denen "gruene", "tempo" und "30" irgendwo vorkommen. */
  var suchwoerterFuer = null, suchwoerter = [];
  function suchwoerterAktuell() {
    if (suchwoerterFuer !== suchbegriff) {
      suchwoerterFuer = suchbegriff;
      suchwoerter = suchbegriff ? suchbegriff.split(/\s+/) : [];
    }
    return suchwoerter;
  }

  function passt(eintrag) {
    var woerter = suchwoerterAktuell();
    for (var i = 0; i < woerter.length; i++) {
      if (eintrag._suchtext.indexOf(woerter[i]) === -1) return false;
    }
    return ACHSEN.every(function (a) {
      var gewaehlt = aktiv[a.key];
      if (!gewaehlt.length) return true;
      var vorhanden = werte(eintrag, a.key);
      return gewaehlt.some(function (w) { return vorhanden.indexOf(w) !== -1; });
    });
  }

  function karte(e) {
    var c = el('article', 'card' + (e.quelle !== 'stadt' ? ' quelle-' + e.quelle : ''));

    var kopf = el('div', 'card-head');
    kopf.appendChild(el('span', 'card-date', e.datum_anzeige));
    kopf.appendChild(el('span', 'card-gremium', e.gremium));
    if (e.quelle === 'bza') {
      kopf.appendChild(el('span', 'herkunft bza', txt('herkunftBza')));
    } else if (e.quelle === 'bezirk_obb') {
      kopf.appendChild(el('span', 'herkunft bezirk_obb', txt('herkunftBezirkObb')));
    }
    /* "maschineller Entwurf" war zu pauschal: die Ueberschrift ist bei diesen
       Eintraegen der Titel aus dem Ratsinfoportal, nur von Aktenzeichen
       befreit. Maschinell geraten sind allein die Schlagworte — und genau das
       sagt der Hinweis jetzt. */
    if (e.entwurf) {
      kopf.appendChild(el('span', 'herkunft entwurf', txt('herkunftEntwurf')));
    }
    c.appendChild(kopf);

    var titelLeicht = leicht && e.klartext_titel_leicht;
    c.appendChild(el('h3', null, titelLeicht ? e.klartext_titel_leicht : e.klartext_titel));

    /* Bei Entwuerfen ist der Klartext leer — dann nichts erfinden. Fehlt in
       der Einfachen Sprache nur die Uebersetzung, faellt die Karte sichtbar
       auf die normale Fassung zurueck (KURATION.md). */
    if (leicht && e.klartext_leicht) {
      c.appendChild(el('p', 'card-text', e.klartext_leicht));
    } else if (e.klartext) {
      c.appendChild(el('p', 'card-text', e.klartext));
      if (leicht) c.appendChild(el('p', 'leicht-hinweis', txt('keineLeichteFassung')));
    }

    /* Stand: einer von vier Hinweisen — auch "keine Entscheidung" ist eine
       Information. */
    if (e.status) c.appendChild(statusHinweis(e));

    /* Woertlicher Beschlusstext aus der Niederschrift (scraper/
       niederschriften_lesen.py) — optisch abgesetzt von der redaktionellen
       Zusammenfassung oben, damit klar bleibt: das ist Originalzitat. */
    if (e.beschluss) {
      var bd = el('details', 'beschluss-original');
      bd.appendChild(el('summary', null, txt('beschlussOriginalLabel')));
      bd.appendChild(el('p', null, e.beschluss.text));
      c.appendChild(bd);
    }

    /* Freier Ortsvermerk, kein Filter */
    if (e.ort && e.ort.length) {
      c.appendChild(el('div', 'ortsvermerk', txt('ort') + e.ort.join(', ')));
    }

    var chips = el('div', 'chips');
    ['lebenslage', 'bezirk', 'anlass'].forEach(function (key) {
      werte(e, key).forEach(function (w) {
        chips.appendChild(el('span', 'chip ' + key, achsenwertText(key, w)));
      });
    });
    c.appendChild(chips);

    /* Quelle immer sichtbar — nicht erst nach dem Aufklappen */
    var pruef = el('div', 'pruefen');
    var pl = el('a', 'pruef-link',
      txt('pruefen') + (e.vorlage ? ' · ' + e.vorlage : ''));
    pl.href = e.vorlage_url || e.sitzung_url;
    pl.target = '_blank';
    pl.rel = 'noopener';
    neuerTabHinweis(pl);
    pruef.appendChild(pl);

    /* Beschlussergebnis: nur die Niederschrift belegt, wie abgestimmt wurde.
       Sie wird erst nach Genehmigung in der Folgesitzung veroeffentlicht —
       fehlt sie, ist das der Grund, und den sagen wir statt zu schweigen. */
    if (e.niederschrift_url) {
      var bl = el('a', 'beschluss', txt('beschlussLink'));
      bl.href = e.niederschrift_url;
      bl.target = '_blank';
      bl.rel = 'noopener';
      neuerTabHinweis(bl);
      pruef.appendChild(bl);
    } else if (e.stand && e.stand.indexOf('Entscheidung') === 0) {
      pruef.appendChild(el('span', 'beschluss-offen', txt('beschlussOffen')));
    }
    c.appendChild(pruef);

    /* Original + Quellen */
    var det = el('details', 'card-orig');
    var sum = el('summary');
    sum.appendChild(document.createTextNode(
      txt('amtlicherWortlaut') + (e.vorlage ? ' · ' + e.vorlage : '')
    ));
    det.appendChild(sum);

    var body = el('div', 'orig-body');
    body.appendChild(el('span', 'orig-label', txt('origLabelTitel')));
    body.appendChild(el('div', 'orig-title', e.amtlicher_titel));

    if (e.antragsteller) {
      body.appendChild(el('span', 'orig-label', txt('origLabelAntrag')));
      body.appendChild(el('div', 'orig-title', e.antragsteller));
    }

    /* Beratungsweg: welches Gremium wann und in welcher Rolle befasst war */
    if (e.beratungsweg && e.beratungsweg.length) {
      body.appendChild(el('span', 'orig-label', txt('origLabelWeg')));
      var weg = el('ol', 'weg');
      e.beratungsweg.forEach(function (s) {
        var li = el('li');
        li.appendChild(el('span', 'weg-rolle', s.rolle));
        li.appendChild(document.createTextNode(
          ' · ' + s.datum_anzeige + ' · ' + s.gremium + ' · TOP ' + s.top_nr
        ));
        if (s.sitzung_url) {
          var wl = el('a', 'weg-link', txt('quelleSitzung'));
          wl.href = s.sitzung_url; wl.target = '_blank'; wl.rel = 'noopener';
          neuerTabHinweis(wl);
          li.appendChild(document.createTextNode(' '));
          li.appendChild(wl);
        }
        weg.appendChild(li);
      });
      body.appendChild(weg);
      body.appendChild(el('div', 'weg-hinweis', txt('wegHinweis')));
    }

    /* Ein offener Antrag (siehe antraege_offen.py) hat keinen Sitzungs-TOP —
       top_nr bleibt dann leer. Statt einer leeren "Tagesordnungspunkt ·
       Sitzung"-Zeile und einem zweiten Link auf dieselbe Vorlage-URL gibt es
       hier nur den erklärenden Hinweis. */
    if (e.top_nr) {
      body.appendChild(el('span', 'orig-label',
        leicht
          ? 'Punkt ' + e.top_nr + ' in der Sitzung ' + e.sitzung_kennung
          : 'Tagesordnungspunkt ' + e.top_nr + ' · Sitzung ' + e.sitzung_kennung));
    } else {
      body.appendChild(el('span', 'orig-label', txt('origLabelOffenerAntrag')));
    }

    var links = el('div', 'quellen');
    if (e.top_nr) {
      var a1 = el('a', 'quelle-link', txt('quelleSitzung'));
      a1.href = e.sitzung_url; a1.target = '_blank'; a1.rel = 'noopener';
      neuerTabHinweis(a1);
      links.appendChild(a1);
    }

    if (e.vorlage_url) {
      var a2 = el('a', 'quelle-link', (leicht ? 'Dokument ' : 'Vorlage ') + e.vorlage);
      a2.href = e.vorlage_url; a2.target = '_blank'; a2.rel = 'noopener';
      neuerTabHinweis(a2);
      links.appendChild(a2);
    }
    e.dokumente.forEach(function (d) {
      var a = el('a', 'quelle-link', d.titel);
      a.href = d.url; a.target = '_blank'; a.rel = 'noopener';
      neuerTabHinweis(a);
      links.appendChild(a);
    });
    body.appendChild(links);
    det.appendChild(body);
    c.appendChild(det);

    return c;
  }

  /* Eine kompakte Karte fuer alle "duennen" Eintraege einer Sitzung (nur
     Titel, keine Zusammenfassung; siehe feed_bauen.py::ist_duenn). */
  function sammelkarte(gruppe) {
    var e0 = gruppe[0];
    var c = el('article', 'card card-sammel' + (e0.quelle !== 'stadt' ? ' quelle-' + e0.quelle : ''));
    var kopf = el('div', 'card-head');
    kopf.appendChild(el('span', 'card-date', e0.datum_anzeige));
    kopf.appendChild(el('span', 'card-gremium', e0.gremium));
    if (e0.quelle === 'bza') kopf.appendChild(el('span', 'herkunft bza', txt('herkunftBza')));
    else if (e0.quelle === 'bezirk_obb') kopf.appendChild(el('span', 'herkunft bezirk_obb', txt('herkunftBezirkObb')));
    c.appendChild(kopf);
    c.appendChild(el('h3', null, txt(gruppe.length > 1 ? 'sammelTitel' : 'sammelTitelEins')));

    var ul = el('ul', 'sammel-liste');
    gruppe.forEach(function (e) {
      var li = el('li');
      li.appendChild(el('span', null, (leicht && e.klartext_titel_leicht) || e.klartext_titel));
      var a = el('a', null, txt('sammelLink'));
      a.href = e.vorlage_url || e.sitzung_url;
      a.target = '_blank'; a.rel = 'noopener';
      neuerTabHinweis(a);
      li.appendChild(a);
      ul.appendChild(li);
    });
    c.appendChild(ul);

    /* Stand nur zeigen, wenn er fuer alle Punkte gleich ist — sonst luegt er
       fuer einen Teil. */
    var gleich = gruppe.every(function (e) {
      return e.status === e0.status && e.stand_datum === e0.stand_datum &&
        !!e.niederschrift_url === !!e0.niederschrift_url;
    });
    if (e0.status && gleich) c.appendChild(statusHinweis(e0));
    c.appendChild(el('p', 'sammel-hinweis', txt('sammelHinweis')));
    return c;
  }

  /* Duenne Eintraege derselben Sitzung zu einem Block zusammenfassen, an der
     Stelle des ersten. Volle Karten bleiben einzeln. */
  function anzeigeListe(treffer) {
    var liste = [];
    var gruppen = {};
    treffer.forEach(function (e) {
      if (!e.duenn) { liste.push({ eintrag: e }); return; }
      var k = e.quelle + '|' + (e.sitzung_url || e.ref);
      if (!gruppen[k]) { gruppen[k] = []; liste.push({ gruppe: gruppen[k] }); }
      gruppen[k].push(e);
    });
    return liste;
  }

  /* Die Kopfleiste klebt oben (auf dem Handy dreizeilig) — ohne Abzug
     verschwaende die Ueberschrift des Ziels darunter. */
  function scrolleZu(ziel) {
    var kopf = document.querySelector('.site-header');
    var abzug = (kopf ? kopf.getBoundingClientRect().height : 0) + 12;
    var ruhig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: ziel.getBoundingClientRect().top + window.pageYOffset - abzug,
      behavior: ruhig ? 'auto' : 'smooth'
    });
  }

  /* Kopf der Bezirksansicht: genau ein Stadtbezirk gewaehlt (optional plus
     "stadtweit"). Nennt, was dort los ist und wann der Bezirksausschuss als
     Naechstes tagt — dort kann man hingehen. */
  function zeichneBezirkKopf(treffer) {
    var kopf = document.getElementById('bezirk-kopf');
    var gewaehlt = aktiv.bezirk.filter(function (b) { return bezirkNr(b); });
    if (gewaehlt.length !== 1) { kopf.hidden = true; kopf.textContent = ''; return; }
    var b = gewaehlt[0];
    kopf.hidden = false;
    kopf.textContent = '';
    kopf.appendChild(el('h2', null, txt('bezirkKopfTitel').replace('{b}', b)));
    var anzahl = treffer.filter(function (e) { return werte(e, 'bezirk').indexOf(b) !== -1; }).length;
    kopf.appendChild(el('p', null, txt('bezirkKopfAnzahl').replace('{n}', anzahl)));

    var t = naechsterBzaTermin(b);
    var tp = el('p', 'termin');
    if (t) {
      tp.appendChild(el('strong', null, txt('bezirkKopfTermin')));
      tp.appendChild(document.createTextNode(
        t.datum_anzeige + terminEinzelheiten(t).map(function (x) { return ' · ' + x; }).join('')));
    } else {
      tp.textContent = txt('bezirkKopfKeinTermin');
    }
    kopf.appendChild(tp);

    var akt = el('div', 'bezirk-kopf-aktionen');
    var mitStadt = aktiv.bezirk.indexOf('stadtweit') !== -1;
    var bs = el('button', null, txt(mitStadt ? 'bezirkStadtweitWeg' : 'bezirkStadtweitDazu'));
    bs.type = 'button';
    bs.addEventListener('click', function () {
      aktiv.bezirk = mitStadt ? [b] : [b, 'stadtweit'];
      gezeigt = ERSTE_SEITE;
      baueFilter();
      zeichne();
    });
    akt.appendChild(bs);
    var ba = el('button', null, txt('bezirkAlle'));
    ba.type = 'button';
    ba.addEventListener('click', function () {
      aktiv.bezirk = [];
      gezeigt = ERSTE_SEITE;
      baueFilter();
      zeichne();
      scrolleZu(document.getElementById('filter'));
    });
    akt.appendChild(ba);
    var bm = el('a', null, txt('bezirkMitmachen'));
    bm.href = 'beteiligen.html';
    akt.appendChild(bm);
    kopf.appendChild(akt);
  }

  /* Nach "Weitere anzeigen" baut zeichne() den kompletten Feed neu auf —
     der button verschwindet dabei aus dem DOM, und der Fokus faellt sonst
     kommentarlos auf <body>. Bis zu diesem Index wird nach dem naechsten
     Aufbau die erste neue Karte fokussiert, statt den Fokus zu verlieren. */
  var fokusNachRender = null;

  function zeichne() {
    var alleTreffer = daten.eintraege.filter(passt);
    var einBezirk = aktiv.bezirk.filter(function (b) { return bezirkNr(b); }).length === 1;
    var zeigeTitel = mitTiteln === null ? einBezirk : mitTiteln;
    var titelAnzahl = alleTreffer.filter(function (e) { return e.duenn; }).length;
    var treffer = zeigeTitel ? alleTreffer : alleTreffer.filter(function (e) { return !e.duenn; });
    var feed = document.getElementById('feed');
    feed.textContent = '';
    urlSchreiben();
    zeichneBezirkKopf(treffer);

    /* Der Ebenen-Schalter zaehlt nur als Auswahl, wenn er enger steht als
       die Voreinstellung (etwa: nur Bezirksausschuesse). */
    var ebeneEng = !gleicheMenge(aktiv.ebene, ebeneStandard()) && aktiv.ebene.length < daten.achsen.ebene.length;
    var gewaehlt = ACHSEN.reduce(function (n, a) { return n + (a.oben ? 0 : aktiv[a.key].length); }, 0)
      + (suchbegriff ? 1 : 0) + (ebeneEng ? 1 : 0);
    document.getElementById('feed-count').textContent =
      gewaehlt === 0
        ? (leicht
            ? treffer.length + (aktiv.ebene.indexOf(EBENE_OBB) === -1
                ? ' Einträge. Das sind alle Themen aus Ingolstadt.' : ' Einträge. Das sind alle Themen.')
            : treffer.length + ' Einträge mit Zusammenfassung, die neuesten zuerst')
        : (leicht
            ? treffer.length + ' Einträge passen zu Ihrer Wahl.'
            : treffer.length + ' Einträge passen zu Ihrer Auswahl');

    if (titelAnzahl) {
      var um = el('button', 'titel-umschalter',
        zeigeTitel ? txt('titelVerbergen') : txt('titelZeigen').replace('{n}', titelAnzahl));
      um.type = 'button';
      um.addEventListener('click', function () { mitTiteln = !zeigeTitel; gezeigt = ERSTE_SEITE; zeichne(); });
      feed.appendChild(um);
    }

    if (!treffer.length) {
      feed.appendChild(el('div', 'leer', txt('leerFilter')));
      return;
    }

    var anzeige = anzeigeListe(treffer);
    var karten = anzeige.slice(0, gezeigt).map(function (x) {
      var c = x.gruppe ? sammelkarte(x.gruppe) : karte(x.eintrag);
      feed.appendChild(c);
      return c;
    });

    if (fokusNachRender !== null) {
      var ziel = karten[fokusNachRender];
      if (ziel) {
        var ueberschrift = ziel.querySelector('h3');
        ueberschrift.setAttribute('tabindex', '-1');
        ueberschrift.focus();
      }
      fokusNachRender = null;
    }

    if (anzeige.length > gezeigt) {
      var rest = anzeige.length - gezeigt;
      var mehrText = leicht
        ? Math.min(SEITE, rest) + ' mehr zeigen (' + rest + ' bleiben übrig)'
        : 'Weitere ' + Math.min(SEITE, rest) + ' anzeigen (' + rest + ' übrig)';
      var mehr = el('button', 'btn-mehr', mehrText);
      mehr.type = 'button';
      mehr.addEventListener('click', function () {
        fokusNachRender = gezeigt;   // Index der ersten neuen Karte
        gezeigt += SEITE;
        zeichne();
      });
      feed.appendChild(mehr);
    }
  }

  urlLesen();
  texteAnwenden();
  baueHeroStats();
  baueEbenen();
  baueFilter();
  baueFooterMeta();
  baueDemnaechst();
  zeichne();
})();
