# OJS Image Pipeline

All OJS image loading flows through two files. Do not add a third.

## Root cause (fixed)

OJS is installed at `submitmanager.com/ojs` but serves public files from the
document root: `submitmanager.com/public/…`. Old syncs wrote
`submitmanager.com/ojs/public/…` into the database, causing 500 errors.
Additionally, `submitmanager.com` blocks server-side HTTP fetches (WAF / hotlink
protection), so `next/image` with `unoptimized: true` was fetching directly
without a browser User-Agent and silently failing.

## The two canonical files

| Responsibility | File |
|---|---|
| Filename parsing + URL construction | `src/features/ojs/utils/ojs-asset-url.ts` |
| Rendering (proxied `<img>` with error fallback) | `src/features/ojs/components/ojs-image.tsx` |

### `ojs-asset-url.ts` — resolver

Three exported functions:

- **`parseOjsFilename(raw)`** — extracts the bare filename from whatever OJS
  stored. Handles three OJS storage formats:
  1. JSON: `{"name":"Journal Cover.png","uploadName":"homepageImage_en.png"}`
     (optionally nested by locale) — `uploadName` is used; `name` only when a
     row has no `uploadName` (see field semantics below).
  2. PHP-serialized: `a:2:{s:10:"uploadName";s:20:"homepageImage_en.png";…}` —
     same order; keys are matched exactly.
  3. Plain string: `cover_issue_1_en_US.png` or any string ending in an image
     extension.

- **`buildOjsPublicUrl(baseUrl, subpath, filename)`** — low-level builder for
  callers that already hold an explicit base URL (e.g. `ojs-mappers.ts`).
  Always `path.basename` + `encodeURIComponent` on the filename to prevent path
  traversal.

- **`buildOjsAssetUrl(subpath, filename)`** — high-level builder. Reads
  `OJS_BASE_URL` from the environment via `getOjsPublicAssetsBaseUrl()` (strips
  a trailing `/ojs` subpath), then calls `buildOjsPublicUrl`, then applies
  `normalizeOjsAssetUrl` as a defensive guard against any legacy `/ojs/public/`
  still in the env value.

`normalizeOjsAssetUrl(url)` in `ojs-config.ts` is the idempotent read-time fix
that rewrites any persisted `…/ojs/public/…` → `…/public/…`.

### Field semantics: `uploadName` is the file, `name` is not (DO NOT SWAP)

OJS 3.x stores image settings as
`{"name": "<original filename>", "uploadName": "<file written to disk>", …}`:

| Key | Example | Exists on disk? |
|---|---|---|
| `uploadName` | `homepageImage_en.png` | **Yes**: `public/journals/1/homepageImage_en.png` → 200 |
| `name` | `journal cover image-Updated3.png` | **No**: the original filename of the upload → 404 |

Evidence: OJS 3.5 reads the stored file as `$setting['uploadName']`
(`lib/pkp/classes/services/PKPContextService.php:826`), and every OJS image
writer (context, site, publication, announcement, highlight, profile) sets
`uploadName` to the generated filename.

Swapping this order broke **every journal cover in production three times**
(#148; the fix #152 was reverted by #155; #239). Real production setting shapes
live in `tests/fixtures/ojs-image-settings.json`. If a change to the parser
makes those tests fail, the change is wrong — never edit the fixture to match.

### Safeguards against a broken cover (#239)

1. **Truth fixtures**: `tests/unit/ojs-asset-url.test.ts` runs the parser on
   real OJS rows.
2. **Sync write guard**: `src/features/ojs/server/cover-check.ts`. The journal
   sync HEAD-checks a new cover URL and never replaces a working cover with
   one that 404s. It reports `covers {checked, ok, broken, kept_old}` in
   `sync_runs.stats`.
3. **Admin warning**: the Sync health widget names journals whose covers do
   not load, or whose broken new URL was refused.
4. **Hourly monitor**: `.github/workflows/cover-monitor.yml` runs
   `scripts/check-covers.ts` against digitopub.com and opens an issue labelled
   `cover-monitor` when any cover fails (it closes it when they recover).
   It checks the covers from the API **and** the ones baked into the homepage HTML.
5. **Homepage revalidation**: `app/page.tsx` sets `revalidate = 300`. The homepage
   is prerendered; without this it kept the cover URLs from deploy time and
   showed broken covers after the data was repaired (2026-10-27).

### If covers break

1. `bun run scripts/check-covers.ts` → which journals, which status, which stored URL.
2. Compare the stored URL's filename with OJS `journal_settings.homepageImage`
   (`uploadName`) and with the files under `public/journals/{id}/` on the OJS host.
3. Fix the cause (usually the parser), deploy, then run the OJS journal sync
   once (`GET /api/ojs/sync` with `CRON_SECRET`) to rewrite the stored URLs.
   The homepage picks up the repaired URLs within 5 minutes.

### `ojs-image.tsx` — renderer

`<OjsImage>` is a `"use client"` wrapper around a plain `<img>`. It:

1. Routes OJS hostnames (`submitmanager.com`, `journals.digitopub.com`) through
   `/api/image-proxy?url=…`, which fetches with a browser User-Agent to bypass
   the WAF.
2. Tracks load errors in local state; on error renders the `fallback` prop
   (defaults to nothing).
3. Accepts the same core props as `next/image` (`fill`, `width`, `height`,
   `sizes`, `priority`, `className`, `style`).

## Image proxy (`/api/image-proxy`)

- Validates the `url` query param against an allowlist of OJS hosts.
- Fetches with a browser User-Agent; no `Referer` header.
- Validates response `Content-Type` is `image/*`.
- Returns with `Cache-Control: public, max-age=86400`.
- Hard limit: 15 MB response body (`IMAGE_PROXY_MAX_BYTES` overrides it); covers
  are up to ~3.4 MB.
- Answers `HEAD` too, which the cover monitor uses (no image download).

## Adding a new OJS image surface

1. Parse the raw OJS setting value with `parseOjsFilename(raw)`.
2. Build the full URL with `buildOjsAssetUrl(subpath, filename)`.
   - Journal covers: `buildOjsAssetUrl("public/journals/{id}", filename)`
   - Profile images: `buildOjsAssetUrl("public/site/profileImages", filename)`
3. Render with `<OjsImage src={url} alt="…" … />`.

Do **not** use `next/image <Image>` for OJS URLs — it will fail silently
because `unoptimized: true` bypasses the server proxy.

## Hosts covered

Both `submitmanager.com` and `journals.digitopub.com` are in:
- `next.config.mjs` → `images.remotePatterns` (belt-and-suspenders)
- `OJS_HOSTS` set in `ojs-image.tsx` (proxy routing)
- `ALLOWED_HOSTS` set in `app/api/image-proxy/route.ts` (security allowlist)

## Tests

`tests/unit/ojs-asset-url.test.ts` covers all three storage formats, the
real-OJS truth fixtures, the `/ojs/public/` rewrite, path-traversal safety,
null/garbage inputs, and the env-var stripping logic.
`tests/unit/ojs-cover-check.test.ts` covers the sync write guard.
