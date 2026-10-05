import { renderPage, videoToken } from '../cms/render.js';
import { SCHEMA } from '../cms/schema.js';
import { ServerBackend, GitHubBackend, CmsError } from './backends.js';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
};

const GH_DEFAULTS = { owner: 'quentonchee', repo: 'site--kenzo', branch: 'main' };
const GH_KEY = 'echoes-cms.github';
const SITE_BASE = new URL('../', location.href).href;

const state = {
  backend: null,
  content: null,
  version: null,
  saved: '',            // JSON snapshot of the last published content
  section: SCHEMA[0].id,
  pending: new Map(),   // upload path -> { dataUrl, data (base64), sent }
  device: 'desktop',
  previewScroll: 0,
  previewAnchor: null,
};

/* =========================================================
   Boot & authentication
   ========================================================= */
function show(id) {
  for (const s of ['screenLoading', 'screenLogin', 'screenSetup', 'screenGithub', 'app']) $(`#${s}`).hidden = s !== id;
}

async function boot() {
  const status = await ServerBackend.detect();
  if (status) {
    state.backend = new ServerBackend();
    if (!status.configured) return show('screenSetup');
    if (!status.authed) return showLogin();
    return openApp();
  }
  const saved = readGithubSettings();
  if (!saved?.token) return showGithub();
  state.backend = new GitHubBackend(saved);
  try {
    await state.backend.verify();
    openApp();
  } catch (err) {
    showGithub(err.message);
  }
}

function showLogin(message = '') {
  show('screenLogin');
  $('#loginError').textContent = message;
  $('#loginForm [name=password]').focus();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', e.target);
  btn.disabled = true;
  try {
    await state.backend.login(e.target.password.value);
    e.target.reset();
    openApp();
  } catch (err) {
    $('#loginError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

function readGithubSettings() {
  try { return JSON.parse(localStorage.getItem(GH_KEY)); } catch { return null; }
}
function showGithub(message = '') {
  show('screenGithub');
  const f = $('#githubForm');
  const saved = { ...GH_DEFAULTS, ...readGithubSettings() };
  for (const k of ['owner', 'repo', 'branch']) f[k].value = saved[k] || '';
  $('#githubError').textContent = message;
}
$('#githubForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const settings = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim(), token: f.token.value.trim() };
  const btn = $('button[type=submit]', f);
  btn.disabled = true; btn.textContent = 'Vérification…';
  try {
    const backend = new GitHubBackend(settings);
    await backend.verify();
    try { localStorage.setItem(GH_KEY, JSON.stringify(settings)); } catch { /* private mode: session only */ }
    state.backend = backend;
    f.token.value = '';
    openApp();
  } catch (err) {
    $('#githubError').textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
});

async function openApp() {
  show('screenLoading');
  try {
    const { content, version } = await state.backend.load();
    state.content = content;
    state.version = version;
    state.saved = JSON.stringify(content);
  } catch (err) {
    if (err.code === 'auth') return state.backend.kind === 'server' ? showLogin(err.message) : showGithub(err.message);
    show('screenLoading');
    $('#screenLoading p').textContent = `Impossible de charger le contenu : ${err.message}`;
    return;
  }
  show('app');
  $('#modeBadge').textContent = state.backend.kind === 'github' ? 'GitHub' : 'Serveur';
  $('#siteLink').href = state.backend.siteUrl;
  buildSidebar();
  selectSection(state.section);
  updateStatus();
}

/* =========================================================
   Helpers
   ========================================================= */
const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const isDirty = () => JSON.stringify(state.content) !== state.saved;
const resolveImage = (p) => state.pending.get(p)?.dataUrl || p;
const imageSrc = (p) => {
  if (!p) return '';
  if (state.pending.has(p)) return state.pending.get(p).dataUrl;
  if (/^(https?:|data:)/.test(p)) return p;
  return new URL(p, SITE_BASE).href;
};

let toastTimer;
function toast(message, kind = '') {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 7000 : 4000);
}

function updateStatus(text) {
  const s = $('#status');
  const dirty = isDirty();
  s.textContent = text || (dirty ? 'Modifications non publiées' : 'Tout est publié');
  s.classList.toggle('is-dirty', dirty && !text);
  $('#publishBtn').disabled = !dirty;
  $$('.sidebar__item').forEach((b) => {
    const sec = SCHEMA.find((x) => x.id === b.dataset.id);
    const data = getPath(state.content, sec.path) || {};
    b.classList.toggle('is-hidden-section', data.visible === false);
  });
}

function changed() {
  updateStatus();
  schedulePreview();
}

/* =========================================================
   Sidebar & sections
   ========================================================= */
function buildSidebar() {
  const nav = $('#sidebar');
  nav.replaceChildren(...SCHEMA.map((sec) => h('button', {
    class: 'sidebar__item', 'data-id': sec.id, onclick: () => selectSection(sec.id),
  }, h('span', {}, sec.title), h('i', { class: 'sidebar__off', title: 'Section masquée' }, 'masquée'))));
}

function selectSection(id) {
  state.section = id;
  const sec = SCHEMA.find((s) => s.id === id);
  $$('.sidebar__item').forEach((b) => b.classList.toggle('is-active', b.dataset.id === id));
  let data = getPath(state.content, sec.path);
  if (!data) { data = {}; state.content[sec.path] = data; }
  const editor = $('#editor');
  editor.replaceChildren(
    h('header', { class: 'editor__head' },
      h('h1', {}, sec.title),
      sec.hint ? h('p', { class: 'muted' }, sec.hint) : null),
    h('div', { class: 'fields' }, buildFields(sec.fields, data)),
  );
  editor.scrollTop = 0;
  renderPreview({ scrollTo: sec.anchor });
  updateStatus();
}

/* =========================================================
   Field builders
   ========================================================= */
function buildFields(fields, obj) {
  return fields.map((f) => buildField(f, obj));
}

function fieldShell(f, control, extra = [], labelExtra = null) {
  return h('div', { class: `field${f.half ? ' field--half' : ''} field--${f.type}` },
    h('div', { class: 'field__top' }, h('label', { class: 'field__label' }, f.label), labelExtra),
    control,
    ...extra,
    f.help ? h('p', { class: 'field__help' }, f.help) : null);
}

function buildField(f, obj) {
  switch (f.type) {
    case 'text': return textField(f, obj);
    case 'textarea':
    case 'rich': return textareaField(f, obj);
    case 'toggle': return toggleField(f, obj);
    case 'color': return colorField(f, obj);
    case 'select': return selectField(f, obj);
    case 'video': return videoField(f, obj);
    case 'image': return imageField(f, obj);
    case 'group': return groupField(f, obj);
    case 'list': return listField(f, obj);
    default: return h('p', {}, `Type inconnu : ${f.type}`);
  }
}

function counter(f, input) {
  if (!f.max) return null;
  const c = h('span', { class: 'field__count' });
  const upd = () => {
    c.textContent = `${input.value.length} / ${f.max}`;
    c.classList.toggle('is-over', input.value.length > f.max);
  };
  input.addEventListener('input', upd);
  upd();
  return c;
}

function textField(f, obj) {
  const input = h('input', { type: 'text', value: obj[f.key] ?? '', oninput: (e) => { obj[f.key] = e.target.value; changed(); } });
  return fieldShell(f, input, [counter(f, input)]);
}

function textareaField(f, obj) {
  const ta = h('textarea', { rows: f.rows || 2, oninput: (e) => { obj[f.key] = e.target.value; changed(); } });
  ta.value = obj[f.key] ?? '';
  let toolbar = null;
  if (f.type === 'rich') {
    const wrap = (mark) => {
      const { selectionStart: a, selectionEnd: b, value } = ta;
      if (a === b) return ta.focus();
      ta.value = value.slice(0, a) + mark + value.slice(a, b) + mark + value.slice(b);
      ta.setSelectionRange(a + mark.length, b + mark.length);
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    };
    toolbar = (h('div', { class: 'toolbar' },
      h('button', { type: 'button', class: 'toolbar__btn', title: 'Italique (sélectionnez du texte)', onclick: () => wrap('*') }, h('em', {}, 'I')),
      h('button', { type: 'button', class: 'toolbar__btn', title: 'Gras (sélectionnez du texte)', onclick: () => wrap('**') }, h('strong', {}, 'G'))));
  }
  return fieldShell(f, ta, [counter(f, ta)], toolbar);
}

function toggleField(f, obj) {
  const isVisibleFlag = f.key === 'visible' || f.key === 'hud';
  const checked = isVisibleFlag ? obj[f.key] !== false : Boolean(obj[f.key]);
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => { obj[f.key] = e.target.checked; changed(); } });
  return h('label', { class: `field field--toggle${f.half ? ' field--half' : ''}` },
    input, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', {}, f.label));
}

function colorField(f, obj) {
  const text = h('input', { type: 'text', value: obj[f.key] || '', class: 'color__hex', maxlength: 7 });
  const picker = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[f.key]) ? obj[f.key] : '#000000' });
  picker.addEventListener('input', () => { text.value = picker.value; obj[f.key] = picker.value; changed(); });
  text.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) { picker.value = text.value; obj[f.key] = text.value; changed(); }
  });
  return fieldShell(f, h('div', { class: 'color' }, picker, text));
}

function selectField(f, obj) {
  const options = getPath(state.content, f.options) || [];
  const select = h('select', { onchange: (e) => { obj[f.key] = e.target.value; changed(); } },
    h('option', { value: '' }, '— Aucune —'),
    options.map((o) => h('option', { value: o.id, selected: o.id === obj[f.key] }, o.label || o.id)));
  return fieldShell(f, select);
}

function videoField(f, obj) {
  const info = h('div', { class: 'video-info' });
  const update = () => {
    const token = videoToken(obj[f.key] || '');
    const [kind, id] = token.split(':');
    info.replaceChildren();
    if (!obj[f.key]) { info.append(h('span', { class: 'muted' }, 'Aucune vidéo')); return; }
    if (kind === 'yt') info.append(h('img', { src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, alt: '' }), h('span', { class: 'ok' }, 'YouTube ✓'));
    else if (kind === 'drive') info.append(h('span', { class: 'ok' }, 'Google Drive ✓ — vérifiez que le partage est « Tous les utilisateurs disposant du lien »'));
    else if (kind === 'vimeo') info.append(h('span', { class: 'ok' }, 'Vimeo ✓'));
    else info.append(h('span', { class: 'warn' }, 'Lien non reconnu : collez un lien YouTube, Vimeo ou Google Drive.'));
  };
  const input = h('input', { type: 'url', value: obj[f.key] ?? '', placeholder: 'https://www.youtube.com/watch?v=…', oninput: (e) => { obj[f.key] = e.target.value.trim(); update(); changed(); } });
  update();
  return fieldShell(f, input, [info]);
}

function imageField(f, obj) {
  const thumb = h('img', { class: 'image__thumb', alt: '' });
  const pathInput = h('input', { type: 'text', class: 'image__path', placeholder: 'assets/…', 'aria-label': 'Chemin de l\'image' });
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
  const set = (p) => {
    obj[f.key] = p;
    pathInput.value = p || '';
    thumb.src = imageSrc(p);
    thumb.hidden = !p;
    changed();
  };
  const refresh = () => { pathInput.value = obj[f.key] || ''; thumb.src = imageSrc(obj[f.key]); thumb.hidden = !obj[f.key]; };
  pathInput.addEventListener('change', () => set(pathInput.value.trim()));
  const upload = async (file) => {
    if (!file) return;
    try {
      toast('Préparation de l\'image…');
      set(await addUpload(file));
      toast('Image ajoutée — elle sera envoyée à la publication.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  };
  fileInput.addEventListener('change', () => { upload(fileInput.files[0]); fileInput.value = ''; });
  const drop = h('div', { class: 'image' },
    h('div', { class: 'image__preview' }, thumb, h('span', { class: 'image__empty' }, 'Glissez une image ici')),
    h('div', { class: 'image__actions' },
      h('button', { type: 'button', class: 'btn btn--small', onclick: () => fileInput.click() }, 'Importer…'),
      h('button', { type: 'button', class: 'btn btn--small btn--ghost', onclick: () => openMedia(set) }, 'Bibliothèque'),
      h('button', { type: 'button', class: 'btn btn--small btn--ghost', onclick: () => set('') }, 'Retirer'),
      pathInput, fileInput));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-drag'); upload(e.dataTransfer.files[0]); });
  refresh();
  return fieldShell(f, drop);
}

function groupField(f, obj) {
  if (!obj[f.key] || typeof obj[f.key] !== 'object') obj[f.key] = {};
  return h('fieldset', { class: 'group' }, h('legend', {}, f.label), h('div', { class: 'fields' }, buildFields(f.fields, obj[f.key])));
}

function listField(f, obj) {
  if (!Array.isArray(obj[f.key])) obj[f.key] = [];
  const arr = obj[f.key];
  const box = h('div', { class: `list${f.compact ? ' list--compact' : ''}` });
  const open = new Set();
  const labelOf = (item, i) => (f.itemTitle ? f.itemTitle(item) : '') || `Élément ${i + 1}`;

  const render = () => {
    box.replaceChildren(...arr.map((item, i) => {
      const title = h('span', { class: 'item__title' }, labelOf(item, i));
      const thumb = f.thumb ? h('img', { class: 'item__thumb', src: imageSrc(item[f.thumb]), alt: '', hidden: !item[f.thumb] }) : null;
      const move = (d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; render(); changed(); };
      const body = h('div', { class: 'item__body fields' }, buildFields(f.fields, item));
      const isOpen = open.has(item);
      const el = h('div', { class: `item${isOpen ? ' is-open' : ''}` },
        h('div', { class: 'item__head' },
          h('button', { type: 'button', class: 'item__toggle', 'aria-expanded': String(isOpen), onclick: () => {
            if (open.has(item)) open.delete(item); else open.add(item);
            el.classList.toggle('is-open'); },
          }, h('span', { class: 'item__n' }, String(i + 1).padStart(2, '0')), thumb, title),
          h('div', { class: 'item__tools' },
            h('button', { type: 'button', class: 'icon-btn', title: 'Monter', disabled: i === 0, onclick: () => move(-1) }, '↑'),
            h('button', { type: 'button', class: 'icon-btn', title: 'Descendre', disabled: i === arr.length - 1, onclick: () => move(1) }, '↓'),
            h('button', { type: 'button', class: 'icon-btn', title: 'Dupliquer', onclick: () => {
              const copy = structuredClone(item); arr.splice(i + 1, 0, copy); open.add(copy); render(); changed(); } }, '⧉'),
            h('button', { type: 'button', class: 'icon-btn icon-btn--danger', title: 'Supprimer', onclick: () => {
              if (!confirm(`Supprimer « ${labelOf(item, i)} » ?`)) return;
              arr.splice(i, 1); render(); changed(); } }, '✕'))),
        body);
      // Keep the header in sync while typing, and auto-fill identifiers from labels.
      let lastLabel = item.label;
      body.addEventListener('input', () => {
        const slugField = f.fields.find((x) => x.slugFrom);
        if (slugField && (!item[slugField.key] || item[slugField.key] === slugify(lastLabel))) {
          item[slugField.key] = slugify(item[slugField.slugFrom]);
          const idInput = body.querySelectorAll('input[type=text]')[f.fields.indexOf(slugField)];
          if (idInput) idInput.value = item[slugField.key];
        }
        lastLabel = item[slugField?.slugFrom || 'label'];
        title.textContent = labelOf(item, i);
        if (thumb) { thumb.src = imageSrc(item[f.thumb]); thumb.hidden = !item[f.thumb]; }
      });
      body.addEventListener('change', () => { if (thumb) { thumb.src = imageSrc(item[f.thumb]); thumb.hidden = !item[f.thumb]; } });
      return el;
    }));
  };
  render();

  const add = h('button', { type: 'button', class: 'btn btn--small btn--ghost list__add', onclick: () => {
    const item = structuredClone(f.defaults || {});
    arr.push(item); open.add(item); render(); changed();
    box.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } }, `+ ${f.addLabel || 'Ajouter'}`);

  return h('div', { class: 'field field--list' },
    h('div', { class: 'field__label' }, f.label, h('span', { class: 'muted' }, ` · ${arr.length}`)),
    box, add);
}

/* =========================================================
   Images: resize in the browser, keep until publish
   ========================================================= */
const MAX_SIDE = 2200;
async function addUpload(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Format non pris en charge (JPG, PNG, WebP ou GIF).');
  if (file.size > 25 * 1024 * 1024) throw new Error('Image trop lourde (25 Mo maximum).');
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const id = Math.random().toString(36).slice(2, 7);
  let blob = file;
  let ext = file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : file.type === 'image/webp' ? 'webp' : 'jpg';

  if (file.type !== 'image/gif') {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = h('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const keepAlpha = file.type === 'image/png' && hasAlpha(ctx, canvas);
    const type = keepAlpha ? 'image/png' : 'image/jpeg';
    ext = keepAlpha ? 'png' : 'jpg';
    blob = await new Promise((res) => canvas.toBlob(res, type, 0.86));
  }
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  const path = `assets/uploads/${base}-${id}.${ext}`;
  state.pending.set(path, { dataUrl, data: dataUrl.split(',')[1], sent: false });
  return path;
}
function hasAlpha(ctx, canvas) {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4 * 16) if (data[i] < 250) return true;
  return false;
}

/* =========================================================
   Media library
   ========================================================= */
async function openMedia(onPick) {
  const dlg = $('#mediaDialog');
  const grid = $('#mediaGrid');
  grid.replaceChildren(h('p', { class: 'muted' }, 'Chargement…'));
  dlg.showModal();
  let images = [];
  try { images = await state.backend.media(); } catch (err) { grid.replaceChildren(h('p', { class: 'error' }, err.message)); return; }
  const local = [...state.pending.keys()].filter((p) => !images.includes(p));
  const all = [...local, ...images.reverse()];
  grid.replaceChildren(...all.map((p) => h('button', { type: 'button', class: 'media__item', title: p, onclick: () => { onPick(p); dlg.close(); } },
    h('img', { src: state.pending.get(p)?.dataUrl || state.backend.imageUrl(p), alt: '', loading: 'lazy' }),
    h('span', {}, p.split('/').pop()))));
  if (!all.length) grid.replaceChildren(h('p', { class: 'muted' }, 'Aucune image pour l\'instant.'));
}

/* =========================================================
   Live preview
   ========================================================= */
const PREVIEW_HEAD = `<style>.reveal{opacity:1!important;transform:none!important}html{scroll-behavior:auto!important}</style>
<script>
  addEventListener('DOMContentLoaded', function () {
    var target = window.__cmsScrollTo;
    if (target) { var el = document.querySelector(target); if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY); }
    else scrollTo(0, window.__cmsScroll || 0);
  });
  var t; addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(function () { parent.postMessage({ cmsScroll: scrollY }, '*'); }, 80); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    e.preventDefault();
    if (href.charAt(0) === '#' && href.length > 1) {
      try { var el = document.querySelector(href); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY, behavior: 'smooth' }); } catch (_) {}
    }
  });
</script>`;

let previewTimer;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => renderPreview(), 350);
}
// Two stacked iframes: the next render loads hidden, then swaps in — no white flash while typing.
const frames = [$('#preview'), null];
function backFrame() {
  if (!frames[1]) {
    frames[1] = frames[0].cloneNode();
    frames[1].removeAttribute('id');
    frames[0].after(frames[1]);
  }
  return frames[1];
}
function renderPreview({ scrollTo } = {}) {
  const frame = backFrame();
  frame.classList.add('is-back');
  frame.onload = () => {
    frame.classList.remove('is-back');
    frames[0].classList.add('is-back');
    frames.reverse();
  };
  // Until the preview reports its scroll position, keep aiming at the section's anchor.
  if (scrollTo) state.previewAnchor = scrollTo;
  const vars = state.previewAnchor
    ? `<script>window.__cmsScrollTo=${JSON.stringify(state.previewAnchor)}</script>`
    : `<script>window.__cmsScroll=${Math.round(state.previewScroll)}</script>`;
  const html = renderPage(state.content, { resolve: resolveImage, base: SITE_BASE });
  frame.srcdoc = html.replace('</head>', `${vars}${PREVIEW_HEAD}</head>`);
}
addEventListener('message', (e) => {
  if (e.source === frames[0]?.contentWindow && typeof e.data?.cmsScroll === 'number') {
    state.previewScroll = e.data.cmsScroll;
    state.previewAnchor = null;
  }
});

$$('.seg__btn').forEach((b) => b.addEventListener('click', () => {
  state.device = b.dataset.device;
  $$('.seg__btn').forEach((x) => x.classList.toggle('is-on', x === b));
  $('#previewStage').classList.toggle('is-mobile', state.device === 'mobile');
}));
$('#togglePreview').addEventListener('click', () => {
  const on = document.body.classList.toggle('show-preview');
  $('#togglePreview').textContent = on ? 'Éditer' : 'Aperçu';
});

/* =========================================================
   Publish
   ========================================================= */
async function publish(force = false) {
  if (!isDirty() && !force) return;
  const btn = $('#publishBtn');
  btn.disabled = true;
  updateStatus('Publication…');
  const json = JSON.stringify(state.content);
  const uploads = [...state.pending].filter(([p, u]) => !u.sent && json.includes(p)).map(([path, u]) => ({ path, data: u.data }));
  try {
    const res = await state.backend.save({
      content: state.content,
      html: renderPage(state.content),
      uploads,
      baseVersion: state.version,
      force,
    });
    state.version = res.version;
    state.saved = json;
    uploads.forEach((u) => { state.pending.get(u.path).sent = true; });
    updateStatus();
    if (state.backend.kind === 'github') {
      toast('Publié ! Le site en ligne sera à jour d\'ici 1 à 2 minutes.', 'ok');
      watchDeploy(res.commit);
    } else {
      toast('Publié ! Le site est à jour.', 'ok');
    }
  } catch (err) {
    updateStatus();
    if (err.code === 'conflict' && !force) {
      if (confirm(`${err.message}\n\nVoulez-vous quand même publier votre version (elle remplacera l'autre) ?`)) return publish(true);
      return;
    }
    if (err.code === 'auth' && state.backend.kind === 'server') {
      toast('Session expirée : reconnectez-vous (vos modifications restent dans cet onglet).', 'error');
      return;
    }
    toast(`Échec de la publication : ${err.message}`, 'error');
  } finally {
    btn.disabled = !isDirty();
  }
}
$('#publishBtn').addEventListener('click', () => publish());
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); publish(); }
});

async function watchDeploy(commit) {
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (isDirty()) return;
    const st = await state.backend.deployStatus().catch(() => null);
    if (!st) return; // no "Pages: read" permission: nothing to report
    if (st.commit === commit && st.status === 'built') { updateStatus(); toast('Le site en ligne est à jour ✓', 'ok'); return; }
    if (st.commit === commit && st.status === 'errored') { toast('GitHub Pages a signalé une erreur de déploiement.', 'error'); return; }
    updateStatus('Mise en ligne en cours…');
  }
  updateStatus();
}

/* =========================================================
   History, backup, menu, logout
   ========================================================= */
const fmtDate = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

$('#historyBtn').addEventListener('click', async () => {
  const dlg = $('#historyDialog');
  const list = $('#historyList');
  list.replaceChildren(h('li', { class: 'muted' }, 'Chargement…'));
  dlg.showModal();
  try {
    const versions = await state.backend.history();
    if (!versions.length) { list.replaceChildren(h('li', { class: 'muted' }, 'Aucune version précédente pour l\'instant.')); return; }
    list.replaceChildren(...versions.map((v, i) => h('li', { class: 'history__item' },
      h('div', {},
        h('strong', {}, fmtDate(v.date)),
        h('span', { class: 'muted small' }, state.backend.kind === 'github'
          ? ` · ${v.author || ''}${i === 0 ? ' · version en ligne' : ''}`
          : ' · sauvegarde avant publication')),
      h('button', { type: 'button', class: 'btn btn--small btn--ghost', onclick: async (e) => {
        e.target.disabled = true;
        try {
          state.content = await state.backend.version(v.id);
          dlg.close();
          buildSidebar();
          selectSection(state.section);
          toast('Version chargée. Cliquez sur « Publier » pour la remettre en ligne.', 'ok');
        } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
      } }, 'Restaurer'))));
  } catch (err) {
    list.replaceChildren(h('li', { class: 'error' }, err.message));
  }
});
$$('[data-close-dialog]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

const menuBtn = $('#menuBtn');
const menuList = $('#menuList');
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuList.hidden = !menuList.hidden;
  menuBtn.setAttribute('aria-expanded', String(!menuList.hidden));
});
document.addEventListener('click', (e) => { if (!menuList.contains(e.target)) { menuList.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });

$('#revertBtn').addEventListener('click', () => {
  if (!isDirty()) return toast('Aucune modification à annuler.');
  if (!confirm('Annuler toutes les modifications non publiées ?')) return;
  state.content = JSON.parse(state.saved);
  selectSection(state.section);
  toast('Modifications annulées.');
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.content, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `echoes-site-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !data.hero) throw new Error('Ce fichier ne ressemble pas à une sauvegarde du site.');
    state.content = data;
    selectSection(state.section);
    toast('Sauvegarde importée. Publiez pour l\'appliquer.', 'ok');
  } catch (err) { toast(err.message, 'error'); }
});

$('#logoutBtn').addEventListener('click', async () => {
  if (isDirty() && !confirm('Des modifications ne sont pas publiées. Se déconnecter quand même ?')) return;
  state.saved = JSON.stringify(state.content);
  if (state.backend.kind === 'server') {
    await state.backend.logout().catch(() => {});
    showLogin();
  } else {
    const s = readGithubSettings() || {};
    delete s.token;
    try { localStorage.setItem(GH_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    showGithub();
  }
});

addEventListener('beforeunload', (e) => {
  if (state.content && isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

boot();
