(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
  };
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------- i18n ---------------- */
  const LANGS = ['es', 'en', 'ca'];
  const dict = window.I18N || { es: {}, en: {}, ca: {} };
  // El español sale del propio HTML: así no se duplica y funciona sin JS.
  $$('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (!(k in dict.es)) dict.es[k] = el.innerHTML.trim();
  });
  const parseAttr = el => el.dataset.i18nAttr.split(';').map(p => p.split(':')).filter(p => p.length === 2);
  $$('[data-i18n-attr]').forEach(el => parseAttr(el).forEach(([attr, k]) => {
    if (!(k in dict.es) && el.hasAttribute(attr)) dict.es[k] = el.getAttribute(attr);
  }));

  let lang = 'es';
  const t = (k, l = lang) => (dict[l] && dict[l][k] !== undefined ? dict[l][k] : dict.es[k] !== undefined ? dict.es[k] : k);

  function applyLang(l, persist) {
    if (!LANGS.includes(l)) l = 'es';
    lang = l;
    document.documentElement.lang = l;
    const missing = [];
    $$('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (l !== 'es' && dict[l][k] === undefined) missing.push(k);
      el.innerHTML = t(k);
    });
    $$('[data-i18n-attr]').forEach(el => parseAttr(el).forEach(([attr, k]) => {
      if (l !== 'es' && dict[l][k] === undefined) missing.push(k);
      el.setAttribute(attr, t(k));
    }));
    if (missing.length) console.warn('[i18n] faltan claves en', l, missing);
    document.title = t('meta.title');
    const md = $('meta[name="description"]');
    if (md) md.setAttribute('content', t('meta.desc'));
    $$('.lang [data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    syncMotionLabel();
    syncMenuLabel();
    resetSprintIdle();
    updateHud(true);
    if (persist) {
      store.set('lang', l);
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.set('lang', l);
        history.replaceState(null, '', url);
      }
    }
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }

  function initialLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) return q;
    const saved = store.get('lang');
    if (LANGS.includes(saved)) return saved;
    const nav = (navigator.languages || [navigator.language || 'es']).map(x => String(x).toLowerCase());
    for (const n of nav) {
      if (n.startsWith('ca')) return 'ca';
      if (n.startsWith('es')) return 'es';
      if (n.startsWith('en')) return 'en';
    }
    return 'es';
  }
  $$('.lang [data-lang]').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang, true)));

  /* ---------------- Toast ---------------- */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* ---------------- Movimiento ---------------- */
  const motionBtn = $('#motion-toggle');
  const savedMotion = store.get('motion');
  if (savedMotion === 'paused' || (savedMotion === null && reduceMQ.matches)) document.body.classList.add('motion-paused');
  function syncMotionLabel() {
    const paused = document.body.classList.contains('motion-paused');
    motionBtn.setAttribute('aria-pressed', String(paused));
    const label = t(paused ? 'ui.motionOn' : 'ui.motionOff');
    motionBtn.setAttribute('aria-label', label);
    motionBtn.title = label;
  }
  function toggleMotion() {
    const paused = document.body.classList.toggle('motion-paused');
    store.set('motion', paused ? 'paused' : 'running');
    syncMotionLabel();
    document.dispatchEvent(new CustomEvent('motionchange', { detail: paused }));
  }
  motionBtn.addEventListener('click', toggleMotion);
  const isPaused = () => document.body.classList.contains('motion-paused');

  /* ---------------- Menú móvil ---------------- */
  const menuBtn = $('#menu-btn'), mobile = $('#mobile-menu');
  function syncMenuLabel() {
    const open = !mobile.hidden;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', t(open ? 'ui.menuClose' : 'ui.menu'));
  }
  function setMenu(open) {
    mobile.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    syncMenuLabel();
  }
  menuBtn.addEventListener('click', () => setMenu(mobile.hidden));
  $$('a', mobile).forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('resize', () => { if (innerWidth > 1180 && !mobile.hidden) setMenu(false); }, { passive: true });

  /* ---------------- Scroll: cabecera, nav, HUD ---------------- */
  const header = $('#header');
  const chapters = $$('[data-chapter]');
  const navLinks = $$('.site-nav a');
  const hudChapter = $('#hud-chapter'), hudBar = $('#hud-bar'), hudNum = $('#hud-num');
  let currentChapter = null;

  function updateHud(force) {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = Math.min(1, Math.max(0, scrollY / max));
    hudBar.style.transform = `scaleY(${p.toFixed(4)})`;
    hudNum.textContent = String(Math.round(p * 100)).padStart(3, '0');
    let cur = chapters[0];
    for (const c of chapters) if (c.getBoundingClientRect().top < innerHeight * 0.5) cur = c;
    if (cur !== currentChapter || force) {
      currentChapter = cur;
      hudChapter.textContent = `${cur.dataset.chapter} · ${t(cur.dataset.chapterKey).toUpperCase()}`;
      navLinks.forEach(a => {
        const on = a.getAttribute('href') === '#' + cur.id;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
  }

  /* Sección "Ahora": pasos ligados al scroll */
  const nowSec = $('#ahora'), steps = $$('.now-step'), dots = $$('.now-dots i'), system = $('#system');
  let nowStep = -1;
  function updateNow() {
    if (!nowSec) return;
    const r = nowSec.getBoundingClientRect();
    const range = Math.max(1, r.height - innerHeight);
    const p = Math.min(0.999, Math.max(0, -r.top / range));
    const i = Math.floor(p * steps.length);
    if (i === nowStep) return;
    nowStep = i;
    steps.forEach((s, n) => s.classList.toggle('is-current', n === i));
    dots.forEach((d, n) => d.classList.toggle('on', n === i));
    system.dataset.step = String(i);
  }

  /* Parallax: cada capa se mueve según su distancia al centro de la pantalla.
     Se mide el padre (sin desplazar) y se usa la propiedad `translate`
     para no pisar los `transform` de las animaciones de entrada. */
  const layers = $$('[data-speed]').map(el => ({ el, parent: el.parentElement, speed: parseFloat(el.dataset.speed) || 0 }));
  const ghosts = $$('.ghost').map(el => ({ el, parent: el.parentElement }));
  const covers = $$('.game-cover').map(el => ({ el, img: $('img', el) }));
  let parallaxOn = false;
  function clearParallax() {
    layers.forEach(l => { l.el.style.translate = ''; });
    ghosts.forEach(g => { g.el.style.translate = ''; });
    covers.forEach(c => { c.img.style.translate = ''; });
  }
  function updateParallax() {
    const enabled = !isPaused() && !reduceMQ.matches;
    if (!enabled) { if (parallaxOn) { clearParallax(); parallaxOn = false; } return; }
    parallaxOn = true;
    const vh = innerHeight, mid = vh / 2, k = innerWidth < 700 ? 0.5 : 1;
    const visible = r => r.bottom > -300 && r.top < vh + 300;
    layers.forEach(({ el, parent, speed }) => {
      const r = parent.getBoundingClientRect();
      if (!visible(r)) return;
      el.style.translate = `0 ${(-(r.top + r.height / 2 - mid) * speed * k).toFixed(1)}px`;
    });
    ghosts.forEach(({ el, parent }) => {
      const r = parent.getBoundingClientRect();
      if (!visible(r)) return;
      el.style.translate = `${((r.top + r.height / 2 - mid) * 0.45 * k).toFixed(1)}px 0`;
    });
    covers.forEach(({ el, img }) => {
      const r = el.getBoundingClientRect();
      if (!visible(r)) return;
      const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - mid) / (mid + r.height / 2)));
      img.style.translate = `0 ${(p * r.height * 0.07).toFixed(1)}px`;
    });
  }
  document.addEventListener('motionchange', updateParallax);
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', updateParallax);

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      header.classList.toggle('scrolled', scrollY > 24);
      updateHud(false);
      updateNow();
      updateParallax();
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  /* ---------------- Aparición al hacer scroll ---------------- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(el => io.observe(el));
  } else {
    $$('.reveal').forEach(el => el.classList.add('visible'));
  }

  /* ---------------- Galerías y visor ---------------- */
  const galleries = {};
  $$('.game').forEach(game => {
    const id = game.id;
    const thumbs = $$('.thumbs button', game);
    galleries[id] = {
      name: $('.game-name', game).textContent.trim(),
      items: thumbs.map(b => $('img', b))
    };
    const cover = $('.game-cover', game), coverImg = $('img', cover);
    thumbs.forEach((b, i) => b.addEventListener('click', () => {
      const img = $('img', b);
      thumbs.forEach(x => x.classList.toggle('on', x === b));
      cover.dataset.index = String(i);
      coverImg.src = img.getAttribute('src');
      coverImg.dataset.full = img.dataset.full;
      coverImg.alt = img.alt;
      coverImg.removeAttribute('width');
      coverImg.removeAttribute('height');
    }));
    cover.addEventListener('click', () => openLightbox(id, Number(cover.dataset.index || 0), cover));
  });

  const lb = $('#lightbox'), lbImg = $('#lb-img'), lbCap = $('#lb-cap'), lbCount = $('#lb-count');
  let lbState = null;
  function showLb() {
    const g = galleries[lbState.id], img = g.items[lbState.i];
    lbImg.src = img.dataset.full || img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = img.alt;
    lbCount.textContent = `${lbState.i + 1} / ${g.items.length}`;
    // Precarga de la siguiente
    const nx = g.items[(lbState.i + 1) % g.items.length];
    if (nx) { const pre = new Image(); pre.src = nx.dataset.full || nx.src; }
  }
  function openLightbox(id, i, opener) {
    lbState = { id, i, opener };
    showLb();
    lb.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => lb.classList.add('open'));
    $('#lb-close').focus();
  }
  function closeLightbox() {
    if (lb.hidden) return;
    lb.classList.remove('open');
    lb.hidden = true;
    document.body.classList.remove('modal-open');
    if (lbState && lbState.opener) lbState.opener.focus();
    lbState = null;
  }
  function stepLb(d) {
    if (!lbState) return;
    const n = galleries[lbState.id].items.length;
    lbState.i = (lbState.i + d + n) % n;
    showLb();
  }
  $('#lb-prev').addEventListener('click', () => stepLb(-1));
  $('#lb-next').addEventListener('click', () => stepLb(1));
  $('#lb-close').addEventListener('click', closeLightbox);
  $$('[data-close]', lb).forEach(el => el.addEventListener('click', closeLightbox));
  let touchX = null;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
    touchX = null;
  });

  function trapFocus(container, e) {
    const f = $$('button, [href], input, [tabindex]:not([tabindex="-1"])', container).filter(x => !x.hidden && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- Email ---------------- */
  // Se compone en tiempo de ejecución para no dejarlo en claro en el HTML.
  const email = ['diegotorres2.dd', 'gmail.com'].join('@');
  const mailLink = $('#mail-link');
  $('#mail-text').textContent = email;
  mailLink.href = 'mailto:' + email;
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      toast(t('toast.copied'));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = email;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      toast(t(ok ? 'toast.copied' : 'toast.copyFail'));
    }
  }
  $('#copy-mail').addEventListener('click', copyEmail);

  /* ---------------- Simulación de sprint ---------------- */
  const runBtn = $('#run-sprint'), logEl = $('#sprint-log'), consoleEl = $('#console');
  const lanePaths = $$('.lane-paths path'), packets = $$('.packets .pk'), flowSteps = $$('.flow-step');
  let sprintRun = 0, sprintDone = false;
  function resetSprintIdle() {
    if (!logEl) return;
    const label = $('[data-i18n]', runBtn);
    if (sprintRun === 0 || sprintDone) label.textContent = t(sprintDone ? 'method.runAgain' : 'method.run');
    if (sprintRun === 0) {
      logEl.innerHTML = '';
      const s = document.createElement('span');
      s.className = 'muted';
      s.textContent = t('method.idle');
      logEl.appendChild(s);
    }
  }
  function placePackets(prog) {
    packets.forEach((pk, i) => {
      const path = lanePaths[i];
      const len = path.getTotalLength();
      const local = Math.min(1, Math.max(0, prog[i]));
      const pt = path.getPointAtLength(len * local);
      pk.setAttribute('cx', pt.x.toFixed(1));
      pk.setAttribute('cy', pt.y.toFixed(1));
      pk.style.opacity = local > 0 && local < 1 ? '1' : '0';
    });
  }
  placePackets([0, 0, 0, 0]);
  function runSprint() {
    const run = ++sprintRun;
    sprintDone = false;
    runBtn.disabled = true;
    consoleEl.classList.add('running');
    consoleEl.classList.remove('done');
    logEl.innerHTML = '';
    const lines = t('log');
    const fast = isPaused() || reduceMQ.matches;
    const lineDelay = fast ? 0 : 520;
    const flowAt = [0, 1, 2, 2, 2, 2, 2, 3, 4, 4];
    lines.forEach((line, i) => setTimeout(() => {
      if (run !== sprintRun) return;
      const row = document.createElement('span');
      row.className = 'row' + (i === lines.length - 1 ? ' ok' : '');
      row.textContent = line;
      logEl.appendChild(row);
      logEl.scrollTop = logEl.scrollHeight;
      flowSteps.forEach((s, n) => s.classList.toggle('lit', n <= flowAt[i]));
      flowSteps.forEach((s, n) => s.classList.toggle('active', n === flowAt[i]));
      if (i === lines.length - 1) {
        runBtn.disabled = false;
        sprintDone = true;
        consoleEl.classList.remove('running');
        consoleEl.classList.add('done');
        $('[data-i18n]', runBtn).textContent = t('method.runAgain');
      }
    }, i * lineDelay));

    if (fast) { placePackets([1, 1, 1, 1]); return; }
    // Cada agente sale cuando aparece su línea y llega antes de la verificación.
    const starts = [3, 4, 5, 6].map(n => n * lineDelay), end = 7 * lineDelay, t0 = performance.now();
    (function frame(now) {
      if (run !== sprintRun) return;
      const el = now - t0;
      placePackets(starts.map((s, i) => (el - s) / (end - s - i * 40)));
      if (el < end + 200) requestAnimationFrame(frame); else placePackets([1, 1, 1, 1]);
    })(t0);
  }
  runBtn.addEventListener('click', runSprint);

  /* ---------------- Paleta de comandos ---------------- */
  const pal = $('#palette'), palInput = $('#palette-input'), palList = $('#palette-list');
  let palItems = [], palIndex = 0, palOpener = null;
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function buildPaletteItems() {
    const sec = [['inicio', 'ch.home'], ['ahora', 'ch.now'], ['laboratorio', 'ch.lab'], ['metodo', 'ch.method'], ['recorrido', 'ch.path'], ['stack', 'ch.stack'], ['sobre-mi', 'ch.about'], ['contacto', 'ch.contact']];
    const items = sec.map(([id, k], i) => ({ group: t('pal.gSections'), label: t(k), hint: String(i).padStart(2, '0'), run: () => document.getElementById(id).scrollIntoView({ behavior: isPaused() ? 'auto' : 'smooth' }) }));
    ['deep-quota', 'dados-del-pozo', 'black-evac', 'skybreaker', 'one-more-horde'].forEach(id => {
      items.push({ group: t('ch.lab'), label: galleries[id].name, hint: '◆', run: () => document.getElementById(id).scrollIntoView({ behavior: isPaused() ? 'auto' : 'smooth', block: 'center' }) });
    });
    items.push(
      { group: t('pal.gActions'), label: t('pal.copy'), hint: '@', run: copyEmail },
      { group: t('pal.gActions'), label: t('hero.cv'), hint: 'PDF', run: () => { const a = document.createElement('a'); a.href = 'assets/cv/CV_Diego_Torres_Garcia_2026.pdf'; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); } },
      { group: t('pal.gActions'), label: t('pal.li'), hint: '↗', run: () => window.open('https://www.linkedin.com/in/diego-torres-ditogar021/', '_blank', 'noopener') },
      { group: t('pal.gActions'), label: t('pal.motion'), hint: '◌', run: toggleMotion },
      { group: t('pal.gActions'), label: t('pal.warp'), hint: '✦', run: warp },
      { group: t('pal.gLang'), label: 'Español', hint: 'ES', run: () => applyLang('es', true) },
      { group: t('pal.gLang'), label: 'English', hint: 'EN', run: () => applyLang('en', true) },
      { group: t('pal.gLang'), label: 'Català', hint: 'CA', run: () => applyLang('ca', true) }
    );
    return items;
  }
  function renderPalette() {
    const q = norm(palInput.value.trim());
    palItems = buildPaletteItems().filter(it => !q || norm(it.label + ' ' + it.group).includes(q));
    palIndex = Math.min(palIndex, Math.max(0, palItems.length - 1));
    palList.innerHTML = '';
    if (!palItems.length) {
      const li = document.createElement('li');
      li.className = 'pal-empty';
      li.textContent = t('pal.empty');
      palList.appendChild(li);
      palInput.removeAttribute('aria-activedescendant');
      return;
    }
    let lastGroup = null;
    palItems.forEach((it, i) => {
      if (it.group !== lastGroup) {
        const g = document.createElement('li');
        g.className = 'pal-group mono';
        g.setAttribute('role', 'presentation');
        g.textContent = it.group;
        palList.appendChild(g);
        lastGroup = it.group;
      }
      const li = document.createElement('li');
      li.id = 'pal-opt-' + i;
      li.className = 'pal-item' + (i === palIndex ? ' on' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === palIndex));
      li.innerHTML = '<span></span><span class="mono"></span>';
      li.firstChild.textContent = it.label;
      li.lastChild.textContent = it.hint;
      li.addEventListener('mousemove', () => { if (palIndex !== i) { palIndex = i; markPalette(); } });
      li.addEventListener('click', () => execPalette(i));
      palList.appendChild(li);
    });
    palInput.setAttribute('aria-activedescendant', 'pal-opt-' + palIndex);
  }
  function markPalette() {
    $$('.pal-item', palList).forEach(li => {
      const on = li.id === 'pal-opt-' + palIndex;
      li.classList.toggle('on', on);
      li.setAttribute('aria-selected', String(on));
      if (on) li.scrollIntoView({ block: 'nearest' });
    });
    palInput.setAttribute('aria-activedescendant', 'pal-opt-' + palIndex);
  }
  function openPalette() {
    if (!pal.hidden) return;
    palOpener = document.activeElement;
    setMenu(false);
    pal.hidden = false;
    document.body.classList.add('modal-open');
    palInput.value = '';
    palIndex = 0;
    renderPalette();
    palInput.focus();
    requestAnimationFrame(() => pal.classList.add('open'));
  }
  function closePalette(restore = true) {
    if (pal.hidden) return;
    pal.classList.remove('open');
    pal.hidden = true;
    document.body.classList.remove('modal-open');
    if (restore && palOpener && palOpener.focus) palOpener.focus();
  }
  function execPalette(i) {
    const it = palItems[i];
    if (!it) return;
    closePalette(false);
    it.run();
  }
  palInput.addEventListener('input', () => { palIndex = 0; renderPalette(); });
  palInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (palItems.length) { palIndex = (palIndex + 1) % palItems.length; markPalette(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (palItems.length) { palIndex = (palIndex - 1 + palItems.length) % palItems.length; markPalette(); } }
    else if (e.key === 'Enter') { e.preventDefault(); execPalette(palIndex); }
  });
  $('#palette-open').addEventListener('click', openPalette);
  $$('[data-close]', pal).forEach(el => el.addEventListener('click', () => closePalette()));
  document.addEventListener('langchange', () => { if (!pal.hidden) renderPalette(); });

  /* ---------------- Hiperespacio ---------------- */
  function warp() {
    toast(t('toast.warp'));
    document.dispatchEvent(new CustomEvent('warp'));
  }
  const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let kIdx = 0;

  /* ---------------- Teclado global ---------------- */
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (pal.hidden) openPalette(); else closePalette();
      return;
    }
    if (!pal.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'Tab') trapFocus($('.palette-box', pal), e);
      return;
    }
    if (!lb.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLb(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLb(-1); }
      else if (e.key === 'Tab') trapFocus(lb, e);
      return;
    }
    if (e.key === 'Escape' && !mobile.hidden) { setMenu(false); menuBtn.focus(); return; }
    if (!typing && e.key === '/' ) { e.preventDefault(); openPalette(); return; }
    if (!typing) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      kIdx = key === konami[kIdx] ? kIdx + 1 : (key === konami[0] ? 1 : 0);
      if (kIdx === konami.length) { kIdx = 0; warp(); }
    }
  });

  /* ---------------- Arranque ---------------- */
  $('#year').textContent = String(new Date().getFullYear());
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (!isMac) {
    $('#palette-open .mono').textContent = 'Ctrl K';
  } else {
    const k = $$('.palette-hint kbd')[0];
    if (k) k.textContent = '⌘';
  }
  applyLang(initialLang(), false);
  onScroll();
  updateNow();
})();
