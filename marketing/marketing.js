(() => {
  'use strict';
  const search = document.querySelector('#mk-search');
  if (!search) return;
  const grid = document.querySelector('#mk-grid');
  const categorySelect = document.querySelector('#mk-category');
  const formatSelect = document.querySelector('#mk-format');
  const categoryLinks = [...document.querySelectorAll('[data-jump-category]')];
  const clear = document.querySelector('#mk-clear-filters');
  const count = document.querySelector('#mk-count');
  const empty = document.querySelector('#mk-empty');
  const scenes = [...document.querySelectorAll('.mk-focus-scene')];
  const focusStatus = document.querySelector('#mk-focus-status');
  const focusSelect = document.querySelector('#mk-focus-select');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const sceneAnimations = new Set();
  function motionPaused() {
    if (motion.matches || window.NorthStarMotion?.isPaused()) return true;
    try { return localStorage.getItem('northstar-motion-paused') === 'true'; }
    catch { return false; }
  }
  function cancelSceneAnimations() {
    sceneAnimations.forEach(animation => animation.cancel());
    sceneAnimations.clear();
  }
  document.addEventListener('northstar:motion-change', () => {
    if (motionPaused()) cancelSceneAnimations();
  });
  motion.addEventListener('change', () => {
    if (motionPaused()) cancelSceneAnimations();
  });
  let currentScene = scenes.find(scene => !scene.hidden);
  function showIndustry(category) {
    const scene = scenes.find(item => item.dataset.industry === category) || scenes[0];
    if (!scene) return;
    const changed = currentScene !== scene;
    scenes.forEach(item => { item.hidden = item !== scene; });
    currentScene = scene;
    focusSelect.value = scene.dataset.industry;
    focusStatus.textContent = displayCategory(scene.dataset.industry) + ' in focus';
    if (changed) cancelSceneAnimations();
    if (changed && !motionPaused() && typeof scene.animate === 'function') {
      const animation = scene.animate([{ opacity: .4, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' });
      sceneAnimations.add(animation);
      animation.addEventListener('finish', () => sceneAnimations.delete(animation), { once: true });
    }
  }
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const displayCategory = value => ({ Medical: 'Healthcare', Commercial: 'Commercial real estate' })[value] || value;
  const canonicalCategory = value => ({ Healthcare: 'Medical', Commercial: 'Commercial real estate' })[value] || value;
  const searchableText = new WeakMap();
  function cardText(card) {
    if (!searchableText.has(card)) {
      const category = canonicalCategory(card.dataset.category);
      const aliases = category === 'Medical' ? 'healthcare medical hospital hospitals' : '';
      const text = normalize([card.dataset.search || '', displayCategory(category), aliases].join(' '));
      searchableText.set(card, new Set(text.match(/[\p{L}\p{N}]+/gu) || []));
    }
    return searchableText.get(card);
  }
  function restoreQuery() {
    const params = new URLSearchParams(location.search);
    search.value = (params.get('q') || '').slice(0, 180);
    for (const [select, key] of [[categorySelect, 'category'], [formatSelect, 'format']]) {
      const value = key === 'category' ? canonicalCategory(params.get(key)) : params.get(key);
      select.value = [...select.options].some(option => option.value === value) ? value : '';
    }
  }
  function filter(updateUrl = true, hash) {
    const category = categorySelect.value;
    const format = formatSelect.value;
    const terms = normalize(search.value.trim()).match(/[\p{L}\p{N}]+/gu) || [];
    const cards = [...grid.querySelectorAll('.mk-card, .ul-card')];
    let visible = 0;
    for (const card of cards) {
      const words = cardText(card);
      const matches = (!category || canonicalCategory(card.dataset.category) === category) && (!format || card.dataset.format === format) && terms.every(term => words.has(term) || words.has(term + 's') || (term.endsWith('s') && words.has(term.slice(0, -1))));
      card.hidden = !matches;
      if (matches) visible++;
    }
    categoryLinks.forEach(link => {
      if (link.dataset.jumpCategory === category) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    const filtered = Boolean(category || format || terms.length);
    count.textContent = visible + (visible === 1 ? ' material' : ' materials') + (filtered ? ' found' : '');
    clear.hidden = !filtered;
    empty.hidden = visible > 0;
    showIndustry(category);
    window.NorthStarAnalytics?.page({page_type:'marketing',industry:category || 'All industries'});
    if (updateUrl) {
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
      if (category) url.searchParams.set('category', category); else url.searchParams.delete('category');
      if (format) url.searchParams.set('format', format); else url.searchParams.delete('format');
      if (hash !== undefined) url.hash = hash;
      history[updateUrl === 'push' ? 'pushState' : 'replaceState'](null, '', url);
    }
  }
  function reset() {
    categorySelect.value = '';
    formatSelect.value = '';
    search.value = '';
    filter();
    search.focus();
  }
  search.addEventListener('input', () => filter());
  categorySelect.addEventListener('change', () => { filter(); window.NorthStarAnalytics?.track('industry_select',{industry:categorySelect.value || 'All industries',placement:'category_filter'}); });
  formatSelect.addEventListener('change', () => filter());
  focusSelect.addEventListener('change', () => {
    categorySelect.value = focusSelect.value;
    formatSelect.value = '';
    search.value = '';
    filter('push', 'industry-focus');
    window.NorthStarAnalytics?.track('industry_select',{industry:focusSelect.value,placement:'industry_focus'});
  });
  categoryLinks.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    categorySelect.value = link.dataset.jumpCategory;
    formatSelect.value = '';
    search.value = '';
    const industry = scenes.some(scene => scene.dataset.industry === link.dataset.jumpCategory);
    filter('push', industry ? 'industry-focus' : 'materials');
    window.NorthStarAnalytics?.track('industry_select',{industry:link.dataset.jumpCategory,placement:'industry_navigation'});
    document.querySelector(industry ? '#industry-focus' : '#materials').scrollIntoView({ behavior: motionPaused() ? 'instant' : 'smooth', block: 'start' });
    (industry ? currentScene.querySelector('h2') : search).focus({ preventScroll: true });
  }));
  document.querySelector('.mk-focus-navigation a').addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    categorySelect.value = '';
    formatSelect.value = '';
    search.value = '';
    filter('push', 'materials');
    document.querySelector('#materials').scrollIntoView({ behavior: motionPaused() ? 'instant' : 'smooth', block: 'start' });
    search.focus({ preventScroll: true });
  });
  // The document base serves static releases; in-page links retain their selected industry.
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const hash = link.getAttribute('href');
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.hash = hash;
    history.pushState(null, '', url);
    target.scrollIntoView({ behavior: motionPaused() ? 'instant' : 'smooth', block: 'start' });
    const heading = hash === '#industry-focus' ? currentScene.querySelector('h2') : target.querySelector('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }));
  document.querySelector('#mk-reset').addEventListener('click', reset);
  clear.addEventListener('click', reset);
  window.addEventListener('popstate', () => {
    restoreQuery();
    filter(false);
  });
  document.addEventListener('northstar:materials-updated', () => filter(false));
  document.querySelector('#mk-tools').hidden = false;
  document.querySelector('#mk-focus-switch').hidden = false;
  restoreQuery();
  filter(false);
})();
