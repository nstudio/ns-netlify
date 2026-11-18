// Mirrors native/ (with shared/) to your NativeScript Edge project while you work.
//   npm run native -- create [--token <create token>]   make an edge project, saved to native/.ns-edge.json
//   npm run native -- push                             upload once
//   npm run native -- watch                            upload, then on every save
//   npm run native -- qr                               print the pairing QR code
import { watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { collect, createProject, DEFAULT_SERVER, deviceLink, editorLink, pairUrl, sync } from '../plugins/nativescript-edge/edge.js';

const root = join(import.meta.dirname, '..');
const nativeDir = join(root, 'native');
const configFile = join(nativeDir, '.ns-edge.json');
const [command = 'watch', ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

async function loadRef() {
  try {
    return JSON.parse(await readFile(configFile, 'utf8'));
  } catch {
    throw new Error('No native/.ns-edge.json yet: run `npm run native -- create` first.');
  }
}

async function push(ref) {
  const { diagnostics, warnings, uploaded, removed } = await sync(ref, await collect(nativeDir));
  const stamp = new Date().toTimeString().slice(0, 8);
  if (diagnostics.length) {
    console.log(`${stamp} ✖ held back, phones keep the last good version:`);
    for (const d of diagnostics) console.log(`    ${d.error}`);
  } else {
    console.log(`${stamp} ✓ ${uploaded} files${removed ? `, ${removed} removed` : ''}`);
  }
  for (const w of warnings) console.log(`    warning: ${w.message}`);
}

async function printPairing(ref) {
  console.log(await QRCode.toString(pairUrl(ref), { type: 'terminal', small: true }));
  console.log(`Scan with your phone's camera to open it in NativeScript Preview.\n  device  ${deviceLink(ref)}\n  editor  ${editorLink(ref)}\n`);
}

const commands = {
  async create() {
    const ref = await createProject((process.env.NS_EDGE_SERVER ?? DEFAULT_SERVER).replace(/\/$/, ''), flag('token') ?? process.env.NS_EDGE_CREATE_TOKEN, 'react');
    await writeFile(configFile, JSON.stringify(ref, null, 2) + '\n');
    console.log(`Created edge project ${ref.id}, saved to native/.ns-edge.json (it holds the keys; it's gitignored).`);
    await push(ref);
    await printPairing(ref);
  },
  async push() {
    await push(await loadRef());
  },
  async qr() {
    await printPairing(await loadRef());
  },
  async watch() {
    const ref = await loadRef();
    await printPairing(ref);
    await push(ref);
    let timer;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void push(ref).catch((e) => console.error(`  ✖ ${e.message}`)), 150);
    };
    for (const dir of [join(nativeDir, 'app'), join(root, 'shared')]) watch(dir, { recursive: true }, changed);
    console.log('Watching native/app and shared/ …');
  },
};

if (!commands[command]) {
  console.error(`Unknown command '${command}'. Use create, push, watch or qr.`);
  process.exit(1);
}
await commands[command]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
