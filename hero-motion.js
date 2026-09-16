/* Hero choreography shares the site's motion preference and native scrolling. */
(() => {
  'use strict';
  const duration = 3000;
  window.NorthStarHeroMotion = Object.freeze({ create({ hero, media, image, advance }) {
    if (!hero || !media || !image) return null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let timer = null, remaining = duration, started = 0, visible = false;
    let focused = false, loading = false, initialized = false, printing = false;
    let animations = [], camera = null, progress = null, previous = null;
    const video = document.createElement('video');
    video.className = 'hero-video'; video.hidden = true; video.preload = 'none';
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
    video.setAttribute('aria-hidden', 'true'); video.tabIndex = -1;
    media.insertBefore(video, image.nextSibling);
    let videoSource = '', videoFailed = false, videoPending = false, videoRevision = 0;
    const disabled = () => reduced.matches || printing || Boolean(window.NorthStarMotion?.isPaused());
    const canPlay = () => initialized && !disabled() && !document.hidden && visible && !focused && !loading && !hero.closest('[hidden]') && !document.querySelector('dialog[open]');
    function pauseVideo() {
      videoRevision++; videoPending = false; video.pause();
      hero.dataset.heroVideoPlayback = videoSource ? 'paused' : 'inactive';
    }
    function syncVideo(playing) {
      if (!playing || !videoSource || videoFailed) {
        pauseVideo();
        if (!videoSource || disabled() || videoFailed) video.hidden = true;
        if (videoFailed) hero.dataset.heroVideoPlayback = 'poster';
        return;
      }
      // Attach the MP4 only when this scene may play; reduced-motion visits use the image alone.
      if (video.getAttribute('src') !== videoSource) video.src = videoSource;
      if (videoPending || !video.paused) return;
      const revision = ++videoRevision;
      videoPending = true; hero.dataset.heroVideoPlayback = 'loading';
      Promise.resolve(video.play()).then(() => {
        if (revision !== videoRevision) return;
        videoPending = false;
        if (!canPlay() || !videoSource) { pauseVideo(); return; }
        video.hidden = false; hero.dataset.heroVideoPlayback = 'playing';
      }).catch(() => {
        if (revision !== videoRevision) return;
        videoPending = false; videoFailed = true; video.hidden = true;
        video.pause(); hero.dataset.heroVideoPlayback = 'poster';
      });
    }
    video.addEventListener('error', () => {
      if (!videoSource) return;
      videoFailed = true; video.hidden = true; pauseVideo();
      hero.dataset.heroVideoPlayback = 'poster';
    });
    const stopTimer = () => {
      if (timer === null) return;
      clearTimeout(timer); timer = null;
      remaining = Math.max(0, remaining - (performance.now() - started));
    };
    function sync() {
      const playing = canPlay();
      hero.dataset.heroPlayback = playing ? 'playing' : 'paused';
      if (disabled()) {
        animations.forEach(animation => animation.cancel()); animations = []; camera = null;
        previous?.remove(); previous = null;
      }
      syncVideo(playing);
      if (playing && !camera && typeof image.animate === 'function') {
        camera = image.animate([{ transform: 'none' }, { transform: 'scale(1.035)' }], { duration: remaining + 1000, fill: 'both', easing: 'linear' });
        animations.push(camera);
      }
      const transitionsPlaying = !disabled() && !document.hidden && visible && !hero.closest('[hidden]') && !document.querySelector('dialog[open]');
      for (const animation of [...animations, progress].filter(Boolean)) {
        if (animation.playState === 'finished' || animation.playState === 'idle') continue;
        if (animation === camera || animation === progress ? playing : transitionsPlaying) animation.play(); else animation.pause();
      }
      if (!playing) { stopTimer(); return; }
      if (timer !== null) return;
      started = performance.now();
      timer = setTimeout(() => { timer = null; remaining = duration; advance(); }, Math.max(50, remaining));
    }
    function resetProgress() {
      stopTimer(); remaining = duration;
      progress?.cancel(); progress = null;
      const segment = hero.querySelector('[data-feature][aria-pressed="true"] .hero-segment-fill');
      if (segment && typeof segment.animate === 'function' && !disabled()) {
        progress = segment.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, fill: 'both' });
      }
    }
    function present(update, { animate = false, index = 0, videoSrc = '' } = {}) {
      stopTimer();
      pauseVideo();
      const outgoingTransform = getComputedStyle(image).transform;
      animations.forEach(animation => animation.cancel()); animations = [];
      previous?.remove(); previous = null;
      const moving = animate && !disabled() && typeof image.animate === 'function';
      if (moving) {
        previous = image.cloneNode();
        previous.removeAttribute('id'); previous.removeAttribute('fetchpriority');
        previous.classList.add('hero-image-previous'); previous.alt = ''; previous.setAttribute('aria-hidden', 'true');
        previous.style.transform = outgoingTransform;
        media.insertBefore(previous, image);
      }
      update();
      videoSource = typeof videoSrc === 'string' && /^assets\/field-media\/video\/[a-z0-9-]+\.mp4$/.test(videoSrc) ? videoSrc : '';
      videoFailed = false; video.hidden = true;
      if (videoSource) {
        video.poster = image.src;
        video.style.setProperty('--hero-position', image.style.getPropertyValue('--hero-position'));
        video.style.setProperty('--hero-mobile-position', image.style.getPropertyValue('--hero-mobile-position'));
        if (video.readyState > 0) video.currentTime = 0;
      }
      initialized = true; loading = false;
      hero.dataset.heroScene = String(index + 1);
      if (!disabled() && typeof image.animate === 'function') {
        const direction = index % 2 ? -1 : 1;
        const from = `scale(1.06) translate3d(${direction * -.8}%,.35%,0)`;
        const to = `scale(1.015) translate3d(${direction * .4}%,-.2%,0)`;
        camera = image.animate([{ transform: from }, { transform: to }], { duration: duration + 1000, fill: 'both', easing: 'linear' });
        animations.push(camera);
        if (previous) {
          animations.push(image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1100, fill: 'both', easing: 'cubic-bezier(.25,1,.5,1)' }));
          const outgoing = previous;
          const fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1250, easing: 'cubic-bezier(.25,1,.5,1)', fill: 'forwards' });
          fade.onfinish = () => { outgoing.remove(); if (previous === outgoing) previous = null; };
          animations.push(fade);
          const sweep = hero.querySelector('.hero-transition-sweep');
          if (sweep) animations.push(sweep.animate([
            { transform: 'translate3d(-180%,0,0) skewX(-16deg)', opacity: 0 },
            { opacity: .2, offset: .25 },
            { transform: 'translate3d(740%,0,0) skewX(-16deg)', opacity: 0 }
          ], { duration: 1300, easing: 'cubic-bezier(.16,1,.3,1)' }));
          const bearing = hero.querySelector('.hero-transition-bearing');
          if (bearing) animations.push(bearing.animate([
            { opacity: 0, transform: 'translate3d(-22px,0,0)' },
            { opacity: .8, offset: .4 },
            { opacity: 0, transform: 'translate3d(22px,0,0)' }
          ], { duration: 1600, easing: 'cubic-bezier(.25,1,.5,1)' }));
          const caption = hero.querySelector('.hero-feature');
          if (caption) animations.push(caption.animate([{ opacity: .3, transform: 'translate3d(0,9px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' }));
        }
      }
      resetProgress(); sync();
    }
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .15; sync();
    }, { threshold: [0, .15] }) : null;
    if (observer) observer.observe(hero); else visible = true;
    const updateFocus = () => {
      focused = hero.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      sync();
    };
    hero.addEventListener('focusin', updateFocus);
    hero.addEventListener('focusout', () => queueMicrotask(updateFocus));
    hero.addEventListener('keydown', () => queueMicrotask(updateFocus));
    // Pointer interaction should not leave automatic playback stuck on a focused control.
    hero.addEventListener('pointerdown', () => { focused = false; sync(); });
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('northstar:motion-change', sync);
    document.addEventListener('northstar:render', sync);
    document.addEventListener('toggle', sync, true);
    addEventListener('beforeprint', () => { printing = true; sync(); });
    addEventListener('afterprint', () => { printing = false; sync(); });
    addEventListener('pagehide', () => { visible = false; sync(); });
    addEventListener('pageshow', () => { const box = hero.getBoundingClientRect(); visible = box.bottom > 0 && box.top < innerHeight; sync(); });
    reduced.addEventListener('change', sync);
    return Object.freeze({
      present,
      begin() { loading = true; sync(); },
      recover() { loading = false; resetProgress(); sync(); }
    });
  } });
})();
