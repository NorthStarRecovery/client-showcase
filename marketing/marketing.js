(() => {
  'use strict';
  const search = document.querySelector('#mk-search');
  if (!search) return;
  const cards = [...document.querySelectorAll('.mk-card')];
  const categorySelect = document.querySelector('#mk-category');
  const formatSelect = document.querySelector('#mk-format');
  const categoryLinks = [...document.querySelectorAll('[data-jump-category]')];
  const clear = document.querySelector('#mk-clear-filters');
  const count = document.querySelector('#mk-count');
  const empty = document.querySelector('#mk-empty');
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const searchableText = new Map(cards.map(card => [card, normalize(card.dataset.search || '')]));
  function restoreQuery() {
    const params = new URLSearchParams(location.search);
    search.value = (params.get('q') || '').slice(0, 180);
    for (const [select, key] of [[categorySelect, 'category'], [formatSelect, 'format']]) {
      select.value = [...select.options].some(option => option.value === params.get(key)) ? params.get(key) : '';
    }
  }
  function filter(updateUrl = true) {
    const category = categorySelect.value;
    const format = formatSelect.value;
    const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matches = (!category || card.dataset.category === category) && (!format || card.dataset.format === format) && terms.every(term => searchableText.get(card).includes(term));
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
    if (updateUrl) {
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
      if (category) url.searchParams.set('category', category); else url.searchParams.delete('category');
      if (format) url.searchParams.set('format', format); else url.searchParams.delete('format');
      history.replaceState(null, '', url);
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
  categorySelect.addEventListener('change', () => filter());
  formatSelect.addEventListener('change', () => filter());
  categoryLinks.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    categorySelect.value = link.dataset.jumpCategory;
    formatSelect.value = '';
    search.value = '';
    filter();
    document.querySelector('#materials').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    search.focus({ preventScroll: true });
  }));
  document.querySelector('#mk-reset').addEventListener('click', reset);
  clear.addEventListener('click', reset);
  window.addEventListener('popstate', () => {
    restoreQuery();
    filter(false);
  });
  document.querySelector('#mk-tools').hidden = false;
  restoreQuery();
  filter(false);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!motion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('mk-in-view');
        observer.unobserve(entry.target);
      }
    }, { threshold: .08 });
    for (const element of document.querySelectorAll('.mk-card, .mk-section-intro, .mk-next')) {
      element.classList.add('mk-enter-ready');
      observer.observe(element);
    }
    motion.addEventListener('change', event => {
      if (event.matches) {
        observer.disconnect();
        document.querySelectorAll('.mk-enter-ready').forEach(element => element.classList.add('mk-in-view'));
      }
    });
  }
})();
