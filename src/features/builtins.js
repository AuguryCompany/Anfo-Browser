// Yerleşik eklentiler. Her biri sayfaya (Android'de) CSS ve JS olarak enjekte edilir.
// match: virgülle ayrılmış alan adları; boş = tüm siteler.
// js: IIFE olarak yazılmıştır; sayfada yalnızca bir kez çalışır.

export const BUILTINS = [
  {
    id: 'cookies',
    name: 'Çerez bannerlarını gizle',
    desc: 'Çerez izin pencerelerini ve kaplamalarını gizler, kilitli kaydırmayı açar.',
    match: '',
    css: `
#onetrust-banner-sdk, #onetrust-consent-sdk, .fc-consent-root, #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay,
.cc-window, [id*="cookie-banner"], [class*="cookie-consent"], .qc-cmp2-container, #didomi-host, .truste_box_overlay
{ display: none !important; }
body[style*="overflow: hidden"], html[style*="overflow: hidden"] { overflow: auto !important; }
`,
    js: `(function () {
  function unlock() {
    [document.documentElement, document.body].forEach(function (el) {
      if (el && el.style.overflow === 'hidden') el.style.overflow = '';
    });
  }
  unlock();
  setTimeout(unlock, 1500);
})();`,
  },
  {
    id: 'yt-focus',
    name: 'YouTube odak',
    desc: 'Shorts rafları, öneriler ve yorumları gizler; izlemeye odaklanırsın.',
    match: 'youtube.com',
    css: `
ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], grid-shelf-view-model, ytd-reel-video-renderer, ytd-shorts,
a[href^="/shorts"], #related, ytd-watch-next-secondary-results-renderer, #secondary, ytd-comments, #comments
{ display: none !important; }
ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-guide-entry-renderer:has(a[href^="/shorts"]) { display: none !important; }
`,
    js: '',
  },
  {
    id: 'yt-speed',
    name: 'Video hız tuşu',
    desc: 'Sayfadaki videolara 1× / 1.25× / 1.5× / 2× hız düğmesi ekler.',
    match: 'youtube.com, vimeo.com',
    css: `
#anfo-yt-speed { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; height: 36px; min-width: 52px; padding: 0 12px;
  border: 0; border-radius: 99px; background: rgba(20, 20, 22, 0.78); color: #f3f1f2;
  font: 600 13px system-ui, sans-serif; cursor: pointer; -webkit-tap-highlight-color: transparent; }
`,
    js: `(function () {
  if (window.__anfoYtSpeed) return;
  window.__anfoYtSpeed = true;
  var steps = [1, 1.25, 1.5, 2], i = 0;
  var seen = new WeakSet();
  var btn = document.createElement('button');
  btn.id = 'anfo-yt-speed';
  btn.type = 'button';
  btn.textContent = '1\\u00d7';
  function sweep(all) {
    document.querySelectorAll('video').forEach(function (v) {
      if (all || !seen.has(v)) { seen.add(v); v.playbackRate = steps[i]; }
    });
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    i = (i + 1) % steps.length;
    btn.textContent = steps[i] + '\\u00d7';
    sweep(true);
  });
  function attach() { if (document.body && !btn.isConnected) document.body.appendChild(btn); }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; attach(); sweep(false); }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });
  attach();
  sweep(false);
})();`,
  },
  {
    id: 'progress',
    name: 'Okuma ilerlemesi',
    desc: 'Sayfanın üstünde ince kiraz bir çubukla okuma ilerlemeni gösterir.',
    match: '',
    css: `
#anfo-progress { position: fixed; top: 0; left: 0; height: 2px; width: 0; background: #e5385f; z-index: 2147483647; pointer-events: none; }
`,
    js: `(function () {
  if (document.getElementById('anfo-progress')) return;
  var bar = document.createElement('div');
  bar.id = 'anfo-progress';
  (document.body || document.documentElement).appendChild(bar);
  function update() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var y = window.scrollY || h.scrollTop || 0;
    var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
    bar.style.width = (p * 100).toFixed(2) + '%';
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();`,
  },
  {
    id: 'no-sticky',
    name: 'Yapışkan üst bar serbest',
    desc: 'Ekranın üstüne yapışan başlıkları normal akışa alır; metin alanı genişler.',
    match: '',
    css: '',
    js: `(function () {
  if (window.__anfoNoSticky) return;
  window.__anfoNoSticky = true;
  function fix(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.id && el.id.indexOf('anfo-') === 0) return;
    var pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'sticky') return;
    var r = el.getBoundingClientRect();
    if (r.top < 5 && r.height > 0 && r.height < 200) el.style.setProperty('position', 'static', 'important');
  }
  function scan(node) {
    fix(node);
    if (!node.getElementsByTagName) return;
    var all = node.getElementsByTagName('*');
    var max = Math.min(all.length, 1500);
    for (var i = 0; i < max; i++) fix(all[i]);
  }
  var queue = [], timer = 0;
  function flush() {
    timer = 0;
    var nodes = queue;
    queue = [];
    for (var i = 0; i < nodes.length; i++) if (nodes[i].isConnected) scan(nodes[i]);
  }
  new MutationObserver(function (muts) {
    for (var m = 0; m < muts.length; m++) {
      var added = muts[m].addedNodes;
      for (var j = 0; j < added.length; j++) queue.push(added[j]);
    }
    if (queue.length && !timer) timer = setTimeout(flush, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function () { if (document.body) scan(document.body); }, 1000);
})();`,
  },
  {
    id: 'select',
    name: 'Kopyalama serbest',
    desc: 'Metin seçimini ve kopyalamayı engelleyen kuralları kaldırır.',
    match: '',
    css: `
* { user-select: auto !important; -webkit-user-select: auto !important; }
`,
    js: `(function () {
  if (window.__anfoSelect) return;
  window.__anfoSelect = true;
  ['copy', 'cut', 'contextmenu', 'selectstart'].forEach(function (type) {
    window.addEventListener(type, function (e) { e.stopImmediatePropagation(); }, true);
  });
  ['oncopy', 'oncut', 'oncontextmenu', 'onselectstart'].forEach(function (k) {
    document.documentElement[k] = null;
    if (document.body) document.body[k] = null;
  });
})();`,
  },
  {
    id: 'dark-lite',
    name: 'Basit karanlık',
    desc: 'Sayfayı kabaca karartır; görselleri ve videoları renkleriyle korur.',
    match: '',
    css: `
html { filter: invert(0.92) hue-rotate(180deg); }
img, video, picture, canvas { filter: invert(1) hue-rotate(180deg); }
`,
    js: '',
  },
  {
    id: 'big-text',
    name: 'Okunaklı metin',
    desc: 'Paragraf ve liste metnini büyütür, satır aralığını açar.',
    match: '',
    css: `
p, li { font-size: max(1em, 17px) !important; line-height: 1.6 !important; }
`,
    js: '',
  },
  {
    id: 'reddit-clean',
    name: 'Reddit temiz',
    desc: 'Giriş ve uygulama tanıtım pencerelerini gizler, kaydırmayı açar.',
    match: 'reddit.com',
    css: `
shreddit-async-loader[bundlename*="sign_up"], shreddit-async-loader[bundlename*="login"],
[data-testid="bottom-bar"], [data-testid="login-modal"], #login-modal
{ display: none !important; }
`,
    js: `(function () {
  function unlock() {
    [document.documentElement, document.body].forEach(function (el) {
      if (el && el.style.overflow === 'hidden') el.style.overflow = '';
    });
  }
  unlock();
  setInterval(unlock, 2000);
})();`,
  },
  {
    id: 'autoplay-stop',
    name: 'Otomatik oynatmayı durdur',
    desc: 'Sen dokunmadan başlayan videoları duraklatır.',
    match: '',
    css: '',
    js: `(function () {
  // Kullanıcının dokunduğu (pointerdown) videolar bir daha durdurulmaz.
  var user = new WeakSet();
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    var v = t && t.closest ? t.closest('video') : null;
    if (v) user.add(v);
  }, { capture: true, passive: true });
  function calm(v) {
    v.removeAttribute('autoplay');
    if (!v.paused && !user.has(v)) v.pause();
  }
  function scan() { document.querySelectorAll('video[autoplay]').forEach(calm); }
  document.addEventListener('play', function (e) {
    var v = e.target;
    if (v && v.tagName === 'VIDEO' && !user.has(v)) v.pause();
  }, true);
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['autoplay'] });
})();`,
  },
  {
    id: 'wiki-clean',
    name: 'Vikipedi temiz',
    desc: 'Vikipedi bağış bannerlarını ve site bildirimlerini gizler.',
    match: 'wikipedia.org',
    css: `
#centralNotice, #siteNotice, .frb, .frb-box, .fundraising-banner, .mw-message-box-centralnotice, #mw-fr-revisiting, .cn-banner
{ display: none !important; }
`,
    js: '',
  },
]

// Eklenti, verilen sunucu adına (host) uygulanmalı mı?
export function matches(ext, host) {
  const list = String((ext && ext.match) || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\*\./, '').replace(/^www\./, ''))
    .filter(Boolean)
  if (!list.length) return true
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return list.some((d) => h === d || h.endsWith('.' + d))
}
