import { createLibraryClient, PUBLIC_FIELDS, libraryConfig } from './library-client.js?v=c3b0a324dcbd';

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

export async function fetchPublished(client) {
  const rows = new Map();
  const pageIdentities = new Set();
  let complete = true;
  for (let from = 0; ;) {
    let result;
    try {
      result = await client.from('marketing_materials').select(PUBLIC_FIELDS, { count: 'exact' })
        .eq('status', 'published').order('published_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
    } catch {
      if (!rows.size) throw new Error('The collection could not be loaded.');
      complete = false;
      break;
    }
    const { data, error, count } = result;
    if (error || !Array.isArray(data)) {
      if (!rows.size) throw new Error('The collection could not be loaded.');
      complete = false;
      break;
    }
    // Detect repeated raw pages independently of validation: an invalid page can
    // still be followed by valid publications that should remain discoverable.
    const identity = JSON.stringify(data.map(row => row?.id ?? row));
    if (data.length && pageIdentities.has(identity)) { complete = false; break; }
    pageIdentities.add(identity);
    for (const row of data) {
      if (!validateMaterial(row)) { complete = false; continue; }
      if (rows.has(row.id)) complete = false;
      rows.set(row.id, row);
    }
    // Advance by the actual response size: the server may cap a requested page.
    from += data.length;
    if (Number.isInteger(count) && from >= count) break;
    if (!data.length) {
      if (Number.isInteger(count) && from < count) complete = false;
      break;
    }
  }
  return { materials: [...rows.values()], complete };
}

function initializeLibrary() {
  const grid = document.getElementById('mk-grid');
  const status = document.getElementById('ul-status');
  if (!grid || !status) return;
  const retry = document.getElementById('ul-retry');
  let client;
  let renderRevision = 0;
  let loading = false;

  function createCard(row) {
    const article = element('article', 'ul-card');
    article.dataset.materialSource = 'published';
    article.dataset.category = row.category;
    article.dataset.pages = row.pages;
    article.dataset.format = row.pages === 1 ? 'one-page' : row.pages <= 3 ? 'extended' : 'long-form';
    article.dataset.search = [row.title, row.category, row.description, row.keywords, row.search_text].join(' ');
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
    meta.append(element('span', 'ul-card-category', row.category === 'Medical' ? 'Healthcare' : row.category), element('span', '', `${row.pages} ${row.pages === 1 ? 'page' : 'pages'} · ${formatBytes(row.file_bytes)}`));
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

  async function load() {
    if (loading) return;
    loading = true;
    const revision = ++renderRevision;
    status.textContent = 'Loading the latest materials…';
    status.dataset.state = 'loading';
    retry.hidden = true;
    try {
      client ||= await createLibraryClient();
      const { materials, complete } = await fetchPublished(client);
      const cards = materials.map(createCard);
      grid.querySelectorAll('[data-material-source="published"]').forEach(card => card.remove());
      grid.append(...cards.map(card => card.article));
      document.dispatchEvent(new CustomEvent('northstar:materials-updated'));
      status.textContent = complete ? '' : 'Some additional materials could not be loaded. You can browse the available materials below or try again.';
      status.dataset.state = complete ? 'ready' : 'error';
      retry.hidden = complete;
      populateCovers(cards, revision);
    } catch {
      status.textContent = 'Additional materials could not be loaded. The available collection below is ready to browse. Try again to include the latest additions.';
      status.dataset.state = 'error';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  retry.addEventListener('click', load);
  load();
}

initializeLibrary();
