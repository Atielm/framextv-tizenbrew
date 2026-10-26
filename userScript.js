// TizenBrew evaluates this when the page's context is created. evaluateScriptOnDocumentStart
// is not used: with it, TizenBrew's launcher never opens the module.
(function () {
  // FrameXTV bundles disable-devtool, which sees TizenBrew's debugger and sends the
  // page to about:blank (black screen). Cancel navigations that leave the site that way.
  if (window.navigation) {
    navigation.addEventListener('navigate', function (e) {
      var url = e.destination.url;
      if (url === 'about:blank' || url.indexOf('disable-devtool') !== -1) e.preventDefault();
    });
  }
  window.close = function () {};

  // Maps the Samsung remote's media keys (Tizen keyCodes) to the page's video.
  // ponytail: only reaches a <video> in the top document; a cross-origin player
  // iframe cannot be scripted from here, so keys do nothing there.
  var SEEK_SECONDS = 10;
  var actions = {
    10252: function (v) { v.paused ? v.play() : v.pause(); }, // MediaPlayPause
    415: function (v) { v.play(); },                           // MediaPlay
    19: function (v) { v.pause(); },                           // MediaPause
    413: function (v) { v.pause(); },                          // MediaStop
    417: function (v) { v.currentTime += SEEK_SECONDS; },      // MediaFastForward
    412: function (v) { v.currentTime -= SEEK_SECONDS; }       // MediaRewind
  };

  document.addEventListener('keydown', function (e) {
    var action = actions[e.keyCode];
    var video = document.querySelector('video');
    if (!action || !video) return;
    e.preventDefault();
    action(video);
  }, true);
})();
