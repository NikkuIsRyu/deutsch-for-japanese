# Deutsch üben (ドイツ語練習)

A small static PWA for Japanese speakers learning German (A2 to B2), built mainly for iPhones. The UI is Japanese, the target language is German. No accounts, no backend, no runtime AI: progress lives in the browser (`localStorage`) and can be exported/imported.

Modes: spaced-repetition review (a port of the scheduler from the Android Knowledge Vault app), word-order building, typing, cloze (articles/prepositions), a sentence browser and short grammar notes.

## Commands

```bash
npm ci
npm run dev        # dev server (base path applies, e.g. http://localhost:4321/deutsch-for-japanese/)
npm test           # node:test, runs tests/*.test.ts and tests/*.test.mjs
npm run build      # build-content (sentences.json) + astro build -> dist/
npm run preview    # serve dist/
npm run icons      # regenerate public/icons/*.png from public/icon.svg (sharp)
```

Requires Node 22+ for the build; `npm test` imports `.ts` files directly and needs a Node with native type stripping (Node 24+ locally; CI runs 22.18+ where it is on by default).

## Data flow

- `content/source/*` and `content/review/fixes.json` -> `scripts/build-content.mjs` -> `src/data/sentences.json` (+ `content-manifest.json`).
- `src/data/grammar.json` is hand-written (Japanese, status `draft`).
- Client scripts (`src/client/*`) import both JSON files; Vite puts them in one shared, cacheable chunk. Pure logic is in `src/lib/*` (SRS, grading, cloze, storage, speech, shuffle) and is unit tested.
- Progress keys in `localStorage` are namespaced `dfj:v1:`. Settings, cards, daily counters and activity are exported as one JSON document (`schema: 1`).

## URLs and base path

Every link goes through `import.meta.env.BASE_URL`. The base is read from the environment at build time:

| Variable | Default |
| :-- | :-- |
| `SITE_URL` | `https://nikkuisryu.github.io` |
| `BASE_PATH` | `/deutsch-for-japanese` |

The web manifest uses relative URLs, so it follows the base automatically.

## Switching to the custom domain

1. DNS: add a `CNAME` record `deutsch` -> `nikkuisryu.github.io` for `nikku.tech`.
2. Repo settings -> Pages -> Custom domain: `deutsch.nikku.tech` (enable HTTPS once the certificate is ready).
3. Repo settings -> Secrets and variables -> Actions -> Variables: set `SITE_URL=https://deutsch.nikku.tech` and `BASE_PATH=/`.
4. Re-run the "Deploy to GitHub Pages" workflow. Local check: `BASE_PATH=/ SITE_URL=https://deutsch.nikku.tech npx astro build`.

Installed Home-Screen apps are tied to the old origin; friends need to add the new URL again and import their exported progress.

## Analytics (Umami, optional)

No analytics script is included unless `PUBLIC_UMAMI_WEBSITE_ID` is set at build time.

1. In Umami, create a new website for this app and copy its website ID.
2. Repo variable `UMAMI_WEBSITE_ID` = that ID. Optional: `UMAMI_SRC` = your script URL (default `https://cloud.umami.is/script.js`).
3. Redeploy.

Only page views and two events are sent: `mode_start` and `session_done` with `{mode, level}`. Sentence text and typed answers are never sent. Every page carries `noindex`.

## Service worker and kill switch

`public/sw.js` precaches the pages and hashed assets listed in `sw-manifest.json` (written after each build, which also stamps a content hash into the worker so each deploy gets its own cache). HTML is network-first, assets cache-first. It is registered only in production builds, with scope = base path.

If a broken worker ever ships: edit `public/sw-kill.json` to `{ "kill": true }` and deploy. On the next visit (page load or worker update check) the worker deletes its caches and unregisters itself. Set it back to `false` afterwards.
