/**
 * The "Open on your phone" button deploy previews get: a self-contained
 * snippet in a shadow root, so the site's CSS and the button's can't clash.
 */

const STORES = {
  ios: 'https://apps.apple.com/app/nativescript-preview/id1264484702',
  android: 'https://play.google.com/store/apps/details?id=org.nativescript.preview.android',
};

export function badgeSnippet({ qrSvg, pairUrl, commit, context }) {
  const data = JSON.stringify({ qrSvg, pairUrl, commit: commit.slice(0, 7), context, stores: STORES }).replace(/</g, '\\u003c');
  return `<script data-nativescript-edge>(() => {
  const d = ${data};
  if (document.querySelector('nativescript-edge-badge')) return;
  const host = document.createElement('nativescript-edge-badge');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = \`<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, sans-serif; }
    .btn { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; display: flex; align-items: center; gap: 9px; padding: 11px 16px 11px 13px; border: 0; border-radius: 999px; background: #0d1117; color: #f4f7fb; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 10px 30px rgba(13,17,23,.28), 0 0 0 1px rgba(255,255,255,.08) inset; transition: transform .15s ease; }
    .btn:hover { transform: translateY(-1px); }
    .btn:focus-visible, .x:focus-visible, a:focus-visible { outline: 2px solid #32e6e2; outline-offset: 2px; }
    .dot { width: 22px; height: 22px; border-radius: 7px; background: #3a53ff; display: grid; place-items: center; }
    .panel { position: fixed; right: 18px; bottom: 76px; z-index: 2147483000; width: 296px; padding: 20px; border-radius: 20px; background: #fff; color: #14171c; box-shadow: 0 24px 60px rgba(13,17,23,.3), 0 0 0 1px #e4e0d6; display: none; }
    .panel.open { display: block; animation: rise .18s ease-out; }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
    h2 { margin: 0 0 4px; font-size: 17px; letter-spacing: -.01em; }
    p { margin: 0; font-size: 13px; line-height: 1.45; color: #5b6370; }
    .qr { margin: 14px 0; padding: 12px; border-radius: 14px; background: #f7f5f0; }
    .qr svg { display: block; width: 100%; height: auto; }
    .links { display: flex; gap: 8px; margin-top: 12px; }
    .links a { flex: 1; text-align: center; padding: 8px 0; border-radius: 10px; background: #f0eee8; color: #14171c; font-size: 12px; font-weight: 600; text-decoration: none; }
    .open-link { display: block; margin-top: 10px; text-align: center; font-size: 12px; color: #05bdba; font-weight: 600; text-decoration: none; }
    .meta { margin-top: 12px; font-size: 11px; color: #8a919c; }
    .x { position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border: 0; border-radius: 8px; background: #f0eee8; color: #5b6370; cursor: pointer; font-size: 15px; line-height: 1; }
  </style>
  <button class="btn" aria-expanded="false" aria-controls="p"><span class="dot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg></span>Open on your phone</button>
  <div class="panel" id="p" role="dialog" aria-label="Open this deploy on your phone">
    <button class="x" aria-label="Close">×</button>
    <h2>This deploy, native</h2>
    <p>Scan with your phone's camera to run this deploy's native app in NativeScript Preview. It talks to this deploy's backend, and updates when the branch does.</p>
    <div class="qr">\${d.qrSvg}</div>
    <div class="links"><a href="\${d.stores.ios}" target="_blank" rel="noopener">App Store</a><a href="\${d.stores.android}" target="_blank" rel="noopener">Google Play</a></div>
    <a class="open-link" href="\${d.pairUrl}">On this phone? Open in NativeScript Preview</a>
    <div class="meta">\${d.context} · \${d.commit} · NativeScript Edge</div>
  </div>\`;
  const btn = root.querySelector('.btn');
  const panel = root.querySelector('.panel');
  const toggle = (open) => { panel.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => toggle(!panel.classList.contains('open')));
  root.querySelector('.x').addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));
  (document.body ?? document.documentElement).appendChild(host);
})();</script>`;
}
