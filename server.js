// Echoes Films — site + CMS server (no dependencies).
//   npm start            → http://localhost:4322  (admin on /admin)
// Settings come from environment variables or a local .env file:
//   CMS_PASSWORD=...     (required to use /admin)
//   PORT=4322  HOST=127.0.0.1   (use HOST=0.0.0.0 on a hosting provider)
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat, rename, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './cms/render.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, 'content', 'site.json');
const HISTORY = path.join(ROOT, 'content', 'history');
const UPLOADS = path.join(ROOT, 'assets', 'uploads');
const HISTORY_KEEP = 60;
const MAX_BODY = 40 * 1024 * 1024;
const SESSION_TTL = 1000 * 60 * 60 * 12;

// ---------- config ----------
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PASSWORD = process.env.CMS_PASSWORD || '';
const PORT = Number(process.env.PORT) || 4322;
const HOST = process.env.HOST || '127.0.0.1';

// ---------- static files ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
// Only these paths are public; everything else (.env, history, server code, .git…) is never served.
const PUBLIC = [/^index\.html$/, /^styles\.css$/, /^main\.js$/, /^assets\/[\w./-]+$/, /^admin\/[\w./-]*$/, /^cms\/(render|schema)\.js$/, /^content\/site\.json$/];
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.ico']);

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (rel === '' ) rel = 'index.html';
  if (rel === 'admin' || rel === 'admin/') rel = 'admin/index.html';
  if (rel.includes('..') || !PUBLIC.some((re) => re.test(rel))) return send(res, 404, 'Not found');
  const file = path.join(ROOT, rel);
  try {
    const st = await stat(file);
    if (!st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
    headers['Cache-Control'] = rel.startsWith('assets/') ? 'public, max-age=86400' : 'no-cache';
    if (rel.startsWith('admin/')) headers['X-Frame-Options'] = 'DENY';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    send(res, 404, 'Not found');
  }
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Fichier trop lourd'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const safeEqual = (a, b) => {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
};

// ---------- auth ----------
const sessions = new Map(); // token -> expiry
const attempts = new Map(); // ip -> [timestamps]
const cookieName = 'cms_session';
function getSession(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`${cookieName}=([a-f0-9]{64})`));
  if (!m) return null;
  const exp = sessions.get(m[1]);
  if (!exp || exp < Date.now()) { sessions.delete(m[1]); return null; }
  return m[1];
}
function isSecure(req) { return req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted; }
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 8;
}

// ---------- content ----------
async function readContent() {
  const raw = await readFile(CONTENT, 'utf8');
  return { content: JSON.parse(raw), version: hash(raw) };
}
async function writeAtomic(file, data) {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}
async function snapshot() {
  await mkdir(HISTORY, { recursive: true });
  const raw = await readFile(CONTENT, 'utf8');
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(path.join(HISTORY, `${id}.json`), raw);
  const files = (await readdir(HISTORY)).filter((f) => f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - HISTORY_KEEP))) await unlink(path.join(HISTORY, f));
}
function validUploadPath(p) {
  return typeof p === 'string' && /^assets\/uploads\/[a-z0-9][a-z0-9._-]{0,120}$/.test(p) && IMAGE_EXT.has(path.extname(p).toLowerCase());
}
async function listImages() {
  const out = [];
  for (const dir of ['assets/img', 'assets/uploads']) {
    try {
      for (const f of await readdir(path.join(ROOT, dir))) {
        if (IMAGE_EXT.has(path.extname(f).toLowerCase())) out.push(`${dir}/${f}`);
      }
    } catch { /* folder may not exist yet */ }
  }
  return out;
}

// ---------- API ----------
async function api(req, res, route) {
  const ip = req.socket.remoteAddress || '';
  if (route === 'status' && req.method === 'GET') {
    return send(res, 200, { mode: 'server', configured: Boolean(PASSWORD), authed: Boolean(getSession(req)) });
  }
  if (route === 'login' && req.method === 'POST') {
    if (!PASSWORD) return send(res, 503, { error: 'Aucun mot de passe configuré : ajoutez CMS_PASSWORD dans le fichier .env puis relancez le serveur.' });
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    const { password = '' } = await readBody(req);
    if (!safeEqual(String(password), PASSWORD)) {
      attempts.get(ip).push(Date.now());
      return send(res, 401, { error: 'Mot de passe incorrect.' });
    }
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    const cookie = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${isSecure(req) ? '; Secure' : ''}`;
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }
  if (route === 'logout' && req.method === 'POST') {
    const t = getSession(req); if (t) sessions.delete(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${cookieName}=; Path=/; Max-Age=0` });
  }

  if (!getSession(req)) return send(res, 401, { error: 'Session expirée, reconnectez-vous.' });
  // Same-origin check for state-changing requests (defence in depth on top of SameSite cookies).
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origine refusée.' });
  }

  if (route === 'content' && req.method === 'GET') return send(res, 200, await readContent());

  if (route === 'content' && req.method === 'PUT') {
    const { content, uploads = [], baseVersion, force } = await readBody(req);
    if (!content || typeof content !== 'object') return send(res, 400, { error: 'Contenu manquant.' });
    const current = await readContent();
    if (!force && baseVersion && baseVersion !== current.version) {
      return send(res, 409, { error: 'Le contenu a été modifié ailleurs depuis que vous l\'avez ouvert.' });
    }
    await mkdir(UPLOADS, { recursive: true });
    for (const u of uploads) {
      if (!validUploadPath(u.path) || typeof u.data !== 'string') return send(res, 400, { error: `Fichier refusé : ${u.path}` });
      await writeFile(path.join(ROOT, u.path), Buffer.from(u.data, 'base64'));
    }
    await snapshot();
    const raw = `${JSON.stringify(content, null, 2)}\n`;
    await writeAtomic(CONTENT, raw);
    await writeAtomic(path.join(ROOT, 'index.html'), renderPage(content));
    return send(res, 200, { ok: true, version: hash(raw) });
  }

  if (route === 'media' && req.method === 'GET') return send(res, 200, { images: await listImages() });

  if (route === 'history' && req.method === 'GET') {
    let files = [];
    try { files = (await readdir(HISTORY)).filter((f) => f.endsWith('.json')).sort().reverse(); } catch { /* none yet */ }
    return send(res, 200, {
      versions: files.map((f) => {
        const id = f.replace(/\.json$/, '');
        const iso = id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z');
        return { id, date: iso };
      }),
    });
  }
  const m = route.match(/^history\/([\w-]+)$/);
  if (m && req.method === 'GET') {
    try { return send(res, 200, { content: JSON.parse(await readFile(path.join(HISTORY, `${m[1]}.json`), 'utf8')) }); }
    catch { return send(res, 404, { error: 'Version introuvable.' }); }
  }
  return send(res, 404, { error: 'Route inconnue.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname.startsWith('/api/')) return await api(req, res, pathname.slice(5));
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Erreur serveur.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Site : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`CMS  : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
  if (!PASSWORD) console.warn('⚠ CMS_PASSWORD non défini : créez un fichier .env (voir .env.example) pour accéder à /admin.');
});
