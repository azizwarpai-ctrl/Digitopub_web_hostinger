# OJS theme — `digitopub`

Source of truth for the SubmitManager (OJS 3.5, `journals.digitopub.com`) frontend theme. It is a child of OJS's `defaultthemeplugin` and is active on the site and all journals.

Until #183 this theme existed **only** on the SiteGround server, where it was edited in place (hence the old `*.bak.*` files there). The baseline commit imports the production files byte for byte, verified by md5 against the server and excluding `*.bak*`. Make every change here, review it in a PR, then deploy.

## Layout

| Path | Purpose |
|---|---|
| `digitopub/DigitopubThemePlugin.php` | Theme plugin class: styles/scripts, template data, hooks |
| `digitopub/templates/frontend/**` | Smarty overrides of the default theme's templates |
| `digitopub/styles/`, `digitopub/js/` | Theme assets |
| `digitopub/locale/en/locale.po` | `plugins.themes.digitopub.*` strings |
| `htaccess/submission-only.conf` | #183 redirects of OJS reader pages to DigitoPub (pasted into the OJS `.htaccess`) |
| `verify-submission-only.sh` | Read-only post-deploy check of the #183 redirect/portal behaviour |

## Submission-only SubmitManager (#183)

SubmitManager is used only for submission, editorial workflow and file storage. DigitoPub is the single publishing surface.

- **`.htaccess`** (`htaccess/submission-only.conf`): issue archive/current, about, masthead, board and policy pages, and search all 301 to DigitoPub. Tested in CI by `tests/unit/ojs-submission-only-redirects.test.ts`.
- **Theme plugin** (`redirectIssuePage`): `issue/view/{id}` 301s to `/journals/{path}/issues/{volume}/{number}`. This needs the issue's DB record, so it runs at template display. Unpublished issues are not redirected, so editors can still preview them.
- **Templates:** the journal and site homes are submission portals. The footer and navbar point readers to DigitoPub. Guarded by `tests/unit/ojs-theme-submission-only-guard.test.ts`.
- **Untouched:** login/registration, submission wizard, dashboard/workflow/management, `about/submissions`, `about/contact`, `publication-fees`, `article/download`, `issue/download`, OAI, the bridge/SSO PHP files.

## Deploy

Server: SiteGround, SSH alias/user per `docs/ops/discovery-2026-08.md`. The theme lives at `~/www/submitmanager.com/public_html/plugins/themes/digitopub/`.

1. **Back up** the live theme on the server:
   `tar -czf ~/theme-digitopub-$(date +%Y%m%d%H%M).tgz -C ~/www/submitmanager.com/public_html/plugins/themes digitopub`
2. **Copy** this directory's `digitopub/` over the live one (e.g. `tar -cf - -C ojs-theme digitopub | ssh <host> 'tar -xf - -C ~/www/submitmanager.com/public_html/plugins/themes'`).
3. **`.htaccess`** (only when `htaccess/submission-only.conf` changed): back up `public_html/.htaccess`, then replace the block between `# ----- Submission-only SubmitManager (#183) -----` and `# ----- end submission-only (#183) -----` with the file's contents. On first install, insert it after the #175 `article/view` rule and before the front-controller rewrite.
4. **Clear compiled templates and CSS:** `rm -rf ~/www/submitmanager.com/public_html/cache/t_compile/* ~/www/submitmanager.com/public_html/cache/*.css`
5. **Verify:** `bash ojs-theme/verify-submission-only.sh` (exits non-zero on any failure).

## Rollback

Restore the backup tarball from step 1 (and the `.htaccess` backup from step 3), then clear the cache (step 4). In an emergency, switch the theme to "Default Theme" in OJS Site Tools → Website → Appearance.
