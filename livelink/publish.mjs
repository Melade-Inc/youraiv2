#!/usr/bin/env node
/**
 * Live.link publishing client for this project.
 *
 * Contract source: https://live.link/start.md and https://app.live.link/api/v1/openapi
 *
 * Credential handling: the token is read only from the LIVE_LINK_TOKEN secret
 * environment variable. It is never written to disk, never placed in a URL or
 * an argv entry, and never printed. Preview URLs carry single-use credentials,
 * so they are shown once and never persisted.
 *
 * Usage:
 *   node livelink/publish.mjs doctor                 # check auth + reachability
 *   node livelink/publish.mjs save                   # create/update PRIVATE draft, mint preview
 *   node livelink/publish.mjs status                 # show draft + publication pointers
 *   node livelink/publish.mjs publish --audience=public --confirm
 *   node livelink/publish.mjs revoke --confirm       # turn off reader access
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://app.live.link/api/v1';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE_DIR = join(ROOT, 'livelink', 'site');
const STATE_PATH = join(ROOT, 'livelink', '.live-link-state.json');

const TITLE = 'YourAI — Private AI Infrastructure for Law Firms';
const DESCRIPTION = 'Private AI infrastructure for law firms. Your matters, your data, your control.';
const KIND = 'app';
const SLUG = 'test-123';               // first assigned slug; preserved on every revision and restore
const ENTRYPOINT = 'index.html';

// Transport limits published in the capability document.
const MAX_FILES = 30;
const MAX_DECODED_BYTES = 3145728;
const MAX_REQUEST_BYTES = 4194304;

const MEDIA_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};
const TEXT_TYPES = new Set(['text/html', 'text/css', 'text/javascript', 'application/json', 'image/svg+xml', 'text/plain']);

class LiveLinkError extends Error {
  constructor(status, payload) {
    const e = payload?.error ?? {};
    super(e.message ? `${e.code ?? status}: ${e.message}` : `HTTP ${status}`);
    this.status = status;
    this.code = e.code ?? null;
    this.traceId = e.traceId ?? null;   // keep only the trace ID for support
    this.details = e.details ?? null;
  }
}

function token() {
  const t = process.env.LIVE_LINK_TOKEN;
  if (!t || !t.trim()) {
    throw new Error(
      'LIVE_LINK_TOKEN is not set in this environment.\n' +
      'Create a revocable credential at https://app.live.link/settings (Settings -> AI connections)\n' +
      'with scopes artifact:read, artifact:write, artifact:publish, then expose it to this\n' +
      'session as the secret environment variable LIVE_LINK_TOKEN. Do not paste it into chat,\n' +
      'a project file, or a command argument.'
    );
  }
  return t.trim();
}

async function api(method, path, body, { idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${token()}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload && Buffer.byteLength(payload, 'utf8') > MAX_REQUEST_BYTES) {
    throw new Error(`Request body ${Buffer.byteLength(payload, 'utf8')} bytes exceeds the ${MAX_REQUEST_BYTES} byte transport limit.`);
  }

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload,
    redirect: 'manual',       // never forward Authorization to a redirect target
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Refusing to follow a ${res.status} redirect: the credential must not be sent to another origin.`);
  }

  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) throw new LiveLinkError(res.status, parsed);
  return parsed;
}

/* ---------- local state: artifact + slug pointers, never credentials ---------- */

async function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(await readFile(STATE_PATH, 'utf8')); } catch { return {}; }
}
async function saveState(next) {
  await writeFile(STATE_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

/* ---------- manifest ---------- */

async function collectFiles(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;                 // no hidden files
      if (entry.name === 'node_modules') continue;              // never upload dependencies
      const full = join(current, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile()) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      const mediaType = MEDIA_TYPES[ext];
      if (!mediaType) throw new Error(`Unsupported file type for upload: ${relative(ROOT, full)}`);
      const bytes = await readFile(full);
      const isText = TEXT_TYPES.has(mediaType);
      out.push({
        path: relative(dir, full).split(sep).join(posix.sep),   // preserve relative nested paths
        mediaType,
        encoding: isText ? 'utf8' : 'base64',
        content: isText ? bytes.toString('utf8') : bytes.toString('base64'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        _decoded: bytes.length,
      });
    }
  }
  await walk(dir);
  return out;
}

async function buildManifest() {
  if (!existsSync(SITE_DIR)) throw new Error(`Missing build output directory: ${relative(ROOT, SITE_DIR)}`);
  const files = await collectFiles(SITE_DIR);
  if (!files.length) throw new Error('No files to upload.');
  if (!files.some((f) => f.path === ENTRYPOINT)) throw new Error(`Entrypoint ${ENTRYPOINT} not found in ${relative(ROOT, SITE_DIR)}.`);
  if (files.length > MAX_FILES) throw new Error(`${files.length} files exceeds the ${MAX_FILES} file limit.`);
  const decoded = files.reduce((n, f) => n + f._decoded, 0);
  if (decoded > MAX_DECODED_BYTES) throw new Error(`${decoded} decoded bytes exceeds the ${MAX_DECODED_BYTES} byte limit.`);

  return {
    manifest: {
      schemaVersion: 1,
      kind: KIND,
      title: TITLE,
      description: DESCRIPTION,
      entrypoint: ENTRYPOINT,
      files: files.map(({ _decoded, ...f }) => f),
    },
    decoded,
    count: files.length,
  };
}

/* ---------- commands ---------- */

async function doctor() {
  token();
  console.log('LIVE_LINK_TOKEN: present (value not shown)');
  const { count, decoded } = await buildManifest();
  console.log(`payload: ${count} file(s), ${decoded} decoded bytes (limits ${MAX_FILES} / ${MAX_DECODED_BYTES})`);
  const state = await loadState();
  if (state.artifactId) console.log(`artifact: ${state.artifactId}  slug: ${state.slug}`);
  else console.log('artifact: none yet (run `save`)');
  await api('GET', '/artifacts');
  console.log('credential accepted by GET /artifacts (artifact:read scope OK)');
}

/** Create or revise the PRIVATE draft, then mint a single-use preview. Never publishes. */
async function save() {
  const state = await loadState();
  const { manifest, count, decoded } = await buildManifest();

  if (!state.artifactId) {
    // Persist the idempotency key BEFORE the write so an uncertain retry reuses it.
    state.createKey ??= `create-${randomUUID()}`;
    await saveState(state);
    const { artifact } = await api('POST', '/artifacts',
      { title: TITLE, kind: KIND, idempotencyKey: state.createKey },
      { idempotencyKey: state.createKey });
    state.artifactId = artifact.id;
    state.slug ??= SLUG;                       // first assigned slug, preserved from here on
    await saveState(state);
    console.log(`created private draft artifact ${artifact.id}`);
  }

  // Concurrency: base the new version on the server's current latest draft pointer.
  const current = await api('GET', `/artifacts/${state.artifactId}`);
  const baseVersionId = current.artifact.latestVersionId ?? null;

  state.versionKey = `version-${randomUUID()}`;
  await saveState(state);

  const { artifact, version } = await api('POST', `/artifacts/${state.artifactId}/versions`,
    { manifest, baseVersionId, idempotencyKey: state.versionKey },
    { idempotencyKey: state.versionKey });

  state.latestVersionId = version.id;
  state.latestVersionNumber = version.number;
  state.slug ??= SLUG;
  delete state.versionKey;
  await saveState(state);

  console.log(`saved private version #${version.number} (${version.id}) — ${count} file(s), ${decoded} bytes`);
  console.log(`published: ${artifact.publication ? artifact.publication.url : 'not published (draft is private)'}`);

  const { url } = await api('POST', `/artifacts/${state.artifactId}/preview`, { versionId: version.id });
  console.log('\nPrivate preview (single-use, not saved to disk):');
  console.log(url);
  return url;
}

/** Publish an already-reviewed version. Requires --confirm and an explicit audience. */
async function publish(args) {
  const audience = (args.audience ?? '').trim();
  if (!['owner', 'recipients', 'public'].includes(audience)) {
    throw new Error('Pass --audience=owner|recipients|public (an explicit audience is required).');
  }
  if (!args.confirm) throw new Error('Refusing to publish without --confirm.');

  const recipients = audience === 'recipients'
    ? String(args.recipients ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (audience === 'recipients' && !recipients.length) {
    throw new Error('audience=recipients requires --recipients=a@example.com,b@example.com');
  }

  const state = await loadState();
  if (!state.artifactId) throw new Error('No draft yet. Run `save` first.');

  const current = await api('GET', `/artifacts/${state.artifactId}`);
  const versionId = args.version ?? current.artifact.latestVersionId;
  if (!versionId) throw new Error('No saved version to publish.');

  // A revoked or expired pointer still counts for the concurrency check.
  const expectedPublishedVersionId = current.artifact.publication?.versionId ?? null;
  const slug = state.slug ?? current.artifact.publication?.slug ?? SLUG;

  const { artifact, publication } = await api('POST', `/artifacts/${state.artifactId}/publish`, {
    versionId, slug, audience, recipients, expiresAt: null, expectedPublishedVersionId,
  });

  state.slug = publication.slug;                 // lock the slug for all later revisions/restores
  state.publishedVersionId = publication.versionId;
  state.publicationUrl = publication.url;
  await saveState(state);

  console.log(`published version ${publication.versionId} to audience "${publication.audience}"`);
  console.log(publication.url);
  if (artifact.latestVersionId !== publication.versionId) {
    console.log(`note: draft #latest (${artifact.latestVersionId}) is newer than what is live.`);
  }
  return publication.url;
}

async function status() {
  const state = await loadState();
  if (!state.artifactId) { console.log('No draft yet. Run `save`.'); return; }
  const { artifact, versions } = await api('GET', `/artifacts/${state.artifactId}`);
  console.log(`artifact ${artifact.id} — "${artifact.title}" (${artifact.kind})`);
  console.log(`latest draft version: ${artifact.latestVersionId ?? 'none'}  (${versions.length} saved)`);
  if (artifact.publication) {
    const p = artifact.publication;
    console.log(`live: ${p.url}`);
    console.log(`  slug=${p.slug} audience=${p.audience} version=${p.versionId} revokedAt=${p.revokedAt ?? 'null'} expiresAt=${p.expiresAt ?? 'null'}`);
  } else {
    console.log('live: not published (draft is private)');
  }
}

async function revoke(args) {
  if (!args.confirm) throw new Error('Refusing to revoke reader access without --confirm.');
  const state = await loadState();
  if (!state.artifactId) throw new Error('No artifact to revoke.');
  await api('POST', `/artifacts/${state.artifactId}/revoke`, {});
  console.log('reader access turned off; the slug stays reserved for a later restore.');
}

/* ---------- entry ---------- */

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const commands = { doctor, save, status, publish, revoke };

if (!cmd || !commands[cmd]) {
  console.error(`Usage: node livelink/publish.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}

try {
  await commands[cmd](args);
} catch (err) {
  if (err instanceof LiveLinkError) {
    console.error(`\nLive.link API error (HTTP ${err.status})`);
    console.error(`  code:    ${err.code}`);
    console.error(`  message: ${err.message}`);
    if (err.traceId) console.error(`  traceId: ${err.traceId}`);
    if (err.status === 401 || err.status === 403) console.error('  fix: reconnect the credential or grant the missing scope.');
    if (err.status === 409) console.error('  fix: run `status` and inspect the draft/live pointers before retrying; do not overwrite concurrent work.');
    if (err.status === 413) console.error('  fix: shrink the payload below the transport limits.');
    if (err.status === 429 || err.status === 503) console.error('  fix: wait and retry with the same idempotency key.');
  } else {
    console.error(`\n${err.message}`);
  }
  process.exit(1);
}
