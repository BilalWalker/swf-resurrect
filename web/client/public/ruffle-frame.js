// Plays one job's original SWF with the self-hosted Ruffle web package. This page runs inside
// <iframe sandbox="allow-scripts"> (an opaque origin), so Ruffle and the SWF are fetched with
// CORS from this server. The SWF URL comes from the fragment and must be a job's /swf route.
(function () {
  'use strict';
  var message = document.getElementById('message');
  function fail(text) {
    message.textContent = text;
    message.className = 'is-error';
    message.hidden = false;
  }

  var swf = decodeURIComponent(window.location.hash.slice(1));
  if (!/^\/api\/jobs\/[a-f0-9]{24}\/swf$/.test(swf)) {
    fail('No SWF to play.');
    return;
  }

  window.RufflePlayer = window.RufflePlayer || {};
  window.RufflePlayer.config = {
    publicPath: '/vendor/ruffle/',
    polyfills: false,
    autoplay: 'on',
    unmuteOverlay: 'hidden',
    // No Ruffle splash (logo and load bar) and no Ruffle context menu, so the side-by-side view
    // shows only the SWF. Option names and values checked against the pinned package 0.7.1
    // (core/dist/public/config/load-options.js and default.js in ruffle.js.map). Ruffle is
    // credited in the page footer and in web/THIRD_PARTY.md instead.
    splashScreen: false,
    letterbox: 'on',
    contextMenu: 'off',
    showSwfDownload: false,
    warnOnUnsupportedContent: false,
    // The SWF is untrusted: no script bridge, no network, no opening URLs.
    allowScriptAccess: false,
    allowNetworking: 'none',
    openUrlMode: 'deny',
    upgradeToHttps: false,
    logLevel: 'warn',
  };

  var script = document.createElement('script');
  script.src = '/vendor/ruffle/ruffle.js';
  script.onerror = function () {
    fail('Ruffle could not be loaded from this server.');
  };
  script.onload = function () {
    try {
      var ruffle = window.RufflePlayer.newest();
      var player = ruffle.createPlayer();
      document.getElementById('stage').appendChild(player);
      var api = typeof player.ruffle === 'function' ? player.ruffle() : player;
      Promise.resolve(api.load({ url: swf, allowScriptAccess: false, allowNetworking: 'none' })).then(
        function () {
          message.hidden = true;
        },
        function (err) {
          fail('Ruffle could not play this SWF: ' + (err && err.message ? err.message : String(err)));
        },
      );
    } catch (err) {
      fail('Ruffle could not start: ' + (err && err.message ? err.message : String(err)));
    }
  };
  document.head.appendChild(script);
})();
