(() => {
  'use strict';
  if (window.NorthStarMotion) { window.NorthStarMotion.refresh(); return; }
  const body = document.body;
  if (!body) return;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'northstar-motion-paused';
  const toggleSelector = '#motion-toggle,[data-motion-toggle]';
  const revealSelector = [
    '.reveal', '[data-motion-reveal]', '.industry-entrance', '.project-card',
    '.project-facts', '.response-sequence li', '.project-context', '.project-contact',
    '.motion-story-heading', '.motion-story-step', '.marketing-spotlight-copy',
    '.mk-card', '.ul-card', '.mk-section-intro', '.mk-focus-proof',
    '.mk-readiness-agenda li', '.mk-next', '.ul-reader-heading', '.ul-reader-body'
  ].join(',');
  const pending = new Set();
  const completed = new WeakSet();
  let userPaused = false, printing = false, frame = null, refreshQueued = false;
  let headers = [], sectionLinks = [], stories = [];
  try { userPaused = localStorage.getItem(storageKey) === 'true'; } catch { /* The current visit still supports pausing. */ }
  const isPaused = () => media.matches || userPaused || printing;
  const clamp = value => Math.max(0, Math.min(1, value));
  const rendered = element => element.isConnected && element.getClientRects().length > 0 && !element.closest('[hidden]');

  function reveal(element) {
    element.classList.remove('motion-awaiting', 'awaiting');
    pending.delete(element);
    observer?.unobserve(element);
    completed.add(element);
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.target.isConnected || isPaused() || (entry.isIntersecting && rendered(entry.target))) reveal(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px 32px 0px' }) : null;

  function enrollReveals() {
    for (const element of pending) if (!rendered(element)) reveal(element);
    for (const element of document.querySelectorAll(revealSelector)) {
      if (completed.has(element) || pending.has(element) || !rendered(element)) continue;
      element.classList.add('motion-reveal');
      // Never conceal something already on screen or containing keyboard focus.
      if (!observer || isPaused() || element.contains(document.activeElement) || element.getBoundingClientRect().top < innerHeight) {
        reveal(element);
      } else {
        element.classList.add('motion-awaiting');
        pending.add(element);
        observer.observe(element);
      }
    }
  }

  function apply() {
    const paused = isPaused();
    body.classList.toggle('motion-enabled', !paused);
    body.classList.toggle('motion-disabled', paused);
    for (const toggle of document.querySelectorAll(toggleSelector)) {
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-disabled', String(media.matches));
      toggle.setAttribute('aria-label', media.matches ? 'Reduced motion follows your device setting' : paused ? 'Turn on motion' : 'Pause motion');
      const label = media.matches ? 'Reduced motion' : paused ? 'Motion off' : 'Motion on';
      const markup = '<i class="icon ' + (paused ? 'play' : 'pause') + '" aria-hidden="true"></i><span>' + label + '</span>';
      if (toggle.innerHTML !== markup) toggle.innerHTML = markup;
    }
    if (paused) {
      for (const element of [...pending]) reveal(element);
      document.querySelectorAll('.awaiting').forEach(element => element.classList.remove('awaiting'));
    }
    document.dispatchEvent(new CustomEvent('northstar:motion-change', { detail: { paused } }));
  }

  function updateStory(story) {
    if (!rendered(story.element)) return;
    const steps = story.steps.filter(rendered);
    if (!steps.length) return;
    const anchor = innerHeight * .48;
    const boxes = steps.map(step => step.getBoundingClientRect());
    const centers = boxes.map(box => box.top + Math.min(box.height / 2, innerHeight * .3));
    let active = 0;
    for (let index = 1; index < centers.length; index++) {
      if (Math.abs(centers[index] - anchor) < Math.abs(centers[active] - anchor)) active = index;
    }
    // Centers follow the real layout, including the stacked phone chapters.
    const span = centers[centers.length - 1] - centers[0];
    const box = story.element.getBoundingClientRect();
    const progress = span > 1 ? clamp((anchor - centers[0]) / span) : clamp((innerHeight - box.top) / (innerHeight + box.height));
    story.element.style.setProperty('--story-progress', progress.toFixed(4));
    steps.forEach((step, index) => step.classList.toggle('is-active', index === active));
  }

  function progress() {
    const bar = document.getElementById('reading-progress');
    const range = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (range > 0 ? clamp(scrollY / range) : 0) + ')';
    const scrolled = scrollY > 24;
    body.classList.toggle('page-scrolled', scrolled);
    for (const header of headers) header.classList.toggle('is-scrolled', scrolled);
    const offset = Math.max(160, ...headers.filter(rendered).map(header => header.getBoundingClientRect().bottom + 90));
    let active = sectionLinks[0];
    for (const link of sectionLinks) {
      const section = document.getElementById(link.dataset.projectSection);
      if (section && section.getBoundingClientRect().top < offset) active = link;
    }
    for (const link of sectionLinks) {
      if (link === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    for (const story of stories) updateStory(story);
    // Also release targets after instant navigation or a large scroll jump.
    for (const element of [...pending]) {
      if (!rendered(element) || element.getBoundingClientRect().top < innerHeight) reveal(element);
    }
  }

  function refresh() {
    headers = [...document.querySelectorAll('.site-header,.mk-header,.up-header,.tt-header,.ns-privacy-header')];
    sectionLinks = [...document.querySelectorAll('.project-section-nav a[data-project-section]')];
    stories = [...document.querySelectorAll('[data-motion-story]')].map(element => ({ element, steps: [...element.querySelectorAll('.motion-story-step')] }));
    apply();
    enrollReveals();
    body.classList.add('motion-ready');
    progress();
  }

  function schedule(needsRefresh = false) {
    refreshQueued ||= needsRefresh;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const rebuild = refreshQueued;
      refreshQueued = false;
      if (rebuild) refresh(); else progress();
    });
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest(toggleSelector) || media.matches) return;
    userPaused = !userPaused;
    try { localStorage.setItem(storageKey, String(userPaused)); } catch { /* Persist for this visit only. */ }
    refresh();
  });
  document.addEventListener('focusin', event => {
    if (!(event.target instanceof Element)) return;
    for (const element of [...pending]) if (element === event.target || element.contains(event.target)) reveal(element);
  });
  document.addEventListener('toggle', () => schedule(true), true);
  document.addEventListener('northstar:render', refresh);
  document.addEventListener('northstar:materials-updated', refresh);
  addEventListener('scroll', () => schedule(), { passive: true });
  addEventListener('resize', () => schedule(true), { passive: true });
  addEventListener('pageshow', () => schedule(true));
  addEventListener('beforeprint', () => { printing = true; refresh(); });
  addEventListener('afterprint', () => { printing = false; refresh(); });
  addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    userPaused = event.key === null ? false : event.newValue === 'true';
    refresh();
  });
  media.addEventListener('change', refresh);
  // Async readers and filtered marketing cards can change without a route event.
  if ('MutationObserver' in window) {
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) schedule(true);
    });
    mutations.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  window.NorthStarMotion = Object.freeze({ isPaused, refresh });
  refresh();
})();
