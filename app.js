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
  const seoModule = window.NORTHSTAR_SEO ? import('./site-seo.mjs?v=7d3a16f265d5') : null;
  let metadataRevision = 0;
  function updatePageMetadata(project = null) {
    document.title = project ? `${project.title} | NorthStar Case Study` : 'NorthStar Case Studies | Recovery, Demolition & Remediation';
    if (!seoModule) return;
    const revision = ++metadataRevision;
    seoModule.then(({ projectPageSeo, collectionPageSeo, serializeSeoJson }) => {
      // Navigation can change while the shared module is loading.
      if (revision !== metadataRevision) return;
      const seo = project ? projectPageSeo(window.NORTHSTAR_SEO, project) : collectionPageSeo(window.NORTHSTAR_SEO, studies);
      document.title = seo.title;
      const setMeta = (kind, name, value) => {
        let node = document.head.querySelector(`meta[${kind}="${name}"]`);
        if (!value) { node?.remove(); return; }
        if (!node) { node = document.createElement('meta'); node.setAttribute(kind, name); document.head.append(node); }
        node.content = value;
      };
      for (const [name, value] of Object.entries({ description:seo.description, robots:seo.robots, 'twitter:card':seo.image ? 'summary_large_image' : 'summary', 'twitter:title':seo.title, 'twitter:description':seo.description, 'twitter:image':seo.image, 'twitter:image:alt':seo.image ? seo.imageAlt : '' })) setMeta('name', name, value);
      for (const [name, value] of Object.entries({ 'og:type':seo.type, 'og:title':seo.title, 'og:description':seo.description, 'og:url':seo.canonical, 'og:image':seo.image, 'og:image:alt':seo.image ? seo.imageAlt : '' })) setMeta('property', name, value);
      let canonical = document.head.querySelector('link[rel="canonical"]');
      if (seo.canonical) {
        if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
        canonical.href = seo.canonical;
      } else canonical?.remove();
      let schema = document.getElementById('northstar-seo-schema');
      if (!schema) { schema = document.createElement('script'); schema.id = 'northstar-seo-schema'; schema.type = 'application/ld+json'; document.head.append(schema); }
      schema.textContent = serializeSeoJson(seo.structured);
    }).catch(error => console.warn('Page metadata could not be updated.', error));
  }
  const photoSrc = project => asset(project.hero || project.images?.[0]?.src || project.visual?.src);
  const isConceptual = project => !asset(project.hero || project.images?.[0]?.src) && asset(project.visual?.src);
  const caption = (project,src) => project.imageCaptions?.[src] || (src === project.visual?.src ? project.visual.caption || 'Conceptual illustration. Not a project photograph.' : `${project.title}: project photograph`);
  const displayCaption = value => String(value || '').replace(/\s*Conceptual (?:project )?illustration[.;]?\s*(?:Not a (?:site|project) photograph(?: or plan)?\.?|Not a photograph of the project\.?)?/gi, '').trim();
  const byId = new Map(studies.map(project => [project.id, project]));
  const storageKey = internal ? 'northstar-experience-internal-v2' : 'northstar-experience-v1';
  const draftFields = {title:'export-title',subtitle:'export-subtitle',recipient:'export-recipient',introduction:'export-introduction',contactName:'export-contact-name',contactEmail:'export-contact-email'};
  const defaultDraft = Object.fromEntries(Object.entries(draftFields).map(([key,id]) => [key,$(id).value]));
  function cleanDraft(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {...Object.fromEntries(Object.entries(draftFields).map(([key,id]) => [key,typeof input[key] === 'string' ? input[key].slice(0,$(id).maxLength > 0 ? $(id).maxLength : 900) : defaultDraft[key]])),edition:input.edition === 'detailed' ? 'detailed' : 'executive',audience:internal && input.audience === 'internal' ? 'internal' : 'client'};
  }
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
  const savedCollections = Array.isArray(store.collections) ? store.collections : store.collections && typeof store.collections === 'object' ? Object.entries(store.collections).map(([name,value]) => ({name,ids:Array.isArray(value) ? value : value?.ids || value?.selection || [],draft:value?.draft})) : [];
  let draft = cleanDraft(store.draft);
  let collections = savedCollections.filter(item => item && typeof item.name === 'string').map(item => ({name:item.name.slice(0,80), ids:cleanIds(item.ids),draft:cleanDraft(item.draft)}));
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
  const heroScenes = Array.isArray(window.NORTHSTAR_HERO_ASSETS) ? window.NORTHSTAR_HERO_ASSETS.filter(scene => asset(scene.src)) : [];
  for (const project of studies.filter(project => project.featured && asset(project.hero))) if (featured.length < 5 && !featured.includes(project)) featured.push(project);
  if (!featured.length && studies.length) featured.push(studies[0]);
  const heroPlayer = window.NorthStarHeroMotion?.create({ hero: document.querySelector('.hero'), media: $('hero-media'), image: $('hero-image'), advance: () => { feature = (feature + 1) % (heroScenes.length || featured.length); renderFeature(true); } });
  const flagship = ['firestone','prologis-fedex-facility','ritz-carlton-naples'].map(id => byId.get(id) || studies.find(project => id === 'firestone' && /firestone/i.test(project.title))).filter(Boolean);
  for (const project of featured) if (flagship.length < 3 && !flagship.includes(project)) flagship.push(project);
  function reportDraftStatus() {
    if ($('draft-status')) $('draft-status').textContent = storageAvailable ? 'Draft saved in this browser.' : 'Draft available for this visit. Browser saving is unavailable.';
  }
  function persist() {
    if (!storageAvailable) { reportDraftStatus(); return; }
    try { localStorage.setItem(storageKey, JSON.stringify({...store, selection, collections, view, draft})); }
    catch { if (storageAvailable) toast('Browser storage is full. Your selection is available for this visit.'); storageAvailable = false; }
    reportDraftStatus();
  }
  function applyDraft(value) {
    draft = cleanDraft(value);
    for (const [key,id] of Object.entries(draftFields)) $(id).value = draft[key];
    document.querySelectorAll('input[name="edition"]').forEach(input => input.checked = input.value === draft.edition);
    $('export-audience').value = draft.audience;
    updateCovers(); updateAudienceWarning();
  }
  function saveDraft() {
    draft = cleanDraft(exportOptions()); updateCovers(); persist();
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
  }
  function photo(project, className = '', loading = 'lazy') {
    const src = photoSrc(project);
    return src ? `<img class="${className}" ${imageAttributes(src)} alt="${esc(caption(project,src))}" loading="${loading}">` : `<span class="photo-empty" aria-hidden="true">NorthStar</span>`;
  }
  function imageAttributes(src, sizes = '(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 40vw') {
    const responsive = window.NORTHSTAR_RESPONSIVE_ASSETS?.[src];
    const variants = typeof responsive?.srcset === 'string' ? responsive.srcset.split(',').map(value => value.trim()).filter(value => { const [url,width] = value.split(/\s+/); return asset(url) && /^\d+w$/.test(width); }) : [];
    return `src="${esc(asset(responsive?.src) || src)}"${variants.length ? ` srcset="${esc(variants.join(', '))}" sizes="${sizes}"` : ''}${Number.isInteger(responsive?.width) && Number.isInteger(responsive?.height) ? ` width="${responsive.width}" height="${responsive.height}"` : ''}`;
  }
  function selectedButton(project, classes = 'card-select') {
    const selected = selection.includes(project.id);
    return `<button class="${classes}" data-select="${esc(project.id)}" aria-pressed="${selected}" aria-label="${selected ? 'Remove' : 'Save'} ${esc(project.title)}${selected ? ' from collection' : ''}">${icon(selected ? 'check' : 'plus')}<span>${selected ? 'Saved' : 'Save project'}</span></button>`;
  }
  function renderCard(project, index) {
    return `<article class="project-card project-enter" style="--entry:${index % 6}" data-project="${esc(project.id)}"><div class="card-media"><a class="card-image-button${isConceptual(project) ? ' conceptual-card' : ''}" data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}" aria-label="Explore ${esc(project.title)}">${photo(project)}<span class="card-view">View project ${icon('arrow-up-right')}</span></a></div>${selectedButton(project)}<div class="card-body"><div class="card-meta mono"><span class="card-sector">${esc(project.sector)}</span><span>${project.restricted ? 'INTERNAL ONLY' : esc(project.period || '')}</span></div><h3 class="card-title"><a data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}">${esc(project.title)}</a></h3><p class="card-summary">${esc(project.outcome || project.summary)}</p><div class="card-foot"><span>${esc(project.location || 'NorthStar project experience')}</span>${icon('arrow-up-right')}</div></div></article>`;
  }
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const aliases = {hospital:'healthcare',hospitals:'healthcare',medical:'healthcare',manufacturing:'industrial',manufacturer:'industrial',manufacturers:'industrial',nyc:'newyork',ca:'california',fl:'florida',tx:'texas',la:'louisiana',nc:'northcarolina',sc:'southcarolina',nj:'newjersey',ny:'newyork',pa:'pennsylvania',tn:'tennessee',va:'virginia',ma:'massachusetts',ga:'georgia',il:'illinois',hi:'hawaii',oh:'ohio'};
  function tokens(value) {
    return normalize(value).replace(/commercial real estate/g,'commercial').replace(/health\s+care/g,'healthcare').replace(/new york(?: city)?/g,'newyork').replace(/north carolina/g,'northcarolina').replace(/south carolina/g,'southcarolina').replace(/new jersey/g,'newjersey').match(/[a-z0-9]+/g)?.map(word => aliases[word] || word) || [];
  }
  const searchIndex = new Map(studies.map(project => [project.id, [
    [project.title,16],[project.sector,14],[(project.services || []).join(' '),10],[project.location,10],[project.event,9],[project.facility,7],
    [[project.outcome,project.summary,...Object.values(project.executive || {})].filter(Boolean).join(' '),4],[project.searchText,1]
  ].map(([text,weight]) => ({words:new Set(tokens(text)),weight}))]));
  function searchScore(project, terms) {
    let total = 0;
    for (const term of terms) {
      const alternatives = [term,term.length > 4 && term.endsWith('s') ? term.slice(0,-1) : term + 's'];
      const score = Math.max(0,...searchIndex.get(project.id).map(field => alternatives.some(word => field.words.has(word)) ? field.weight : 0));
      if (!score) return -1;
      total += score;
    }
    return total;
  }
  const filterParams = {q:'search',location:'location-filter',event:'event-filter',service:'service-filter',sort:'sort'};
  let libraryQuery = new URLSearchParams(location.search);
  let routeInitialized = false, homeReady = false;
  function filterQuery(includeContext = true) {
    const query = new URLSearchParams(includeContext ? libraryQuery : '');
    for (const [key,id] of Object.entries(filterParams)) { const value = $(id).value.trim(); if (value && !(key === 'sort' && value === 'featured')) query.set(key,value); else query.delete(key); }
    if (sector) query.set('sector',sector); else query.delete('sector');
    if (view === 'list') query.set('view','list'); else query.delete('view');
    return query;
  }
  const withQuery = (path, query, hash = '') => path + (query.toString() ? '?' + query.toString() : '') + hash;
  function syncFilters() {
    libraryQuery = filterQuery();
    const url = withQuery(location.pathname,libraryQuery,location.hash);
    if (url !== location.pathname + location.search + location.hash) history.pushState({},'',url);
  }
  function restoreFilters() {
    libraryQuery = new URLSearchParams(location.search);
    for (const [key,id] of Object.entries(filterParams)) {
      const input = $(id), value = libraryQuery.get(key) || (key === 'sort' ? 'featured' : '');
      input.value = key === 'q' ? value.slice(0,200) : [...input.options].some(option => option.value === value) ? value : key === 'sort' ? 'featured' : '';
    }
    const requestedSector = libraryQuery.get('sector');
    sector = studies.some(project => project.sector === requestedSector) ? requestedSector : '';
    view = libraryQuery.get('view') === 'list' || (!routeInitialized && !libraryQuery.has('view') && store.view === 'list') ? 'list' : 'grid';
    if (!routeInitialized && view === 'list' && !libraryQuery.has('view')) { libraryQuery.set('view','list'); history.replaceState(history.state,'',withQuery(location.pathname,libraryQuery,location.hash)); }
    routeInitialized = true;
    document.querySelectorAll('[data-sector]').forEach(button => button.setAttribute('aria-pressed',button.dataset.sector === sector));
    limit = 12;
  }
  function reportSearch(terms) {
    const controlledTopics = ['healthcare','industrial','commercial','hospitality','education','hurricane','fire','water','demolition','abatement','recovery'];
    const topic = controlledTopics.find(value => terms.includes(value)) || (terms.length ? 'other' : sector ? 'industry' : 'all');
    const properties = {topic_category:topic,result_count:filtered.length,industry:sector || 'All industries'};
    track('search_results',properties);
    if (!filtered.length) track('search_zero_results',properties);
  }
  function recentYear(project) {
    const years = String(project.period || '').match(/\b(?:19|20)\d{2}\b/g) || [];
    return Number(project.year) || (years.length ? Number(years[0]) : 0);
  }
  function render(sync = false, measure = false) {
    const terms = [...new Set(tokens($('search').value))];
    const scores = new Map(studies.map(project => [project.id,searchScore(project,terms)]));
    filtered = studies.filter(project => (!sector || project.sector === sector) && (!$('location-filter').value || project.location === $('location-filter').value) && (!$('event-filter').value || project.event === $('event-filter').value) && (!$('service-filter').value || (project.services || []).includes($('service-filter').value)) && scores.get(project.id) >= 0);
    const sort = $('sort').value;
    if (sort === 'az') filtered.sort((a,b) => a.title.localeCompare(b.title));
    if (sort === 'za') filtered.sort((a,b) => b.title.localeCompare(a.title));
    if (sort === 'sector') filtered.sort((a,b) => a.sector.localeCompare(b.sector) || a.title.localeCompare(b.title));
    if (sort === 'recent') filtered.sort((a,b) => recentYear(b)-recentYear(a) || a.title.localeCompare(b.title));
    if (sort === 'featured') filtered.sort((a,b) => scores.get(b.id)-scores.get(a.id) || Number(b.featured) - Number(a.featured));
    $('project-grid').innerHTML = filtered.slice(0,limit).map(renderCard).join('');
    $('project-grid').classList.toggle('list-view', view === 'list');
    $('result-count').innerHTML = `<strong>${filtered.length}</strong> ${filtered.length === 1 ? 'project' : 'projects'}${sector ? ` in ${esc(sector)}` : ' to explore'}`;
    $('showing-count').textContent = `SHOWING ${Math.min(limit,filtered.length)} OF ${filtered.length} PROJECTS`;
    $('load-more').hidden = limit >= filtered.length;
    $('empty-state').hidden = filtered.length !== 0;
    $('select-results').disabled = !filtered.length;
    $('grid-view').setAttribute('aria-pressed', view === 'grid'); $('list-view').setAttribute('aria-pressed', view === 'list');
    if (sync) syncFilters();
    if (measure) reportSearch(terms);
    document.dispatchEvent(new CustomEvent('northstar:render'));
  }
  function populateFilters() {
    for (const [id, values] of [['location-filter',studies.map(project => project.location)], ['event-filter',studies.map(project => project.event)], ['service-filter',studies.flatMap(project => project.services)]]) {
      for (const value of [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b))) $(id).add(new Option(value, value));
    }
    const sectors = [...new Set(studies.map(project => project.sector))].sort((a,b) => a.localeCompare(b));
    $('sector-tabs').innerHTML = ['',...sectors].map(value => `<button data-sector="${esc(value)}" aria-pressed="${value === sector}">${esc(value || 'All projects')}<span>${value ? studies.filter(project => project.sector === value).length : studies.length}</span></button>`).join('');
    $('industry-entrances').innerHTML = sectors.map((value,index) => `<button class="industry-entrance" data-industry="${esc(value)}"><span class="mono">${String(index+1).padStart(2,'0')} / ${studies.filter(project => project.sector === value).length} PROJECTS</span><strong>${esc(value)}</strong>${icon('arrow-up-right')}</button>`).join('');
    if ($('industry-quick-select')) $('industry-quick-select').innerHTML = '<option value="">Choose an industry</option>' + sectors.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  }
  function renderEditorial() {
    $('flagship-grid').innerHTML = flagship.map((project,index) => `<article class="flagship-card reveal"><a class="flagship-image" data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}">${photo(project)}<span class="flagship-number mono">${String(index+1).padStart(2,'0')}</span><span class="flagship-open">Explore project ${icon('arrow-up-right')}</span></a><div class="flagship-copy"><span class="mono">${esc(project.sector)} / ${esc(project.location)}</span><h3><a data-project-link="${esc(project.id)}" href="${projectUrl(project.id)}">${esc(project.title)}</a></h3><p>${esc(project.outcome || project.summary)}</p>${selectedButton(project,'text-button flagship-save')}</div></article>`).join('');
  }
  function initializeHome() {
    if (homeReady) return;
    homeReady = true; renderEditorial(); renderFeature();
  }
  function resetFilters() {
    $('search').value = ''; ['location-filter','event-filter','service-filter'].forEach(id => $(id).value = '');
    sector = ''; limit = 12; $('sort').value = 'featured'; document.querySelectorAll('[data-sector]').forEach(button => button.setAttribute('aria-pressed', button.dataset.sector === '')); render(true,true);
  }
  function updateCovers() {
    const first = byId.get(selection[0]) || featured[0];
    const src = first ? photoSrc(first) : '';
    for (const id of ['showcase-image','live-cover-image']) if (src && (id === 'showcase-image' ? homeReady : $('portfolio-dialog').open)) {
      const responsive = window.NORTHSTAR_RESPONSIVE_ASSETS?.[src];
      $(id).src = asset(responsive?.src) || src;
    }
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
    if ($('share-collection')) $('share-collection').disabled = !selection.some(id => !byId.get(id).restricted);
    if ($('discuss-collection')) $('discuss-collection').disabled = !selection.length;
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
    const items = heroScenes.length ? heroScenes : featured;
    if (!items.length) return;
    const revision = ++featureRevision, project = items[feature];
    heroPlayer?.begin();
    const src = asset(heroScenes.length ? project.src : project.hero || project.images?.[0]?.src);
    const responsive = heroScenes.length ? project : window.NORTHSTAR_RESPONSIVE_ASSETS?.[src];
    const srcset = typeof responsive?.srcset === 'string' ? responsive.srcset.split(',').map(value => value.trim()).filter(value => { const [url,width] = value.split(/\s+/); return asset(url) && /^\d+w$/.test(width); }).join(', ') : '';
    if (animate && src) {
      const preload = new Image(); preload.srcset = srcset; preload.sizes = '100vw'; preload.src = src;
      let timeout;
      try { await Promise.race([preload.decode(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Image loading timed out.')), 8000); })]); }
      catch { if (revision === featureRevision) heroPlayer?.recover(); return; }
      finally { clearTimeout(timeout); }
    }
    if (revision !== featureRevision) return;
    const update = () => {
    $('hero-image').srcset = srcset; $('hero-image').sizes = '100vw';
    $('hero-image').src = src; $('hero-image').alt = heroScenes.length ? project.alt : project.title;
    $('hero-image').style.setProperty('--hero-position', heroScenes.length ? project.position || 'center' : 'center');
    $('hero-image').style.setProperty('--hero-mobile-position', heroScenes.length ? project.mobilePosition || project.position || 'center' : 'center');
    $('hero-sector').textContent = project.sector.toUpperCase(); $('hero-title').textContent = project.title; $('hero-location').textContent = project.location;
    if (heroScenes.length) {
      delete $('hero-case').dataset.projectLink;
      const destination = typeof project.href === 'string' && /^marketing\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(project.href) ? project.href : '#library';
      $('hero-case').toggleAttribute('data-home', destination === '#library');
      $('hero-case').href = basePath + destination;
    }
    else { $('hero-case').dataset.projectLink = project.id; $('hero-case').removeAttribute('data-home'); $('hero-case').href = projectUrl(project.id); }
    $('hero-outcome').textContent = project.outcome || project.summary;
    $('feature-index').textContent = String(feature+1).padStart(2,'0'); $('feature-total').textContent = String(items.length).padStart(2,'0');
    if (!$('feature-dots').children.length) $('feature-dots').innerHTML = items.map((item,index) => `<button data-feature="${index}" aria-label="Show image ${index + 1} of ${items.length}: ${esc(item.title)}" aria-pressed="${index === feature}"><span class="hero-segment-fill" aria-hidden="true"></span></button>`).join('');
    $('feature-dots').querySelectorAll('button').forEach((button,index) => button.setAttribute('aria-pressed',index === feature));
    };
    if (heroPlayer) heroPlayer.present(update, { animate, index: feature }); else update();
  }
  function showDialog(dialog, focusId) {
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    if (focusId) $(focusId)?.focus({preventScroll:true});
  }
  function mountDialog(id, className, title, body) {
    let dialog = $(id);
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = id; dialog.className = className; document.body.append(dialog); }
    dialog.setAttribute('aria-labelledby',id + '-title');
    dialog.innerHTML = `<div class="dialog-header"><h2 id="${id}-title" tabindex="-1">${esc(title)}</h2><button class="icon-button" data-close-dialog="${id}" aria-label="Close ${esc(title)}">${icon('x')}</button></div><div class="dialog-body">${body}</div>`;
    showDialog(dialog,id + '-title'); return dialog;
  }
  async function copyText(value, message) {
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(value); toast(message); }
    catch {
      mountDialog('copy-dialog','enquiry-dialog','Copy this text',`<p>Select and copy the text below.</p><textarea id="copy-text" class="enquiry-brief" rows="5" readonly aria-label="Text to copy">${esc(value)}</textarea>`);
      $('copy-text').focus(); $('copy-text').select();
    }
  }
  function publicIds(ids) { return cleanIds(ids).filter(id => !byId.get(id).restricted && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)); }
  function collectionUrl(ids) {
    return location.origin + withQuery(basePath,new URLSearchParams({collection:publicIds(ids).join(',')}));
  }
  function openEnquiry(ids) {
    const available = publicIds(ids).map(id => byId.get(id));
    if (!available.length) { toast('Select a public project to prepare an enquiry.'); return; }
    const reference = available.length === 1 ? location.origin + projectUrl(available[0].id) : collectionUrl(available.map(item => item.id));
    const brief = `I would like to discuss a project with NorthStar.\n\nRelevant experience:\n${available.map(item => `${item.title}\n${location.origin + projectUrl(item.id)}`).join('\n\n')}\n\nMy site, priorities and timing:\n`;
    const emailBody = available.length <= 3 ? brief : `I would like to discuss a project with NorthStar.\n\nRelevant experience: ${available.length} selected projects\n${reference}\n\nMy site, priorities and timing:\n`;
    const mailto = `mailto:contact@northstar.com?subject=${encodeURIComponent(available.length === 1 ? `Project enquiry: ${available[0].title}` : 'Project enquiry: selected NorthStar experience')}&body=${encodeURIComponent(emailBody)}`;
    mountDialog('enquiry-dialog','enquiry-dialog','Discuss your project',`<p>Your project references are ready. Add your site, priorities and timing in your email, or copy the brief into the contact form.</p><label for="enquiry-brief">Project reference brief</label><textarea id="enquiry-brief" class="enquiry-brief" rows="8" readonly>${esc(brief)}</textarea><div class="enquiry-actions"><a class="button" href="${esc(mailto)}" data-enquiry-email>Open email draft ${icon('arrow-up-right')}</a><button class="button outline" data-copy-enquiry>Copy project brief</button><a class="text-button" data-contact-link href="${esc(contactUrl)}" target="_blank" rel="noopener noreferrer">Open corporate contact form ${icon('arrow-up-right')}</a></div><p>For an emergency response, call <a href="tel:18002832933">1-800-283-2933</a>.</p>`);
    track('contact_click',{method:'prepare-enquiry',placement:available.length === 1 ? 'case-reference' : 'collection',project_count:available.length});
  }
  let lastSharedCollection = '';
  function previewSharedCollection() {
    const raw = new URLSearchParams(location.search).get('collection');
    if (!raw || raw === lastSharedCollection) return;
    lastSharedCollection = raw;
    const ids = raw.length <= 10000 ? publicIds(raw.split(',').slice(0,150)) : [];
    if (!ids.length) { toast('This shared collection has no available public projects.'); return; }
    const dialog = mountDialog('shared-collection-dialog','shared-collection-dialog','Shared project collection',`<p>Explore these ${ids.length} selected ${ids.length === 1 ? 'project' : 'projects'}. Your current saved collection remains available until you choose an action.</p><ol class="shared-project-list">${ids.map(id => `<li><a data-project-link="${esc(id)}" href="${projectUrl(id)}">${esc(byId.get(id).title)}</a><span>${esc(byId.get(id).sector)}</span></li>`).join('')}</ol><div class="enquiry-actions"><button class="button" id="shared-collection-add">Add to saved projects</button><button class="button outline" id="shared-collection-replace">Use as new collection</button></div>`);
    $('shared-collection-add').onclick = () => { selection = cleanIds([...selection,...ids]); updateSelection(); dialog.close(); toast('Shared projects added to your collection.'); };
    $('shared-collection-replace').onclick = () => { selection = [...ids]; applyDraft({...defaultDraft,title:'Shared project collection'}); updateSelection(); dialog.close(); openPortfolio(); toast('Shared collection loaded as your current draft.'); };
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
  function hasSubstantiveStory(project, sections) {
    const words = tokens(sections.map(section => section.text || '').join(' '));
    if (words.length < 65) return false;
    const overviewWords = new Set(tokens([project.summary,...Object.values(project.executive || {})].join(' ')));
    return new Set(words.filter(word => word.length > 3 && !overviewWords.has(word))).size >= 12;
  }
  function relatedProjects(project) {
    const services = new Set(project.services || []);
    const facility = new Set(tokens(project.facility).filter(word => word.length > 3));
    return studies.filter(item => item.id !== project.id).map(item => {
      const shared = (item.services || []).filter(service => services.has(service));
      const sameEvent = project.event && project.event !== 'Not specified' && project.event === item.event;
      const sameSector = item.sector === project.sector;
      const sameFacility = tokens(item.facility).filter(word => facility.has(word)).length;
      const score = shared.length * 5 + Number(Boolean(sameEvent)) * 5 + Number(sameSector) * 3 + Math.min(sameFacility,3) * 2;
      const reason = shared.length ? `Shared experience: ${shared.slice(0,2).join(' · ')}` : sameEvent ? `Similar event: ${item.event}` : sameFacility ? 'Similar facility experience' : `More ${project.sector.toLowerCase()} experience`;
      return {project:item,score,reason};
    }).filter(item => item.score > 0).sort((a,b) => b.score-a.score || Number(Boolean(b.project.hero))-Number(Boolean(a.project.hero))).slice(0,3);
  }
  function industryGuide(project) {
    const guides = {Healthcare:['medical-brief','Healthcare project planning'],Industrial:['industrial-brief','Industrial project planning'],Commercial:['commercial-real-estate-brief','Commercial property planning'],Education:['education-brief','Education project planning'],Hospitality:['hospitality-recovery','Hospitality recovery guide'],Technology:['technology-brief','Technology project planning']};
    const [id,title] = guides[project.sector] || ['national-recovery-capabilities','NorthStar recovery capabilities'];
    return `<aside class="project-guide"><span class="eyebrow mono">PLAN YOUR NEXT STEP</span><h3>${esc(title)}</h3><p>Explore the capabilities and planning guidance relevant to your site.</p><a class="text-button" href="${basePath}marketing/${id}.html">Read the guide ${icon('arrow-up-right')}</a></aside>`;
  }
  function photoAttribution(image) {
    if (!image.license || !/^https:\/\//.test(image.sourceUrl || '') || !/^https:\/\//.test(image.licenseUrl || '')) return '';
    return ` <span class="photo-credit-links"><a href="${esc(image.sourceUrl)}" target="_blank" rel="noopener noreferrer">Photo source</a> · <a href="${esc(image.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(image.license)}</a></span>`;
  }
  function renderProject(id) {
    const project = byId.get(id); if (!project) return false;
    current = id;
    const executive = project.executive || {};
    const sections = project.sections?.length ? project.sections : [{heading:'Project story',text:project.overview}];
    const narrative = sections.filter(section => section.text).map(section => `<section><h3>${esc(section.heading || 'Project story')}</h3>${section.text.split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('');
    const images = (project.images || []).filter(image => asset(image.src));
    const gallery = images.map((image,index) => `<figure class="project-photo reveal"><button data-photo="${esc(image.src)}" data-caption="${esc(caption(project,image.src))}" aria-label="Enlarge photograph ${index+1}: ${esc(caption(project,image.src))}"><img ${imageAttributes(image.src)} alt="${esc(caption(project,image.src))}" loading="lazy">${icon('maximize-2')}</button><figcaption><span class="mono">${String(index+1).padStart(2,'0')}</span><span class="photo-caption">${esc(displayCaption(caption(project,image.src)))}${photoAttribution(image)}</span></figcaption></figure>`).join('');
    const timeline = Array.isArray(project.timeline) ? project.timeline.filter(item => item.label && item.text) : [];
    const related = relatedProjects(project);
    const research = project.research || {};
    const publicSources = (research.sources || []).filter(source => /^https:\/\//.test(source.url || ''));
    const qualifiers = (project.qualifiers || []).map(note => `<p class="detail-qualifier">${esc(note)}</p>`).join('');
    const reviewNote = internal && project.editorialNote ? `<aside class="editorial-note"><span class="mono">INTERNAL EDITORIAL NOTE</span><p>${esc(Array.isArray(project.editorialNote) ? project.editorialNote.join(' ') : project.editorialNote)}</p></aside>` : '';
    const metrics = projectMetrics(project);
    const storyVisual = project.storyVisual && asset(project.storyVisual.src) ? project.storyVisual : null;
    const explainer = storyVisual && !isConceptual(project) ? `<section class="project-explainer reveal"><div class="section-heading"><div><span class="eyebrow mono">THE PROJECT, EXPLAINED</span><h2>${esc(storyVisual.title || 'Understanding the scope.')}</h2></div></div><figure><button data-photo="${esc(storyVisual.src)}" data-caption="${esc(storyVisual.caption || 'Conceptual project illustration.') }" aria-label="Enlarge project illustration"><img ${imageAttributes(storyVisual.src,'(max-width: 640px) 100vw, 85vw')} alt="${esc(storyVisual.caption || storyVisual.title || 'Project illustration')}" loading="lazy">${icon('maximize-2')}</button><figcaption><p>${esc(displayCaption(storyVisual.caption) || storyVisual.title || 'The project scope.')}</p></figcaption></figure>${storyVisual.description ? `<p class="explainer-description">${esc(storyVisual.description)}</p>` : ''}</section>` : '';
    $('project-page').innerHTML = `<article class="project-experience">
      <div class="project-breadcrumb section-wrap"><a href="${basePath}#library" data-home>${icon('arrow-left')} All projects</a><span class="mono">${esc(project.sector)}${project.restricted ? ' / INTERNAL ONLY' : ''}</span><button class="motion-toggle project-motion" data-motion-toggle aria-pressed="false"><i class="icon pause" aria-hidden="true"></i><span>Motion on</span></button><button class="text-button" data-copy-project="${esc(id)}">Copy project link ${icon('arrow-up-right')}</button></div>
      <section class="project-opening${isConceptual(project) ? ' conceptual-opening' : ''}"><div class="project-opening-photo">${photo(project,'','eager')}</div><div class="project-opening-copy"><span class="eyebrow mono">${esc([project.location,project.period].filter(Boolean).join(' / '))}</span><h1 id="project-title" tabindex="-1">${esc(project.title)}</h1><p>${esc(project.outcome || project.summary)}</p><div class="project-actions">${selectedButton(project,'button inverse')}<button class="text-button" data-export-one="${esc(id)}">Download project ${icon('download')}</button></div></div></section>
      <nav class="project-section-nav section-wrap" aria-label="Project sections"><a data-project-section="project-overview" href="${projectUrl(id)}#project-overview">Overview</a>${timeline.length ? `<a data-project-section="project-response" href="${projectUrl(id)}#project-response">Response sequence</a>` : ''}${images.length ? `<a data-project-section="project-gallery" href="${projectUrl(id)}#project-gallery">Photographs</a>` : ''}${related.length ? `<a data-project-section="related-projects" href="${projectUrl(id)}#related-projects">Related experience</a>` : ''}<a data-enquire="${esc(id)}" href="${esc(contactUrl)}">Discuss a project like this ${icon('arrow-up-right')}</a></nav>
      <div class="project-body section-wrap"><section id="project-overview" class="project-overview"><div class="project-narrative"><span class="eyebrow mono">PROJECT OVERVIEW</span>${executive.challenge || executive.response || executive.result ? `<div class="executive-story">${[['01','The challenge',executive.challenge],['02','NorthStar’s response',executive.response],['03','The result',executive.result]].filter(([, ,text]) => text).map(([number,title,text]) => `<section class="reveal"><span class="mono">${number}</span><div><h2>${title}</h2><p>${esc(text)}</p></div></section>`).join('')}</div><details class="full-story"><summary>Read the complete project story ${icon('plus')}</summary><div class="detail-story">${narrative}</div></details>` : `<div class="detail-story">${narrative}</div>`}${qualifiers}${reviewNote}</div><aside class="project-facts"><span class="eyebrow mono">PROJECT AT A GLANCE</span>${metrics ? `<div class="project-fact-metrics">${metrics}</div>` : ''}<dl>${[['Location',project.location],['Industry',project.sector],['Event',project.event],['Period',project.period]].filter(([,value]) => value).map(([label,value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${project.services?.length ? `<h3 class="mono">PROJECT SERVICES</h3><div class="detail-services">${project.services.map(service => `<span>${esc(service)}</span>`).join('')}</div>` : ''}</aside></section>
      ${explainer}
      ${timeline.length ? `<section id="project-response" class="response-sequence"><div class="section-heading"><div><span class="eyebrow mono">THE WORK, IN SEQUENCE</span><h2>How it came together.</h2></div></div><ol>${timeline.map((item,index) => `<li class="reveal"><span class="sequence-number mono">${String(index+1).padStart(2,'0')}</span><h3>${esc(item.label)}</h3><p>${esc(item.text)}</p></li>`).join('')}</ol></section>` : ''}
      ${research.context ? `<aside class="project-context reveal"><span class="eyebrow mono">PROJECT CONTEXT</span><h2>The setting for the work.</h2><p>${esc(research.context)}</p>${publicSources.length ? `<details><summary>Explore the public context</summary><ul>${publicSources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || 'Public information')} ${icon('arrow-up-right')}</a></li>`).join('')}</ul></details>` : ''}</aside>` : ''}
      ${gallery ? `<section id="project-gallery" class="project-gallery-section"><div class="section-heading"><div><span class="eyebrow mono">PROJECT PHOTOGRAPHS</span><h2>A closer look.</h2></div><p>Select a photograph to explore it in detail.</p></div><div class="project-photo-grid">${gallery}</div></section>` : isConceptual(project) ? `<div class="conceptual-explanation"><span class="eyebrow mono">THE PROJECT, EXPLAINED</span><p>${esc(displayCaption(project.visual.caption) || project.visual.title || project.title)}</p>${storyVisual?.description ? `<p>${esc(storyVisual.description)}</p>` : ''}<button class="text-button" data-photo="${esc(photoSrc(project))}" data-caption="${esc(project.visual.caption || 'Conceptual project illustration')}">Explore the illustration ${icon('maximize-2')}</button></div>` : ''}
      ${industryGuide(project)}
      <section class="project-contact reveal"><div><span class="eyebrow mono">YOUR NEXT PROJECT</span><h2>Let’s discuss<br>the work ahead.</h2><p>Bring this project reference into a conversation about your site and priorities.</p></div><a class="button inverse" data-enquire="${esc(id)}" href="${esc(contactUrl)}">Discuss a project like this ${icon('arrow-up-right')}</a></section>
      ${related.length ? `<section id="related-projects" class="related-projects"><div class="section-heading"><div><span class="eyebrow mono">CONTINUE EXPLORING</span><h2>Related experience.</h2></div></div><div class="related-grid">${related.map((item,index) => `<div><p class="related-reason">${esc(item.reason)}</p>${renderCard(item.project,index)}</div>`).join('')}</div></section>` : ''}</div></article>`;
    if (!hasSubstantiveStory(project,sections)) $('project-page').querySelector('.full-story')?.remove();
    $('home-page').hidden = true; document.body.classList.add('project-route');
    updatePageMetadata(project);
    reportCase(project);
    document.querySelector('.skip-link').href = projectUrl(id) + '#project-overview';
    document.dispatchEvent(new CustomEvent('northstar:render')); return true;
  }
  function navigateProject(id, push = true) {
    if (!byId.has(id)) return;
    if (push) { libraryQuery = filterQuery(); history.pushState({project:id},'',withQuery(projectUrl(id),libraryQuery)); }
    if ($('case-dialog').open) $('case-dialog').close();
    $('shared-collection-dialog')?.close();
    lastSharedCollection = '';
    renderProject(id); window.scrollTo({top:0,behavior:'instant'}); $('project-title')?.focus({preventScroll:true});
  }
  function navigateHome(hash = '', push = true) {
    if (push) { libraryQuery = filterQuery(); history.pushState({},'',withQuery(basePath,libraryQuery,hash)); }
    $('home-page').hidden = false; $('project-page').innerHTML = ''; document.body.classList.remove('project-route'); current = null;
    initializeHome(); render(); updateCovers();
    updatePageMetadata(); document.querySelector('.skip-link').href = '#library';
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
  function openPortfolio() { renderPortfolio(); renderCollections(); updateAudienceWarning(); showDialog($('portfolio-dialog'),'portfolio-title'); updateCovers(); track('portfolio_open',{project_count:selection.length}); }
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
      if (link.dataset.enquire) { event.preventDefault(); openEnquiry([link.dataset.enquire]); return; }
      if (link.hasAttribute('data-home')) { event.preventDefault(); navigateHome(new URL(link.href).hash); return; }
      const sectionId = link.dataset.projectSection || (link.classList.contains('skip-link') && current ? 'project-overview' : null);
      if (sectionId && document.body.classList.contains('project-route')) { const target = document.getElementById(sectionId); if (target) { event.preventDefault(); history.pushState({project:current},'',withQuery(projectUrl(current),filterQuery(),'#' + sectionId)); target.scrollIntoView(); if (link.classList.contains('skip-link')) { target.tabIndex = -1; target.focus({preventScroll:true}); } } return; }
    }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.closeDialog) { $(button.dataset.closeDialog)?.close(); return; }
    if (button.hasAttribute('data-copy-enquiry')) { copyText($('enquiry-brief').value,'Project brief copied.'); return; }
    if (button.dataset.problem) {
      sector = ''; $('search').value = ''; ['location-filter','event-filter','service-filter'].forEach(id => $(id).value = '');
      const problem = button.dataset.problem;
      if ([...$('service-filter').options].some(option => option.value === problem)) $('service-filter').value = problem;
      else $('search').value = problem === 'Business Continuity' ? 'temporary power' : problem;
      limit = 12; document.querySelectorAll('[data-sector]').forEach(tab => tab.setAttribute('aria-pressed',tab.dataset.sector === ''));
      render(true,true); $('library').scrollIntoView(); $('library-heading').tabIndex = -1; $('library-heading').focus({preventScroll:true}); return;
    }
    if (button.hasAttribute('data-open-portfolio')) { openPortfolio(); return; }
    if (button.dataset.select) { toggleSelection(button.dataset.select,button); return; }
    if (button.dataset.open) { openCase(button.dataset.open); return; }
    if (button.dataset.industry) {
      sector = button.dataset.industry; limit = 12;
      track('industry_select',{industry:sector,placement:'case_industry_navigation'});
      $('search').value = ''; ['location-filter','event-filter','service-filter'].forEach(id => $(id).value = '');
      document.querySelectorAll('[data-sector]').forEach(tab => tab.setAttribute('aria-pressed',tab.dataset.sector === sector));
      render(true,true); $('library').scrollIntoView(); $('library-heading').tabIndex = -1; $('library-heading').focus({preventScroll:true}); return;
    }
    if (button.dataset.copyProject) {
      const url = location.origin + projectUrl(button.dataset.copyProject);
      copyText(url,'Project link copied.'); return;
    }
    if (button.hasAttribute('data-sector')) {
      sector = button.dataset.sector; limit = 12;
      track('industry_select',{industry:sector || 'All industries',placement:'case_filter'});
      document.querySelectorAll('[data-sector]').forEach(tab => tab.setAttribute('aria-pressed', tab === button)); render(true,true); return;
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
      $('lightbox-image').src = button.dataset.photo; $('lightbox-image').alt = button.dataset.caption || byId.get(current)?.title || 'Project photograph'; $('lightbox-caption').textContent = displayCaption($('lightbox-image').alt); showDialog($('lightbox'));
      const project = byId.get(current);
      if (project) track('image_enlarge', {project_id:project.id,industry:project.sector,placement:button.closest('.project-photo-grid,.detail-gallery') ? 'project-gallery' : 'project-illustration'});
      return;
    }
    if (button.dataset.exportOne) { const project = byId.get(button.dataset.exportOne); if (project) { if (project.restricted && $('export-audience').value === 'client') { if (!selection.includes(project.id)) selection.push(project.id); updateSelection(); openPortfolio(); return; } exportProjects([project],exportOptions({title:project.title,subtitle:'NorthStar project experience'})); } }
  });
  document.addEventListener('toggle', event => {
    if (!event.target.matches?.('#project-page details.full-story') || !event.target.open) return;
    const project = byId.get(current);
    if (project) track('story_expand', {project_id:project.id,industry:project.sector});
  }, true);
  $('search').addEventListener('input',() => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { limit = 12; render(true,true); },250); });
  ['location-filter','event-filter','service-filter','sort'].forEach(id => $(id).addEventListener('change',() => { limit = 12; render(true,true); }));
  $('industry-quick-select')?.addEventListener('change',() => {
    sector = $('industry-quick-select').value; $('search').value = ''; ['location-filter','event-filter','service-filter'].forEach(id => $(id).value = '');
    limit = 12; document.querySelectorAll('[data-sector]').forEach(tab => tab.setAttribute('aria-pressed',tab.dataset.sector === sector));
    render(true,true); $('library').scrollIntoView(); $('library-heading').tabIndex = -1; $('library-heading').focus({preventScroll:true});
  });
  $('filter-toggle').onclick = () => { const expanded = $('filter-toggle').getAttribute('aria-expanded') !== 'true'; $('filter-toggle').setAttribute('aria-expanded',expanded); $('advanced-filters').hidden = !expanded; };
  $('reset-filters').onclick = resetFilters; $('empty-reset').onclick = () => { resetFilters(); $('search').focus(); };
  $('load-more').onclick = () => { const oldLimit = limit; limit += 12; render(); const next = $('project-grid').querySelectorAll('.card-image-button')[oldLimit]; next?.focus({preventScroll:true}); };
  $('grid-view').onclick = () => { view = 'grid'; render(true); persist(); }; $('list-view').onclick = () => { view = 'list'; render(true); persist(); };
  $('select-results').onclick = () => { selection = cleanIds([...selection,...filtered.map(project => project.id)]); updateSelection(); track('project_selection',{action:'save_results',project_count:selection.length}); toast(`${filtered.length} matching projects selected.`); };
  const clearSelection = () => { selection = []; updateSelection(); track('project_selection',{action:'clear',project_count:0}); toast('Project selection cleared.'); };
  $('clear-selection').onclick = () => { clearSelection(); document.querySelector('.portfolio-trigger').focus(); }; $('portfolio-clear').onclick = () => { clearSelection(); $('browse-from-portfolio').focus(); };
  $('feature-prev').onclick = () => { const count = heroScenes.length || featured.length; feature = (feature - 1 + count) % count; renderFeature(true); }; $('feature-next').onclick = () => { feature = (feature + 1) % (heroScenes.length || featured.length); renderFeature(true); };
  $('close-case').onclick = () => $('case-dialog').close(); $('close-portfolio').onclick = () => $('portfolio-dialog').close(); $('close-lightbox').onclick = () => $('lightbox').close();
  $('case-dialog').addEventListener('close',() => { current = null; if (location.hash.startsWith('#case/')) history.replaceState(null,'',location.pathname+location.search+'#library'); });
  $('browse-from-portfolio').onclick = () => { $('portfolio-dialog').close(); if ($('case-dialog').open) $('case-dialog').close(); navigateHome('#library'); $('search').focus(); };
  $('portfolio-form').addEventListener('submit',event => { event.preventDefault(); if (!selection.length) return; exportProjects(selection.map(id => byId.get(id)),exportOptions()); });
  $('export-audience').addEventListener('change',() => { updateAudienceWarning(); saveDraft(); });
  $('remove-restricted').onclick = () => { selection = selection.filter(id => !byId.get(id).restricted); updateSelection(); toast('Restricted projects removed from this selection.'); };
  $('portfolio-form').addEventListener('invalid',() => { $('cover-customization').open = true; },true);
  Object.values(draftFields).forEach(id => $(id).addEventListener('input',saveDraft));
  document.querySelectorAll('input[name="edition"]').forEach(input => input.addEventListener('change',saveDraft));
  $('copy-filter-link')?.addEventListener('click',() => { const query = filterQuery(false); copyText(location.origin + withQuery(basePath,query,'#library'),'Filtered project link copied.'); });
  $('share-collection')?.addEventListener('click',() => { const ids = publicIds(selection); if (!ids.length) return; copyText(collectionUrl(ids),'Collection link copied. It includes public projects and their order.'); track('collection_action',{action:'share',project_count:ids.length}); });
  $('discuss-collection')?.addEventListener('click',() => openEnquiry(selection));
  $('save-collection').onclick = () => {
    const name = $('collection-name').value.trim().slice(0,80); if (!name) { $('collection-name').focus(); toast('Give this selection a name.'); return; }
    const existing = collections.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
    const item = {name,ids:[...selection],draft:cleanDraft(exportOptions())}; if (existing >= 0) collections[existing] = item; else collections.push(item);
    persist(); renderCollections(); toast(storageAvailable ? `“${name}” saved in this browser.` : `“${name}” is available for this visit. Browser saving is unavailable.`);
    track('collection_action',{action:'save',project_count:selection.length});
  };
  $('saved-collections').onchange = () => { const index = $('saved-collections').value; $('delete-collection').hidden = index === ''; if (index !== '' && collections[Number(index)]) { selection = cleanIds(collections[Number(index)].ids); $('collection-name').value = collections[Number(index)].name; applyDraft(collections[Number(index)].draft); updateSelection(); track('collection_action',{action:'load',project_count:selection.length}); toast('Saved collection and cover loaded.'); } };
  $('delete-collection').onclick = () => { const index = Number($('saved-collections').value); if ($('saved-collections').value !== '' && collections[index]) { collections.splice(index,1); persist(); renderCollections(); track('collection_action',{action:'delete'}); toast('Saved selection deleted.'); } };
  document.addEventListener('keydown',event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/input|textarea|select/i.test(event.target.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); if (document.body.classList.contains('project-route')) navigateHome('#library'); $('search').focus(); $('library').scrollIntoView(); } });
  function readRoute() {
    restoreFilters();
    const relativePath = location.pathname.startsWith(basePath) ? location.pathname.slice(basePath.length) : '';
    const match = relativePath.match(/^projects\/([^/]+)(?:\/(?:index\.html)?)?$/);
    if (match) { try { if (!renderProject(decodeURIComponent(match[1]))) { $('home-page').hidden = true; $('project-page').innerHTML = `<section class="project-not-found section-wrap"><h1>Project unavailable.</h1><p>This project is not part of this collection.</p><a class="button" href="${basePath}" data-home>Explore projects</a></section>`; } } catch { toast('This project link is not valid.'); } }
    else if (location.hash.startsWith('#case/')) { try { const id = decodeURIComponent(location.hash.slice(6)); if (byId.has(id)) { history.replaceState({project:id},'',withQuery(projectUrl(id),libraryQuery)); renderProject(id); } } catch { toast('This project link is not valid.'); } }
    else if (document.body.classList.contains('project-route')) navigateHome(location.hash,false);
    else { initializeHome(); render(); updatePageMetadata(); }
    if (!current) previewSharedCollection();
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
  populateFilters(); applyDraft(draft); readRoute(); updateSelection();
  window.NorthStarLibrary = Object.freeze({getSelection:() => [...selection],getStudies:() => studies,openCase:navigateProject,openPortfolio});
})();
