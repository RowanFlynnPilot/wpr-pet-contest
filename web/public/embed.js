/* global window, document, location, history */
// The contest's site-wide host script, for the WordPress pages that embed it
// (web/EMBED.md). An administrator loads it once, from the site's header or
// footer code; nothing goes in the page itself, because WPR's server firewall
// refuses to save a page with a script in it. It finds the contest's frames by
// their address, so each page keeps its plain iframe, and with it:
// - a share link's #/pet/<id> (or any #/ route) opens in the frame;
// - the frame grows to the app, with no inner scrollbar;
// - moving to another view scrolls the app's top back into view;
// - the article widget's frames fit their card.
// It accepts messages only from the contest's own origin and only ever sets a
// height or scrolls; nothing from a frame is executed.
(function () {
  var me = document.currentScript;
  var BASE = me && me.src ? me.src.replace(/embed\.js([?#].*)?$/, '') : 'https://rowanflynnpilot.github.io/wpr-pet-contest/';
  var ORIGIN = BASE.split('/').slice(0, 3).join('/');

  function frames() {
    var out = [];
    var all = document.getElementsByTagName('iframe');
    for (var i = 0; i < all.length; i++) {
      if ((all[i].getAttribute('src') || '').indexOf(BASE) === 0) out.push(all[i]);
    }
    return out;
  }

  function isWidget(frame) {
    return frame.getAttribute('src').indexOf(BASE + 'widget.html') === 0;
  }

  // Share links are the page's address plus the app's route,
  // e.g. .../pet-contest/#/pet/<id>. Hand the route to the contest frame.
  function route() {
    if (location.hash.indexOf('#/') !== 0) return;
    var list = frames();
    for (var i = 0; i < list.length; i++) {
      if (isWidget(list[i])) continue;
      var base = list[i].getAttribute('src').split('#')[0];
      if (list[i].src !== base + location.hash) list[i].src = base + location.hash;
      break;
    }
    // Free-vote email links carry a single-use token (fv=...). Once it is in
    // the frame, take it out of this page's address bar and history.
    if (location.hash.indexOf('fv=') !== -1) {
      history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/[?&]fv=[^&]*/, ''));
    }
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN || !event.data) return;
    var list = frames();
    for (var i = 0; i < list.length; i++) {
      var frame = list[i];
      if (frame.contentWindow !== event.source) continue;
      var type = event.data.type;
      if ((type === 'wpr-pets-height' || type === 'wpr-pets-widget-height') && event.data.height > 0) {
        // The pasted frame is a fixed, screen-tall window; from here on it is
        // as tall as the app, and the app is told so (it lays itself out for
        // a page-tall frame only once it hears this).
        frame.style.minHeight = '0';
        frame.style.height = event.data.height + 'px';
        event.source.postMessage({ type: 'wpr-pets-host' }, ORIGIN);
      } else if (type === 'wpr-pets-nav' && frame.getBoundingClientRect().top < 0) {
        frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  window.addEventListener('hashchange', route);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', route);
  else route();
})();
