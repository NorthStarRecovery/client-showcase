(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<i class="icon ${name}" aria-hidden="true"></i>`;
  const asset = value => /^assets\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpg|jpeg|svg)$/.test(value || '') && !value.includes('..') ? value : '';
  const studies = Array.isArray(window.NORTHSTAR_PROJECTS) ? window.NORTHSTAR_PROJECTS : [];
  const internal = window.NORTHSTAR_MODE === 'internal';
  const contactUrl = /^https:\/\/www\.northstar\.com\//.test(window.NORTHSTAR_CONTACT_URL || '') ? window.NORTHSTAR_CONTACT_URL : 'https://www.northstar.com/contact-us/';
  const collectionLabel = internal ? 'Portfolio studio' : 'Saved projects';
  const basePath = new URL('.', document.baseURI).pathname;
  const projectUrl = id => basePath + 'projects/' + encodeURIComponent(id) + '/';
  const photoSrc = project => asset(project.hero || project.images?.[0]?.src || project.visual?.src);
  const isConceptual = project => !asset(project.hero || project.images?.[0]?.src) && asset(project.visual?.src);
  const caption = (project,src) => project.imageCaptions?.[src] || (src === project.visual?.src ? project.visual.caption || 'Conceptual illustration. Not a project photograph.' : `${project.title} — project photograph`);
  const displayCaption = value => String(value || '').replace(/\s*Conceptual (?:project )?illustration[.;]?\s*(?:Not a (?:site|project) photograph(?: or plan)?\.?|Not a photograph of the project\.?)?/gi, '').trim();
  const byId = new Map(studies.map(project => [project.id, project]));
  const storageKey = internal ? 'northstar-experience-internal-v2' : 'northstar-experience-v1';
  let store = {}, storageAvailable = true;
  let previous = null;
  try {
    previous = localStorage.getItem(storageKey);
    store = JSON.parse(previous || '{}');
  } catch { storageAvailable = false; }
  if (!internal && previous && storageAvailable) {
    try { if (!localStorage.getItem('northstar-experience-v1-backup')) localStorage.setItem('northstar-experience-v1-backup',previous); }
    catch { storageAvailable = false; /* Keep the loaded selection usable and preserve the original stored data. */ }
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
  const cleanIds = ids => [...new Set((Array.isArray(ids) ? ids : []).filter(id => byId.has(id)))];
  let selection = cleanIds(store.selection);
  const savedCollections = Array.isArray(store.collections) ? store.collections : store.collections && typeof store.collections === 'object' ? Object.entries(store.collections).map(([name,value]) => ({name,ids:Array.isArray(value) ? value : value?.ids || value?.selection || []})) : [];
  let collections = savedCollections.filter(item => item && typeof item.name === 'string').map(item => ({name:item.name.slice(0,80), ids:cleanIds(item.ids)}));
  let sector = '', view = store.view === 'list' ? 'list' : 'grid', limit = 12, filtered = [], current = null;
  let analyticsCase = null;
  const track = (name, properties) => window.NorthStarAnalytics?.track(name, properties);
  function reportCase(project) {
    window.NorthStarAnalytics?.page({page_type:'case_study',project_id:project.id,industry:project.sector});
    if (analyticsCase !== project.id) track('case_view',{project_id:project.id,industry:project.sector});
    analyticsCase = project.id;
  }
  document.addEventListener('northstar:analytics-ready', () => {
    if (current && byId.has(current)) track('case_view',{project_id:current,industry:byId.get(current).sector});
  });
  let feature = 0, featureRevision = 0, toastTimer, searchTimer;
  const featured = ['ritz-carlton-naples','prologis-fedex-facility','capital-one-tower','flagler-college','el-conquistador-resort'].map(id => byId.get(id)).filter(Boolean);
  for (const project of studies.filter(project => project.featured && asset(project.hero))) if (featured.length < 5 && !featured.includes(project)) featured.push(project);
  if (!featured.length && studies.length) featured.push(studies[0]);
  const flagship = [...featured];
  for (const project of studies.filter(project => project.featured && asset(project.hero))) if (flagship.length < 8 && !flagship.includes(project)) flagship.push(project);
  for (const project of studies.filter(project => asset(project.hero))) if (flagship.length < 8 && !flagship.includes(project)) flagship.push(project);
  function persist() {
    if (!storageAvailable) return;
    try { localStorage.setItem(storageKey, JSON.stringify({...store, selection, collections, view})); }
    catch { if (storageAvailable) toast('Browser storage is full. Your selection is available for this visit.'); storageAvailable = false; }
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
  }
  function photo(project, className = '', loading = 'lazy') {
    const src = photoSrc(project);
    return src ? `<img class="${className}" src="${esc(src)}" alt="${esc(caption(project,src))}" loading="${loading}">` : `<span class="photo-empty" aria-hidden="true">NorthStar</span>`;
  }
  function selectedButton(project, classes = 'card-select') {
    const selected = selection.includes(project.id);
    return `<button class="${classes}" data-select="${esc(project.id)}" aria-pressed="${selected}" aria-label="${selected ? 'Remove' : 'Save'} ${esc(project.title)}${selected ? ' from collection' : ''}">${icon(selected ? 'check' : 'plus')}<span>${selected ? 'Saved' : 'Save project'}</span></button>`;
  }
  function renderCard(project, index) {
    return `<article class="project-card project-enter" style="--entry:${index % 6}" data-project="${esc(project.id)}"><div class="card-media"><a class="card-image-button${isConceptual(project) ? ' conceptual-card' : ''}" data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}" aria-label="Explore ${esc(project.title)}">${photo(project)}<span class="card-view">View project ${icon('arrow-up-right')}</span></a></div>${selectedButton(project)}<div class="card-body"><div class="card-meta mono"><span class="card-sector">${esc(project.sector)}</span><span>${project.restricted ? 'INTERNAL ONLY' : esc(project.period || '')}</span></div><h3 class="card-title"><a data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}">${esc(project.title)}</a></h3><p class="card-summary">${esc(project.outcome || project.summary)}</p><div class="card-foot"><span>${esc(project.location || 'NorthStar project experience')}</span>${icon('arrow-up-right')}</div></div></article>`;
  }
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const searchable = new Map(studies.map(project => [project.id, normalize([project.searchText,project.title,project.location,project.sector,project.outcome,project.research?.context,...Object.values(project.executive || {})].filter(Boolean).join(' '))]));
  function render() {
    const terms = normalize($('search').value).trim().split(/\s+/).filter(Boolean);
    filtered = studies.filter(project => (!sector || project.sector === sector) && (!$('location-filter').value || project.location === $('location-filter').value) && (!$('event-filter').value || project.event === $('event-filter').value) && (!$('service-filter').value || project.services.includes($('service-filter').value)) && terms.every(term => searchable.get(project.id).includes(term)));
    const sort = $('sort').value;
    if (sort === 'az') filtered.sort((a,b) => a.title.localeCompare(b.title));
    if (sort === 'za') filtered.sort((a,b) => b.title.localeCompare(a.title));
    if (sort === 'sector') filtered.sort((a,b) => a.sector.localeCompare(b.sector) || a.title.localeCompare(b.title));
    if (sort === 'featured') filtered.sort((a,b) => Number(b.featured) - Number(a.featured));
    $('project-grid').innerHTML = filtered.slice(0,limit).map(renderCard).join('');
    $('project-grid').classList.toggle('list-view', view === 'list');
    $('result-count').innerHTML = `<strong>${filtered.length}</strong> ${filtered.length === 1 ? 'project' : 'projects'}${sector ? ` in ${esc(sector)}` : ' to explore'}`;
    $('showing-count').textContent = `SHOWING ${Math.min(limit,filtered.length)} OF ${filtered.length} PROJECTS`;
    $('load-more').hidden = limit >= filtered.length;
    $('empty-state').hidden = filtered.length !== 0;
    $('select-results').disabled = !filtered.length;
    $('grid-view').setAttribute('aria-pressed', view === 'grid'); $('list-view').setAttribute('aria-pressed', view === 'list');
    document.dispatchEvent(new CustomEvent('northstar:render'));
  }
  function populateFilters() {
    for (const [id, values] of [['location-filter',studies.map(project => project.location)], ['event-filter',studies.map(project => project.event)], ['service-filter',studies.flatMap(project => project.services)]]) {
      for (const value of [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b))) $(id).add(new Option(value, value));
    }
    const sectors = [...new Set(studies.map(project => project.sector))].sort((a,b) => a.localeCompare(b));
    $('sector-tabs').innerHTML = ['',...sectors].map(value => `<button data-sector="${esc(value)}" aria-pressed="${value === sector}">${esc(value || 'All projects')}<span>${value ? studies.filter(project => project.sector === value).length : studies.length}</span></button>`).join('');
    $('industry-entrances').innerHTML = sectors.map((value,index) => `<button class="industry-entrance" data-industry="${esc(value)}"><span class="mono">${String(index+1).padStart(2,'0')} / ${studies.filter(project => project.sector === value).length} PROJECTS</span><strong>${esc(value)}</strong>${icon('arrow-up-right')}</button>`).join('');
  }
  function renderEditorial() {
    $('flagship-grid').innerHTML = flagship.map((project,index) => `<article class="flagship-card reveal"><a class="flagship-image" data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}">${photo(project)}<span class="flagship-number mono">${String(index+1).padStart(2,'0')}</span><span class="flagship-open">Explore project ${icon('arrow-up-right')}</span></a><div class="flagship-copy"><span class="mono">${esc(project.sector)} / ${esc(project.location)}</span><h3><a data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}">${esc(project.title)}</a></h3><p>${esc(project.outcome || project.summary)}</p>${selectedButton(project,'text-button flagship-save')}</div></article>`).join('');
    const sequence = featured.slice(0,3);
    $('field-sequence').innerHTML = sequence.map((project,index) => { const src = asset(project.images?.[1]?.src || project.hero); return `<a class="field-image reveal" data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}"><img src="${esc(src)}" alt="${esc(caption(project,src))}" loading="lazy"><span><b class="mono">0${index+1} / ${esc(project.sector)}</b><strong>${esc(project.title)}</strong>${icon('arrow-up-right')}</span></a>`; }).join('');
  }
  function resetFilters() {
    $('search').value = ''; ['location-filter','event-filter','service-filter'].forEach(id => $(id).value = '');
    sector = ''; limit = 12; document.querySelectorAll('[data-sector]').forEach(button => button.setAttribute('aria-pressed', button.dataset.sector === '')); render();
  }
  function updateCovers() {
    const first = byId.get(selection[0]) || featured[0];
    const src = first ? photoSrc(first) : '';
    for (const id of ['showcase-image','live-cover-image']) if (src) $(id).src = src;
    const title = $('export-title').value.trim() || 'Selected project experience';
    $('live-cover-title').textContent = title;
    $('showcase-title').textContent = $('export-subtitle').value.trim() || 'Experience in action.';
    const recipient = $('export-recipient').value.trim();
    $('live-cover-recipient').textContent = recipient ? `Prepared for ${recipient}` : 'Prepared for the work ahead.';
    $('showcase-recipient').textContent = $('live-cover-recipient').textContent;
    $('live-cover-count').textContent = `${selection.length} ${selection.length === 1 ? 'PROJECT' : 'PROJECTS'}`;
  }
  function updateSelection() {
    document.querySelectorAll('.selection-count').forEach(node => node.textContent = selection.length);
    const wasHidden = $('selection-dock').hidden;
    $('selection-dock').hidden = !selection.length;
    if (wasHidden && selection.length) $('selection-dock').classList.add('arrived');
    document.querySelectorAll('[data-select]').forEach(button => {
      const project = byId.get(button.dataset.select); if (!project) return;
      const selected = selection.includes(project.id);
      button.setAttribute('aria-pressed',selected); button.setAttribute('aria-label',`${selected ? 'Remove' : 'Save'} ${project.title}${selected ? ' from collection' : ''}`);
      button.innerHTML = icon(selected ? 'check' : 'plus') + `<span>${selected ? 'Saved' : 'Save project'}</span>`;
    });
    $('export-button').disabled = !selection.length;
    $('portfolio-clear').disabled = !selection.length;
    $('save-collection').disabled = !selection.length;
    updateAudienceWarning();
    updateCovers(); persist();
    if ($('portfolio-dialog').open) renderPortfolio();
  }
  function toggleSelection(id, button) {
    if (!byId.has(id)) return;
    const selected = selection.includes(id);
    selection = selected ? selection.filter(value => value !== id) : [...selection,id];
    updateSelection();
    if (button) { button.classList.remove('just-selected'); requestAnimationFrame(() => button.classList.add('just-selected')); }
    track('project_selection',{project_id:id,industry:byId.get(id).sector,action:selected?'remove':'save',project_count:selection.length});
    toast(`${byId.get(id).title} ${selected ? 'removed from' : 'saved to'} your collection.`);
  }
  async function renderFeature(animate = false) {
    if (!featured.length) return;
    const revision = ++featureRevision, project = featured[feature];
    const src = asset(project.hero || project.images?.[0]?.src);
    if (animate && src) { const preload = new Image(); preload.src = src; try { await preload.decode(); } catch { /* The image element displays its native fallback if unavailable. */ } }
    if (revision !== featureRevision) return;
    $('hero-image').src = src; $('hero-image').alt = project.title;
    $('hero-sector').textContent = project.sector.toUpperCase(); $('hero-title').textContent = project.title; $('hero-location').textContent = project.location;
    $('hero-case').dataset.projectLink = project.id; $('hero-case').href = projectUrl(project.id);
    $('hero-outcome').textContent = project.outcome || project.summary;
    $('feature-index').textContent = String(feature+1).padStart(2,'0'); $('feature-total').textContent = String(featured.length).padStart(2,'0');
    if (!$('feature-dots').children.length) $('feature-dots').innerHTML = featured.map((item,index) => `<button data-feature="${index}" aria-label="Show ${esc(item.title)}" aria-pressed="${index === feature}"></button>`).join('');
    $('feature-dots').querySelectorAll('button').forEach((button,index) => button.setAttribute('aria-pressed',index === feature));
    if (animate) { $('hero-media').classList.remove('changing'); requestAnimationFrame(() => requestAnimationFrame(() => $('hero-media').classList.add('changing'))); }
  }
  function showDialog(dialog, focusId) {
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    if (focusId) $(focusId)?.focus({preventScroll:true});
  }
  function openCase(id, setHash = true) {
    const project = byId.get(id); if (!project) return;
    current = id;
    const sections = project.sections?.length ? project.sections : [{heading:'Project story',text:project.overview}];
    const metrics = (project.metrics || []).map(metric => `<div class="detail-metric"><strong>${esc(metric.value)}</strong><span>${esc(metric.label)}</span></div>`).join('');
    const gallery = (project.images || []).map((image,index) => asset(image.src) ? `<button data-photo="${esc(image.src)}" aria-label="Enlarge ${esc(project.title)} photograph ${index+1}"><img src="${esc(image.src)}" alt="${esc(project.title)} photograph ${index+1}" loading="lazy">${icon('maximize-2')}</button>` : '').join('');
    const narrative = sections.filter(section => section.text).map(section => `<section><h3>${esc(section.heading || 'Project story')}</h3>${section.text.split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('');
    const qualifiers = (project.qualifiers || []).map(note => `<p class="detail-qualifier">${esc(note)}</p>`).join('');
    $('case-content').innerHTML = `<div class="detail-hero">${photo(project,'','eager')}<div><span class="mono">${esc(project.sector.toUpperCase())}${project.restricted ? ' / CONFIDENTIAL' : ''}</span><h2 id="detail-title" tabindex="-1">${esc(project.title)}</h2><p>${esc([project.location,project.period].filter(Boolean).join(' / '))}</p></div></div><div class="detail-content"><div class="detail-intro"><p class="detail-summary">${esc(project.summary)}</p>${selectedButton(project,'button detail-select')}</div>${metrics ? `<div class="detail-metrics">${metrics}</div>` : ''}<div class="detail-main"><div class="detail-story">${narrative}${qualifiers}</div><aside class="detail-sidebar"><div><h3>PROJECT SERVICES</h3><div class="detail-services">${project.services.map(service => `<span>${esc(service)}</span>`).join('')}</div></div><dl>${[['Location',project.location],['Event',project.event],['Period',project.period]].filter(([,value]) => value).map(([label,value]) => `<dt>${label.toUpperCase()}</dt><dd>${esc(value)}</dd>`).join('')}</dl><button class="button outline" data-export-one="${esc(id)}">Create project PDF ${icon('arrow-up-right')}</button></aside></div>${gallery ? `<div class="detail-gallery">${gallery}</div>` : ''}</div>`;
    if (setHash && location.hash !== '#case/'+id) history.pushState({case:id},'', '#case/'+encodeURIComponent(id));
    showDialog($('case-dialog'),'detail-title');
  }
  function projectMetrics(project) {
    const metrics = project.highlights?.length ? project.highlights : project.metrics || [];
    return metrics.map(metric => `<div class="detail-metric"><strong>${esc(metric.value)}</strong><span>${esc(metric.label)}</span></div>`).join('');
  }
  function renderProject(id) {
    const project = byId.get(id); if (!project) return false;
    current = id;
    const executive = project.executive || {};
    const sections = project.sections?.length ? project.sections : [{heading:'Project story',text:project.overview}];
    const narrative = sections.filter(section => section.text).map(section => `<section><h3>${esc(section.heading || 'Project story')}</h3>${section.text.split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('');
    const images = (project.images || []).filter(image => asset(image.src));
    const gallery = images.map((image,index) => `<figure class="project-photo reveal"><button data-photo="${esc(image.src)}" data-caption="${esc(caption(project,image.src))}" aria-label="Enlarge photograph ${index+1}: ${esc(caption(project,image.src))}"><img src="${esc(image.src)}" alt="${esc(caption(project,image.src))}" loading="lazy">${icon('maximize-2')}</button><figcaption><span class="mono">${String(index+1).padStart(2,'0')}</span>${esc(displayCaption(caption(project,image.src)))}</figcaption></figure>`).join('');
    const timeline = Array.isArray(project.timeline) ? project.timeline.filter(item => item.label && item.text) : [];
    const related = studies.filter(item => item.id !== id && item.sector === project.sector).sort((a,b) => Number(Boolean(b.hero))-Number(Boolean(a.hero))).slice(0,3);
    const research = project.research || {};
    const publicSources = (research.sources || []).filter(source => /^https:\/\//.test(source.url || ''));
    const qualifiers = (project.qualifiers || []).map(note => `<p class="detail-qualifier">${esc(note)}</p>`).join('');
    const reviewNote = internal && project.editorialNote ? `<aside class="editorial-note"><span class="mono">INTERNAL EDITORIAL NOTE</span><p>${esc(Array.isArray(project.editorialNote) ? project.editorialNote.join(' ') : project.editorialNote)}</p></aside>` : '';
    const metrics = projectMetrics(project);
    const storyVisual = project.storyVisual && asset(project.storyVisual.src) ? project.storyVisual : null;
    const explainer = storyVisual && !isConceptual(project) ? `<section class="project-explainer reveal"><div class="section-heading"><div><span class="eyebrow mono">THE PROJECT, EXPLAINED</span><h2>${esc(storyVisual.title || 'Understanding the scope.')}</h2></div></div><figure><button data-photo="${esc(storyVisual.src)}" data-caption="${esc(storyVisual.caption || 'Conceptual project illustration.') }" aria-label="Enlarge project illustration"><img src="${esc(storyVisual.src)}" alt="${esc(storyVisual.caption || storyVisual.title || 'Project illustration')}" loading="lazy">${icon('maximize-2')}</button><figcaption><p>${esc(displayCaption(storyVisual.caption) || storyVisual.title || 'The project scope.')}</p></figcaption></figure>${storyVisual.description ? `<p class="explainer-description">${esc(storyVisual.description)}</p>` : ''}</section>` : '';
    $('project-page').innerHTML = `<article class="project-experience">
      <div class="project-breadcrumb section-wrap"><a href="${basePath}#library" data-home>${icon('arrow-left')} All projects</a><span class="mono">${esc(project.sector)}${project.restricted ? ' / INTERNAL ONLY' : ''}</span><button class="motion-toggle project-motion" data-motion-toggle aria-pressed="false"><i class="icon pause" aria-hidden="true"></i><span>Motion on</span></button><button class="text-button" data-copy-project="${esc(id)}">Copy project link ${icon('arrow-up-right')}</button></div>
      <section class="project-opening${isConceptual(project) ? ' conceptual-opening' : ''}"><div class="project-opening-photo">${photo(project,'','eager')}</div><div class="project-opening-copy"><span class="eyebrow mono">${esc([project.location,project.period].filter(Boolean).join(' / '))}</span><h1 id="project-title" tabindex="-1">${esc(project.title)}</h1><p>${esc(project.outcome || project.summary)}</p><div class="project-actions">${selectedButton(project,'button inverse')}<button class="text-button" data-export-one="${esc(id)}">Download project ${icon('download')}</button></div></div></section>
      <nav class="project-section-nav section-wrap" aria-label="Project sections"><a data-project-section="project-overview" href="${projectUrl(id)}#project-overview">Overview</a>${timeline.length ? `<a data-project-section="project-response" href="${projectUrl(id)}#project-response">Response sequence</a>` : ''}${images.length ? `<a data-project-section="project-gallery" href="${projectUrl(id)}#project-gallery">Photographs</a>` : ''}${related.length ? `<a data-project-section="related-projects" href="${projectUrl(id)}#related-projects">Related experience</a>` : ''}<a data-contact-link href="${esc(contactUrl)}">Discuss your project ${icon('arrow-up-right')}</a></nav>
      <div class="project-body section-wrap"><section id="project-overview" class="project-overview"><div class="project-narrative"><span class="eyebrow mono">PROJECT OVERVIEW</span>${executive.challenge || executive.response || executive.result ? `<div class="executive-story">${[['01','The challenge',executive.challenge],['02','NorthStar’s response',executive.response],['03','The result',executive.result]].filter(([, ,text]) => text).map(([number,title,text]) => `<section class="reveal"><span class="mono">${number}</span><div><h2>${title}</h2><p>${esc(text)}</p></div></section>`).join('')}</div><details class="full-story"><summary>Read the complete project story ${icon('plus')}</summary><div class="detail-story">${narrative}</div></details>` : `<div class="detail-story">${narrative}</div>`}${qualifiers}${reviewNote}</div><aside class="project-facts"><span class="eyebrow mono">PROJECT AT A GLANCE</span>${metrics ? `<div class="project-fact-metrics">${metrics}</div>` : ''}<dl>${[['Location',project.location],['Industry',project.sector],['Event',project.event],['Period',project.period]].filter(([,value]) => value).map(([label,value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${project.services?.length ? `<h3 class="mono">PROJECT SERVICES</h3><div class="detail-services">${project.services.map(service => `<span>${esc(service)}</span>`).join('')}</div>` : ''}</aside></section>
      ${explainer}
      ${timeline.length ? `<section id="project-response" class="response-sequence"><div class="section-heading"><div><span class="eyebrow mono">THE WORK, IN SEQUENCE</span><h2>How it came together.</h2></div></div><ol>${timeline.map((item,index) => `<li class="reveal"><span class="sequence-number mono">${String(index+1).padStart(2,'0')}</span><h3>${esc(item.label)}</h3><p>${esc(item.text)}</p></li>`).join('')}</ol></section>` : ''}
      ${research.context ? `<aside class="project-context reveal"><span class="eyebrow mono">PROJECT CONTEXT</span><h2>The setting for the work.</h2><p>${esc(research.context)}</p>${publicSources.length ? `<details><summary>Explore the public context</summary><ul>${publicSources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || 'Public information')} ${icon('arrow-up-right')}</a></li>`).join('')}</ul></details>` : ''}</aside>` : ''}
      ${gallery ? `<section id="project-gallery" class="project-gallery-section"><div class="section-heading"><div><span class="eyebrow mono">PROJECT PHOTOGRAPHS</span><h2>A closer look.</h2></div><p>Select a photograph to explore it in detail.</p></div><div class="project-photo-grid">${gallery}</div></section>` : isConceptual(project) ? `<div class="conceptual-explanation"><span class="eyebrow mono">THE PROJECT, EXPLAINED</span><p>${esc(displayCaption(project.visual.caption) || project.visual.title || project.title)}</p>${storyVisual?.description ? `<p>${esc(storyVisual.description)}</p>` : ''}<button class="text-button" data-photo="${esc(photoSrc(project))}" data-caption="${esc(project.visual.caption || 'Conceptual project illustration')}">Explore the illustration ${icon('maximize-2')}</button></div>` : ''}
      <section class="project-contact reveal"><div><span class="eyebrow mono">YOUR NEXT PROJECT</span><h2>Let’s discuss<br>the work ahead.</h2><p>Talk with NorthStar about your site, your priorities, and the experience relevant to your project.</p></div><a class="button inverse" data-contact-link href="${esc(contactUrl)}">Discuss your project ${icon('arrow-up-right')}</a></section>
      ${related.length ? `<section id="related-projects" class="related-projects"><div class="section-heading"><div><span class="eyebrow mono">CONTINUE EXPLORING</span><h2>Related experience.</h2></div></div><div class="related-grid">${related.map(renderCard).join('')}</div></section>` : ''}</div></article>`;
    $('home-page').hidden = true; document.body.classList.add('project-route');
    document.title = `${project.title} | NorthStar Project Experience`;
    reportCase(project);
    document.querySelector('.skip-link').href = projectUrl(id) + '#project-overview';
    document.dispatchEvent(new CustomEvent('northstar:render')); return true;
  }
  function navigateProject(id, push = true) {
    if (!byId.has(id)) return;
    if (push) history.pushState({project:id},'',projectUrl(id));
    if ($('case-dialog').open) $('case-dialog').close();
    renderProject(id); window.scrollTo({top:0,behavior:'instant'}); $('project-title')?.focus({preventScroll:true});
  }
  function navigateHome(hash = '', push = true) {
    if (push) history.pushState({},'', basePath + hash);
    $('home-page').hidden = false; $('project-page').innerHTML = ''; document.body.classList.remove('project-route'); current = null;
    document.title = 'Project Experience | NorthStar'; document.querySelector('.skip-link').href = '#library';
    analyticsCase = null;
    window.NorthStarAnalytics?.page({page_type:'case_library'});
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView(); else window.scrollTo({top:0,behavior:'instant'});
    const destination = (hash && document.getElementById(hash.slice(1))) || $('hero-heading');
    const heading = destination.matches('h1,h2,h3') ? destination : destination.querySelector('h1,h2,h3') || destination;
    heading.tabIndex = -1; heading.focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent('northstar:render'));
  }
  function exportOptions(overrides = {}) {
    return {edition:document.querySelector('input[name="edition"]:checked')?.value || 'executive',audience:internal ? $('export-audience').value : 'client',title:$('export-title').value.trim(),subtitle:$('export-subtitle').value.trim(),recipient:$('export-recipient').value.trim(),introduction:$('export-introduction').value.trim(),contactName:$('export-contact-name').value.trim(),contactEmail:$('export-contact-email').value.trim(),contactUrl,...overrides};
  }
  function updateAudienceWarning() {
    const restricted = selection.map(id => byId.get(id)).filter(project => project.restricted);
    const blocked = internal && $('export-audience').value === 'client' && restricted.length > 0;
    $('export-restriction').hidden = !blocked;
    $('restriction-message').textContent = blocked ? `This client collection contains ${restricted.length} restricted ${restricted.length === 1 ? 'project' : 'projects'}: ${restricted.map(project => project.title).join(', ')}. Remove these projects or choose NorthStar internal.` : '';
    $('export-button').disabled = !selection.length || blocked;
  }
  function renderPortfolio() {
    $('portfolio-list-count').textContent = `${selection.length} SELECTED ${selection.length === 1 ? 'PROJECT' : 'PROJECTS'}`;
    $('portfolio-empty').hidden = Boolean(selection.length);
    $('portfolio-items').innerHTML = selection.map((id,index) => {
      const project = byId.get(id);
      return `<article class="portfolio-item" data-item="${esc(id)}">${photo(project)}<div><span class="mono">${String(index+1).padStart(2,'0')} / ${esc(project.sector.toUpperCase())}${project.restricted ? ' / INTERNAL ONLY' : ''}</span><h3>${esc(project.title)}</h3><div class="portfolio-item-actions"><button class="icon-button" data-move="${esc(id)}" data-direction="-1" aria-label="Move ${esc(project.title)} up" ${index === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button><button class="icon-button" data-move="${esc(id)}" data-direction="1" aria-label="Move ${esc(project.title)} down" ${index === selection.length-1 ? 'disabled' : ''}>${icon('arrow-down')}</button><button class="icon-button" data-remove="${esc(id)}" aria-label="Remove ${esc(project.title)} from portfolio">${icon('x')}</button></div></div></article>`;
    }).join('');
    updateCovers();
  }
  function renderCollections() {
    $('saved-collections').innerHTML = '<option value="">Choose a saved selection</option>' + collections.map((item,index) => `<option value="${index}">${esc(item.name)} (${item.ids.length})</option>`).join('');
    $('delete-collection').hidden = true;
  }
  function openPortfolio() { renderPortfolio(); renderCollections(); updateAudienceWarning(); showDialog($('portfolio-dialog'),'portfolio-title'); track('portfolio_open',{project_count:selection.length}); }
  function exportProjects(items, options) {
    if (options.audience === 'client' && items.some(project => project.restricted)) { toast('Restricted projects require an internal edition. Review the sharing audience in Portfolio studio.'); return; }
    if (!window.NorthStarExport) { toast('The portfolio creator could not load. Refresh the page and try again.'); return; }
    $('export-button').disabled = true;
    try {
      Promise.resolve(window.NorthStarExport.open(items,options)).then(result => { if (result) { toast(`Your ${result.pages}-page collection is ready.`); track('portfolio_created',{edition:options.edition,project_count:items.length,page_count:result.pages}); } }).catch(error => { track('portfolio_failed',{edition:options.edition,project_count:items.length}); toast(error.message || 'Your collection could not be created. Please try again.'); }).finally(updateAudienceWarning);
    } catch (error) { track('portfolio_failed',{edition:options.edition,project_count:items.length}); toast(error.message || 'Your collection could not be created. Please try again.'); updateAudienceWarning(); }
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      if (link.dataset.projectLink) { event.preventDefault(); navigateProject(link.dataset.projectLink); return; }
      if (link.hasAttribute('data-home')) { event.preventDefault(); navigateHome(new URL(link.href).hash); return; }
      const sectionId = link.dataset.projectSection || (link.classList.contains('skip-link') && current ? 'project-overview' : null);
      if (sectionId && document.body.classList.contains('project-route')) { const target = document.getElementById(sectionId); if (target) { event.preventDefault(); history.pushState({project:current},'',projectUrl(current) + '#' + sectionId); target.scrollIntoView(); if (link.classList.contains('skip-link')) { target.tabIndex = -1; target.focus({preventScroll:true}); } } return; }
    }
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-open-portfolio')) { openPortfolio(); return; }
    if (button.dataset.select) { toggleSelection(button.dataset.select,button); return; }
    if (button.dataset.open) { openCase(button.dataset.open); return; }
    if (button.dataset.industry) {
      sector = button.dataset.industry; limit = 12;
      track('industry_select',{industry:sector,placement:'case_industry_navigation'});
      $('search').value = ''; ['location-filter','event-filter','service-filter'].forEach(id => $(id).value = '');
      document.querySelectorAll('[data-sector]').forEach(tab => tab.setAttribute('aria-pressed',tab.dataset.sector === sector));
      render(); $('library').scrollIntoView(); $('library-heading').tabIndex = -1; $('library-heading').focus({preventScroll:true}); return;
    }
    if (button.dataset.copyProject) {
      const url = location.origin + projectUrl(button.dataset.copyProject);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast('Project link copied.'),() => toast('Copy this project’s address from your browser to share it.'));
      else toast('Copy this project’s address from your browser to share it.'); return;
    }
    if (button.hasAttribute('data-sector')) {
      sector = button.dataset.sector; limit = 12;
      track('industry_select',{industry:sector || 'All industries',placement:'case_filter'});
      document.querySelectorAll('[data-sector]').forEach(tab => tab.setAttribute('aria-pressed', tab === button)); render(); return;
    }
    if (button.hasAttribute('data-feature')) { feature = Number(button.dataset.feature); renderFeature(true); return; }
    if (button.dataset.move) {
      const index = selection.indexOf(button.dataset.move), to = index + Number(button.dataset.direction);
      if (index < 0 || to < 0 || to >= selection.length) return;
      [selection[index],selection[to]] = [selection[to],selection[index]]; updateSelection();
      const next = document.querySelector(`[data-move="${CSS.escape(button.dataset.move)}"][data-direction="${button.dataset.direction}"]`);
      if (next && !next.disabled) next.focus(); else document.querySelector(`[data-item="${CSS.escape(button.dataset.move)}"] [data-remove]`)?.focus();
      toast('Project order updated.'); return;
    }
    if (button.dataset.remove) {
      const index = selection.indexOf(button.dataset.remove); toggleSelection(button.dataset.remove);
      const remaining = $('portfolio-items').querySelectorAll('[data-remove]');
      if (remaining.length) remaining[Math.min(index,remaining.length-1)].focus(); else $('browse-from-portfolio').focus(); return;
    }
    if (button.dataset.photo && asset(button.dataset.photo)) {
      $('lightbox-image').src = button.dataset.photo; $('lightbox-image').alt = button.dataset.caption || byId.get(current)?.title || 'Project photograph'; $('lightbox-caption').textContent = displayCaption($('lightbox-image').alt); showDialog($('lightbox')); return;
    }
    if (button.dataset.exportOne) { const project = byId.get(button.dataset.exportOne); if (project) { if (project.restricted && $('export-audience').value === 'client') { if (!selection.includes(project.id)) selection.push(project.id); updateSelection(); openPortfolio(); return; } exportProjects([project],exportOptions({title:project.title,subtitle:'NorthStar project experience'})); } }
  });
  $('search').addEventListener('input',() => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { limit = 12; render(); },100); });
  ['location-filter','event-filter','service-filter','sort'].forEach(id => $(id).addEventListener('change',() => { limit = 12; render(); }));
  $('filter-toggle').onclick = () => { const expanded = $('filter-toggle').getAttribute('aria-expanded') !== 'true'; $('filter-toggle').setAttribute('aria-expanded',expanded); $('advanced-filters').hidden = !expanded; };
  $('reset-filters').onclick = resetFilters; $('empty-reset').onclick = () => { resetFilters(); $('search').focus(); };
  $('load-more').onclick = () => { const oldLimit = limit; limit += 12; render(); const next = $('project-grid').querySelectorAll('.card-image-button')[oldLimit]; next?.focus({preventScroll:true}); };
  $('grid-view').onclick = () => { view = 'grid'; render(); persist(); }; $('list-view').onclick = () => { view = 'list'; render(); persist(); };
  $('select-results').onclick = () => { selection = cleanIds([...selection,...filtered.map(project => project.id)]); updateSelection(); track('project_selection',{action:'save_results',project_count:selection.length}); toast(`${filtered.length} matching projects selected.`); };
  const clearSelection = () => { selection = []; updateSelection(); track('project_selection',{action:'clear',project_count:0}); toast('Project selection cleared.'); };
  $('clear-selection').onclick = () => { clearSelection(); document.querySelector('.portfolio-trigger').focus(); }; $('portfolio-clear').onclick = () => { clearSelection(); $('browse-from-portfolio').focus(); };
  $('feature-prev').onclick = () => { feature = (feature - 1 + featured.length) % featured.length; renderFeature(true); }; $('feature-next').onclick = () => { feature = (feature + 1) % featured.length; renderFeature(true); };
  $('close-case').onclick = () => $('case-dialog').close(); $('close-portfolio').onclick = () => $('portfolio-dialog').close(); $('close-lightbox').onclick = () => $('lightbox').close();
  $('case-dialog').addEventListener('close',() => { current = null; if (location.hash.startsWith('#case/')) history.replaceState(null,'',location.pathname+location.search+'#library'); });
  $('browse-from-portfolio').onclick = () => { $('portfolio-dialog').close(); if ($('case-dialog').open) $('case-dialog').close(); navigateHome('#library'); $('search').focus(); };
  $('portfolio-form').addEventListener('submit',event => { event.preventDefault(); if (!selection.length) return; exportProjects(selection.map(id => byId.get(id)),exportOptions()); });
  $('export-audience').addEventListener('change',updateAudienceWarning);
  $('remove-restricted').onclick = () => { selection = selection.filter(id => !byId.get(id).restricted); updateSelection(); toast('Restricted projects removed from this selection.'); };
  $('portfolio-form').addEventListener('invalid',() => { $('cover-customization').open = true; },true);
  ['export-title','export-subtitle','export-recipient'].forEach(id => $(id).addEventListener('input',updateCovers));
  $('save-collection').onclick = () => {
    const name = $('collection-name').value.trim(); if (!name) { $('collection-name').focus(); toast('Give this selection a name.'); return; }
    const existing = collections.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
    const item = {name,ids:[...selection]}; if (existing >= 0) collections[existing] = item; else collections.push(item);
    persist(); renderCollections(); toast(`“${name}” saved in this browser.`);
    track('collection_action',{action:'save',project_count:selection.length});
  };
  $('saved-collections').onchange = () => { const index = $('saved-collections').value; $('delete-collection').hidden = index === ''; if (index !== '' && collections[Number(index)]) { selection = cleanIds(collections[Number(index)].ids); $('collection-name').value = collections[Number(index)].name; updateSelection(); track('collection_action',{action:'load',project_count:selection.length}); toast('Saved selection loaded.'); } };
  $('delete-collection').onclick = () => { const index = Number($('saved-collections').value); if ($('saved-collections').value !== '' && collections[index]) { collections.splice(index,1); persist(); renderCollections(); track('collection_action',{action:'delete'}); toast('Saved selection deleted.'); } };
  document.addEventListener('keydown',event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/input|textarea|select/i.test(event.target.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); if (document.body.classList.contains('project-route')) navigateHome('#library'); $('search').focus(); $('library').scrollIntoView(); } });
  function readRoute() {
    const relativePath = location.pathname.startsWith(basePath) ? location.pathname.slice(basePath.length) : '';
    const match = relativePath.match(/^projects\/([^/]+)(?:\/(?:index\.html)?)?$/);
    if (match) { try { if (!renderProject(decodeURIComponent(match[1]))) { $('home-page').hidden = true; $('project-page').innerHTML = `<section class="project-not-found section-wrap"><h1>Project unavailable.</h1><p>This project is not part of this collection.</p><a class="button" href="${basePath}" data-home>Explore projects</a></section>`; } } catch { toast('This project link is not valid.'); } }
    else if (location.hash.startsWith('#case/')) { try { const id = decodeURIComponent(location.hash.slice(6)); if (byId.has(id)) { history.replaceState({project:id},'',projectUrl(id)); renderProject(id); } } catch { toast('This project link is not valid.'); } }
    else if (document.body.classList.contains('project-route')) navigateHome(location.hash,false);
  }
  window.addEventListener('popstate',readRoute);
  $('total-studies').textContent = studies.length; $('total-sectors').textContent = new Set(studies.map(project => project.sector)).size;
  document.querySelectorAll('[data-collection-label]').forEach(node => node.textContent = collectionLabel);
  document.querySelectorAll('[data-contact-link]').forEach(node => node.href = contactUrl);
  $('portfolio-title').textContent = collectionLabel; $('audience-field').hidden = !internal;
  $('cover-customization').open = internal;
  $('edition-label').textContent = internal ? 'INTERNAL / PORTFOLIO STUDIO' : 'PROJECT EXPERIENCE';
  document.body.classList.toggle('internal-edition',internal);
  if (internal) { document.querySelector('#portfolio-section .callout-copy>p').textContent = 'Build project collections for clients or internal teams. Customize the cover, arrange the stories, and choose an executive or detailed edition.'; document.querySelector('#portfolio-section [data-open-portfolio]').innerHTML = 'Open Portfolio studio ' + icon('arrow-up-right'); }
  populateFilters(); renderEditorial(); renderFeature(); render(); updateSelection(); readRoute();
  window.NorthStarLibrary = Object.freeze({getSelection:() => [...selection],getStudies:() => studies,openCase:navigateProject,openPortfolio});
})();
