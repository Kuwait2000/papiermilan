/* Skript der Seite themen.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  var KEY = 'papierpanther-leichte-sprache';
  var T = {
    h1: ['Themen im Überblick', 'Themen'],
    intro: ['Hier sehen Sie, worum es in Rat und Kreistag ging — gruppiert nach Lebenslage. Ein Klick auf eine Kachel zeigt die passenden Einträge auf der Startseite.',
            'Hier sehen Sie, worum es ging. Zum Beispiel bei Wohnen oder Verkehr. Ein Klick zeigt die passenden Themen.']
  };
  var btn = document.getElementById('btn-leicht');
  var leicht = false;
  try { leicht = localStorage.getItem(KEY) === '1'; } catch (e) {}
  function anwenden() {
    btn.setAttribute('aria-pressed', leicht ? 'true' : 'false');
    document.getElementById('t-h1').textContent = T.h1[leicht ? 1 : 0];
    document.getElementById('t-intro').textContent = T.intro[leicht ? 1 : 0];
  }
  btn.addEventListener('click', function () {
    leicht = !leicht;
    try { localStorage.setItem(KEY, leicht ? '1' : '0'); } catch (e) {}
    anwenden();
  });
  anwenden();
})();
