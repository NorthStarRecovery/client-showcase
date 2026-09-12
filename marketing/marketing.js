(() => {
  'use strict';
  const search = document.querySelector('#mk-search');
  if (!search) return;
  const cards = [...document.querySelectorAll('.mk-card')];
  const buttons = [...document.querySelectorAll('.mk-filters button[data-category]')];
  const count = document.querySelector('#mk-count');
  const empty = document.querySelector('#mk-empty');
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const params = new URLSearchParams(location.search);
  let category = buttons.some(button => button.dataset.category === params.get('category')) ? params.get('category') : '';
  search.value = (params.get('q') || '').slice(0, 180);
  function filter(updateUrl = true) {
    const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matches = (!category || card.dataset.category === category) && terms.every(term => normalize(card.dataset.search).includes(term));
      card.hidden = !matches;
      if (matches) visible++;
    }
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    count.textContent = visible + (visible === 1 ? ' material' : ' materials') + ((category || terms.length) ? ' found' : '');
    empty.hidden = visible > 0;
    if (updateUrl) {
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
      if (category) url.searchParams.set('category', category); else url.searchParams.delete('category');
      history.replaceState(null, '', url);
    }
  }
  search.addEventListener('input', () => filter());
  buttons.forEach(button => button.addEventListener('click', () => { category = button.dataset.category; filter(); }));
  document.querySelectorAll('[data-jump-category]').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    category = link.dataset.jumpCategory;
    search.value = '';
    filter();
    document.querySelector('#materials').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    search.focus({ preventScroll: true });
  }));
  document.querySelector('#mk-reset').addEventListener('click', () => { category = ''; search.value = ''; filter(); search.focus(); });
  window.addEventListener('popstate', () => {
    const state = new URLSearchParams(location.search);
    search.value = (state.get('q') || '').slice(0, 180);
    category = buttons.some(button => button.dataset.category === state.get('category')) ? state.get('category') : '';
    filter(false);
  });
  document.querySelector('#mk-tools').hidden = false;
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
