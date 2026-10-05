// Two interchangeable storage backends for the admin:
//  - ServerBackend: talks to server.js (/api/*) when the site runs on a Node host.
//  - GitHubBackend: commits straight to the GitHub repository (static hosting / GitHub Pages).

export class CmsError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/* ---------------- Server ---------------- */
export class ServerBackend {
  constructor() {
    this.kind = 'server';
    this.api = new URL('../api/', location.href);
  }

  async call(route, { method = 'GET', body } = {}) {
    const res = await fetch(new URL(route, this.api), {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) throw new CmsError(data.error, 'conflict');
    if (res.status === 401) throw new CmsError(data.error || 'Non connecté.', 'auth');
    if (!res.ok) throw new CmsError(data.error || `Erreur ${res.status}`);
    return data;
  }

  // Resolves to the server status, or null when no CMS server is running (static hosting).
  static async detect() {
    try {
      const res = await fetch(new URL('../api/status', location.href), { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.mode === 'server' ? data : null;
    } catch { return null; }
  }

  login(password) { return this.call('login', { method: 'POST', body: { password } }); }
  logout() { return this.call('logout', { method: 'POST' }); }
  load() { return this.call('content'); }
  save({ content, uploads, baseVersion, force }) {
    return this.call('content', { method: 'PUT', body: { content, uploads, baseVersion, force } });
  }
  async media() { return (await this.call('media')).images; }
  async history() { return (await this.call('history')).versions; }
  async version(id) { return (await this.call(`history/${encodeURIComponent(id)}`)).content; }
  imageUrl(p) { return new URL(`../${p}`, location.href).href; }
  get siteUrl() { return new URL('../', location.href).href; }
}

/* ---------------- GitHub ---------------- */
const GH = 'https://api.github.com';
const CONTENT_PATH = 'content/site.json';

const utf8ToB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export class GitHubBackend {
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token });
    this.kind = 'github';
  }

  async call(route, { method = 'GET', body, allow404 = false } = {}) {
    const res = await fetch(`${GH}/repos/${this.owner}/${this.repo}${route}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (allow404 && res.status === 404) return null;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new CmsError('Jeton GitHub invalide ou expiré.', 'auth');
    if (res.status === 403 || res.status === 404) {
      throw new CmsError(`Accès refusé au dépôt ${this.owner}/${this.repo}. Vérifiez le nom du dépôt et que le jeton a la permission « Contents : Read and write ».`, 'auth');
    }
    if (res.status === 409 || res.status === 422) throw new CmsError(data.message || 'Conflit GitHub.', 'conflict');
    if (!res.ok) throw new CmsError(data.message || `Erreur GitHub ${res.status}`);
    return data;
  }

  async verify() {
    const repo = await this.call('');
    if (!repo.permissions?.push) throw new CmsError('Ce jeton ne peut pas écrire dans le dépôt (permission « Contents : Read and write » requise).', 'auth');
    return repo;
  }

  async load(ref = this.branch) {
    const file = await this.call(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(ref)}`);
    return { content: JSON.parse(b64ToUtf8(file.content)), version: file.sha };
  }

  // One atomic commit with the content, the regenerated page and any new images.
  async save({ content, html, uploads = [], baseVersion, force }) {
    const ref = await this.call(`/git/ref/heads/${this.branch}`);
    const head = ref.object.sha;
    if (!force && baseVersion) {
      const current = await this.call(`/contents/${CONTENT_PATH}?ref=${head}`);
      if (current.sha !== baseVersion) throw new CmsError('Le contenu a été modifié ailleurs depuis que vous l\'avez ouvert.', 'conflict');
    }
    const commit = await this.call(`/git/commits/${head}`);
    const tree = [
      { path: CONTENT_PATH, mode: '100644', type: 'blob', content: `${JSON.stringify(content, null, 2)}\n` },
      { path: 'index.html', mode: '100644', type: 'blob', content: html },
    ];
    for (const u of uploads) {
      const blob = await this.call('/git/blobs', { method: 'POST', body: { content: u.data, encoding: 'base64' } });
      tree.push({ path: u.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.call('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
    const newCommit = await this.call('/git/commits', {
      method: 'POST',
      body: { message: 'Mise à jour du contenu via le CMS', tree: newTree.sha, parents: [head] },
    });
    await this.call(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: newCommit.sha } });
    const saved = await this.call(`/contents/${CONTENT_PATH}?ref=${newCommit.sha}`);
    return { ok: true, version: saved.sha, commit: newCommit.sha };
  }

  async media() {
    const out = [];
    for (const dir of ['assets/img', 'assets/uploads']) {
      const list = await this.call(`/contents/${dir}?ref=${this.branch}`, { allow404: true });
      for (const f of list || []) if (/\.(jpe?g|png|webp|gif|avif|ico)$/i.test(f.name)) out.push(`${dir}/${f.name}`);
    }
    return out;
  }

  async history() {
    const commits = await this.call(`/commits?sha=${this.branch}&path=${CONTENT_PATH}&per_page=30`);
    return commits.map((c) => ({ id: c.sha, date: c.commit.author.date, message: c.commit.message, author: c.commit.author.name }));
  }

  async version(sha) { return (await this.load(sha)).content; }

  // GitHub Pages deployment status (needs the optional "Pages: read" permission).
  async deployStatus() {
    const build = await this.call('/pages/builds/latest', { allow404: true }).catch(() => null);
    return build ? { status: build.status, commit: build.commit } : null;
  }

  // Images straight from the repo, so they show up before GitHub Pages has redeployed.
  imageUrl(p) { return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${p}`; }
  get siteUrl() { return `https://${this.owner.toLowerCase()}.github.io/${this.repo}/`; }
}

export { utf8ToB64 };
