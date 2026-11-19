/**
 * Netlify build plugin: every deploy gets the phone app from the same commit,
 * served by NativeScript Edge and pointed at that deploy's backend.
 *
 * One edge project per branch (and one for production) keeps its pairing
 * across deploys, so a phone that scanned a deploy preview's code updates
 * in place when the branch is pushed again. The projects' keys live in a
 * Netlify Blobs store of the site.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { dirname, join } from 'node:path';
import { getStore } from '@netlify/blobs';
import QRCode from 'qrcode';
import { badgeSnippet } from './badge.js';
import { collect, configModule, createProject, DEFAULT_SERVER, deviceLink, editorLink, pairUrl, projectExists, setDetails, sync } from './edge.js';

export const onPostBuild = async ({ constants, inputs, utils }) => {
  const env = process.env;
  const context = env.CONTEXT ?? 'dev';
  // A pull request builds BRANCH `pull/<n>/head`; HEAD is the branch's own name.
  const branch = env.HEAD ?? env.BRANCH ?? 'local';
  const commit = env.COMMIT_REF ?? '';
  const apiBase = (context === 'production' ? env.URL : env.DEPLOY_PRIME_URL) ?? env.URL;
  const server = (env.NS_EDGE_SERVER ?? DEFAULT_SERVER).replace(/\/$/, '');
  if (!apiBase) return utils.build.failPlugin('nativescript-edge: no deploy URL in the build environment (URL / DEPLOY_PRIME_URL).');

  const store = await projectStore(constants, utils);
  const key = context === 'production' ? 'production' : `branch/${branch}`;

  try {
    let ref = await store.get(key);
    if (ref && (ref.server !== server || !(await projectExists(ref)))) ref = null;
    if (!ref) {
      ref = await createProject(server, await createToken(env), inputs.template);
      await store.set(key, ref);
      console.log(`nativescript-edge: created edge project ${ref.id} for ${key}`);
    }

    const files = await collect(join(process.cwd(), inputs.nativeDir));
    const config = configModule({ apiBase, context, commit, branch, deployId: env.DEPLOY_ID ?? '' });
    const changes = [...files.filter((f) => f.path !== 'app/config.ts'), { path: 'app/config.ts', content: config }];
    const result = await sync(ref, changes);
    await setDetails(ref, {
      title: context === 'production' ? 'Field Notes' : `Field Notes · ${branch}`,
      description: `${env.SITE_NAME ?? 'Netlify site'} ${context} ${commit.slice(0, 7)}, backed by ${apiBase}`,
    });

    const pair = pairUrl(ref);
    const qrSvg = await QRCode.toString(pair, { type: 'svg', margin: 0, color: { dark: '#0d1117', light: '#0000' } });
    const manifest = { deviceLink: deviceLink(ref), pairUrl: pair, qrSvg, context, commit, apiBase };
    await writeFile(join(constants.PUBLISH_DIR, 'native.json'), JSON.stringify(manifest));

    const badged = inputs.badgeContexts.includes(context) ? await injectBadge(constants.PUBLISH_DIR, badgeSnippet({ qrSvg, pairUrl: pair, commit, context })) : 0;

    const problems = result.diagnostics.map((d) => `- ${d.error}`).join('\n');
    utils.status.show({
      title: result.diagnostics.length ? 'Native app held back: fix the errors below' : 'Native app ready: open this deploy on a phone',
      summary: [
        result.diagnostics.length
          ? `The phone app from this commit has ${result.diagnostics.length} error${result.diagnostics.length === 1 ? '' : 's'}; phones keep running the last good version.`
          : `Scan the QR code on ${badged ? 'any page of this deploy' : 'the site'} with a phone's camera to open the native app in NativeScript Preview. It talks to ${apiBase}.`,
        `Device link: ${manifest.deviceLink}`,
        inputs.editorLink ? `Edit it live, with an agent on a real phone: ${editorLink(ref)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      text: [problems, result.warnings.map((w) => `warning: ${w.message}`).join('\n')].filter(Boolean).join('\n\n') || undefined,
    });
    console.log(`nativescript-edge: ${result.uploaded} files to ${ref.id} (${result.removed} removed), ${result.diagnostics.length} errors, badge on ${badged} pages`);
  } catch (e) {
    // The web deploy shouldn't fail because the native preview couldn't be made.
    utils.build.failPlugin(`nativescript-edge: ${e.message}`, { error: e });
  }
};

/**
 * The edge create token. A local `netlify deploy --build` loads the site's
 * variables but can't read secret values, so local builds name a dotenv
 * file holding it with NS_EDGE_ENV_FILE instead.
 */
async function createToken(env) {
  if (env.NS_EDGE_ENV_FILE) {
    const token = parseEnv(await readFile(env.NS_EDGE_ENV_FILE, 'utf8')).NS_EDGE_CREATE_TOKEN;
    if (token) return token;
  }
  return env.NS_EDGE_CREATE_TOKEN;
}

/**
 * Edge project keys by deploy key. Builds keep them in the build cache, which
 * every build of the site restores; the site's Blobs store also holds them
 * when the build may write it (CLI deploys), and is read first. Git builds
 * may only write deploy-scoped stores.
 */
async function projectStore(constants, utils) {
  const file = join(process.cwd(), '.netlify', 'nativescript-edge', 'projects.json');
  await utils.cache.restore(file).catch(() => {});
  const blobs =
    constants.SITE_ID && constants.NETLIFY_API_TOKEN
      ? getStore({ name: 'nativescript-edge', siteID: constants.SITE_ID, token: constants.NETLIFY_API_TOKEN, consistency: 'strong' })
      : null;
  const read = async () => JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
  return {
    get: async (k) => (blobs ? await blobs.get(k, { type: 'json' }).catch(() => null) : null) ?? (await read())[k] ?? null,
    set: async (k, v) => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ ...(await read()), [k]: v }, null, 2));
      await utils.cache.save(file).catch(() => {});
      await blobs?.setJSON(k, v).catch(() => {});
    },
  };
}

async function injectBadge(dir, snippet) {
  let count = 0;
  const walk = async (rel) => {
    for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
      const child = join(rel, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(join(dir, child), 'utf8');
        if (html.includes('data-nativescript-edge')) continue;
        const at = html.lastIndexOf('</body>');
        await writeFile(join(dir, child), at >= 0 ? html.slice(0, at) + snippet + html.slice(at) : html + snippet);
        count++;
      }
    }
  };
  await walk('');
  return count;
}
