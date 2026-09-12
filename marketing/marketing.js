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
  document.querySelector('#mk-reset').addEventListener('click', () => { category = ''; search.value = ''; filter(); search.focus(); });
  window.addEventListener('popstate', () => {
    const state = new URLSearchParams(location.search);
    search.value = (state.get('q') || '').slice(0, 180);
    category = buttons.some(button => button.dataset.category === state.get('category')) ? state.get('category') : '';
    filter(false);
  });
  document.querySelector('#mk-tools').hidden = false;
  filter(false);
})();
