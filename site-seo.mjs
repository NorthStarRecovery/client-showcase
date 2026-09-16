// Shared by static rendering and in-page navigation; keep this module dependency-free.
export const HOME_TITLE = 'NorthStar Case Studies | Recovery, Demolition & Remediation';
export const HOME_DESCRIPTION = 'Explore NorthStar case studies in disaster recovery, demolition and environmental remediation. Browse projects by industry, location and service, and save a collection.';
export const HOME_IMAGE = 'assets/capabilities/07-crew-briefing-dawn-1912.webp';
export const HOME_IMAGE_ALT = 'NorthStar crew briefing at dawn.';
const ORGANIZATION_ID = 'https://www.northstar.com/#organization';
const plain = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const safeAsset = value => typeof value === 'string' && /^assets\/[a-zA-Z0-9_./ -]+\.(?:webp|png|jpe?g|svg)$/.test(value) && !value.split('/').some(part => part.startsWith('.'));
const safeShareImage = value => safeAsset(value) || (typeof value === 'string' && /^marketing\/previews\/[a-zA-Z0-9_-]+\.webp$/.test(value));

export function serializeSeoJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function createSiteSeo({ origin = '', basePath = '/website/', indexable = false } = {}) {
  let normalizedOrigin = '';
  try {
    const parsed = new URL(origin);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) normalizedOrigin = parsed.origin;
  } catch { /* Local previews deliberately omit a public origin. */ }
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new TypeError('SEO basePath must be an absolute directory path.');
  return { origin: normalizedOrigin, basePath, indexable: Boolean(indexable && normalizedOrigin) };
}

function siteUrl(config, relative = '') {
  return config.origin ? new URL(config.basePath + relative, config.origin).href : '';
}

function organization(config) {
  return {
    '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'NorthStar', url: 'https://www.northstar.com/',
    ...(config.origin ? { logo: siteUrl(config, 'assets/brand/logo-color.png') } : {}),
    contactPoint: [
      { '@type': 'ContactPoint', contactType: 'Project and showcase questions', email: 'adelacruz@northstar.com' },
      { '@type': 'ContactPoint', contactType: '24-hour emergency response', telephone: '+18002832933' }
    ]
  };
}

function pageGraph(config, page, extra = []) {
  const home = siteUrl(config);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(config),
      { '@type': 'WebSite', ...(home ? { '@id': home + '#website', url: home } : {}), name: 'NorthStar Project Experience', inLanguage: 'en-US', publisher: { '@id': ORGANIZATION_ID } },
      { ...page, inLanguage: 'en-US', publisher: { '@id': ORGANIZATION_ID }, ...(home ? { isPartOf: { '@id': home + '#website' } } : {}) },
      ...extra
    ]
  };
}

function imageForProject(project) {
  return [project.hero, ...(project.images || []).map(image => image.src), project.visual?.src].find(safeAsset) || '';
}

export function projectDescription(project) {
  return plain(project.summary) || [plain(project.title), [plain(project.sector), plain(project.location)].filter(Boolean).join(' in '), (project.services || []).filter(value => plain(value)).join(', ')].filter(Boolean).join('. ');
}

function descriptor(config, { title, description, path = '', image = HOME_IMAGE, imageAlt = HOME_IMAGE_ALT, type = 'website', indexable = config.indexable, structured }) {
  const canonical = siteUrl(config, path);
  return {
    title, description, canonical, type,
    robots: indexable && config.indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    image: safeShareImage(image) ? siteUrl(config, image) : '', imageAlt,
    structured
  };
}

export function collectionPageSeo(config, projects = []) {
  const canonical = siteUrl(config);
  const publicProjects = projects.filter(project => !project.restricted);
  const page = { '@type': 'CollectionPage', name: HOME_TITLE, description: HOME_DESCRIPTION, ...(canonical ? { '@id': canonical + '#webpage', url: canonical, mainEntity: { '@type': 'ItemList', numberOfItems: publicProjects.length, itemListElement: publicProjects.map((project, index) => ({ '@type': 'ListItem', position: index + 1, name: project.title, url: siteUrl(config, 'projects/' + encodeURIComponent(project.id) + '/') })) } } : {}) };
  return descriptor(config, { title: HOME_TITLE, description: HOME_DESCRIPTION, structured: pageGraph(config, page) });
}

export function projectPageSeo(config, project) {
  if (project.restricted) return genericPageSeo(config, { title: 'NorthStar Project Experience', description: HOME_DESCRIPTION, indexable: false });
  const path = 'projects/' + encodeURIComponent(project.id) + '/';
  const canonical = siteUrl(config, path);
  const title = project.title + ' | NorthStar Case Study';
  const description = projectDescription(project);
  const image = imageForProject(project);
  const imageAlt = image === project.visual?.src ? plain(project.visual.title) || project.title + ' project illustration' : plain(project.imageCaptions?.[image]) || project.title + ' project photograph';
  const work = {
    '@type': 'CreativeWork', name: project.title, description, genre: 'Case study', inLanguage: 'en-US', publisher: { '@id': ORGANIZATION_ID },
    ...(canonical ? { '@id': canonical + '#case-study', url: canonical, mainEntityOfPage: { '@id': canonical + '#webpage' } } : {}),
    ...(image && config.origin ? { image: siteUrl(config, image) } : {}),
    ...(plain(project.sector) ? { about: { '@type': 'Thing', name: plain(project.sector) } } : {}),
    ...(plain(project.location) ? { spatialCoverage: { '@type': 'Place', name: plain(project.location) } } : {}),
    ...(project.services?.length ? { keywords: project.services.filter(value => plain(value)).join(', ') } : {})
  };
  const breadcrumbs = canonical ? { '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumbs', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'All projects', item: siteUrl(config) },
    { '@type': 'ListItem', position: 2, name: project.title, item: canonical }
  ] } : null;
  const page = { '@type': 'WebPage', name: title, description, ...(canonical ? { '@id': canonical + '#webpage', url: canonical, mainEntity: { '@id': work['@id'] }, breadcrumb: { '@id': breadcrumbs['@id'] } } : { mainEntity: work }) };
  return descriptor(config, { title, description, path, image, imageAlt, type: 'article', structured: pageGraph(config, page, canonical ? [work, breadcrumbs] : []) });
}

export function marketingPageSeo(config, materials = []) {
  const title = 'Industry Guides & Resources | NorthStar';
  const description = 'Explore NorthStar industry guides, project experience and readiness resources for manufacturing, commercial real estate, healthcare, education, technology and hospitality.';
  const path = 'marketing/';
  const canonical = siteUrl(config, path);
  const page = { '@type': 'CollectionPage', name: title, description, ...(canonical ? { '@id': canonical + '#webpage', url: canonical, mainEntity: { '@type': 'ItemList', itemListElement: materials.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.title, url: siteUrl(config, 'marketing/' + encodeURIComponent(item.id) + '.html') })) } } : {}) };
  return descriptor(config, { title, description, path, structured: pageGraph(config, page) });
}

export function genericPageSeo(config, { title, description, path = '', image = HOME_IMAGE, imageAlt = HOME_IMAGE_ALT, indexable = config.indexable, pageType = 'WebPage' }) {
  const canonical = siteUrl(config, path);
  const page = { '@type': pageType, name: title, description, ...(canonical ? { '@id': canonical + '#webpage', url: canonical } : {}) };
  return descriptor(config, { title, description, path, image, imageAlt, indexable, structured: pageGraph(config, page) });
}

// Title and description are included; callers should remove template copies first.
export function renderSeoHead(seo) {
  const meta = (kind, name, value) => '<meta ' + kind + '="' + name + '" content="' + escapeHtml(value) + '">';
  return '<title>' + escapeHtml(seo.title) + '</title>' + meta('name', 'description', seo.description) + meta('name', 'robots', seo.robots)
    + meta('property', 'og:site_name', 'NorthStar Project Experience') + meta('property', 'og:locale', 'en_US')
    + meta('property', 'og:type', seo.type) + meta('property', 'og:title', seo.title) + meta('property', 'og:description', seo.description)
    + (seo.canonical ? '<link rel="canonical" href="' + escapeHtml(seo.canonical) + '">' + meta('property', 'og:url', seo.canonical) : '')
    + meta('name', 'twitter:card', seo.image ? 'summary_large_image' : 'summary') + meta('name', 'twitter:title', seo.title) + meta('name', 'twitter:description', seo.description)
    + (seo.image ? meta('property', 'og:image', seo.image) + meta('property', 'og:image:alt', seo.imageAlt) + meta('name', 'twitter:image', seo.image) + meta('name', 'twitter:image:alt', seo.imageAlt) : '')
    + '<script id="northstar-seo-schema" type="application/ld+json">' + serializeSeoJson(seo.structured) + '</script>';
}
