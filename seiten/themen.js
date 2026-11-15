/* Skript der Seite themen.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
  var KEY = 'papierpanther-leichte-sprache';
  var T = {
    h1: ['Themen im Überblick', 'Themen'],
    intro: ['Zu einigen Themen gibt es mehr als einzelne Tagesordnungspunkte: Zahlen, Rechner und Hintergründe. Hier finden Sie alle auf einen Blick.',
            'Zu diesen Themen gibt es mehr Infos. Zum Beispiel Zahlen und Rechner.']
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
