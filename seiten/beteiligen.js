/* Skript der Seite beteiligen.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  'use strict';

  var LS_KEY_LEICHT = 'papierpanther-leichte-sprache';
  var leicht = false;
  try { leicht = localStorage.getItem(LS_KEY_LEICHT) === '1'; } catch (err) { /* Storage kann gesperrt sein */ }

  var TEXTE = {
    'osm-h2': { n: 'Wege und Orte eintragen', l: 'Wege und Orte eintragen' },
    'osm-intro': {
      n: 'Die Karte „<a href="wege.html">Deine 15 Minuten</a>“ ist nur so gut wie OpenStreetMap, die freie Weltkarte, ' +
        'die Freiwillige pflegen. Was dort fehlt, fehlt auch hier: eine Bank, ein abgesenkter Bordstein, eine Ampel. ' +
        'Jede und jeder kann solche Lücken schließen. Nach dem nächsten Daten-Update erscheinen die Einträge auf der Karte.',
      l: 'Die Karte „<a href="wege.html">Deine 15 Minuten</a>“ kommt von OpenStreetMap. ' +
        'Das ist eine freie Karte im Internet. Viele Menschen tragen dort etwas ein. ' +
        'Fehlt etwas auf der Karte? Dann können Sie es eintragen.',
    },
    'osm-wie': {
      n: 'So geht es: Auf <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">openstreetmap.org</a> ' +
        'die Stelle suchen und „Bearbeiten“ wählen; dafür braucht es ein kostenloses Konto. Am Handy geht es einfacher mit der App ' +
        '<a href="https://streetcomplete.app" target="_blank" rel="noopener noreferrer">StreetComplete</a>, die in der Nähe gezielt ' +
        'nach fehlenden Angaben fragt. Ganz ohne Konto lässt sich ein Hinweis als Notiz auf der Karte hinterlassen, den Freiwillige ' +
        'dann prüfen und eintragen.',
      l: 'So geht es: Gehen Sie auf <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">openstreetmap.org</a>. ' +
        'Dafür brauchen Sie ein Konto. Das kostet nichts. Mit dem Handy geht es leichter. Dafür gibt es die App ' +
        '<a href="https://streetcomplete.app" target="_blank" rel="noopener noreferrer">StreetComplete</a>. ' +
        'Ohne Konto können Sie eine Notiz schreiben. Andere Menschen tragen es dann ein.',
    },
    'osm-cta-text': {
      n: 'Kein Konto, keine Zeit? Eine Notiz an der richtigen Stelle genügt.',
      l: 'Sie haben kein Konto? Schreiben Sie eine Notiz.',
    },
    'osm-lizenz': {
      n: 'Was Sie in OpenStreetMap eintragen, steht unter der Open Database License (ODbL) und darf von allen genutzt werden, ' +
        'auch von dieser Seite. Bitte nur eintragen, was Sie selbst vor Ort gesehen haben.',
      l: 'Was Sie eintragen, dürfen alle benutzen. Tragen Sie nur ein, was Sie selbst gesehen haben.',
    },
    'h1': { n: 'Beteiligen', l: 'Mitmachen' },
    'lede': {
      n: 'Informieren, mitreden, Themen ansprechen oder Antworten holen: Demokratie lebt von Beteiligung und Austausch.',
      l: 'Sie können sich informieren. Sie können mitreden. Sie können Fragen stellen. Demokratie braucht Beteiligung. Und sie braucht Austausch.',
    },
    'hinweis': {
      n: '<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> Diese Seite sammelt nur Links zu offiziellen Kontakt- und Beteiligungsangeboten der Stadt Ingolstadt, des Bezirks Oberbayern und des Beteiligungsportals ingolstadt-macht-mit.de.',
      l: '<strong>PapierPanther ist kein Angebot der Stadt Ingolstadt.</strong> Diese Seite sammelt nur Links. Die Links führen zu offiziellen Seiten: von der Stadt Ingolstadt, vom Bezirk Oberbayern und von der Seite ingolstadt-macht-mit.de.',
    },
    'vertreter-h2': {
      n: 'Sprechen Sie Ihre gewählten Vertreter:innen an',
      l: 'Sprechen Sie mit den gewählten Personen',
    },
    'vertreter-intro': {
      n: 'Jede Ebene hat eigene Mitglieder mit eigenen Kontaktseiten im Ratsinfoportal — von dort lässt sich meist direkt eine Nachricht schreiben.',
      l: 'Es gibt drei Gruppen von gewählten Personen. Jede Gruppe hat eine eigene Kontakt-Seite. Dort finden Sie die Namen. Oft können Sie dort auch eine Nachricht schreiben.',
    },
    'kontakt-stadtrat-titel': { n: 'Stadträtinnen und Stadträte', l: 'Der Stadtrat' },
    'kontakt-stadtrat-text': {
      n: 'Der Stadtrat entscheidet über die großen Linien der Stadtpolitik, vom Haushalt bis zur Bauleitplanung. Sagen Sie den Mitgliedern, was Ihnen wichtig ist.',
      l: 'Der Stadtrat trifft die großen Entscheidungen für Ingolstadt. Zum Beispiel über Geld und über Bau-Pläne. Schreiben Sie den Mitgliedern, was Ihnen wichtig ist.',
    },
    'kontakt-bza-titel': { n: 'Bezirksausschuss-Vertreter:innen', l: 'Der Bezirksausschuss' },
    'kontakt-bza-text': {
      n: 'Die zwölf Bezirksausschüsse sind am nächsten an Ihrem Alltag dran. Sagen Sie Ihrem Ausschuss, was in Ihrem Stadtteil ansteht.',
      l: 'Es gibt 12 Bezirks-Ausschüsse. Sie kümmern sich um Ihren Stadt-Teil. Sagen Sie Ihrem Bezirks-Ausschuss, was bei Ihnen los ist.',
    },
    'kontakt-bezirk-titel': { n: 'Bezirksrätinnen und Bezirksräte', l: 'Der Bezirkstag Oberbayern' },
    'kontakt-bezirk-text': {
      n: 'Der Bezirkstag Oberbayern entscheidet überregional unter anderem über Soziales, Kultur und Krankenhäuser. Auch dort können Sie sich direkt melden.',
      l: 'Der Bezirkstag Oberbayern entscheidet für ganz Oberbayern. Zum Beispiel über Soziales, Kultur und Krankenhäuser. Auch dort können Sie sich melden.',
    },
    'maengel-h2': { n: 'Etwas kaputt oder unsicher? Der Mängelmelder', l: 'Ist etwas kaputt? Der Mängelmelder' },
    'maengel-text': {
      n: 'Schlagloch, kaputte Straßenbeleuchtung, beschädigter Spielplatz oder wilder Müll: Über den Mängelmelder der Stadt Ingolstadt melden Sie das mit Ort und Foto direkt an die zuständige Fachstelle — ganz ohne selbst herauszufinden, wer zuständig ist.',
      l: 'Ist eine Straßen-Lampe kaputt? Oder ein Spielplatz? Liegt Müll herum? Der Mängelmelder ist ein Formular im Internet. Dort melden Sie das der Stadt, mit Ort und Foto. Sie müssen nicht wissen, wer dafür zuständig ist.',
    },
    'maengel-cta-text': {
      n: 'Ihr Anliegen geht direkt an das Bürgerbüro des Oberbürgermeisters und die zuständige Fachstelle.',
      l: 'Ihre Meldung geht direkt an die Stadt.',
    },
    'projekte-h2': { n: 'Beteiligungsprojekte der Stadt', l: 'Mitmach-Projekte der Stadt' },
    'projekte-intro': {
      n: 'Über die direkte Kontaktaufnahme hinaus sammelt das städtische Portal <a href="https://ingolstadt-macht-mit.de" target="_blank" rel="noopener noreferrer">ingolstadt-macht-mit.de<span class="sr-only"> (öffnet in neuem Tab)</span></a> laufende Beteiligungsprojekte, oft mit Umfragen, Workshops oder Online-Karten. Drei aktuelle Beispiele:',
      l: 'Es gibt noch mehr Wege mitzumachen. Die Seite <a href="https://ingolstadt-macht-mit.de" target="_blank" rel="noopener noreferrer">ingolstadt-macht-mit.de<span class="sr-only"> (öffnet in neuem Tab)</span></a> sammelt Mitmach-Projekte der Stadt. Hier sind drei Beispiele:',
    },
    'projekt-mobilitaet-titel': { n: 'Mobilitätsplan Ingolstadt 2040+', l: 'Mobilitäts-Plan Ingolstadt 2040+' },
    'projekt-mobilitaet-text': {
      n: 'Wie soll man sich 2040 in Ingolstadt fortbewegen? Der Mobilitätsplan sammelt dazu Ideen und Rückmeldungen aus der Bürgerschaft.',
      l: 'Wie fahren wir im Jahr 2040 durch Ingolstadt? Bei diesem Projekt können Sie Ihre Ideen dazu sagen.',
    },
    'projekt-laerm-titel': { n: 'Lärmaktionsplanung Stadt Ingolstadt', l: 'Plan gegen Lärm' },
    'projekt-laerm-text': {
      n: 'Wo stört Verkehrslärm besonders? Die Lärmaktionsplanung sucht Problemstellen und schützt zugleich ruhige Gebiete vor mehr Lärm.',
      l: 'Wo ist es zu laut durch Verkehr? Bei diesem Projekt sagen Sie, wo Lärm stört. Ruhige Orte sollen ruhig bleiben.',
    },
    'projekt-isek-titel': { n: 'ISEK 2040+', l: 'ISEK 2040+' },
    'projekt-isek-text': {
      n: 'Das Integrierte Städtebauliche Entwicklungskonzept bündelt, wie sich Ingolstadts Stadtteile langfristig weiterentwickeln sollen, mit eigenen Beteiligungsterminen.',
      l: 'ISEK ist ein großer Plan für die Zukunft von Ingolstadts Stadt-Teilen. Es gibt eigene Termine, bei denen Sie mitreden können.',
    },
    'portal-cta-text': {
      n: 'Alle laufenden und abgeschlossenen Beteiligungsprojekte der Stadt gibt es gesammelt auf ingolstadt-macht-mit.de.',
      l: 'Alle Mitmach-Projekte der Stadt stehen auf ingolstadt-macht-mit.de.',
    },
    'mitmacher-h2': {
      n: 'Bringen Sie Ihre eigene Projektidee ein: die MitmacherINnen',
      l: 'Ihre eigene Idee: die MitmacherINnen',
    },
    'mitmacher-text': {
      n: 'Die Nachhaltigkeitsagenda der Stadt lebt von den „MitmacherINnen“: Bürgerinnen ' +
        'und Bürger, die eigene, alltagspraktische Projektideen für ein nachhaltigeres ' +
        'Ingolstadt einreichen und gemeinsam umsetzen — von einem Stadtwald-Biotop über ' +
        'ein Foodsharing-Café bis zu einer solidarischen Landwirtschaft. Wer eine Idee ' +
        'hat, kann sie einreichen und Mitstreiter:innen finden.',
      l: 'Die Stadt hat einen Plan für mehr Nachhaltigkeit. Er heißt Nachhaltigkeits-' +
        'Agenda. Die „MitmacherINnen“ sind Menschen aus Ingolstadt. Sie haben eigene ' +
        'Ideen für eine bessere Zukunft. Zum Beispiel: ein kleiner Wald mitten in der ' +
        'Stadt. Oder ein Café, in dem man Essen teilt. Haben Sie auch eine Idee? Dann ' +
        'können Sie mitmachen.',
    },
    'mitmacher-cta-text': {
      n: 'Projektidee einreichen oder bei einem bestehenden Projekt mitmachen.',
      l: 'Reichen Sie Ihre Idee ein. Oder machen Sie bei einem Projekt mit.',
    },
  };

  var LINKTEXTE = {
    'link-kontakt-stadtrat': { n: 'Mitglieder des Stadtrats und ihre Kontaktdaten', l: 'Mitglieder vom Stadtrat finden' },
    'link-kontakt-bza': { n: 'Mitglieder der Bezirksausschüsse und ihre Kontaktdaten', l: 'Mitglieder vom Bezirksausschuss finden' },
    'link-kontakt-bezirk': { n: 'Mitglieder des Bezirkstags Oberbayern und ihre Kontaktdaten', l: 'Mitglieder vom Bezirkstag finden' },
    'link-maengel': { n: 'Zum Mängelmelder', l: 'Zum Mängelmelder' },
    'link-projekt-mobilitaet': { n: 'Zum Mobilitätsplan', l: 'Zum Mobilitäts-Plan' },
    'link-projekt-laerm': { n: 'Zur Lärmaktionsplanung', l: 'Zum Lärm-Projekt' },
    'link-projekt-isek': { n: 'Zu ISEK 2040+', l: 'Zu ISEK 2040+' },
    'link-portal-cta': { n: 'Alle Beteiligungsprojekte ansehen', l: 'Alle Mitmach-Projekte ansehen' },
    'link-mitmacher': { n: 'Zu den MitmacherINnen', l: 'Zu den MitmacherINnen' },
    'link-osm-notiz': { n: 'Notiz in OpenStreetMap hinterlassen', l: 'Eine Notiz schreiben' },
  };

  function setLinkText(id, paar) {
    var a = document.getElementById(id);
    if (!a) return;
    a.textContent = paar[leicht ? 'l' : 'n'];
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = ' (öffnet in neuem Tab)';
    a.appendChild(sr);
  }

  function texteAnwenden() {
    Object.keys(TEXTE).forEach(function (id) {
      var el = document.getElementById('txt-' + id);
      if (el) el.innerHTML = TEXTE[id][leicht ? 'l' : 'n'];
    });
    Object.keys(LINKTEXTE).forEach(function (id) {
      setLinkText(id, LINKTEXTE[id]);
    });
  }

  texteAnwenden();

  var btnLeicht = document.getElementById('btn-leicht');
  btnLeicht.setAttribute('aria-pressed', leicht ? 'true' : 'false');
  btnLeicht.addEventListener('click', function () {
    leicht = !leicht;
    btnLeicht.setAttribute('aria-pressed', leicht ? 'true' : 'false');
    try { localStorage.setItem(LS_KEY_LEICHT, leicht ? '1' : '0'); } catch (err) { /* Storage kann gesperrt sein */ }
    texteAnwenden();
  });
})();
