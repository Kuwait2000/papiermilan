// Zaehlung der Seitenaufrufe -- in dieser Portierung AUSGESCHALTET.
// Das Originalprojekt zaehlt anonym ueber ein selbst gehostetes GoatCounter
// (keine Cookies, kein localStorage). Hier ist der Hostname ein Platzhalter
// und trifft nie zu, damit lokale Vorschauen und Tests nichts senden.
// Zum Einschalten: eigene Domain eintragen und in der CSP aller Seiten
// wieder "connect-src 'self' https://DEIN-GOATCOUNTER" ergaenzen
// (siehe Datenschutzerklaerung, Abschnitt "Zaehlung der Seitenaufrufe").
(function () {
  if (location.hostname !== "DEINE-DOMAIN.example") return;
  if (navigator.webdriver || !navigator.sendBeacon) return;
  var q = new URLSearchParams({
    p: location.pathname,
    t: document.title,
    r: document.referrer,
    rnd: Math.random().toString(36).slice(2)
  });
  navigator.sendBeacon("https://DEIN-GOATCOUNTER.goatcounter.com/count?" + q);
})();
