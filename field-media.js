/* Field photography is additive; original case galleries and hero artwork remain intact. */
(() => {
  'use strict';
  const dialog = document.getElementById('field-lightbox');
  const links = [...document.querySelectorAll('[data-field-photo]')];
  let current = 0, opener = null;
  const visibleLinks = () => links.filter(link => !link.closest('.field-photo-card')?.hidden);
  const filter = document.getElementById('field-group');
  if (filter) {
    filter.closest('label').hidden = false;
    filter.addEventListener('change', () => {
      for (const card of document.querySelectorAll('.field-photo-card')) card.hidden = Boolean(filter.value && card.dataset.fieldGroup !== filter.value);
      const count = visibleLinks().length;
      document.getElementById('field-result-count').textContent = `${count} ${count === 1 ? 'photograph' : 'photographs'}${filter.value ? ` / ${filter.value}` : ' / All locations'}`;
    });
  }
  if (dialog) {
    const image = document.getElementById('field-lightbox-image');
    const caption = document.getElementById('field-lightbox-caption');
    const position = document.getElementById('field-lightbox-position');
    const show = index => {
      const available = visibleLinks();
      if (!available.length) return;
      current = (index + available.length) % available.length;
      const link = available[current];
      image.src = link.href;
      image.alt = link.querySelector('img').alt;
      caption.textContent = `${link.dataset.group} — ${link.dataset.caption}`;
      position.textContent = `${current + 1} / ${available.length}`;
    };
    for (const link of links) link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (typeof dialog.showModal !== 'function') return;
      event.preventDefault(); opener = link;
      show(visibleLinks().indexOf(link)); dialog.showModal();
    });
    dialog.querySelector('[data-field-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-field-previous]').addEventListener('click', () => show(current - 1));
    dialog.querySelector('[data-field-next]').addEventListener('click', () => show(current + 1));
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1)); }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { image.removeAttribute('src'); opener?.focus({preventScroll:true}); });
  }
  const films = [...document.querySelectorAll('.field-films video')];
  const pauseAll = () => films.forEach(film => film.pause());
  for (const film of films) film.addEventListener('play', () => films.filter(other => other !== film).forEach(other => other.pause()));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });
  window.addEventListener('pagehide', pauseAll);
  document.addEventListener('northstar:render', () => { if (document.getElementById('home-page')?.hidden) pauseAll(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (!entry.isIntersecting) entry.target.pause(); }), {threshold:0});
    films.forEach(film => observer.observe(film));
  }
})();
