/* Automatic measurement on the configured public showcase; inactive without a valid Measurement ID. */
(() => {
  'use strict';
  const config = window.NORTHSTAR_ANALYTICS_CONFIG || {};
  const measurementId = typeof config.measurementId === 'string' ? config.measurementId : '';
  const base = typeof config.publicBasePath === 'string' ? config.publicBasePath : '';
  const campaignKey = 'northstar.analytics.campaign.v1';
  const audienceKey = 'northstar.analytics.audience.v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const events = new Set(['page_view', 'case_view', 'industry_select', 'material_view', 'file_download',
    'contact_click', 'project_selection', 'collection_action', 'portfolio_open', 'portfolio_created',
    'portfolio_failed', 'portfolio_download', 'print_requested', 'content_engagement', 'content_depth',
    'story_expand', 'image_enlarge', 'search_results', 'search_zero_results']);
  const ids = new Set(['project_id', 'material_id', 'bundle_id']);
  const counters = new Set(['project_count', 'page_count', 'result_count']);
  const strings = new Set(['page_type', 'industry', 'file_name', 'file_extension', 'placement', 'method', 'action', 'edition', 'topic_category']);
  const searchTopics = new Set(['healthcare','industrial','commercial','hospitality','education','hurricane','fire','water','demolition','abatement','recovery','other','industry','all']);
  const slug = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
  const industries = new Map([
    ['manufacturing', 'Manufacturing'], ['industrial', 'Industrial'],
    ['commercial-real-estate', 'Commercial real estate'], ['medical', 'Medical'],
    ['education', 'Education'], ['technology', 'Technology'], ['hospitality', 'Hospitality'],
    ['recovery-services', 'Recovery services'], ['premier-response', 'Premier Response'],
    ['commercial', 'Commercial'], ['healthcare', 'Healthcare'], ['residential', 'Residential'],
    ['government', 'Government'], ['energy', 'Energy'], ['retail', 'Retail'], ['all', 'All'],
    ['all-industries', 'All industries']
  ]);
  const materialIndustries = {
    'hospitality-readiness': 'Hospitality', 'hospitality-recovery': 'Hospitality',
    'hospitality-capital-renewal': 'Hospitality', 'national-recovery-capabilities': 'Recovery services',
    'emergency-activation-guide': 'Recovery services', 'emergency-response-request': 'Recovery services',
    'premier-response-program': 'Premier Response',
    'premier-response-journey': 'Premier Response'
  };
  ['manufacturing', 'industrial', 'commercial-real-estate', 'medical', 'education', 'technology'].forEach(id => {
    ['overview', 'brief'].forEach(edition => { materialIndustries[`${id}-${edition}`] = industries.get(id); });
  });
  const bundles = new Set(['northstar-industry-collection', 'northstar-marketing-collection']);
  const noOp = () => false;
  window.NorthStarAnalytics = Object.freeze({ track: noOp, page: noOp, openSettings: noOp,
    setAudience: noOp, getAudience: () => 'unclassified' });

  function eligible() {
    return /^G-[A-Z0-9]{4,20}$/.test(measurementId) && /^\/[a-z0-9-]+\/$/.test(base)
      && location.protocol === 'https:' && !location.port
      && Array.isArray(config.allowedHosts) && config.allowedHosts.includes(location.hostname)
      && location.hostname !== 'localhost' && !/^127\./.test(location.hostname)
      && location.pathname.startsWith(base) && window.NORTHSTAR_MODE !== 'internal'
      && !document.documentElement.hasAttribute('data-offline-portfolio');
  }
  if (!eligible()) return;

  let initialized = false;
  let failed = false;
  let lastPage = '';
  let lastMaterial = '';
  let currentPage = {};
  let campaign = {};
  let audience = storageGet('localStorage', audienceKey) === 'staff' ? 'staff' : 'unclassified';
  let engagement = null;
  let focused = document.hasFocus();
  let lastActivity = performance.now();
  const disabledKey = `ga-disable-${measurementId}`;
  const campaignFields = [['campaign_source', 'utm_source', config.campaignSources],
    ['campaign_medium', 'utm_medium', config.campaignMediums], ['campaign_name', 'utm_campaign', config.campaignNames]];
  // Keep only approved entry labels, so SPA navigation does not erase the incoming campaign.
  const entryCampaign = captureEntryCampaign();

  function storageGet(kind, key) {
    try { return window[kind].getItem(key); } catch { return null; }
  }
  function storageSet(kind, key, value) {
    try { window[kind].setItem(key, value); return true; } catch { return false; }
  }
  function getAudience() { return audience; }
  function setAudience(value) {
    if (!['staff', 'unclassified'].includes(value)) return false;
    if (!storageSet('localStorage', audienceKey, value) || storageGet('localStorage', audienceKey) !== value) return false;
    audience = value;
    if (initialized && !failed) gtag('set', { traffic_audience: audience });
    return true;
  }
  function normalizeSlug(value) {
    if (typeof value !== 'string' || value.length > 80) return '';
    return slug.test(value) ? value : '';
  }
  function safeProperties(input) {
    const result = {};
    if (!input || typeof input !== 'object') return result;
    for (const [key, value] of Object.entries(input)) {
      if (counters.has(key) && Number.isInteger(value) && value >= 0 && value <= 1000) result[key] = value;
      if (key === 'active_seconds' && [30, 60, 120].includes(value)) result[key] = value;
      if (key === 'percent_scrolled' && [50, 90].includes(value)) result[key] = value;
      if (ids.has(key) && normalizeSlug(value)) result[key] = value;
      if (!strings.has(key) || typeof value !== 'string' || value.length > 80) continue;
      if (key === 'topic_category') {
        if (searchTopics.has(value)) result[key] = value;
      } else if (key === 'industry') {
        const known = industries.get(value.toLowerCase().replace(/ /g, '-'));
        if (known) result[key] = known;
      } else if (key === 'file_name') {
        const match = value.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.(pdf|zip|html)$/);
        if (match && (Object.hasOwn(materialIndustries, match[1]) || bundles.has(match[1])
          || match[1] === 'northstar-portfolio'
          || /^upload-[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/.test(value))) result[key] = value;
      } else if (key === 'file_extension') {
        if (['pdf', 'zip', 'html'].includes(value)) result[key] = value;
      } else if (normalizeSlug(value)) result[key] = value;
    }
    return result;
  }
  function cleanUrl(raw) {
    try {
      const url = new URL(raw);
      if (!['https:', 'http:'].includes(url.protocol)) return '';
      // Queries, fragments, usernames and passwords never become measurement parameters.
      return url.origin + (/@|%40/i.test(url.pathname) ? '/' : url.pathname);
    } catch { return ''; }
  }
  function inferredPage() {
    const path = location.pathname.slice(base.length);
    if (path === '' || path === 'index.html') return { page_type: 'home' };
    if (path === 'marketing/' || path === 'marketing/index.html') {
      const category = new URLSearchParams(location.search).get('category');
      const industry = Object.values(materialIndustries).includes(category) ? category : 'All industries';
      return { page_type: 'marketing', industry };
    }
    if (path === 'privacy.html') return { page_type: 'privacy' };
    if (path === 'team-tools.html') return { page_type: 'team_tools' };
    if (path === 'marketing/material.html') return { page_type: 'material' };
    const material = path.match(/^marketing\/([a-z0-9-]+)\.html$/)?.[1];
    if (material && Object.hasOwn(materialIndustries, material)) {
      return { page_type: 'material', material_id: material, industry: materialIndustries[material],
        edition: material.endsWith('-overview') ? 'overview' : material.endsWith('-brief') ? 'brief' : 'guide' };
    }
    const project = path.match(/^projects\/([a-z0-9-]+)\/?$/)?.[1];
    if (project) {
      const record = Array.isArray(window.NORTHSTAR_PROJECTS)
        ? window.NORTHSTAR_PROJECTS.find(item => item.id === project && !item.restricted) : null;
      return { page_type: 'case_study', project_id: project, ...(record ? { industry: record.sector } : {}) };
    }
    return { page_type: 'showcase' };
  }
  function pageTitle() {
    const labels = { home: 'Project experience', marketing: 'Marketing materials', material: 'Marketing material',
      privacy: 'Privacy and analytics', case: 'Case study', case_study: 'Case study', case_library: 'Project experience',
      project: 'Case study', showcase: 'Client showcase', team_tools: 'Team tools' };
    return `${labels[currentPage.page_type] || 'Client showcase'} | NorthStar`;
  }
  function pageParameters() {
    let referrer = cleanUrl(document.referrer);
    // External paths may contain account names or search terms even without a query string.
    if (referrer) {
      const url = new URL(referrer);
      if (url.origin !== location.origin) referrer = url.origin + '/';
    }
    return { page_location: cleanUrl(location.href), page_referrer: referrer, page_title: pageTitle() };
  }
  function approvedCampaign(value, list) {
    return typeof value === 'string' && value.length <= 48 && normalizeSlug(value)
      && Array.isArray(list) && list.includes(value) ? value : '';
  }
  function captureEntryCampaign() {
    const query = new URLSearchParams(location.search);
    const result = {};
    for (const [key, parameter, list] of campaignFields) {
      const value = approvedCampaign(query.get(parameter), list);
      if (value) result[key] = value;
    }
    return result;
  }
  function readCampaign() {
    let stored = {};
    try {
      const saved = JSON.parse(storageGet('sessionStorage', campaignKey) || '{}');
      if (saved?.version === 1 && Number.isFinite(saved.savedAt) && saved.savedAt <= Date.now()
        && Date.now() - saved.savedAt < 30 * 60 * 1000) stored = saved.values || {};
    } catch { /* Retain attribution in memory when storage is unavailable. */ }
    const result = {};
    for (const [key, , list] of campaignFields) {
      const value = entryCampaign[key] || approvedCampaign(stored[key], list);
      if (value) result[key] = value;
    }
    storageSet('sessionStorage', campaignKey, JSON.stringify({ version: 1, savedAt: Date.now(), values: result }));
    return result;
  }
  function gtag() { window.dataLayer.push(arguments); }
  function send(name, properties) {
    if (!initialized || failed || !eligible() || window[disabledKey]) return false;
    // Reassert clean defaults for GA-generated session/engagement events after SPA navigation.
    const page = pageParameters();
    gtag('set', { ...page, traffic_audience: audience });
    storageSet('sessionStorage', campaignKey, JSON.stringify({ version: 1, savedAt: Date.now(), values: campaign }));
    gtag('event', name, { ...safeProperties(properties), ...page, traffic_audience: audience, send_to: measurementId });
    return true;
  }
  function track(name, properties) {
    if (!events.has(name)) return false;
    if (name === 'page_view') return page(properties);
    let context = {};
    if (['contact_click', 'content_engagement', 'content_depth', 'story_expand', 'image_enlarge'].includes(name)
      || (name === 'print_requested' && currentPage.page_type === 'material')) {
      context = safeProperties({ page_type: currentPage.page_type, industry: currentPage.industry,
        project_id: currentPage.project_id, material_id: currentPage.material_id, edition: currentPage.edition });
    }
    return send(name, { ...context, ...safeProperties(properties) });
  }
  function page(properties) {
    if (!eligible()) return false;
    currentPage = { ...inferredPage(), ...safeProperties(properties) };
    if (!initialized || failed) return false;
    // Uploaded material metadata arrives asynchronously. Measure only once its identity is known.
    if (location.pathname === base + 'marketing/material.html' && !currentPage.material_id) return false;
    const path = location.pathname;
    if (lastPage === path) return false;
    if (!send('page_view', currentPage)) return false;
    lastPage = path;
    resetEngagement();
    if (currentPage.material_id && lastMaterial !== currentPage.material_id) {
      send('material_view', currentPage);
      lastMaterial = currentPage.material_id;
    }
    return true;
  }
  function initialize() {
    if (initialized || !eligible() || window[disabledKey]) return;
    initialized = true;
    failed = false;
    campaign = readCampaign();
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied' });
    gtag('set', { ...pageParameters(), traffic_audience: audience, allow_google_signals: false, allow_ad_personalization_signals: false,
      ads_data_redaction: true, url_passthrough: false });
    gtag('js', new Date());
    gtag('config', measurementId, { ...pageParameters(), campaign_source: '', campaign_medium: '', campaign_name: '',
      ...campaign, send_page_view: false,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      campaign_content: '', campaign_term: '', campaign_id: '',
      cookie_domain: 'none', cookie_path: base, cookie_expires: lifetime / 1000,
      cookie_flags: 'SameSite=Lax;Secure' });
    // The tag fetch itself cannot carry a raw page query or recipient in its Referer header.
    const googleScript = document.createElement('script');
    googleScript.async = true;
    googleScript.referrerPolicy = 'no-referrer';
    googleScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    googleScript.onerror = () => { failed = true; window[disabledKey] = true; };
    document.head.append(googleScript);
    page(currentPage);
    document.dispatchEvent(new CustomEvent('northstar:analytics-ready'));
  }
  function delegatedClick(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const anchor = target?.closest('a[href]');
    if (!anchor || event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    const placement = anchor.closest('.screen-tools') ? 'document-tools'
      : anchor.closest('header') ? 'header' : anchor.closest('footer') ? 'footer' : 'content';
    if (url.origin === location.origin && url.pathname.startsWith(base + 'marketing/downloads/')) {
      const name = url.pathname.slice((base + 'marketing/downloads/').length);
      const match = name.match(/^([a-z0-9-]+)\.(pdf|zip)$/);
      if (!match) return;
      const id = match[1], extension = match[2];
      if (extension === 'pdf' && Object.hasOwn(materialIndustries, id)) {
        track('file_download', { material_id: id, industry: materialIndustries[id], file_name: name,
          file_extension: extension, placement, method: 'link' });
      } else if (extension === 'zip' && bundles.has(id)) {
        track('file_download', { bundle_id: id, file_name: name, file_extension: extension, placement, method: 'link' });
      }
    } else if (url.href === 'https://www.northstar.com/contact-us/' || url.href === 'tel:+18002832933'
      || url.href === 'tel:18002832933' || url.href === 'tel:1-800-283-2933') {
      track('contact_click', { method: url.protocol === 'tel:' ? 'phone' : 'website', placement });
    }
  }
  function contentElement() {
    if (currentPage.page_type === 'case_study') return document.querySelector('#project-page .project-narrative');
    if (currentPage.page_type === 'material') return document.querySelector('main');
    return null;
  }
  function resetEngagement() {
    const now = performance.now();
    engagement = ['case_study', 'material'].includes(currentPage.page_type)
      ? { activeMs: 0, tick: now, times: new Set(), depths: new Set(), scrolled: false, scrollY: window.scrollY, ready: false }
      : null;
    lastActivity = now;
    // Let route focus and initial scroll restoration finish before treating movement as content exploration.
    const view = engagement;
    requestAnimationFrame(() => {
      if (view && view === engagement) { view.scrollY = window.scrollY; view.ready = true; }
    });
  }
  function foreground() {
    return document.visibilityState === 'visible' && focused && !document.querySelector('dialog[open]');
  }
  function measureTime() {
    if (!engagement) return;
    const now = performance.now();
    const elapsed = now - engagement.tick;
    // Background throttling or a sleeping computer must not become active reading time.
    if (foreground() && contentElement() && elapsed >= 0 && elapsed <= 5000) {
      const activeEnd = Math.min(now, lastActivity + 60000);
      engagement.activeMs += Math.max(0, activeEnd - engagement.tick);
      for (const seconds of [30, 60, 120]) {
        if (engagement.activeMs >= seconds * 1000 && !engagement.times.has(seconds)) {
          if (track('content_engagement', { active_seconds: seconds })) engagement.times.add(seconds);
        }
      }
    }
    engagement.tick = now;
  }
  function measureDepth() {
    if (!engagement?.ready || !engagement.scrolled || !foreground()) return;
    const content = contentElement();
    if (!content) return;
    const rect = content.getBoundingClientRect();
    if (rect.height <= 0 || rect.top >= innerHeight || rect.bottom <= 0) return;
    const visibleDepth = Math.min(100, Math.max(0, (innerHeight - rect.top) / rect.height * 100));
    for (const percent of [50, 90]) {
      if (visibleDepth >= percent && !engagement.depths.has(percent)) {
        if (track('content_depth', { percent_scrolled: percent })) engagement.depths.add(percent);
      }
    }
  }
  function activity() {
    measureTime();
    lastActivity = performance.now();
  }
  function observeEngagement() {
    window.setInterval(measureTime, 1000);
    document.addEventListener('visibilitychange', () => {
      if (engagement) engagement.tick = performance.now();
    });
    window.addEventListener('blur', () => { measureTime(); focused = false; });
    window.addEventListener('focus', () => {
      focused = true;
      if (engagement) engagement.tick = performance.now();
      lastActivity = performance.now();
    });
    for (const name of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(name, activity, { passive: true });
    window.addEventListener('scroll', () => {
      activity();
      if (engagement?.ready && engagement.scrollY !== window.scrollY) engagement.scrolled = true;
      if (engagement) engagement.scrollY = window.scrollY;
      measureDepth();
    }, { passive: true });
    window.addEventListener('storage', event => {
      if (event.key !== audienceKey && event.key !== null) return;
      audience = storageGet('localStorage', audienceKey) === 'staff' ? 'staff' : 'unclassified';
      if (initialized && !failed) gtag('set', { traffic_audience: audience });
    });
  }
  function mount() {
    if (!eligible()) return;
    const utility = document.createElement('nav');
    utility.className = 'ns-analytics-utility';
    utility.setAttribute('aria-label', 'Privacy information');
    const privacy = document.createElement('a');
    privacy.href = base + 'privacy.html';
    privacy.textContent = 'Privacy';
    utility.append(privacy);
    document.body.append(utility);
    document.addEventListener('click', delegatedClick);
    document.addEventListener('auxclick', delegatedClick);
    currentPage = { ...inferredPage(), ...currentPage };
    initialize();
    observeEngagement();
  }
  window.NorthStarAnalytics = Object.freeze({ track, page, openSettings: noOp, setAudience, getAudience });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
