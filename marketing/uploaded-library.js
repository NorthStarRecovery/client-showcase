import { createLibraryClient, PUBLIC_FIELDS, libraryConfig } from './library-client.js';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(['Manufacturing', 'Industrial', 'Commercial real estate', 'Medical', 'Education', 'Technology', 'Hospitality', 'Recovery services', 'Premier Response']);
const SIGNED_SECONDS = 60;
const PAGE_SIZE = 200;

export function validateMaterial(row) {
  if (!row || !UUID_PATTERN.test(row.id) || row.status !== 'published' || !CATEGORIES.has(row.category)
    || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 300
    || typeof row.description !== 'string' || row.description.length > 10000
    || !Number.isInteger(row.pages) || row.pages < 1 || row.pages > 10000
    || !Number.isInteger(row.file_bytes) || row.file_bytes < 1 || row.file_bytes > 100 * 1024 * 1024
    || row.file_path !== `${row.id}/document.pdf` || row.cover_path !== `${row.id}/cover.webp`
    || typeof row.keywords !== 'string' || row.keywords.length > 10000
    || typeof row.search_text !== 'string' || row.search_text.length > 1000000) return null;
  return row;
}

export function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function materialUrl(id) {
  if (!UUID_PATTERN.test(id)) throw new Error('Invalid material identifier.');
  return new URL(`material.html?id=${encodeURIComponent(id)}`, location.href).href;
}

export function validatedSignedUrl(value, objectPath) {
  const url = new URL(value);
  const origin = new URL(libraryConfig.url).origin;
  if (url.origin !== origin || url.protocol !== 'https:' || url.username || url.password
    || decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/${libraryConfig.bucket}/${objectPath}`
    || !url.searchParams.get('token') || [...url.searchParams.keys()].some(key => !['token', 'download'].includes(key))) {
    throw new Error('Invalid material URL.');
  }
  return url.href;
}

export async function signedMaterialUrl(client, row, kind = 'file') {
  if (!validateMaterial(row)) throw new Error('Material unavailable.');
  const path = kind === 'cover' ? row.cover_path : row.file_path;
  const { data, error } = await client.storage.from(libraryConfig.bucket).createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Material unavailable.');
  return validatedSignedUrl(data.signedUrl, path);
}

export async function downloadMaterial(client, row, placement) {
  if (!validateMaterial(row)) throw new Error('Material unavailable.');
  const { data, error } = await client.storage.from(libraryConfig.bucket).download(row.file_path);
  if (error || !data || await data.slice(0, 5).text() !== '%PDF-') throw new Error('The PDF could not be downloaded.');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `northstar-${row.id}.pdf`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  window.NorthStarAnalytics?.track('file_download', {
    material_id: `upload-${row.id}`, industry: row.category, file_extension: 'pdf',
    file_name: `upload-${row.id}.pdf`, placement
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const node = element('i', `ul-icon ul-icon-${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function placeholder() {
  const node = element('span', 'ul-cover-placeholder');
  node.append(icon('file'), element('span', '', 'PDF material'));
  return node;
}

async function fetchPublished(client) {
  const rows = new Map();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from('marketing_materials').select(PUBLIC_FIELDS)
      .eq('status', 'published').order('published_at', { ascending: false }).order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) throw new Error('The collection could not be loaded.');
    for (const row of data) {
      if (!validateMaterial(row)) throw new Error('A material could not be loaded.');
      rows.set(row.id, row);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return [...rows.values()];
}

function initializeLibrary() {
  const grid = document.getElementById('ul-grid');
  if (!grid) return;
  const search = document.getElementById('ul-search');
  const category = document.getElementById('ul-category');
  const status = document.getElementById('ul-status');
  const count = document.getElementById('ul-count');
  const empty = document.getElementById('ul-empty');
  const retry = document.getElementById('ul-retry');
  let client;
  let materials = [];
  let renderRevision = 0;
  let loaded = false;
  let loading = false;

  function createCard(row) {
    const article = element('article', 'ul-card');
    const href = materialUrl(row.id);
    const cover = element('a', 'ul-card-cover');
    cover.href = href;
    cover.setAttribute('aria-label', `View ${row.title}`);
    const image = element('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.hidden = true;
    const fallback = placeholder();
    cover.append(image, fallback);
    let refreshed = false;
    image.addEventListener('load', () => { image.hidden = false; image.style.opacity = '1'; fallback.hidden = true; });
    image.addEventListener('error', async () => {
      image.hidden = true;
      fallback.hidden = false;
      if (refreshed || !article.isConnected) return;
      refreshed = true;
      try {
        const url = await signedMaterialUrl(client, row, 'cover');
        image.style.opacity = '0';
        image.hidden = false;
        image.src = url;
      } catch { /* The PDF stays available if its cover cannot load. */ }
    });
    const body = element('div', 'ul-card-body');
    const meta = element('p', 'ul-card-meta');
    meta.append(element('span', 'ul-card-category', row.category), element('span', '', `${row.pages} ${row.pages === 1 ? 'page' : 'pages'} · ${formatBytes(row.file_bytes)}`));
    const title = element('h3');
    const titleLink = element('a', '', row.title);
    titleLink.href = href;
    title.append(titleLink);
    const description = element('p', 'ul-card-description', row.description);
    const actions = element('div', 'ul-card-actions');
    const view = element('a', '', 'View material');
    view.href = href;
    view.append(icon('arrow'));
    const download = element('button', '', 'Download PDF');
    download.type = 'button';
    download.setAttribute('aria-label', `Download ${row.title} as PDF`);
    download.append(icon('download'));
    const feedback = element('p', 'ul-card-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    download.addEventListener('click', async () => {
      download.disabled = true;
      feedback.textContent = 'Preparing your download…';
      feedback.dataset.state = 'loading';
      try {
        await downloadMaterial(client, row, 'uploaded-library');
        feedback.textContent = 'Download started.';
        feedback.dataset.state = 'ready';
      } catch {
        feedback.textContent = 'The PDF could not be downloaded. Try again or reopen the material.';
        feedback.dataset.state = 'error';
      } finally { download.disabled = false; }
    });
    actions.append(view, download);
    body.append(meta, title, description, actions, feedback);
    article.append(cover, body);
    return { article, image, row };
  }

  async function populateCovers(cards, revision) {
    for (let offset = 0; offset < cards.length; offset += 50) {
      if (revision !== renderRevision) return;
      const batch = cards.slice(offset, offset + 50);
      try {
        const { data, error } = await client.storage.from(libraryConfig.bucket).createSignedUrls(batch.map(card => card.row.cover_path), SIGNED_SECONDS);
        if (error || !data || revision !== renderRevision) continue;
        const byPath = new Map(data.filter(item => item?.path).map(item => [item.path, item]));
        for (const card of batch) {
          const item = byPath.get(card.row.cover_path);
          if (!item?.signedUrl || item.error) continue;
          try {
            const url = validatedSignedUrl(item.signedUrl, card.row.cover_path);
            card.image.style.opacity = '0';
            card.image.hidden = false;
            card.image.src = url;
          } catch { /* Keep the neutral PDF cover. */ }
        }
      } catch { /* Cover availability must not hide a published material. */ }
    }
  }

  function render() {
    if (!loaded) return;
    const revision = ++renderRevision;
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const selected = category.value;
    const filtered = materials.filter(row => {
      if (selected && row.category !== selected) return false;
      const text = [row.title, row.category, row.description, row.keywords, row.search_text].join(' ').toLocaleLowerCase();
      return words.every(word => text.includes(word));
    });
    const cards = filtered.map(createCard);
    grid.replaceChildren(...cards.map(card => card.article));
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'material' : 'materials'}${filtered.length !== materials.length ? ` of ${materials.length}` : ''}`;
    empty.hidden = filtered.length > 0;
    empty.textContent = materials.length ? 'No matching materials. Try another search or choose a different category.' : 'New materials will appear here as NorthStar publishes them. Explore the curated collection above in the meantime.';
    populateCovers(cards, revision);
  }

  async function load() {
    if (loading) return;
    loading = true;
    loaded = false;
    ++renderRevision;
    grid.replaceChildren();
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading the latest materials…';
    status.dataset.state = 'loading';
    empty.hidden = true;
    retry.hidden = true;
    count.textContent = '';
    try {
      client ||= await createLibraryClient();
      materials = await fetchPublished(client);
      loaded = true;
      status.textContent = '';
      status.dataset.state = 'ready';
      render();
    } catch {
      status.textContent = 'The latest materials could not be loaded. Please try again. The curated collection above is still available.';
      status.dataset.state = 'error';
      retry.hidden = false;
    } finally {
      loading = false;
      grid.setAttribute('aria-busy', 'false');
    }
  }

  search.addEventListener('input', render);
  category.addEventListener('change', render);
  retry.addEventListener('click', load);
  load();
}

initializeLibrary();
