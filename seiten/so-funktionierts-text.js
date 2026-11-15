/* Skript der Seite so-funktionierts.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  'use strict';
  var KEY = 'papierpanther-leichte-sprache';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };
  var Z = window.FABRIK_ZAHLEN || {};
  var fmt = function (n) { return Math.round(n).toLocaleString('de-DE'); };
  var REPO = 'https://github.com/mnkeller/papierpanther/blob/main/';

  /* Texte: [normal, Leichte Sprache] */
  var T = {
    'kicker': ['So funktioniert’s', 'So geht diese Seite'],
    'h1': ['Wie aus einem Tagesordnungspunkt ein Eintrag wird', 'So kommt ein Thema auf diese Seite'],
    'lede': ['Alles auf dieser Seite stammt aus dem Ratsinfoportal der Stadt Ingolstadt: den öffentlich einsehbaren Sitzungskalendern, Tagesordnungen und Vorlagen. Ein Programm liest sie regelmäßig aus, fasst die Punkte mit KI-Unterstützung zusammen und ordnet ihnen Schlagworte zu. Die Fabrik unten zeigt die Schritte einzeln.',
             'Alle Infos kommen vom Rats-Info-Portal der Stadt Ingolstadt. Das darf jede und jeder lesen. Ein Computer-Programm liest diese Seiten regelmäßig. Eine KI schreibt dann kurze Texte dazu. Die Fabrik unten zeigt jeden Schritt.'],
    'fehler': ['<strong>Ich sehe nur einen Teil davon durch, deshalb können Fehler vorkommen.</strong> Was auf den Unterseiten steht, habe ich durchgesehen; die Einträge in der Liste entstehen automatisch und sind nicht einzeln geprüft. Die Zusammenfassungen ersetzen nicht das Originaldokument, sondern führen dorthin.',
               '<strong>Ich lese nur einen Teil der Texte durch. Darum können Fehler drin sein.</strong> Die Einträge in der Liste schreibt ein Computer-Programm. Richtig ist immer das Original-Dokument. Es ist bei jedem Eintrag verlinkt.'],
    'scroll': ['Scrollen Sie weiter: Die Kamera fährt durch die Fabrik, Station für Station.', 'Scrollen Sie nach unten. Dann sehen Sie jede Station.'],
    'ecke1': ['<i></i><b>Rot</b> = das Beispiel', '<i></i><b>Rot</b> = das Beispiel'],
    'ecke2': ['Grau = alle anderen Punkte', 'Grau = alle anderen Themen'],
    'nogl': ['Die 3D-Ansicht braucht WebGL. Dieser Browser bietet es gerade nicht an. Die Texte führen trotzdem durch alle Stationen.', 'Die Bilder gehen in diesem Browser nicht. Die Texte zeigen trotzdem jede Station.'],
    'stueck-lab': ['Beispiel · Tempo 30', 'Beispiel: Tempo 30'],
    'code-lab': ['Im Quellcode', 'Im Programm-Code'],
    'h-sehen': ['Was Sie hier sehen und was nicht', 'Das zeigt diese Seite, und das zeigt sie nicht'],
    'sehen': ['Die Seite zeigt, worüber beraten wird und wo entschieden werden soll. Wie eine Abstimmung ausgegangen ist, steht in der Niederschrift der Sitzung. Die wird erst etwa vier bis acht Wochen später veröffentlicht. Sobald sie vorliegt, verlinkt der Eintrag sie. Nicht-öffentliche Sitzungsteile sind naturgemäß nicht dabei.',
              'Die Seite zeigt, worüber der Stadt-Rat redet. Sie zeigt, wo er bald entscheiden will. Wie die Abstimmung ausging, steht im Protokoll. Das Protokoll kommt erst 4 bis 8 Wochen später. Dann gibt es einen Link dazu. Manche Sitzungs-Teile sind nicht öffentlich. Die zeigt diese Seite nicht.'],
    'h-beispiel': ['Das Beispiel im Original', 'Das Beispiel zum Nachlesen'],
    'beispiel': ['Das Beispiel ist ein Punkt unter Tausenden. Ich habe es ausgewählt, weil man daran den ganzen Weg gut sieht: Die Antwort steht verteilt in drei Dokumenten mit zusammen 68 Seiten. Für jeden anderen Tagesordnungspunkt läuft es genauso. Hier können Sie die drei Dokumente selbst nachlesen.',
                 'Das Beispiel ist ein Thema von vielen. Daran sieht man jeden Schritt gut. Die Antwort steht in 3 Dokumenten. Zusammen sind das 68 Seiten. Bei jedem anderen Thema geht es genauso. Hier können Sie die Dokumente lesen.'],
    'beleg1': ['Antrag vom 9. Juli 2024, 2 Seiten', 'Der Antrag, 2 Seiten'],
    'beleg2': ['Vorlage der Verwaltung, 6 Seiten', 'Die Antwort der Verwaltung, 6 Seiten'],
    'beleg3': ['Ausschuss für Stadtentwicklung, das Ergebnis steht auf Seite 54', 'Das Ergebnis steht auf Seite 54'],
    'h-fehler': ['Etwas gefunden, das nicht stimmt?', 'Haben Sie einen Fehler gefunden?'],
    'kontakt': ['Über <a href="impressum.html">das Impressum</a> erreichen Sie mich. Hinweise auf Fehler sind ausdrücklich erwünscht und helfen mir, die Seite zu verbessern. Der Quellcode aller Stationen ist <a href="https://github.com/mnkeller/papierpanther" rel="noopener noreferrer" target="_blank">öffentlich einsehbar<span class="sr-only"> (öffnet in neuem Tab)</span></a>.',
                'Schreiben Sie mir. Meine Kontakt-Daten stehen im <a href="impressum.html">Impressum</a>. Über Hinweise freue ich mich.'],
    'f-datenschutz': ['Datenschutz', 'Daten-Schutz'],
    'f-quellcode': ['Quellcode', 'Programm-Code']
  };
  var LINEAL = [['Annahme', 'Abholen'], ['Sortierer', 'Sortieren'], ['Leser', 'Lesen'], ['Sprachmodell', 'KI'], ['Prüfstand', 'Prüfen'], ['Stempel', 'Ergebnis'], ['Ausgabe', 'Website']];

  /* Stationen der Fabrik. Das rote Werkstueck ist ein Beispiel unter vielen;
     die Zahlen kommen aus data/fabrik.js (scraper/feed_bauen.py). */
  var STATIONEN = [
    { nr: '00', name: ['Überblick', 'Überblick'],
      titel: ['Wie ein Antrag in den <span>PapierPanther</span> kommt', 'So kommt ein Antrag auf die Seite'],
      text: ['Sieben Stationen, vom Ratsinfoportal bis zur Website. Das rote Werkstück ist ein Beispiel: ein Antrag zu Tempo 30 aus dem Jahr 2024. Die grauen Blätter sind alle anderen Tagesordnungspunkte. Mit jedem läuft es genauso.',
             'Es gibt 7 Stationen. Das rote Teil ist ein Beispiel. Es ist ein Antrag zu Tempo 30. Die grauen Blätter sind alle anderen Themen. Mit allen passiert das Gleiche.'],
      stueck: ['Antrag V0564/24 vom 9. Juli 2024', 'Antrag vom 9. Juli 2024'],
      code: 'scraper/', lab: ['Tagesordnungspunkte', 'Themen'], wert: Z.tops },
    { nr: '01', name: ['Annahme', 'Abholen'],
      titel: ['Der Greifer holt, <span>was öffentlich ist</span>', 'Das Programm holt die Seiten'],
      text: ['Ein Skript liest drei Portale aus: Stadtrat mit Ausschüssen, die zwölf Bezirksausschüsse und den Bezirk Oberbayern. Zwischen zwei Abrufen wartet es und merkt sich jede Seite, damit das Portal nichts zweimal liefern muss.',
             'Ein Programm liest 3 Internet-Seiten. Vom Stadt-Rat, von den Bezirks-Ausschüssen und vom Bezirk Oberbayern. Es liest langsam. So hat die Seite der Stadt keinen Stress.'],
      stueck: ['Antrag V0564/24, als PDF mit zwei Seiten', 'Der Antrag hat 2 Seiten'],
      code: 'scraper/ris_ingolstadt.py', lab: ['Sitzungen ausgelesen', 'Sitzungen gelesen'], wert: Z.sitzungen },
    { nr: '02', name: ['Sortierer', 'Sortieren'],
      titel: ['Jeder Punkt bekommt <span>eine Adresse</span>', 'Jedes Thema bekommt eine Nummer'],
      text: ['Aus jeder Sitzung werden die Tagesordnungspunkte, aus jedem Punkt die Vorlage. Ein fester Schlüssel sorgt dafür, dass nichts doppelt kommt oder verloren geht. Reine Sitzungsroutine wie „Genehmigung der Niederschrift“ fällt in die Kiste.',
             'Jedes Thema bekommt eine feste Nummer. So geht nichts verloren. Und nichts kommt doppelt. Manche Themen sind nur Routine. Zum Beispiel: Das Protokoll wird genehmigt. Die kommen in eine Kiste.'],
      stueck: ['stadt:11850#Ö9 · Ausschuss für Stadtentwicklung, 15.10.2025', 'Nummer: stadt:11850#Ö9'],
      code: 'scraper/ris_ingolstadt.py', lab: ['Routinepunkte aussortiert', 'Routine-Themen aussortiert'], wert: Z.routine },
    { nr: '03', name: ['Leser', 'Lesen'],
      titel: ['Erst lesen, <span>dann schreiben</span>', 'Erst wird gelesen'],
      text: ['Für jedes Thema holt ein Skript das Hauptdokument und zieht den Text heraus. Anlagen wie Pläne und Gutachten bleiben draußen. Sie vervielfachen die Textmenge, ohne zu sagen, worum es geht.',
             'Zu jedem Thema gibt es ein Dokument. Das Programm holt den Text aus dem Dokument. Pläne und Gutachten lässt es weg. Die sind sehr lang. Und sie sagen wenig über das Thema.'],
      stueck: ['Antrag (2 Seiten) und Vorlage der Verwaltung V0566/25 (6 Seiten) als Text', 'Antrag und Antwort der Verwaltung, 8 Seiten'],
      code: 'scraper/vorlagen_holen.py', lab: ['Themen mit verlinktem Dokument', 'Themen mit Dokument'], wert: Z.mit_dokument },
    { nr: '04', name: ['Sprachmodell', 'KI'],
      titel: ['Die KI schreibt, <span>mit dem Dokument auf dem Tisch</span>', 'Die KI schreibt einen kurzen Text'],
      text: ['Das Sprachmodell bekommt den Text der Vorlage und ein Regelwerk. Daraus schreibt es eine Überschrift, vier bis sieben Sätze in normaler Sprache, fünf bis neun in Leichter Sprache und Schlagworte aus einer festen Liste. Es soll nur zusammenfassen, was im Dokument steht.',
             'Die KI bekommt den Text vom Dokument. Und sie bekommt Regeln. Dann schreibt sie eine Überschrift und einen kurzen Text. Auch in Leichter Sprache. Sie soll nur schreiben, was im Dokument steht.'],
      stueck: ['„Grüne beantragen mehr Tempo-30-Strecken in Ingolstadt“ · Leichte Sprache: „Grüne wollen mehr Tempo 30 in der Stadt“', '„Grüne wollen mehr Tempo 30 in der Stadt“'],
      code: 'KURATION.md', lab: ['Themen auch in Leichter Sprache', 'Themen in Leichter Sprache'], wert: Z.leichte_sprache },
    { nr: '05', name: ['Prüfstand', 'Prüfen'],
      titel: ['Regeln, <span>die ein Programm nachrechnet</span>', 'Ein Programm prüft die Texte'],
      text: ['Vor jeder Veröffentlichung prüft ein Programm die Regeln. Kein Text darf einen Beschluss behaupten. Schlagworte nur aus der Liste. Jeder Link zeigt auf das Portal der Stadt. Sätze in Leichter Sprache mit mehr als 14 Wörtern werden gemeldet. Was durchfällt, geht zurück.',
             'Vor dem Veröffentlichen prüft ein Programm jeden Text. Zum Beispiel: Steht da ein Ergebnis, das die KI nicht wissen kann? Ist ein Satz zu lang? Dann geht der Text zurück.'],
      stueck: ['Bestanden: kein behaupteter Beschluss, alle Schlagworte erlaubt', 'Geprüft: alles in Ordnung'],
      code: 'scraper/pruefen.py', lab: ['automatische Prüfungen', 'Prüfungen'], wert: 16 },
    { nr: '06', name: ['Stempel', 'Ergebnis'],
      titel: ['Beschlüsse kommen aus dem Protokoll, <span>nie aus der KI</span>', 'Das Ergebnis kommt aus dem Protokoll'],
      text: ['Ob etwas entschieden ist, schreibt kein Sprachmodell. Ein eigenes Skript liest die Niederschriften und sucht die Abstimmung zur passenden Vorlage. Nur mit Beleg gibt es den Stempel. Im Zweifel steht da: Ergebnis steht im Protokoll.',
             'Die KI schreibt nie, wie abgestimmt wurde. Das steht im Protokoll der Sitzung. Ein Programm liest das Protokoll. Nur dann gibt es einen Stempel. Sonst steht da: Ergebnis steht im Protokoll.'],
      stueck: ['Niederschrift vom 15.10.2025, Seite 54: „Gegen 1 Stimme: Entsprechend dem Antrag genehmigt.“', 'Protokoll vom 15.10.2025: angenommen'],
      code: 'scraper/niederschriften_lesen.py', lab: ['Entscheidungen mit Beleg', 'Ergebnisse mit Beleg'], wert: Z.entschieden },
    { nr: '07', name: ['Ausgabe', 'Website'],
      titel: ['Sortiert nach <span>Lebenslage, Ort und Anlass</span>', 'Alles kommt auf die Website'],
      text: ['Am Ende steht alles in einer Datei, die die Website lädt. Jeder Eintrag ist nach Lebenslage, Stadtbezirk und Anlass sortiert und verlinkt die Quelle im Ratsinfoportal.',
             'Am Ende kommt alles auf diese Seite. Jedes Thema hat Schlag-Worte. Zum Beispiel den Stadt-Bezirk. So finden Sie es leichter. Bei jedem Thema gibt es einen Link zum Original.'],
      stueck: ['Unterwegs · stadtweit · Verkehrsplanung, Sicherheit', 'Unterwegs · ganze Stadt · Verkehr'],
      code: 'scraper/feed_bauen.py', lab: ['Stadtbezirke', 'Stadt-Bezirke'], wert: Z.stadtbezirke },
    { nr: '07', name: ['Ergebnis', 'Fertig'],
      titel: ['Einmal durch: <span>aus 68 Seiten wird eine Karte</span>', 'Aus 68 Seiten wird ein kurzer Text'],
      text: ['Von oben sieht man den ganzen Weg. Nur eine Station schreibt Text: das Sprachmodell. Alles andere holt, sortiert, prüft und belegt. Und bei jedem Eintrag ist das Original einen Klick entfernt.',
             'Von oben sieht man den ganzen Weg. Nur an einer Station schreibt die KI. Alle anderen Stationen holen, sortieren und prüfen. Das Original ist immer verlinkt.'],
      stueck: ['Status auf der Website: Entschieden, angenommen am 15.10.2025', 'Auf der Seite steht: Entschieden'],
      code: 'index.html', lab: ['Themen auf der Website', 'Themen auf der Seite'], wert: Z.themen }
  ];

  var btn = $('#btn-leicht');
  var leicht = false;
  try { leicht = localStorage.getItem(KEY) === '1'; } catch (e) {}
  var L = function () { return leicht ? 1 : 0; };

  function texte() {
    btn.setAttribute('aria-pressed', leicht ? 'true' : 'false');
    Object.keys(T).forEach(function (k) {
      var el = document.getElementById('t-' + k) || document.getElementById(k) || document.getElementById('hud-' + k);
      if (el) el.innerHTML = T[k][L()];
    });
    $('#hud-lineal').innerHTML = LINEAL.map(function (w, j) {
      return '<li>0' + (j + 1) + ' ' + w[L()] + '</li>';
    }).join('');
    aktiv = -1; fabrikScroll();
  }

  /* ---------- Fabrik: Texte zu den Stationen ---------- */
  var fab = $('#fabrik'), stage = $('#stage'), hp = $('#hud-panel'), hzw = $('#hud-zahl-wert'), lauf = $('#hud-lauf');
  var kopfzeile = $('.site-header');
  window.FAB = { s: 0 };
  var aktiv = -1, zahlJetzt = 0, zahlAnim = null, wechsel = null;
  function zeigeStation(i) {
    if (i === aktiv) return;
    var st = STATIONEN[i];
    var setze = function () {
      $('#hud-nr').textContent = st.nr; $('#hud-name').textContent = st.name[L()];
      $('#hud-titel').innerHTML = st.titel[L()]; $('#hud-text').textContent = st.text[L()];
      $('#hud-stueck').textContent = st.stueck[L()];
      var c = $('#hud-code'); c.textContent = st.code; c.href = REPO + st.code;
      $('#hud-zahl-lab').textContent = st.lab[L()];
      hp.classList.remove('weg');
    };
    clearTimeout(wechsel);
    if (aktiv === -1 || reduce) setze(); else { hp.classList.add('weg'); wechsel = setTimeout(setze, 260); }
    aktiv = i;
    document.querySelectorAll('#hud-lineal li').forEach(function (li, j) { li.classList.toggle('on', j + 1 === i); });
    var von = zahlJetzt, bis = st.wert || 0, t0 = performance.now();
    cancelAnimationFrame(zahlAnim);
    var schritt = function (now) {
      var f = reduce ? 1 : Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - f, 3);
      zahlJetzt = von + (bis - von) * e; hzw.textContent = fmt(zahlJetzt);
      if (f < 1) zahlAnim = requestAnimationFrame(schritt);
    };
    zahlAnim = requestAnimationFrame(schritt);
  }
  function kopfHoehe() {
    // Auf dem Handy klebt die Kopfzeile nicht (kopf.js), dann klebt die Buehne ganz oben
    var h = getComputedStyle(kopfzeile).position === 'sticky' ? kopfzeile.offsetHeight : 0;
    document.documentElement.style.setProperty('--kopf', h + 'px');
    return h;
  }
  var kopf = 0;
  function fabrikScroll() {
    var r = fab.getBoundingClientRect();
    var total = fab.offsetHeight - stage.offsetHeight;
    var s = Math.max(0, Math.min(8, (kopf - r.top) / Math.max(1, total) * 8));
    window.FAB.s = s;
    zeigeStation(Math.round(s));
    lauf.style.width = (s <= 1 ? 0 : Math.min(1, (s - 1) / 7)) * 100 + '%';
  }

  btn.addEventListener('click', function () {
    leicht = !leicht;
    try { localStorage.setItem(KEY, leicht ? '1' : '0'); } catch (e) {}
    texte();
  });
  addEventListener('scroll', fabrikScroll, { passive: true });
  // kopf.js laeuft erst nach diesem Skript und aendert Hoehe und Position der Kopfzeile
  var neuMessen = function () { kopf = kopfHoehe(); fabrikScroll(); };
  addEventListener('resize', neuMessen);
  addEventListener('load', neuMessen);
  if (window.ResizeObserver) new ResizeObserver(neuMessen).observe(kopfzeile);
  kopf = kopfHoehe();
  texte();
})();
