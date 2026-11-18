/**
 * Pushing a native/ folder to a NativeScript Edge project. Shared by the build
 * plugin and scripts/native.mjs.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_SERVER = 'https://preview.nativescript.org';

/** Root files a NativeScript project keeps beside app/; the edge stores them but devices never load them. */
const PROJECT_FILES = ['package.json', 'tsconfig.json', 'nativescript.config.ts', 'vite.config.ts', 'vite.config.mts', 'references.d.ts', '.gitignore'];
const SKIP = new Set(['node_modules', 'platforms', 'hooks', 'App_Resources', '.ns-vite-build', 'dev']);

/**
 * native/'s files as the edge stores them: root project files and app/**,
 * following symlinks so a linked shared/ folder lands under app/.
 */
export async function collect(nativeDir) {
  const files = [];
  for (const name of PROJECT_FILES) {
    const content = await readFile(join(nativeDir, name), 'utf8').catch(() => null);
    if (content !== null) files.push({ path: name, content });
  }
  const walk = async (rel) => {
    for (const entry of await readdir(join(nativeDir, rel))) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue;
      const child = `${rel}/${entry}`;
      const info = await stat(join(nativeDir, child));
      if (info.isDirectory()) await walk(child);
      else files.push({ path: child, content: await readFile(join(nativeDir, child), 'utf8') });
    }
  };
  await walk('app');
  return files;
}

/** app/config.ts, pointing the app at the deploy it was built with. */
export function configModule({ apiBase, context, commit = '', branch = '', deployId = '' }) {
  return [
    '// Written by the nativescript-edge build plugin for each deploy.',
    `export const API_BASE = ${JSON.stringify(apiBase)};`,
    `export const DEPLOY = ${JSON.stringify({ context, commit, branch, deployId })};`,
    '',
  ].join('\n');
}

export async function createProject(server, token, template) {
  const res = await fetch(`${server}/api/projects?template=${encodeURIComponent(template)}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`NativeScript Edge didn't create a project (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const { id, writeKey, deviceKey, pair } = await res.json();
  return { server, id, writeKey, deviceKey, pair, template };
}

export async function projectExists(ref) {
  const res = await fetch(`${ref.server}/p/${ref.id}/files`).catch(() => null);
  return res?.ok === true;
}

/**
 * Makes the project's files match `files`: one atomic batch, with every
 * app/ file the edge has that isn't in `files` deleted.
 */
export async function sync(ref, files) {
  const remote = await (await fetch(`${ref.server}/p/${ref.id}/files`)).json();
  const keep = new Set(files.map((f) => f.path));
  const removed = remote.map((f) => f.path).filter((p) => p.startsWith('app/') && !keep.has(p)).map((path) => ({ path, content: null }));
  const res = await fetch(`${ref.server}/p/${ref.id}/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ref.writeKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ changes: [...files, ...removed] }),
  });
  if (!res.ok) throw new Error(`NativeScript Edge refused the files (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const { diagnostics = [], warnings = [] } = await res.json();
  return { diagnostics, warnings, uploaded: files.length, removed: removed.length };
}

export async function setDetails(ref, details) {
  await fetch(`${ref.server}/p/${ref.id}/details`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${ref.writeKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(details),
  }).catch(() => {});
}

export const deviceLink = (ref) => `${ref.server}/p/${ref.id}#${ref.deviceKey}`;
export const editorLink = (ref) => `${ref.server}/p/${ref.id}/#key=${ref.writeKey}`;
export const pairUrl = (ref) => ref.pair ?? `nspreview://pair?url=${encodeURIComponent(deviceLink(ref))}`;
