/* Editorial NorthStar portfolios. Fonts and imagery are embedded before pagination. */
(function () {
  'use strict';
  const activeScript = document.currentScript;
  const base = new URL('.', activeScript && activeScript.src ? activeScript.src : location.href);
  // A downloaded portfolio must never send its recipient back to the author's preview server.
  const publicationBase = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.protocol === 'file:' ? new URL('https://northstarrecovery.github.io/client-showcase/') : base;
  const cache = new Map();
  const defaults = { title: 'Selected\nexperience.', subtitle: 'A selection of NorthStar projects.', logo: 'assets/brand/v2-symbol-blue.svg', edition: 'executive', audience: 'client', introduction: '', contactName: 'NorthStar', contactEmail: 'contact@northstar.com', contactUrl: 'https://www.northstar.com/contact-us/' };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  function text(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    if (typeof value === 'object') return text(value.text || value.label || value.name || value.value || '');
    return String(value).trim();
  }
  function safeName(value) { return text(value).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 100) || 'NorthStar Portfolio'; }
  function externalUrl(value) { try { const url = new URL(text(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  function emailUrl(value) { const address = text(value); return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) ? 'mailto:' + encodeURIComponent(address).replace(/%40/g, '@') : ''; }
  function displayCaption(caption) { return text(caption).replace(/\s*Conceptual (?:project )?illustration[.;]?\s*(?:Not a (?:site|project) photograph(?: or plan)?\.?|Not a photograph of the project\.?)?/gi, '').trim(); }
  function resourceUrl(value) {
    if (!value) return '';
    if (/^data:(?:image\/(?:png|jpeg|webp|gif|avif|svg\+xml)|font\/[^;,]+|application\/(?:font-[^;,]+|octet-stream));/i.test(String(value))) return String(value);
    try {
      const url = new URL(value, base);
      if (!['http:', 'https:', 'file:', 'blob:'].includes(url.protocol)) return '';
      if (!['file:', 'blob:'].includes(url.protocol) && url.origin !== base.origin) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  async function photographBlob(blob) {
    if (!/^image\/(?:png|webp|avif|gif)$/i.test(blob.type)) return blob;
    const objectUrl = URL.createObjectURL(blob);
    try {
      const photograph = new Image(); photograph.src = objectUrl; await photograph.decode();
      const canvas = document.createElement('canvas'); canvas.width = photograph.naturalWidth; canvas.height = photograph.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('A photograph could not be prepared.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(photograph, 0, 0);
      return await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('A photograph could not be prepared.')), 'image/jpeg', 0.9));
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  async function embed(value, isPhotograph) {
    const url = resourceUrl(value);
    if (!url) throw new Error('An image could not be loaded.');
    if (url.startsWith('data:')) return url;
    const cacheKey = (isPhotograph ? 'photo:' : 'asset:') + url;
    if (!cache.has(cacheKey)) {
      const promise = (async () => {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('A portfolio image or font could not be loaded.');
          let blob = await response.blob();
          if (/\.ttf(?:[?#]|$)/i.test(url)) blob = new Blob([blob], { type: 'font/ttf' });
          if (isPhotograph) blob = await photographBlob(blob);
          return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('An asset could not be prepared.')); reader.readAsDataURL(blob); });
        } finally { clearTimeout(timeout); }
      })();
      cache.set(cacheKey, promise); promise.catch(() => cache.delete(cacheKey));
    }
    return cache.get(cacheKey);
  }
  function normalize(study, index) {
    const heroValue = study.hero || study.image || '';
    const hero = typeof heroValue === 'object' ? heroValue.src : heroValue;
    const imageValues = [hero].concat(Array.isArray(study.images) ? study.images.map(image => typeof image === 'string' ? image : image.src) : []).filter(Boolean);
    if (!imageValues.length && study.visual && study.visual.src) imageValues.push(study.visual.src);
    const images = imageValues.map(resourceUrl).filter(Boolean);
    const captions = {};
    imageValues.forEach(value => { const conceptual = study.visual && resourceUrl(study.visual.src) === resourceUrl(value) && study.visual.kind === 'conceptual'; const caption = text((study.imageCaptions || {})[value]) || (conceptual ? text(study.visual.caption) : ''); captions[resourceUrl(value)] = { caption, conceptual: !!conceptual }; });
    const overview = text(study.overview || study.narrative || study.description);
    const key = overview.replace(/\s+/g, ' ');
    const sections = (Array.isArray(study.sections) ? study.sections : []).map(section => ({ heading: text(section.heading || section.title), text: text(section.text || section.body) })).filter(section => section.text && section.text.replace(/\s+/g, ' ') !== key);
    return {
      id: 'project-' + (index + 1), title: text(study.title) || 'NorthStar Project', sector: text(study.sector), location: text(study.location), event: text(study.event), period: text(study.period), year: text(study.year),
      services: text(study.services), summary: text(study.summary), overview, sections, outcome: text(study.outcome),
      executive: ['challenge', 'response', 'result'].map(key => ({ heading: key === 'response' ? 'NorthStar\u2019s response' : key[0].toUpperCase() + key.slice(1), text: text(study.executive && study.executive[key]) })).filter(section => section.text),
      highlights: (Array.isArray(study.highlights) ? study.highlights : []).filter(metric => metric && (metric.value || metric.value === 0)).map(metric => ({ value: text(metric.value), label: text(metric.label) })).slice(0, 3),
      timeline: (Array.isArray(study.timeline) ? study.timeline : []).map(item => ({ label: text(item.label), text: text(item.text) })).filter(item => item.text),
      research: { context: text(study.research && study.research.context), sources: (study.research && Array.isArray(study.research.sources) ? study.research.sources : []).map(source => ({ title: text(source.title), url: externalUrl(source.url) })).filter(source => source.title && source.url) },
      metrics: (Array.isArray(study.metrics) ? study.metrics : []).filter(metric => metric && (metric.value || metric.value === 0)).map(metric => ({ value: text(metric.value), label: text(metric.label).replace(/\bsource[- ]reported\b/gi, 'Reported').replace(/\bsource\s*:\s*/gi, '') })),
      qualifiers: (Array.isArray(study.qualifiers) ? study.qualifiers : Array.isArray(study.editorialNotes) ? study.editorialNotes : []).map(text).filter(Boolean),
      images: Array.from(new Set(images)).slice(0, 3), captions,
      storyVisual: study.storyVisual && resourceUrl(study.storyVisual.src) && resourceUrl(study.storyVisual.src) !== images[0] ? { src: resourceUrl(study.storyVisual.src), title: text(study.storyVisual.title) || 'Project explained', caption: text(study.storyVisual.caption), description: text(study.storyVisual.description), conceptual: study.storyVisual.kind === 'conceptual' } : null,
      restricted: study.restricted === true
    };
  }
  function paragraphMarkup(value, extraClass) { return text(value).split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean).map(paragraph => '<p class="story-block' + (extraClass ? ' ' + extraClass : '') + '">' + escape(paragraph.replace(/\r?\n/g, ' ')) + '</p>').join(''); }
  function logoMarkup(logo) { return '<div class="page-logo">' + (logo ? '<img src="' + escape(logo) + '" alt="">' : '') + '<strong>NorthStar</strong></div>'; }
  function header(logo, label, restricted) { return '<header class="page-header">' + logoMarkup(logo) + '<div class="page-header-label">' + escape(label) + (restricted ? '<span class="confidential">Restricted / Internal use only</span>' : '') + '</div></header>'; }
  function footer(label) { return '<footer class="page-footer"><span class="page-footer-title">' + escape(label) + '</span><span class="page-number"></span></footer>'; }
  function page(className, content, id) { return '<div class="page-wrap"><section class="page ' + className + '"' + (id ? ' id="' + id + '"' : '') + '>' + content + '</section></div>'; }
  function supportingResources(studies, logo, internal, confidential) {
    // These designed, public guides are part of every release; IDs and titles match data/marketing.json.
    const guides = {
      hospitality: ['hospitality-recovery', 'Hospitality recovery'],
      healthcare: ['medical-brief', 'Medical recovery brief'],
      medical: ['medical-brief', 'Medical recovery brief'],
      industrial: ['industrial-brief', 'Industrial recovery brief'],
      manufacturing: ['manufacturing-brief', 'Manufacturing recovery brief'],
      commercial: ['commercial-real-estate-brief', 'Commercial real estate recovery brief'],
      'commercial real estate': ['commercial-real-estate-brief', 'Commercial real estate recovery brief'],
      education: ['education-brief', 'Education recovery brief'],
      technology: ['technology-brief', 'Technology recovery brief']
    };
    const selected = new Map();
    studies.forEach(study => {
      const sectorKey = study.sector.toLowerCase();
      const [id, title] = Object.hasOwn(guides, sectorKey) ? guides[sectorKey] : ['national-recovery-capabilities', 'National recovery capabilities'];
      if (!selected.has(id)) selected.set(id, { id, title, sectors: new Set() });
      if (study.sector) selected.get(id).sectors.add(study.sector === 'Medical' ? 'Healthcare' : study.sector);
    });
    const materials = Array.from(selected.values());
    let markup = '';
    for (let offset = 0; offset < materials.length; offset += 6) {
      const cards = materials.slice(offset, offset + 6).map(material => {
        const url = new URL('marketing/' + material.id + '.html', publicationBase);
        const pdf = new URL('marketing/downloads/' + material.id + '.pdf', publicationBase);
        return '<li class="resource-card" data-resource-id="' + material.id + '"><p class="resource-sectors">' + escape(Array.from(material.sectors).join(' / ') || 'Recovery services') + '</p><h3>' + escape(material.title) + '</h3><div class="resource-actions"><a href="' + escape(url.href) + '">Read online <span aria-hidden="true">\u2197</span></a><a href="' + escape(pdf.href) + '" aria-label="PDF: ' + escape(material.title) + '">Open PDF <span aria-hidden="true">\u2197</span></a></div><p class="resource-address">' + escape(url.host + url.pathname) + '</p></li>';
      }).join('');
      markup += page('supporting-resources', '<div class="page-inner">' + header(logo, 'Supporting resources', confidential) + '<div class="page-content"><p class="eyebrow">For the work ahead</p><h2 class="index-title">Put the experience<br>to work.</h2><p class="index-intro">Capability guides for the industries in this collection. Use them to prepare your next conversation with NorthStar.</p><ul class="resource-grid">' + cards + '</ul><p class="resource-note">These links open companion publications online. The guides remain separate from the documented project experience in this portfolio.</p></div>' + footer(internal ? 'Internal use only / Supporting resources' : 'NorthStar / Supporting resources') + '</div>', 'portfolio-resources-' + (offset / 6 + 1));
    }
    return markup;
  }
  function studyTemplate(study, images, logo, options, storyVisual) {
    const executive = options.edition === 'executive';
    const summaryMatches = study.overview.replace(/\s+/g, ' ').startsWith(study.summary.replace(/\s+/g, ' '));
    let body = study.overview ? paragraphMarkup(study.overview) : '';
    body += study.sections.map(section => (section.heading ? '<h3 class="story-heading">' + escape(section.heading) + '</h3>' : '') + paragraphMarkup(section.text)).join('');
    if (!body && study.summary) body = paragraphMarkup(study.summary);
    body += study.qualifiers.map(qualifier => paragraphMarkup(qualifier, 'story-qualifier')).join('');
    const hasSummary = study.summary && !summaryMatches && study.overview && !study.executive.length;
    const useSummary = hasSummary && study.summary.length <= 420;
    if (hasSummary && !useSummary) body = paragraphMarkup(study.summary) + body;
    if (executive && study.executive.length) body = study.executive.map(section => '<h3 class="story-heading">' + escape(section.heading) + '</h3>' + paragraphMarkup(section.text)).join('') + study.qualifiers.map(qualifier => paragraphMarkup(qualifier, 'story-qualifier')).join('');
    if (!executive && study.timeline.length) body += '<h3 class="story-heading">Project sequence</h3>' + study.timeline.map(item => paragraphMarkup((item.label ? item.label + ' / ' : '') + item.text, 'timeline-step')).join('');
    if (!executive && study.research.context) body += '<h3 class="story-heading research-heading">Project context</h3>' + paragraphMarkup(study.research.context, 'research-context') + study.research.sources.map(source => '<p class="story-block research-source" data-href="' + escape(source.url) + '">' + escape(source.title) + '</p>').join('');
    const figures = executive ? (study.highlights.length ? study.highlights : study.metrics.slice(0, 3)) : (study.metrics.length ? study.metrics : study.highlights);
    const metrics = figures.length ? '<div class="metrics" style="--metric-count:' + (figures.length === 4 ? 2 : Math.min(figures.length, 3)) + '">' + figures.map(metric => '<div class="metric"><strong class="metric-value' + (metric.value.length > 12 ? ' long-value' : '') + '">' + escape(metric.value) + '</strong><span class="metric-label">' + escape(metric.label) + '</span></div>').join('') + '</div>' : '';
    const meta = [study.location, study.period || study.year, study.event].filter(Boolean).map(value => '<span>' + escape(value) + '</span>').join('');
    const lead = study.outcome || (!executive && useSummary ? study.summary : '');
    const explanation = storyVisual ? '<div class="study-visual"><p class="eyebrow">Project explained</p><h3 class="visual-title">' + escape(storyVisual.title) + '</h3><figure class="explanation-scene"><img src="' + escape(storyVisual.src) + '" alt="' + (storyVisual.conceptual ? 'Illustration: ' : '') + escape(storyVisual.description || storyVisual.title) + '"><figcaption>' + escape(displayCaption(storyVisual.caption) || storyVisual.title) + '</figcaption></figure>' + (storyVisual.description ? '<p class="visual-description">' + escape(storyVisual.description) + '</p>' : '') + '</div>' : '';
    const imageMarkup = image => '<img src="' + escape(image.src) + '" alt="' + escape(image.caption || (image.conceptual ? 'Illustration: ' : '') + study.title) + '">' + (displayCaption(image.caption) ? '<figcaption>' + escape(displayCaption(image.caption)) + '</figcaption>' : '');
    return '<template class="study-template" data-id="' + study.id + '" data-title="' + escape(study.title) + '" data-sector="' + escape(study.sector) + '" data-restricted="' + study.restricted + '"><div class="opening-chrome">' + header(logo, study.sector || 'Project experience', study.restricted) + '<div class="project-heading"><h2 class="project-title' + (study.title.length > 65 ? ' long-title' : '') + '">' + escape(study.title) + '</h2><p class="project-meta">' + meta + '</p></div>' + (images[0] ? '<figure class="project-scene' + (images[0].conceptual ? ' conceptual-scene' : '') + '">' + imageMarkup(images[0]) + '</figure>' : '') + metrics + (lead ? '<p class="standfirst' + (lead.length > 290 ? ' long-summary' : '') + '">' + escape(lead) + '</p>' : '') + '</div><div class="narrative-blocks">' + body + '</div><div class="study-gallery">' + images.map(image => '<figure>' + imageMarkup(image) + '</figure>').join('') + '</div><div class="study-services">' + (study.services ? '<p class="service-line"><strong>Services</strong> / ' + escape(study.services) + '</p>' : '') + '</div>' + explanation + '</template>';
  }
  function runtime() {
    'use strict';
    delete document.body.dataset.ready;
    const status = document.getElementById('export-status');
    const root = document.getElementById('portfolio');
    const cloneQueue = queue => queue.map(block => ({ ...block }));
    const waitImages = () => Promise.all(Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; })));
    function nodeFor(block) { const node = document.createElement(block.tag); node.className = block.className; if (block.href) { const link = document.createElement('a'); link.href = block.href; link.textContent = block.text; node.appendChild(link); } else node.textContent = block.text; return node; }
    function fits(column) { return column.scrollHeight <= column.clientHeight + 1; }
    function fillColumns(columns, queue) {
      const remaining = cloneQueue(queue);
      for (const [columnIndex, column] of columns.entries()) {
        column.replaceChildren();
        let safety = 0;
        while (remaining.length && safety++ < 10000) {
          const block = remaining[0]; const node = nodeFor(block); column.appendChild(node);
          if (fits(column)) {
            if (block.tag === 'H3' && remaining.length > 1) {
              const next = nodeFor({ ...remaining[1], text: remaining[1].text.split(/\s+/).slice(0, 22).join(' ') }); column.appendChild(next); const fitsWithBody = fits(column); next.remove();
              if (!fitsWithBody) { node.remove(); break; }
            }
            remaining.shift(); continue;
          }
          node.remove(); if (block.tag !== 'P') break;
          const words = block.text.split(/\s+/); if (words.length < 26) break;
          column.appendChild(node); let low = 0, high = words.length - 1;
          while (low < high) { const mid = Math.ceil((low + high) / 2); node.textContent = words.slice(0, mid).join(' '); if (fits(column)) low = mid; else high = mid - 1; }
          let cut = low; if (words.length - cut < 14) cut = Math.max(0, words.length - 18);
          for (let candidate = cut; candidate >= Math.max(18, cut - 12); candidate--) if (/[.!?][”"')]*$/.test(words[candidate - 1])) { cut = candidate; break; }
          if (cut < 18) { node.remove(); break; }
          if (columnIndex === columns.length - 1 && cut < 32) { node.remove(); break; }
          node.textContent = words.slice(0, cut).join(' '); remaining[0] = { ...block, text: words.slice(cut).join(' ') }; break;
        }
      }
      return remaining;
    }
    const columns = area => Array.from(area.querySelectorAll('.flow-column'));
    function fitTitle(title, maxHeight, minimum) { let size = parseFloat(getComputedStyle(title).fontSize); while (title.scrollHeight > maxHeight && size > minimum) { title.style.fontSize = --size + 'px'; } }
    function frame(className, id, headerHtml, footerHtml) {
      const wrap = document.createElement('div'); wrap.className = 'page-wrap';
      const section = document.createElement('section'); section.className = 'page ' + className; if (id) section.id = id;
      const inner = document.createElement('div'); inner.className = 'page-inner'; inner.innerHTML = headerHtml + '<div class="page-content"></div>' + footerHtml;
      section.appendChild(inner); wrap.appendChild(section); root.appendChild(wrap); return { wrap, page: section, content: inner.querySelector('.page-content'), inner };
    }
    function readingArea(content) { const area = document.createElement('div'); area.className = 'flow-area'; area.innerHTML = '<div class="reading-columns"><div class="flow-column"></div>' + (document.body.dataset.edition === 'executive' ? '' : '<div class="flow-column"></div>') + '</div>'; content.appendChild(area); return area; }
    function composeProjects() {
      const bank = document.getElementById('study-bank'); const genericFooter = document.getElementById('footer-template').innerHTML; const logoHtml = document.getElementById('logo-template').innerHTML;
      const templates = Array.from(bank.content.querySelectorAll('.study-template'));
      for (const template of templates) {
        const data = template.content, title = template.dataset.title;
        let queue = Array.from(data.querySelector('.narrative-blocks').children).map(node => ({ tag: node.tagName, className: node.className, text: node.textContent, href: node.dataset.href || '' }));
        const gallery = Array.from(data.querySelectorAll('.study-gallery figure'));
        const restrictedClass = template.dataset.restricted === 'true' ? ' project-restricted' : '';
        const opening = frame('project-opening' + (!gallery.length ? ' no-image' : '') + restrictedClass, template.dataset.id, '', genericFooter);
        const chrome = data.querySelector('.opening-chrome').cloneNode(true); opening.inner.insertBefore(chrome.querySelector('.page-header'), opening.content); opening.content.append(...Array.from(chrome.children));
        fitTitle(opening.content.querySelector('.project-title'), 116, 28);
        const area = readingArea(opening.content); const services = data.querySelector('.study-services').innerHTML; if (services) opening.content.insertAdjacentHTML('beforeend', services);
        const scene = opening.content.querySelector('.project-scene');
        if (scene && !scene.classList.contains('conceptual-scene') && area.clientHeight < 100) scene.style.height = '180px';
        const originalSceneHeight = scene ? scene.offsetHeight : 0;
        const originalQueue = cloneQueue(queue); let remaining = fillColumns(columns(area), queue);
        if (remaining.length && scene && !scene.classList.contains('conceptual-scene') && scene.offsetHeight > 180 && remaining.reduce((sum, block) => sum + block.text.split(/\s+/).length, 0) < 150) {
          for (const height of [240, 210, 180].filter(height => height < originalSceneHeight)) { scene.style.height = height + 'px'; remaining = fillColumns(columns(area), originalQueue); if (!remaining.length) break; }
          if (remaining.length) { scene.style.height = originalSceneHeight + 'px'; remaining = fillColumns(columns(area), originalQueue); }
        }
        if (!originalQueue.length) area.remove(); queue = remaining; let part = 0;
        const group = [opening.wrap];
        while (queue.length) {
          if (++part > 100) throw new Error('This selection is too large to compose. Try fewer projects.');
          const head = document.createElement('header'); head.className = 'page-header'; head.innerHTML = logoHtml + '<div class="page-header-label"></div>'; head.lastElementChild.textContent = template.dataset.sector || 'Project experience';
          if (template.dataset.restricted === 'true') { const confidential = document.createElement('span'); confidential.className = 'confidential'; confidential.textContent = 'Restricted / Internal use only'; head.lastElementChild.appendChild(confidential); }
          const next = frame('continuation' + restrictedClass, '', head.outerHTML, genericFooter); group.push(next.wrap);
          const heading = document.createElement('div'); heading.className = 'project-heading'; const h2 = document.createElement('h2'); h2.className = 'project-title'; h2.textContent = title; const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'The project, continued'; heading.append(h2, eyebrow); next.content.appendChild(heading); fitTitle(h2, 108, 24);
          const reading = readingArea(next.content), maximum = reading.clientHeight, before = cloneQueue(queue); queue = fillColumns(columns(reading), queue);
          if (queue.length === before.length && queue[0] && queue[0].text === before[0].text) throw new Error('A project paragraph could not be composed.');
          if (!queue.length) {
            let low = 110, high = maximum;
            while (high - low > 2) { const mid = Math.floor((high + low) / 2); reading.style.flex = '0 0 ' + mid + 'px'; if (fillColumns(columns(reading), before).length) low = mid + 1; else high = mid; }
            const balanced = Math.min(maximum, high + 12); reading.style.flex = '0 0 ' + balanced + 'px'; fillColumns(columns(reading), before);
            const extra = maximum - balanced - 24;
            if (gallery.length && extra > 145) { const montage = document.createElement('div'); montage.className = 'continuation-gallery'; const photoSet = gallery.length > 1 ? gallery.slice(1, 3) : gallery.slice(0, 1); montage.style.height = Math.min(extra, 420) + 'px'; montage.style.setProperty('--gallery-count', photoSet.length); photoSet.forEach(image => montage.appendChild(image.cloneNode(true))); next.content.appendChild(montage); }
          }
        }
        const explanation = data.querySelector('.study-visual');
        if (explanation) {
          const illustrated = frame('project-explained' + restrictedClass, '', data.querySelector('.page-header').outerHTML, genericFooter); group.push(illustrated.wrap);
          const heading = document.createElement('h2'); heading.className = 'project-title'; heading.textContent = title; illustrated.content.appendChild(heading); fitTitle(heading, 92, 28);
          illustrated.content.append(...Array.from(explanation.cloneNode(true).children));
        }
        group.forEach(wrap => { wrap.querySelector('.page-footer-title').textContent = (document.body.dataset.audience === 'internal' ? 'Internal use only / ' : '') + title; });
      }
      const closer = document.getElementById('closer-template'); root.appendChild(closer.content.cloneNode(true)); bank.remove(); closer.remove(); document.getElementById('footer-template').remove(); document.getElementById('logo-template').remove();
      const pages = Array.from(root.querySelectorAll('.page'));
      pages.forEach((page, index) => { page.dataset.page = index + 1; const number = page.querySelector('.page-number'); if (number) number.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(pages.length).padStart(2, '0'); });
      document.querySelectorAll('.index-link').forEach(link => { const target = document.getElementById(link.getAttribute('href').slice(1)); if (target) link.querySelector('.index-page').textContent = String(target.dataset.page).padStart(2, '0'); });
      document.body.dataset.paginated = 'true'; document.getElementById('page-count').textContent = templates.length + ' projects / ' + pages.length + ' pages';
    }
    function checkLayout() { const bad = Array.from(document.querySelectorAll('.flow-column,.page-content,.page-inner,.closer-content')).filter(node => node.scrollHeight > node.clientHeight + 2); const coverTitle = document.querySelector('.cover h1'); if (coverTitle.scrollHeight > parseFloat(getComputedStyle(coverTitle).maxHeight) + 2) bad.push(coverTitle); if (bad.length) throw new Error('A page needs more space. Please shorten the portfolio title or choose fewer project metrics.'); }
    function sizePages() { const available = Math.max(250, Math.min(816, innerWidth - (innerWidth < 700 ? 20 : 40))); const scale = available / 816; document.querySelectorAll('.page-wrap').forEach(wrap => { wrap.style.width = available + 'px'; wrap.style.height = 1056 * scale + 'px'; wrap.firstElementChild.style.transform = 'scale(' + scale + ')'; }); }
    function serialized(forPdf) {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('.page-wrap').forEach(wrap => { wrap.removeAttribute('style'); wrap.classList.remove('entering'); wrap.firstElementChild.style.transform = ''; });
      const cloneStatus = clone.querySelector('#export-status'); if (cloneStatus) cloneStatus.textContent = '';
      clone.querySelectorAll('button').forEach(button => { button.disabled = false; }); clone.querySelector('body').removeAttribute('data-pdf-endpoint');
      if (forPdf) clone.querySelectorAll('script,.export-toolbar,.export-status,.portfolio-help,.page-dots').forEach(node => node.remove());
      return '<!doctype html>\n' + clone.outerHTML;
    }
    function downloadBlob(blob, extension) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = (document.body.dataset.filename || 'NorthStar Portfolio') + '.' + extension; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    function printPortfolio() { status.textContent = 'Choose Save as PDF, US Letter, background graphics on, and browser headers and footers off.'; window.print(); }
    function bindControls() {
      document.getElementById('download-html').addEventListener('click', () => { downloadBlob(new Blob([serialized(false)], { type: 'text/html;charset=utf-8' }), 'html'); status.textContent = 'Your portable portfolio is ready.'; });
      document.getElementById('print-portfolio').addEventListener('click', printPortfolio);
      const pdfButton = document.getElementById('download-pdf'); if (!document.body.dataset.pdfEndpoint || location.protocol === 'file:') pdfButton.textContent = 'Save PDF';
      pdfButton.addEventListener('click', async () => {
        const endpoint = document.body.dataset.pdfEndpoint; if (!endpoint || location.protocol === 'file:') { printPortfolio(); return; }
        const requestBody = JSON.stringify({ html: serialized(true) }); if (new Blob([requestBody]).size > 76 * 1024 * 1024) { status.textContent = 'This large portfolio is ready to save through Print. Choose Save as PDF to include every selected project.'; return; }
        pdfButton.disabled = true; status.textContent = 'Creating your PDF. The page layout is already prepared.'; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90000);
        try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody, signal: controller.signal }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/pdf')) throw new Error('PDF could not be created.'); downloadBlob(await response.blob(), 'pdf'); status.textContent = 'Your NorthStar PDF is ready.'; }
        catch (_) { status.textContent = 'The PDF download is unavailable. Use Print to save this same designed portfolio as a PDF.'; }
        finally { clearTimeout(timeout); pdfButton.disabled = false; }
      });
      const dots = document.querySelector('.page-dots'); dots.replaceChildren(); const wraps = Array.from(document.querySelectorAll('.page-wrap'));
      wraps.forEach((wrap, index) => { const button = document.createElement('button'); button.className = 'page-dot'; button.type = 'button'; button.setAttribute('aria-label', 'Go to page ' + (index + 1)); button.addEventListener('click', () => wrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })); dots.appendChild(button); });
      if ('IntersectionObserver' in window) { const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { const index = wraps.indexOf(entry.target); dots.querySelectorAll('button').forEach((button, i) => { button.classList.toggle('active', i === index); if (i === index) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }); if (!entry.target.dataset.seen) { entry.target.dataset.seen = 'true'; entry.target.classList.add('entering'); setTimeout(() => entry.target.classList.remove('entering'), 800); } } }); }, { threshold: .2 }); wraps.forEach(wrap => observer.observe(wrap)); }
      addEventListener('resize', sizePages); sizePages();
    }
    window.NorthStarPortfolioReady = (async () => { await document.fonts.ready; await waitImages(); fitTitle(document.querySelector('.cover h1'), 240, 40); if (document.body.dataset.paginated !== 'true') composeProjects(); await waitImages(); checkLayout(); bindControls(); document.body.dataset.ready = 'true'; window.NorthStarPortfolio = Object.freeze({ html: () => serialized(false), pdfHtml: () => serialized(true) }); return { pages: document.querySelectorAll('.page').length }; })().catch(error => { status.textContent = error.message; document.body.dataset.failed = 'true'; document.querySelectorAll('.toolbar-actions button').forEach(button => { button.disabled = true; }); throw error; });
  }
  async function stylesheet() {
    const response = await fetch(new URL('export.css', base)); if (!response.ok) throw new Error('The portfolio design could not be loaded.');
    const css = await response.text(); const urls = Array.from(new Set(Array.from(css.matchAll(/url\(["']?([^"')]+)["']?\)/g), match => match[1]))); const fonts = new Map(await Promise.all(urls.map(async url => [url, await embed(url)])));
    return css.replace(/url\(["']?([^"')]+)["']?\)/g, (_, url) => 'url("' + fonts.get(url) + '")');
  }
  function render(studies, options, css, assets) {
    const title = text(options.title) || defaults.title, subtitle = text(options.subtitle), logo = assets.get(resourceUrl(options.logo));
    const imagesFor = study => study.images.map(path => ({ src: assets.get(path), ...study.captions[path] })).filter(image => image.src); const allImages = studies.flatMap(imagesFor); const hero = allImages.find(image => !image.conceptual) || allImages[0];
    const date = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()); const confidential = studies.some(study => study.restricted);
    const editionName = options.edition === 'detailed' ? 'Detailed edition' : 'Executive edition';
    const internal = options.audience === 'internal';
    const cover = page('cover inverse', (hero ? '<img class="cover-photo" src="' + escape(hero.src) + '" alt=""><div class="cover-scrim"></div>' : '') + '<div class="page-inner"><div class="page-header">' + logoMarkup(logo) + '<div class="cover-top-right">' + editionName + '<br>' + escape(date) + '</div></div>' + (internal ? '<div class="cover-restriction">Internal use only' + (confidential ? '<span>Contains restricted project information</span>' : '') + '</div>' : '') + '<div class="cover-message"><p class="cover-kicker">NorthStar / Selected experience</p><h1>' + escape(title).replace(/\n/g, '<br>') + '</h1>' + (subtitle ? '<p class="cover-subtitle">' + escape(subtitle) + '</p>' : '') + '</div><div class="cover-bottom"><div class="cover-recipient">' + (options.recipient ? '<span>Prepared for</span>' + escape(text(options.recipient)) : '<span>NorthStar</span>Selected project experience') + '</div><p class="cover-tagline">We Bring Answers.</p></div></div>', 'portfolio-cover');
    const introduction = options.introduction ? page('introduction', '<div class="page-inner">' + header(logo, editionName, confidential) + '<div class="page-content"><p class="eyebrow">Prepared for your review</p><h2 class="index-title">Experience for<br>the work ahead.</h2><div class="introduction-copy">' + paragraphMarkup(options.introduction) + '</div><div class="intro-facts"><strong>' + studies.length + ' selected ' + (studies.length === 1 ? 'project' : 'projects') + '</strong><span>' + editionName + '</span></div></div>' + footer(internal ? 'Internal use only / Selected experience' : 'Selected experience') + '</div>') : '';
    let contents = '';
    for (let offset = 0; offset < studies.length; offset += 4) {
      contents += page('contents', '<div class="page-inner">' + header(logo, editionName, confidential) + '<div class="page-content"><p class="eyebrow">In this collection</p><h2 class="index-title">' + (offset ? 'Experience,<br>continued.' : 'The projects.<br>The response.') + '</h2>' + (!offset ? '<p class="index-intro">A closer look at the challenges, work and results behind this selection of NorthStar experience.</p>' : '') + '<ol class="index-list">' + studies.slice(offset, offset + 4).map((study, index) => { const image = imagesFor(study)[0]; return '<li class="index-entry"><a class="index-link" href="#' + study.id + '">' + (image ? '<img class="index-thumb" src="' + escape(image.src) + '" alt="' + (image.conceptual ? 'Conceptual illustration' : '') + '">' : '<span class="index-thumb empty">' + String(offset + index + 1).padStart(2, '0') + '</span>') + '<span><span class="index-project">' + escape(study.title) + '</span><span class="index-meta">' + escape([study.sector, study.location, study.restricted ? 'Restricted' : ''].filter(Boolean).join(' / ')) + '</span></span><span class="index-page"></span></a></li>'; }).join('') + '</ol><div class="index-count"><strong>' + studies.length + ' selected ' + (studies.length === 1 ? 'project' : 'projects') + '</strong><span>NorthStar / We Bring Answers.</span></div></div>' + footer(internal ? 'Internal use only / Selected experience' : 'Selected experience') + '</div>');
    }
    const closerPhotos = studies.map(study => imagesFor(study).find(image => !image.conceptual)).filter(Boolean).slice(0, 3);
    const contactUrl = externalUrl(options.contactUrl), contactEmail = emailUrl(options.contactEmail);
    const closer = supportingResources(studies, logo, internal, confidential) + page('closer inverse', '<div class="page-inner">' + header(logo, 'NorthStar', confidential) + '<div class="closer-content"><div class="closer-rule"></div><h2>We Bring Answers.</h2><p class="closer-description">' + escape(options.closingText || 'Tell us about your site, your priorities and the work ahead.') + '</p><div class="contact-panel"><p class="eyebrow">Discuss your project</p>' + (options.contactName ? '<strong>' + escape(options.contactName) + '</strong>' : '') + (contactEmail ? '<a class="contact-email" href="' + escape(contactEmail) + '">' + escape(options.contactEmail) + '</a>' : '') + (contactUrl ? '<a class="contact-link" href="' + escape(contactUrl) + '">Connect with NorthStar <span aria-hidden="true">\u2192</span></a>' : '') + '</div>' + (closerPhotos.length ? '<div class="closer-mosaic" style="--image-count:' + closerPhotos.length + '">' + closerPhotos.map(image => '<img src="' + escape(image.src) + '" alt="">').join('') + '</div>' : '') + '<div class="closer-bottom"><strong>NorthStar</strong><span>' + escape(date) + '<br>' + editionName + '</span></div></div>' + footer(internal ? 'Internal use only / NorthStar' : 'NorthStar / Selected experience') + '</div>');
    const toolbar = '<header class="export-toolbar"><div class="toolbar-title">Your NorthStar portfolio<small id="page-count">Composing your pages</small></div><div class="toolbar-actions"><button type="button" class="quiet" id="print-portfolio">Print</button><button type="button" id="download-html">Download HTML</button><button type="button" class="primary" id="download-pdf">Download PDF</button></div></header>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + escape(title.replace(/\n/g, ' ') + ' | NorthStar') + '</title><style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body data-edition="' + options.edition + '" data-audience="' + options.audience + '" data-filename="' + escape(safeName('NorthStar - ' + title.replace(/\n/g, ' ') + ' - ' + editionName + (internal ? ' - INTERNAL' : ''))) + '" data-pdf-endpoint="' + (window.NORTHSTAR_STATIC ? '' : escape(new URL('/api/portfolio-pdf', base).href)) + '">' + toolbar + '<div class="export-status" id="export-status" role="status" aria-live="polite"></div><main class="portfolio-shell" id="portfolio">' + cover + introduction + contents + '</main><nav class="page-dots" aria-label="Portfolio pages"></nav><p class="portfolio-help">Designed for US Letter. Download the PDF to share, or keep a portable HTML edition.</p><template id="logo-template">' + logoMarkup(logo) + '</template><template id="footer-template">' + footer(internal ? 'Internal use only / NorthStar' : 'NorthStar / Selected experience') + '</template><template id="study-bank">' + studies.map(study => studyTemplate(study, imagesFor(study), logo, options, study.storyVisual ? { ...study.storyVisual, src: assets.get(study.storyVisual.src) } : null)).join('') + '</template><template id="closer-template">' + closer + '</template><script>(' + runtime.toString() + ')();<\/script></body></html>';
  }
  async function populate(popup, input, rawOptions) {
    const options = Object.assign({}, defaults, rawOptions || {}), studies = input.map(normalize);
    const paths = Array.from(new Set([resourceUrl(options.logo)].concat(studies.flatMap(study => study.images.concat(study.storyVisual ? [study.storyVisual.src] : []))).filter(Boolean)));
    const logoUrl = resourceUrl(options.logo);
    const [css, pairs] = await Promise.all([stylesheet(), Promise.all(paths.map(async path => [path, await embed(path, path !== logoUrl)]))]); if (popup.closed) return null;
    popup.document.open(); popup.document.write(render(studies, options, css, new Map(pairs))); popup.document.close(); popup.opener = null;
    const ready = await popup.NorthStarPortfolioReady;
    // These live-preview listeners remain in the parent; portable files contain no analytics.
    const properties = {page_type:'portfolio',edition:options.edition,project_count:studies.length,page_count:ready.pages};
    popup.document.getElementById('download-html')?.addEventListener('click', () => window.NorthStarAnalytics?.track('portfolio_download',{...properties,file_extension:'html',action:'requested'}));
    popup.document.getElementById('print-portfolio')?.addEventListener('click', () => window.NorthStarAnalytics?.track('print_requested',{...properties,method:'print'}));
    popup.document.getElementById('download-pdf')?.addEventListener('click', () => window.NorthStarAnalytics?.track(popup.document.body.dataset.pdfEndpoint?'portfolio_download':'print_requested',{...properties,file_extension:'pdf',action:'requested',method:popup.document.body.dataset.pdfEndpoint?'download':'save_pdf'}));
    return { window: popup, count: studies.length, pages: ready.pages, warnings: [] };
  }
  function open(studies, options) {
    if (!Array.isArray(studies) || !studies.length) return Promise.reject(new Error('Select at least one project for your portfolio.'));
    const selectedOptions = Object.assign({}, defaults, options || {});
    if (!['client', 'internal'].includes(selectedOptions.audience)) return Promise.reject(new Error('Choose a client or internal audience.'));
    if (!['executive', 'detailed'].includes(selectedOptions.edition)) return Promise.reject(new Error('Choose an executive or detailed edition.'));
    if (selectedOptions.audience === 'client' && studies.some(study => study.restricted === true)) return Promise.reject(new Error('Restricted projects cannot be included in a client portfolio. Remove them or choose an internal edition.'));
    if (text(selectedOptions.contactEmail) && !emailUrl(selectedOptions.contactEmail)) return Promise.reject(new Error('Enter a valid contact email address.'));
    if (text(selectedOptions.contactUrl) && !externalUrl(selectedOptions.contactUrl)) return Promise.reject(new Error('Enter a full http or https contact address.'));
    const limits = { title: 100, subtitle: 400, recipient: 160, closingText: 260, introduction: 900, contactName: 100, contactEmail: 160, contactUrl: 500 };
    for (const [key, limit] of Object.entries(limits)) if (options && text(options[key]).length > limit) return Promise.reject(new Error('Please keep the portfolio ' + key + ' to ' + limit + ' characters or fewer.'));
    const popup = window.open('', '_blank'); if (!popup) return Promise.reject(new Error('Allow pop-ups for this site, then open your portfolio again.'));
    popup.document.write('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Composing Your NorthStar Portfolio</title><style>body{margin:0;background:#071b2c;color:#fff;font-family:Arial,sans-serif}.loading-screen{max-width:610px;margin:auto;padding:100px 40px}.loading-screen h1{font-size:46px;line-height:1.05;margin:25px 0}.loading-screen p{font-size:16px;line-height:1.6;color:#b9d3f5}.loading-screen small{font-size:11px;letter-spacing:1.5px}.loading-line{height:3px;background:#ffffff20;margin:36px 0;overflow:hidden}.loading-line:after{content:"";display:block;width:45%;height:100%;background:#fff;animation:sweep 1.2s ease-in-out infinite}@keyframes sweep{from{transform:translateX(-110%)}to{transform:translateX(330%)}}@media(prefers-reduced-motion:reduce){.loading-line:after{animation:none}}</style><body><main class="loading-screen"><small>NORTHSTAR / SELECTED EXPERIENCE</small><div class="loading-line"></div><h1>A portfolio,<br>made for you.</h1><p role="status">Composing the photography, typography and story of your selected projects.</p></main></body></html>'); popup.document.close();
    return populate(popup, studies, options).catch(error => { if (!popup.closed && !popup.document.getElementById('export-status')) popup.document.body.innerHTML = '<main class="loading-screen"><h1>Your portfolio needs a moment.</h1><p>' + escape(error.message) + '</p><p>Return to the library and try again. Your selection is still there.</p></main>'; throw error; });
  }
  window.NorthStarExport = Object.freeze({ open });
})();
