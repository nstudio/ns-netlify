# Field Notes: one Netlify app, on the web and native on phones

Capture notes in the field on your phone, with the photo, the place, the direction you faced and the words in the picture, and explore them on the web on a map, searchable and shareable. One Netlify project runs it all:

| Piece | Netlify | Lives in |
| --- | --- | --- |
| Logins | Netlify Identity (email and password over its REST endpoints, so phones need no browser) | `shared/auth.ts` |
| Notes | Netlify Database (Postgres, a branch per deploy preview, migrations on deploy) | `netlify/database/migrations/` |
| Photos | Netlify Blobs | `netlify/server/` |
| API and live updates | Netlify Server (`/api/*`, WebSockets fanned out with Postgres `LISTEN/NOTIFY`) | `netlify/server/` |
| Share pages | Netlify Server (`/n/:id`, server-rendered with Open Graph cards) | `netlify/server/` |
| Web app | Static Vite + React, served from the CDN | `web/` |
| Phone app | NativeScript, React driving real iOS and Android views, served from NativeScript Edge into NativeScript Preview | `native/` |
| Native previews | A build plugin: every deploy, deploy previews included, gets its own phone app from the same commit, talking to that deploy's backend, with a QR code on the preview | `plugins/nativescript-edge/` |

## Layout

```
shared/          types, API and Identity clients, live socket, formatting, React hooks, design tokens
                 (no DOM, Node or NativeScript APIs: the web app, the phone app and the server all import it)
netlify/server/  the API (Netlify Server); imports only shared/types.ts and shared/format.ts
netlify/database/migrations/
web/             the web app
native/          the phone app; native/app/shared is a symlink to ../../shared
plugins/nativescript-edge/  the Netlify build plugin
scripts/native.mjs          sync native/app (and shared/) to a NativeScript Edge project while you work
```

## The phone app runs from the edge

`native/` is a NativeScript Edge project (`react` template): devices load its modules over HTTP from NativeScript Edge and hot-reload as files change. The build plugin pushes `native/app` with `shared/` and a generated `app/config.ts` (the deploy's URL) to an edge project per branch, then:

- adds an "Open on your phone" button with a QR code to every page of deploy previews and branch deploys (not production),
- adds the QR link and the project's editor link to the deploy summary in the Netlify UI.

Scanning the code opens the app in NativeScript Preview from the App Store or Google Play. Push another commit and phones that scanned it update in place.

## Develop

```sh
npm install
netlify dev                 # web app, server and a local Postgres
npm run native -- watch     # mirror native/app and shared/ to your edge project; scan its QR once
```

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `NS_EDGE_CREATE_TOKEN` | Netlify env (secret, builds) | lets the build plugin create edge projects |
| `NS_EDGE_SERVER` | optional | defaults to `https://preview.nativescript.org` |
