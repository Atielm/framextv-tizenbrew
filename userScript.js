// TizenBrew evaluates this when the page's context is created. evaluateScriptOnDocumentStart
// is not used: with it, TizenBrew's launcher never opens the module.
(function () {
  // If the script arrived too late and the page was already blanked, go back to the
  // site; by then TizenBrew has the script cached and injects it in time.
  // window.name survives navigations in the same tab, so it caps the retries.
  if (window.top === window && location.href === 'about:blank') {
    var retry = +((window.name.match(/^fxtv-retry-(\d+)$/) || [0, 0])[1]);
    if (retry < 3) {
      window.name = 'fxtv-retry-' + (retry + 1);
      location.replace('https://framextv.cc/');
    }
    return;
  }
  setTimeout(function () { if (/^fxtv-retry-/.test(window.name)) window.name = ''; }, 15000);

  // FrameXTV bundles disable-devtool, which sees TizenBrew's debugger and sends the
  // page to about:blank (black screen). Cancel navigations that leave the site that way.
  if (window.navigation) {
    navigation.addEventListener('navigate', function (e) {
      var url = e.destination.url;
      if (url === 'about:blank' || url.indexOf('disable-devtool') !== -1) e.preventDefault();
    });
  }
  window.close = function () {};

  // The welcome modal cannot be focused with the remote. Mark it seen for next loads
  // and press "Continue to site" if it is already showing.
  try { localStorage.setItem('framextv_welcome_seen', 'true'); } catch (e) {}
  var tries = 0;
  var closeWelcome = setInterval(function () {
    var btn = document.querySelector('[data-testid="welcome-continue-btn"]');
    if (btn) btn.click();
    if (btn || ++tries > 40) clearInterval(closeWelcome);
  }, 250);

  // Remote navigation: the site expects a mouse. Arrows move focus to the nearest
  // clickable element in that direction, OK (Enter) clicks it.
  var FOCUSABLE = 'a[href],button,input,select,textarea,iframe,[tabindex]:not([tabindex="-1"]),[role="button"],[role="link"]';
  var DIRS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var style = document.createElement('style');
  style.textContent = '.fxtv-focus{outline:4px solid #3b82f6!important;outline-offset:3px!important;' +
    'box-shadow:0 0 0 8px rgba(59,130,246,.35)!important;}';
  (document.head || document.documentElement).appendChild(style);
  var current = null;

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled;
  }

  // Nearest row (or column) in that direction first, then the best aligned element in it.
  function moveFocus(dir) {
    var cur = current && document.contains(current) ? current : null;
    var f = cur ? cur.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    var vertical = dir === 'up' || dir === 'down';
    var cands = [];
    var all = document.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === cur || !visible(el) || (cur && (cur.contains(el) || el.contains(cur)))) continue;
      var r = el.getBoundingClientRect();
      var gap = dir === 'down' ? r.top - f.bottom : dir === 'up' ? f.top - r.bottom :
        dir === 'right' ? r.left - f.right : f.left - r.right;
      // Allow small overlaps between neighbours; the centre must still lie in that direction.
      var ahead = dir === 'down' ? r.top + r.height / 2 > f.top + f.height / 2 : dir === 'up' ? r.top + r.height / 2 < f.top + f.height / 2 :
        dir === 'right' ? r.left + r.width / 2 > f.left + f.width / 2 : r.left + r.width / 2 < f.left + f.width / 2;
      if (cur && (!ahead || gap < -20)) continue;
      var cross = vertical ? Math.abs(r.left + r.width / 2 - (f.left + f.width / 2)) : Math.abs(r.top + r.height / 2 - (f.top + f.height / 2));
      cands.push({ el: el, gap: Math.max(gap, 0), cross: cross });
    }
    if (!cands.length) return false;
    var minGap = Math.min.apply(null, cands.map(function (c) { return c.gap; }));
    var best = null;
    cands.forEach(function (c) {
      if (c.gap <= minGap + 40 && (!best || c.cross < best.cross)) best = c;
    });
    setFocus(best.el);
    return true;
  }

  function setFocus(el) {
    if (current) current.classList.remove('fxtv-focus');
    current = el;
    el.classList.add('fxtv-focus');
    try { el.focus({ preventScroll: true }); } catch (e) {}
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  // OK inside the player (same-origin iframe): start the stream or toggle play.
  function playerEnter() {
    var start = document.querySelector('[aria-label="Play Stream"]');
    var video = document.querySelector('video');
    if (start && visible(start)) start.click();
    else if (video) video.paused ? video.play() : video.pause();
  }
  window.__fxtvMove = moveFocus;
  window.__fxtvEnter = playerEnter;

  // Maps the Samsung remote's media keys (Tizen keyCodes) to the page's video.
  // ponytail: only reaches a <video> in this document; a cross-origin player
  // iframe gets its own copy of this script only if TizenBrew injects there.
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
    var typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    var dir = DIRS[e.keyCode];
    if (dir && !(typing && (dir === 'left' || dir === 'right'))) {
      var moved = moveFocus(dir);
      // Nothing more inside the player in that direction: hand focus back to the page.
      if (!moved && window !== window.top) {
        try { window.parent.focus(); moved = window.parent.__fxtvMove(dir); } catch (err) {}
      }
      if (moved) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (e.keyCode === 13 && !typing) {
      var cur = current && document.contains(current) ? current : null;
      if (!cur && window === window.top) return;
      e.preventDefault();
      e.stopPropagation();
      if (!cur) playerEnter();
      else if (cur.tagName === 'IFRAME') {
        try { cur.contentWindow.focus(); cur.contentWindow.__fxtvEnter(); } catch (err) {}
      } else if (cur.tagName === 'VIDEO') { cur.paused ? cur.play() : cur.pause(); } else { cur.click(); }
      return;
    }
    var action = actions[e.keyCode];
    var video = document.querySelector('video');
    if (!action || !video) return;
    e.preventDefault();
    action(video);
  }, true);
})();
