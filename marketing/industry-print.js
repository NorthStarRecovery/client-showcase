(() => {
  'use strict';
  const pages = [...document.querySelectorAll('.industry-document .page')];
  const shells = pages.map(page => {
    const shell = document.createElement('div');
    shell.className = 'page-shell';
    page.before(shell);
    shell.append(page);
    return shell;
  });
  const scalePages = () => {
    const scale = Math.min(1, Math.max(0.1, (document.documentElement.clientWidth - 24) / 816));
    for (const [index, shell] of shells.entries()) {
      shell.style.width = `${816 * scale}px`;
      shell.style.height = `${1056 * scale}px`;
      pages[index].style.transform = `scale(${scale})`;
    }
  };
  scalePages();
  document.body.classList.add('document-enhanced');
  window.addEventListener('resize', scalePages, {passive:true});
  document.querySelector('.print-action')?.addEventListener('click', () => window.print());
})();
