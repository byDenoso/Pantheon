/** Choose one active asset before assigning video.src; no hidden high-resolution preloads. */
export function selectCinemaSource(assets, theme, orientation, {width, coarse = false, saveData = false, effectiveType = ''}) {
  const constrained = saveData || /^(slow-2g|2g|3g)$/.test(effectiveType);
  return width >= 960 && !coarse && !constrained
    ? (assets.videosHd?.[theme]?.[orientation] || assets.videos[theme][orientation])
    : assets.videos[theme][orientation];
}

/** Decorative pre-rendered volumetric film. No WebGL, data access or pointer capture. */
export function createCinemaMedia(container, assets, {paused = false, onMode = () => {}} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const mq = win.matchMedia('(prefers-reduced-motion: reduce)');
  const dataMq = win.matchMedia('(prefers-reduced-data: reduce)'), pointerMq = win.matchMedia('(pointer: coarse)');
  const connection = win.navigator?.connection;
  let generation = 0;
  let stopped = false, theme = doc.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  let manualPause = paused, hidden = doc.hidden, current = '', time = 0, failed = false, mode = 'poster';
  const img = doc.createElement('img'), video = doc.createElement('video');
  img.alt = ''; img.decoding = 'async'; img.className = 'nexo-cinema-poster';
  video.className = 'nexo-cinema-video'; video.muted = true; video.defaultMuted = true;
  video.loop = true; video.playsInline = true; video.setAttribute('playsinline', '');
  video.setAttribute('muted', ''); video.preload = 'metadata'; video.disablePictureInPicture = true;
  container.append(img, video);
  const orientation = () => win.innerHeight > win.innerWidth ? 'portrait' : 'landscape';
  const reduced = () => mq.matches;
  const setMode = next => { mode = next; container.dataset.mode = next; onMode(next); };
  const poster = () => {
    const index = Math.min(2, Math.max(0, Math.floor(time / 9)));
    const src = assets.posters[theme][orientation()][index];
    if (img.getAttribute('src') !== src) img.src = src;
    video.poster = src;
  };
  const fail = () => { if (stopped) return; failed = true; video.pause(); setMode('poster'); poster(); };
  const play = () => {
    if (stopped || hidden || manualPause || reduced() || failed) { video.pause(); return; }
    const requestGeneration = generation;
    const rejected = error => {
      // A replaced source or deliberate pause cancels the earlier play promise.
      // That cancellation must not disable the new theme/orientation's video.
      if (stopped || requestGeneration !== generation || hidden || manualPause || reduced() || error?.name === 'AbortError') return;
      fail();
    };
    try { const p = video.play(); if (p?.catch) p.catch(rejected); } catch (error) { rejected(error); }
  };
  const changeSource = () => {
    if (stopped) return;
    poster();
    if (reduced()) { generation++; video.pause(); video.removeAttribute('src'); video.load(); current = ''; setMode('poster'); return; }
    const src = selectCinemaSource(assets, theme, orientation(), {width: win.innerWidth, coarse: pointerMq.matches, saveData: dataMq.matches || connection?.saveData, effectiveType: connection?.effectiveType});
    if (current !== src) {
      if (Number.isFinite(video.currentTime) && video.currentTime > 0) time = video.currentTime;
      generation++; video.pause(); setMode('poster'); current = src; failed = false; video.src = src; video.load();
    }
    play();
  };
  const metadata = () => { if (stopped) return; try { video.currentTime = time % (video.duration || 27); } catch {} poster(); if (manualPause && video.readyState >= 2) setMode('video'); play(); };
  const playable = () => { if (!stopped && !failed && !reduced()) setMode('video'); };
  const clock = () => { if (!stopped && Number.isFinite(video.currentTime)) time = video.currentTime; };
  const visibility = () => { hidden = doc.hidden; if (hidden) video.pause(); else play(); };
  const preference = () => { time = video.currentTime || time; changeSource(); };
  const resize = () => changeSource();
  video.addEventListener('loadedmetadata', metadata); video.addEventListener('loadeddata', playable);
  video.addEventListener('playing', playable); video.addEventListener('error', fail); video.addEventListener('timeupdate', clock);
  doc.addEventListener('visibilitychange', visibility); mq.addEventListener('change', preference);
  dataMq.addEventListener('change', changeSource); pointerMq.addEventListener('change', changeSource); connection?.addEventListener?.('change', changeSource);
  win.addEventListener('resize', resize, {passive: true});
  const observer = new win.MutationObserver(() => {
    const next = doc.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    if (next !== theme) { theme = next; changeSource(); }
  });
  observer.observe(doc.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  changeSource();
  return {
    setPaused(value) { manualPause = value === true; if (manualPause) video.pause(); else { if (failed) { failed = false; setMode('poster'); } play(); } },
    getState() { return {mode, paused: manualPause, reducedMotion: reduced(), hidden, failed, theme, orientation: orientation(), source: current, time}; },
    dispose() {
      if (stopped) return; stopped = true; generation++; video.pause();
      video.removeEventListener('loadedmetadata', metadata); video.removeEventListener('loadeddata', playable);
      video.removeEventListener('playing', playable); video.removeEventListener('error', fail); video.removeEventListener('timeupdate', clock);
      doc.removeEventListener('visibilitychange', visibility); mq.removeEventListener('change', preference); win.removeEventListener('resize', resize); observer.disconnect();
      dataMq.removeEventListener('change', changeSource); pointerMq.removeEventListener('change', changeSource); connection?.removeEventListener?.('change', changeSource);
      video.removeAttribute('src'); video.load(); video.remove(); img.remove();
    },
  };
}
