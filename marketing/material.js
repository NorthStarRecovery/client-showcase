import { createLibraryClient, PUBLIC_FIELDS } from './library-client.js?v=f9576070ec66';
import { UUID_PATTERN, validateMaterial, formatBytes, materialUrl, signedMaterialUrl, downloadMaterial } from './uploaded-library.js?v=f9576070ec66';

const get = id => document.getElementById(id);
const status = get('material-status');
const content = get('material-content');
const unavailable = get('material-unavailable');
const retry = get('material-retry');
const actionStatus = get('material-action-status');
const cover = get('material-cover');
const coverPlaceholder = get('material-cover-placeholder');
const read = get('material-read');
const download = get('material-download');
const frame = get('material-pdf');
const panel = get('material-pdf-panel');
let client;
let material;
let loading = false;
let coverRefreshed = false;
let pageTracked = false;

function showUnavailable() {
  status.textContent = '';
  content.hidden = true;
  unavailable.hidden = false;
  retry.hidden = true;
  document.title = 'Material unavailable | NorthStar';
}

async function setCover() {
  try { cover.src = await signedMaterialUrl(client, material, 'cover'); } catch { cover.hidden = true; coverPlaceholder.hidden = false; }
}

cover.addEventListener('load', () => { cover.hidden = false; coverPlaceholder.hidden = true; });
cover.addEventListener('error', () => {
  cover.hidden = true;
  coverPlaceholder.hidden = false;
  if (coverRefreshed) return;
  coverRefreshed = true;
  setCover();
});

async function load() {
  if (loading) return;
  const params = new URL(location.href).searchParams;
  const id = params.get('id');
  if (!id || params.getAll('id').length !== 1 || !UUID_PATTERN.test(id)) { showUnavailable(); return; }
  loading = true;
  retry.hidden = true;
  unavailable.hidden = true;
  status.dataset.state = 'loading';
  status.textContent = 'Loading marketing material…';
  try {
    client ||= await createLibraryClient();
    const { data, error } = await client.from('marketing_materials').select(PUBLIC_FIELDS).eq('id', id).eq('status', 'published').maybeSingle();
    if (error) throw new Error('Unable to load the material.');
    material = validateMaterial(data);
    if (!material) { showUnavailable(); return; }
    document.title = `${material.title} | NorthStar`;
    get('material-category').textContent = ({ Medical: 'Healthcare', Commercial: 'Commercial real estate' })[material.category] || material.category;
    get('material-title').textContent = material.title;
    get('material-description').textContent = material.description;
    get('material-pages').textContent = `${material.pages} ${material.pages === 1 ? 'page' : 'pages'}`;
    get('material-size').textContent = formatBytes(material.file_bytes);
    cover.alt = `${material.title} cover`;
    content.hidden = false;
    status.textContent = '';
    status.dataset.state = 'ready';
    setCover();
    if (!pageTracked) {
      window.NorthStarAnalytics?.page({ page_type: 'material', material_id: `upload-${material.id}`, industry: material.category, edition: 'uploaded' });
      pageTracked = true;
    }
  } catch {
    status.textContent = 'This material could not be loaded. Please try again.';
    status.dataset.state = 'error';
    retry.hidden = false;
  } finally { loading = false; }
}

download.addEventListener('click', async () => {
  if (!material) return;
  download.disabled = true;
  actionStatus.textContent = 'Preparing your download…';
  actionStatus.dataset.state = 'loading';
  try {
    await downloadMaterial(client, material, 'uploaded-material');
    actionStatus.textContent = 'Download started.';
    actionStatus.dataset.state = 'ready';
  } catch {
    actionStatus.textContent = 'The PDF could not be downloaded. Try again or return to the collection for the current material.';
    actionStatus.dataset.state = 'error';
  } finally { download.disabled = false; }
});

read.addEventListener('click', async () => {
  if (!material) return;
  read.disabled = true;
  actionStatus.textContent = 'Opening the PDF…';
  actionStatus.dataset.state = 'loading';
  try {
    const url = await signedMaterialUrl(client, material);
    frame.src = url;
    panel.hidden = false;
    read.setAttribute('aria-expanded', 'true');
    get('material-pdf-heading').focus();
    actionStatus.textContent = '';
    actionStatus.dataset.state = 'ready';
  } catch {
    actionStatus.textContent = 'The PDF preview is unavailable. Try Download PDF or return to the collection.';
    actionStatus.dataset.state = 'error';
  } finally { read.disabled = false; }
});

get('material-close-pdf').addEventListener('click', () => {
  panel.hidden = true;
  frame.removeAttribute('src');
  read.setAttribute('aria-expanded', 'false');
  read.focus();
});

get('material-share').addEventListener('click', async () => {
  if (!material) return;
  actionStatus.dataset.state = 'ready';
  try {
    await navigator.clipboard.writeText(materialUrl(material.id));
    actionStatus.textContent = 'Link copied. You can paste it into your message.';
  } catch {
    actionStatus.replaceChildren(document.createTextNode('Copy this link: '));
    const link = document.createElement('a');
    link.href = materialUrl(material.id);
    link.textContent = link.href;
    actionStatus.append(link);
  }
});

retry.addEventListener('click', load);
load();
