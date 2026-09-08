(() => {
  'use strict';
  const body = document.body, media = matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = false, pendingFrame = false;
  const observed = new WeakSet();
  try { userPaused = localStorage.getItem('northstar-motion-paused') === 'true'; } catch { /* Device motion preferences still apply. */ }
  const paused = () => media.matches || userPaused;
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.remove('awaiting'); observer.unobserve(entry.target); }
  }), {threshold:.1,rootMargin:'0px 0px -18px 0px'}) : null;
  function bindReveals() {
    document.querySelectorAll('.reveal').forEach(element => {
      if (observed.has(element)) return;
      observed.add(element);
      if (observer) {
        if (element.getBoundingClientRect().top > innerHeight && !paused()) element.classList.add('awaiting');
        observer.observe(element);
      }
    });
  }
  function apply() {
    body.classList.toggle('motion-enabled',!paused()); body.classList.toggle('motion-disabled',paused());
    document.querySelectorAll('#motion-toggle,[data-motion-toggle]').forEach(toggle => {
      toggle.setAttribute('aria-pressed',String(paused()));
      toggle.innerHTML = '<i class="icon ' + (paused() ? 'play' : 'pause') + '" aria-hidden="true"></i><span>' + (media.matches ? 'Reduced motion' : paused() ? 'Motion off' : 'Motion on') + '</span>';
      toggle.setAttribute('aria-label',media.matches ? 'Reduced motion follows your device setting' : paused() ? 'Turn on motion' : 'Pause motion');
      toggle.setAttribute('aria-disabled',String(media.matches));
    });
    if (paused()) document.querySelectorAll('.awaiting').forEach(element => element.classList.remove('awaiting'));
  }
  document.addEventListener('click',event => {
    if (!event.target.closest('#motion-toggle,[data-motion-toggle]') || media.matches) return;
    userPaused = !userPaused;
    try { localStorage.setItem('northstar-motion-paused',String(userPaused)); } catch { /* The toggle remains active for this visit. */ }
    apply();
  });
  function progress() {
    const range = document.documentElement.scrollHeight - innerHeight;
    document.getElementById('reading-progress').style.transform = 'scaleX(' + (range > 0 ? Math.min(1,scrollY/range) : 0) + ')';
    const links = [...document.querySelectorAll('.project-section-nav a[data-project-section]')];
    let active = links[0];
    for (const link of links) { const section = document.getElementById(link.dataset.projectSection); if (section && section.getBoundingClientRect().top < 220) active = link; }
    links.forEach(link => { if (link === active) link.setAttribute('aria-current','true'); else link.removeAttribute('aria-current'); });
    pendingFrame = false;
  }
  addEventListener('scroll',() => { if (!pendingFrame) { pendingFrame = true; requestAnimationFrame(progress); } },{passive:true});
  addEventListener('resize',progress); media.addEventListener('change',apply);
  document.addEventListener('northstar:render',() => { bindReveals(); apply(); progress(); });
  apply(); bindReveals(); progress();
})();
