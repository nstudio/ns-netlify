import { altitude, coordinates, heading, relativeTime, titleFrom } from '../../shared/format.ts';
import { APP_NAME, TAGLINE, tokens } from '../../shared/tokens.ts';
import type { Note, Platform } from '../../shared/types.ts';

const { color, font, radius } = tokens;

const PLATFORM_NAMES: Record<Platform, string> = { ios: 'iPhone', android: 'Android', web: 'the web' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const e = escapeHtml;

/** Blank-line separated paragraphs; single newlines become line breaks. */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${e(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function excerpt(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function renderSharedNote(note: Note, origin: string): string {
  const title = note.title || titleFrom(note.body || note.recognizedText || note.transcript || '') || 'A field note';
  const pageUrl = `${origin}/n/${note.shareId ?? ''}`;
  const imageUrl = note.photo ? `${origin}${note.photo.url}` : null;
  const description =
    excerpt(note.body || note.recognizedText || note.transcript || '') ||
    (note.place?.name ? `Noted at ${note.place.name}` : `A note captured on ${PLATFORM_NAMES[note.capturedOn]}`);

  const meta = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${e(APP_NAME)}">`,
    `<meta property="og:title" content="${e(title)}">`,
    `<meta property="og:description" content="${e(description)}">`,
    `<meta property="og:url" content="${e(pageUrl)}">`,
    `<meta name="description" content="${e(description)}">`,
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${e(title)}">`,
    `<meta name="twitter:description" content="${e(description)}">`,
  ];
  if (imageUrl && note.photo) {
    meta.push(
      `<meta property="og:image" content="${e(imageUrl)}">`,
      `<meta property="og:image:type" content="image/jpeg">`,
      `<meta property="og:image:width" content="${note.photo.width}">`,
      `<meta property="og:image:height" content="${note.photo.height}">`,
      `<meta property="og:image:alt" content="${e(title)}">`,
      `<meta name="twitter:image" content="${e(imageUrl)}">`,
    );
  }

  const photo = note.photo
    ? `<figure class="photo"><img src="${e(note.photo.url)}" width="${note.photo.width}" height="${note.photo.height}" alt="${e(title)}"></figure>`
    : '';

  const place = note.place;
  const facts: string[] = [];
  if (place) {
    const osm = `https://www.openstreetmap.org/?mlat=${place.lat.toFixed(6)}&mlon=${place.lng.toFixed(6)}#map=16/${place.lat.toFixed(5)}/${place.lng.toFixed(5)}`;
    facts.push(
      `<div class="fact place"><span class="label">Place</span><a href="${e(osm)}" rel="noopener">` +
        (place.name ? `<strong>${e(place.name)}</strong>` : '') +
        `<span class="coords">${e(coordinates(place))}</span></a></div>`,
    );
    if (place.heading != null) {
      facts.push(
        `<div class="fact"><span class="label">Facing</span><span class="value"><span class="arrow" style="transform:rotate(${Math.round(place.heading)}deg)" aria-hidden="true">↑</span>${e(heading(place.heading))}</span></div>`,
      );
    }
    if (place.altitude != null) {
      facts.push(`<div class="fact"><span class="label">Altitude</span><span class="value">${e(altitude(place.altitude))}</span></div>`);
    }
  }
  if (note.device) facts.push(`<div class="fact"><span class="label">Device</span><span class="value">${e(note.device)}</span></div>`);

  const tags = note.tags.length
    ? `<ul class="tags">${note.tags.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`
    : '';
  const recognized = note.recognizedText
    ? `<section class="quiet"><h2>Text in the photo</h2><div>${paragraphs(note.recognizedText)}</div></section>`
    : '';
  const transcript = note.transcript
    ? `<section class="quiet"><h2>Voice note</h2><div>${paragraphs(note.transcript)}</div></section>`
    : '';

  const captured = `Captured on ${PLATFORM_NAMES[note.capturedOn]} · <time datetime="${e(note.createdAt)}">${e(relativeTime(note.createdAt))}</time>`;

  return page({
    title: `${title} · ${APP_NAME}`,
    head: meta.join('\n    '),
    body: `
    <article class="note">
      ${photo}
      <div class="sheet">
        <p class="captured${note.capturedOn === 'web' ? '' : ' native'}"><span class="dot" aria-hidden="true"></span>${captured}</p>
        <h1>${e(title)}</h1>
        ${note.body.trim() ? `<div class="body">${paragraphs(note.body)}</div>` : ''}
        ${tags}
        ${facts.length ? `<div class="facts">${facts.join('\n')}</div>` : ''}
        ${recognized}
        ${transcript}
      </div>
    </article>`,
  });
}

export function renderNotFound(): string {
  return page({
    title: `Not found · ${APP_NAME}`,
    head: '<meta name="robots" content="noindex">',
    body: `
    <article class="note missing">
      <div class="sheet">
        <p class="captured"><span class="dot" aria-hidden="true"></span>404</p>
        <h1>This note isn’t shared</h1>
        <div class="body"><p>The link may have been turned off by the person who shared it, or the note was deleted.</p></div>
        <p><a class="button" href="/">Open ${e(APP_NAME)}</a></p>
      </div>
    </article>`,
  });
}

function page({ title, head, body }: { title: string; head: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${e(title)}</title>
    <meta name="theme-color" content="${color.paper}">
    ${head}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Inter:wght@400;500;600&display=swap">
    <style>${STYLES}</style>
  </head>
  <body>
    <header class="top">
      <a class="brand" href="/"><span class="mark" aria-hidden="true"></span>${e(APP_NAME)}</a>
    </header>
    <main>${body}
    </main>
    <footer>
      <p><strong>${e(APP_NAME)}</strong> — built on <a href="https://www.netlify.com" rel="noopener">Netlify</a>, native on phones with <a href="https://nativescript.org" rel="noopener">NativeScript</a></p>
      <p class="tagline">${e(TAGLINE)}</p>
    </footer>
  </body>
</html>`;
}

const STYLES = `
:root {
  --accent: ${color.accent};
  --native: ${color.native};
  --ink: ${color.ink};
  --paper: ${color.paper};
  --card: ${color.card};
  --line: ${color.line};
  --text: ${color.text};
  --soft: ${color.textSoft};
  --display: ${font.display};
  --sans: ${font.body};
  --mono: ${font.mono};
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--text);
  font: 400 17px/1.6 var(--sans);
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.top, main, footer { width: 100%; max-width: 760px; margin: 0 auto; padding: 0 20px; }
.top { padding-top: 22px; padding-bottom: 18px; }
.brand {
  display: inline-flex; align-items: center; gap: 10px;
  font: 650 19px/1 var(--display); letter-spacing: -0.01em; text-decoration: none; color: var(--ink);
}
.mark {
  width: 22px; height: 22px; border-radius: 7px; background: var(--accent);
  box-shadow: inset 0 0 0 5px var(--card), inset 0 0 0 7px var(--accent);
}
.note {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: ${radius.card}px;
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(13, 17, 23, 0.04), 0 18px 40px -24px rgba(13, 17, 23, 0.25);
}
.photo { margin: 0; background: var(--ink); }
.photo img { display: block; width: 100%; height: auto; max-height: 78vh; object-fit: contain; }
.sheet { padding: 26px 28px 30px; }
.captured {
  display: flex; align-items: center; gap: 8px; margin: 0 0 10px;
  font-size: 13px; font-weight: 500; letter-spacing: 0.02em; color: var(--soft);
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
.captured.native .dot { background: var(--native); }
h1 {
  margin: 0 0 14px;
  font: 650 clamp(30px, 6vw, 44px)/1.08 var(--display);
  letter-spacing: -0.02em; color: var(--ink);
  overflow-wrap: anywhere;
}
.body p { margin: 0 0 14px; overflow-wrap: anywhere; }
.tags { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; padding: 0; }
.tags li {
  padding: 3px 12px; border-radius: ${radius.chip}px; background: var(--paper); border: 1px solid var(--line);
  font-size: 13px; font-weight: 500; color: var(--soft);
}
.tags li::before { content: "#"; color: var(--accent); margin-right: 1px; }
.facts {
  display: flex; flex-wrap: wrap; gap: 1px;
  margin: 24px 0 0; background: var(--line); border: 1px solid var(--line); border-radius: ${radius.photo}px; overflow: hidden;
}
.fact { flex: 1 1 150px; background: var(--card); padding: 12px 14px; min-width: 0; }
.fact.place { flex-basis: 100%; }
.label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--soft); margin-bottom: 3px; }
.value { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; }
.place a { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; text-decoration: none; }
.place a:hover strong, .place a:hover .coords { text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 3px; }
.place strong { font-weight: 600; color: var(--ink); }
.coords { font: 500 14px/1.4 var(--mono); color: var(--soft); }
.arrow { display: inline-block; color: var(--accent); font-weight: 700; }
.quiet { margin: 24px 0 0; padding: 16px 18px; border-radius: ${radius.photo}px; background: var(--paper); color: var(--soft); }
.quiet h2 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.quiet p { margin: 0 0 8px; font-size: 15px; white-space: normal; overflow-wrap: anywhere; }
.quiet p:last-child { margin-bottom: 0; }
.button {
  display: inline-block; margin-top: 8px; padding: 10px 18px; border-radius: ${radius.chip}px;
  background: var(--ink); color: var(--paper); text-decoration: none; font-weight: 600; font-size: 15px;
}
.button:hover { background: var(--accent); color: var(--ink); }
footer { padding-top: 28px; padding-bottom: 40px; color: var(--soft); font-size: 14px; text-align: center; }
footer p { margin: 0 0 4px; }
footer strong { font-family: var(--display); font-weight: 650; color: var(--ink); }
footer a { text-decoration-color: var(--accent); text-underline-offset: 3px; }
.tagline { font-size: 13px; }
@media (max-width: 520px) {
  .top, main, footer { padding-left: 16px; padding-right: 16px; }
  .sheet { padding: 20px 18px 22px; }
  body { font-size: 16px; }
}
`;
