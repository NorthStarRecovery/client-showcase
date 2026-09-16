import { createLibraryClient, libraryConfig, PUBLIC_FIELDS } from './library-client.js?v=7d3a16f265d5';
import { processMaterial } from './material-processing.js?v=7d3a16f265d5';

const el = Object.fromEntries([...document.querySelectorAll('[id^="up-"]')].map(node => [node.id.slice(3), node]));
const state = { client: null, user: null, material: null, preview: null, abort: null, selection: 0, authCheck: 0, busy: false, managing: false, activation: null };
const categories = new Set([...el.category.options].map(option => option.value).filter(Boolean));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function status(element, message = '', error = false) {
  element.textContent = message;
  element.dataset.state = error ? 'error' : 'ready';
}

function errorText(error, fallback) {
  if (error?.name === 'AbortError') return 'Processing was canceled.';
  const detail = typeof error?.message === 'string' ? error.message.trim().slice(0, 240) : '';
  return detail ? `${fallback} ${detail}` : fallback;
}

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}

function materialURL(id) {
  if (!uuidPattern.test(id)) throw new Error('The material has an invalid identifier.');
  const url = new URL('material.html', location.href);
  url.searchParams.set('id', id);
  return url.href;
}

function updateControls() {
  for (const control of el['material-form'].elements) control.disabled = state.busy || !state.user;
  const valid = el.title.value.trim() && categories.has(el.category.value) && el.description.value.trim();
  el.publish.disabled = state.busy || !state.user || !state.material || !valid;
  el.signout.disabled = state.busy;
  el['material-form'].setAttribute('aria-busy', String(state.busy));
}

function clearMaterial({ keepResult = false } = {}) {
  state.selection += 1;
  state.abort?.abort();
  state.abort = null;
  state.material = null;
  if (state.preview) URL.revokeObjectURL(state.preview);
  state.preview = null;
  el['material-form'].reset();
  el.preview.removeAttribute('src');
  el.preview.hidden = true;
  el.drop.setAttribute('aria-busy', 'false');
  el.review.hidden = true;
  el['publish-section'].hidden = !keepResult;
  el['file-name'].textContent = 'Selected material';
  el['page-count'].textContent = '';
  status(el['extraction-status']);
  status(el.status);
  if (!keepResult) {
    el.result.hidden = true;
    el.result.replaceChildren();
  }
  updateControls();
}

function showResult(message, row) {
  const paragraph = node('p', message);
  el.result.replaceChildren(paragraph);
  if (row) {
    const link = node('a', 'View published material');
    link.href = materialURL(row.id);
    const collection = node('a', 'View the collection');
    collection.href = './#uploaded-materials';
    el.result.append(link, collection);
  }
  el.result.hidden = false;
  el['publish-section'].hidden = false;
  el.result.tabIndex = -1;
  el.result.focus({ preventScroll: true });
}

function lockWorkspace() {
  state.user = null;
  clearMaterial();
  el.workspace.hidden = true;
  el.signout.hidden = true;
  el['signin-panel'].hidden = Boolean(state.activation);
  el.managed.replaceChildren(node('p', 'Sign in to manage uploaded materials.', 'up-help'));
}

async function requireAdmin() {
  const user = check(await state.client.auth.getUser())?.user;
  if (!user || check(await state.client.rpc('is_marketing_admin')) !== true) {
    throw new Error('This account does not have administrator access.');
  }
  return user;
}

async function unlockWorkspace() {
  const request = ++state.authCheck;
  const user = await requireAdmin();
  if (request !== state.authCheck) return;
  const changedUser = state.user?.id !== user.id;
  if (changedUser) clearMaterial();
  state.user = user;
  el.workspace.hidden = false;
  el.signout.hidden = false;
  el['signin-panel'].hidden = true;
  el.setup.hidden = true;
  updateControls();
  if (changedUser) await loadManaged();
}

async function selectFile(file) {
  if (!state.user || state.busy || !file) return;
  clearMaterial();
  const selection = state.selection;
  const controller = new AbortController();
  state.abort = controller;
  status(el.status, 'Preparing your material on this device…');
  el.drop.setAttribute('aria-busy', 'true');
  try {
    const processed = await processMaterial(file, {
      signal: controller.signal,
      onProgress(progress) {
        if (selection === state.selection) status(el.status, typeof progress === 'string' ? progress : progress.message || 'Processing your material…');
      }
    });
    if (selection !== state.selection || !state.user) return;
    state.material = processed;
    state.preview = URL.createObjectURL(processed.cover);
    el.preview.src = state.preview;
    el.preview.alt = `First page preview of ${processed.title || processed.originalName || file.name}`;
    el.preview.hidden = false;
    el['file-name'].textContent = processed.originalName || file.name;
    el['page-count'].textContent = `${processed.pages} ${processed.pages === 1 ? 'page' : 'pages'} · ${(processed.bytes / 1048576).toFixed(1)} MB PDF`;
    status(el['extraction-status'], processed.searchText?.trim() ? 'Searchable text extracted. Review the suggested details.' : 'No searchable text found. Add a description and keywords to help people find this material.');
    el.title.value = String(processed.title || '').slice(0, 100);
    el.description.value = String(processed.description || '').slice(0, 400);
    el.keywords.value = String(processed.keywords || '').slice(0, 300);
    el.review.hidden = false;
    el['publish-section'].hidden = false;
    status(el.status, 'Your preview is ready. Review the details below before publishing.');
  } catch (error) {
    if (selection === state.selection && error.name !== 'AbortError') status(el.status, errorText(error, 'The file could not be processed.'), true);
  } finally {
    if (selection === state.selection) {
      state.abort = null;
      el.drop.setAttribute('aria-busy', 'false');
      updateControls();
    }
  }
}

async function cleanDraft(id) {
  // Confirm the state after a failed request: a publish may have reached the server.
  const row = check(await state.client.from('marketing_materials').select('id,status,file_path,cover_path').eq('id', id).maybeSingle());
  if (!row) return { cleaned: true };
  if (row.status === 'published') return { published: row };
  check(await state.client.storage.from(libraryConfig.bucket).remove([row.file_path, row.cover_path]));
  check(await state.client.from('marketing_materials').delete().eq('id', id).eq('status', 'draft'));
  return { cleaned: true };
}

async function publish(event) {
  event.preventDefault();
  if (state.busy || !state.material || !state.user) return;
  if (!el['material-form'].reportValidity() || !el.title.value.trim() || !el.description.value.trim()) return;
  const processed = state.material;
  state.busy = true;
  updateControls();
  el.result.hidden = true;
  let draftId = null;
  try {
    await requireAdmin();
    status(el.status, 'Checking your collection…');
    const matches = check(await state.client.from('marketing_materials').select('id,status,title').eq('sha256', processed.sha256).limit(1));
    if (matches.length) {
      if (matches[0].status === 'published') {
        showResult('This file is already published. Open the existing material below.', matches[0]);
      } else {
        showResult('This file already has an unpublished entry. Find it under Manage uploaded materials to publish it, or delete the draft before starting again.');
        await loadManaged();
      }
      status(el.status, 'Existing material found. No duplicate was created.');
      return;
    }
    const id = crypto.randomUUID();
    const record = {
      id, title: el.title.value.trim(), category: el.category.value,
      description: el.description.value.trim(), keywords: el.keywords.value.trim(),
      search_text: String(processed.searchText || '').slice(0, 40000),
      pages: processed.pages, file_bytes: processed.bytes, sha256: processed.sha256,
      file_path: `${id}/document.pdf`, cover_path: `${id}/cover.webp`, status: 'draft'
    };
    draftId = id;
    check(await state.client.from('marketing_materials').insert(record));
    status(el.status, 'Uploading the PDF…');
    check(await state.client.storage.from(libraryConfig.bucket).upload(record.file_path, processed.pdf, { contentType: 'application/pdf', upsert: false }));
    status(el.status, 'Uploading the preview…');
    check(await state.client.storage.from(libraryConfig.bucket).upload(record.cover_path, processed.cover, { contentType: 'image/webp', upsert: false }));
    status(el.status, 'Publishing to the collection…');
    check(await state.client.from('marketing_materials').update({ status: 'published' }).eq('id', id).eq('status', 'draft'));
    const fresh = check(await state.client.from('marketing_materials').select(PUBLIC_FIELDS).eq('id', id).eq('status', 'published').single());
    clearMaterial({ keepResult: true });
    showResult('Published. Your material is now available in the public collection.', fresh);
    await loadManaged();
  } catch (error) {
    let cleanup = null;
    if (draftId) {
      try { cleanup = await cleanDraft(draftId); } catch { /* Keep the draft so an administrator can retry cleanup. */ }
    }
    if (cleanup?.published) {
      clearMaterial({ keepResult: true });
      showResult('Published. The final confirmation was interrupted, but the material is available.', cleanup.published);
    } else {
      status(el.status, errorText(error, 'The material was not published.'), true);
      if (draftId && !cleanup?.cleaned) showResult('An unfinished draft remains in Manage uploaded materials. You can retry publishing it if both files arrived, or delete the draft and upload again.');
    }
    await loadManaged();
  } finally {
    state.busy = false;
    updateControls();
  }
}

function confirmAction(article, message, label) {
  return new Promise(resolve => {
    const panel = node('div', null, 'up-confirmation');
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', message);
    panel.append(node('p', message));
    const actions = node('div', null, 'up-managed-actions');
    const confirm = node('button', label);
    const cancel = node('button', 'Cancel');
    confirm.type = cancel.type = 'button';
    function finish(value) { panel.remove(); resolve(value); }
    confirm.addEventListener('click', () => finish(true), { once: true });
    cancel.addEventListener('click', () => finish(false), { once: true });
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') finish(false); });
    actions.append(confirm, cancel);
    panel.append(actions);
    article.append(panel);
    cancel.focus();
  });
}

async function manage(row, action, article, trigger) {
  if (state.managing || state.busy) return;
  state.managing = true;
  state.busy = true;
  updateControls();
  try {
    if (action !== 'publish') {
      const message = action === 'delete' ? `Permanently delete the draft “${row.title}” and its stored files?` : `Remove “${row.title}” from the public collection? You can publish it again later.`;
      if (!await confirmAction(article, message, action === 'delete' ? 'Delete draft permanently' : 'Unpublish material')) { trigger.focus(); return; }
    }
    for (const button of el.managed.querySelectorAll('button')) button.disabled = true;
    el.managed.setAttribute('aria-busy', 'true');
    await requireAdmin();
    if (action === 'delete') {
      const result = await cleanDraft(row.id);
      if (result.published) throw new Error('This material is published. Unpublish it before deleting.');
    } else {
      if (action === 'publish') {
        const files = check(await state.client.storage.from(libraryConfig.bucket).list(row.id, { limit: 10 }));
        if (!['document.pdf', 'cover.webp'].every(name => files.some(file => file.name === name))) {
          throw new Error('This draft is missing its PDF or preview. Delete the unfinished draft and upload the original file again.');
        }
      }
      const expected = action === 'publish' ? 'draft' : 'published';
      const updated = check(await state.client.from('marketing_materials').update({ status: action === 'publish' ? 'published' : 'draft' }).eq('id', row.id).eq('status', expected).select('id,status').single());
      if (!updated) throw new Error('This material changed in another session. Refresh the list and try again.');
    }
    await loadManaged();
    const message = action === 'delete' ? 'Draft and stored files deleted.' : action === 'publish' ? 'Material published.' : 'Material unpublished.';
    el.managed.prepend(node('p', message, 'up-help'));
  } catch (error) {
    const note = node('p', errorText(error, 'The change could not be completed.'), 'up-status');
    note.dataset.state = 'error';
    note.setAttribute('role', 'alert');
    article.append(note);
  } finally {
    state.managing = false;
    state.busy = false;
    el.managed.setAttribute('aria-busy', 'false');
    for (const button of el.managed.querySelectorAll('button')) button.disabled = false;
    updateControls();
  }
}

async function loadManaged() {
  if (!state.user) return;
  const userId = state.user.id;
  el.managed.setAttribute('aria-busy', 'true');
  try {
    const rows = check(await state.client.from('marketing_materials').select('id,title,category,pages,status,created_at').order('created_at', { ascending: false }));
    if (state.user?.id !== userId) return;
    el.managed.replaceChildren();
    if (!rows.length) el.managed.append(node('p', 'No uploaded materials yet. Add your first material above.', 'up-help'));
    for (const row of rows) {
      const article = node('article', null, 'up-managed-item');
      const copy = node('div');
      copy.append(node('h3', row.title));
      const published = row.status === 'published';
      const created = new Date(row.created_at);
      const date = Number.isNaN(created.getTime()) ? '' : ` · Added ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(created)}`;
      copy.append(node('p', `${row.category} · ${row.pages} ${row.pages === 1 ? 'page' : 'pages'}${date}`));
      copy.append(node('span', published ? 'Published' : 'Draft / not public', 'up-badge'));
      const actions = node('div', null, 'up-managed-actions');
      if (published) {
        const view = node('a', 'View');
        view.href = materialURL(row.id);
        view.setAttribute('aria-label', `View ${row.title}`);
        actions.append(view);
      }
      for (const action of published ? ['unpublish'] : ['publish', 'delete']) {
        const button = node('button', action === 'unpublish' ? 'Unpublish' : action === 'publish' ? 'Publish' : 'Delete draft');
        button.type = 'button';
        button.setAttribute('aria-label', `${button.textContent}: ${row.title}`);
        button.addEventListener('click', () => manage(row, action, article, button));
        actions.append(button);
      }
      article.append(copy, actions);
      el.managed.append(article);
    }
  } catch (error) {
    if (state.user?.id !== userId) return;
    const message = node('p', errorText(error, 'The uploaded materials could not be loaded.'), 'up-status');
    message.dataset.state = 'error';
    const retry = node('button', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', loadManaged);
    el.managed.replaceChildren(message, retry);
  } finally {
    if (state.user?.id === userId) el.managed.setAttribute('aria-busy', 'false');
  }
}

function setAuthBusy(form, busy) {
  form.setAttribute('aria-busy', String(busy));
  for (const control of form.elements) control.disabled = busy;
}

el['signin-form'].addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.client || el.signin.disabled) return;
  setAuthBusy(el['signin-form'], true);
  status(el['auth-status'], 'Signing in…');
  try {
    check(await state.client.auth.signInWithPassword({ email: el.email.value.trim(), password: el.password.value }));
    await unlockWorkspace();
    status(el['auth-status']);
  } catch (error) {
    state.authCheck += 1;
    lockWorkspace();
    status(el['auth-status'], errorText(error, 'Sign-in could not be completed.'), true);
    await state.client.auth.signOut({ scope: 'local' }).catch(() => {});
  } finally {
    el.password.value = '';
    setAuthBusy(el['signin-form'], false);
  }
});

el.signout.addEventListener('click', async () => {
  if (state.busy) return;
  state.authCheck += 1;
  lockWorkspace();
  try {
    check(await state.client.auth.signOut({ scope: 'local' }));
    status(el['auth-status'], 'Signed out.');
  } catch (error) {
    status(el['auth-status'], errorText(error, 'Your workspace is locked, but sign-out could not be confirmed. Close this tab to clear its session.'), true);
  }
});

el['setup-form'].addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.client || !state.activation || el['setup-submit'].disabled) return;
  if (el['setup-password'].value !== el['setup-confirm'].value) {
    status(el['setup-status'], 'The passwords do not match.', true);
    el['setup-confirm'].focus();
    return;
  }
  const password = el['setup-password'].value;
  setAuthBusy(el['setup-form'], true);
  status(el['setup-status'], 'Setting up your administrator access…');
  try {
    const endpoint = new URL(`/functions/v1/${libraryConfig.activationFunction}`, libraryConfig.url);
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: libraryConfig.key }, body: JSON.stringify({ token: state.activation, password }), cache: 'no-store', credentials: 'omit' });
    const result = await response.json();
    if (!response.ok || !result.email) throw new Error(result.error || 'The invitation could not be activated.');
    state.activation = null;
    el.email.value = result.email;
    check(await state.client.auth.signInWithPassword({ email: result.email, password }));
    await unlockWorkspace();
  } catch (error) {
    status(el['setup-status'], errorText(error, 'Account setup could not be completed.'), true);
    if (!state.activation) {
      el['signin-panel'].hidden = false;
      status(el['auth-status'], 'Your password was created. Sign in using it to continue.');
    }
  } finally {
    el['setup-password'].value = '';
    el['setup-confirm'].value = '';
    setAuthBusy(el['setup-form'], false);
  }
});

el.file.addEventListener('change', () => {
  const file = el.file.files?.[0];
  el.file.value = '';
  selectFile(file);
});
for (const eventName of ['dragenter', 'dragover']) el.drop.addEventListener(eventName, event => {
  event.preventDefault();
  if (state.user && !state.busy) el.drop.classList.add('is-dragover');
});
el.drop.addEventListener('dragleave', event => { if (!el.drop.contains(event.relatedTarget)) el.drop.classList.remove('is-dragover'); });
el.drop.addEventListener('drop', event => {
  event.preventDefault();
  el.drop.classList.remove('is-dragover');
  if (event.dataTransfer?.files.length !== 1) { status(el.status, 'Choose one file at a time.', true); return; }
  selectFile(event.dataTransfer.files[0]);
});
el['material-form'].addEventListener('input', updateControls);
el['material-form'].addEventListener('change', updateControls);
el['material-form'].addEventListener('submit', publish);
el.reset.addEventListener('click', () => { if (!state.busy) { clearMaterial(); el.file.focus(); } });

function consumeActivationFragment() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('setup')) {
    history.replaceState(null, '', location.pathname + location.search);
    const token = fragment.get('setup');
    if (/^[a-f0-9]{64}$/i.test(token || '')) {
      state.activation = token;
      state.authCheck += 1;
      lockWorkspace();
      el['setup-email'].value = fragment.get('email') || '';
      el.setup.hidden = false;
      el['signin-panel'].hidden = true;
    } else status(el['auth-status'], 'This invitation link is incomplete or invalid. Use a valid administrator invitation or sign in.', true);
  }
}

window.addEventListener('hashchange', consumeActivationFragment);

async function init() {
  consumeActivationFragment();
  updateControls();
  try {
    state.client = createLibraryClient({ admin: true });
    state.client.auth.onAuthStateChange(event => {
      if (state.activation || event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        state.authCheck += 1;
        lockWorkspace();
      } else if (event === 'TOKEN_REFRESHED') {
        // Avoid making a new auth request while the client's auth lock is held.
        setTimeout(() => unlockWorkspace().catch(error => { lockWorkspace(); status(el['auth-status'], errorText(error, 'Please sign in again.'), true); }), 0);
      }
    });
    if (!state.activation) {
      const session = check(await state.client.auth.getSession())?.session;
      if (session) await unlockWorkspace();
    }
  } catch (error) {
    const target = state.activation ? el['setup-status'] : el['auth-status'];
    status(target, errorText(error, 'Administrator access is temporarily unavailable. Refresh this page to try again.'), true);
  }
}

init();
