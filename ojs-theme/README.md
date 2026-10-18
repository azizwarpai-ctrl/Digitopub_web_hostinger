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

## Deploy

Server: SiteGround, SSH alias/user per `docs/ops/discovery-2026-08.md`. The theme lives at `~/www/submitmanager.com/public_html/plugins/themes/digitopub/`.

1. **Back up** the live theme on the server:
   `tar -czf ~/theme-digitopub-$(date +%Y%m%d%H%M).tgz -C ~/www/submitmanager.com/public_html/plugins/themes digitopub`
2. **Copy** this directory's `digitopub/` over the live one (e.g. `tar -cf - -C ojs-theme digitopub | ssh <host> 'tar -xf - -C ~/www/submitmanager.com/public_html/plugins/themes'`).
3. **Clear compiled templates and CSS:** `rm -rf ~/www/submitmanager.com/public_html/cache/t_compile/* ~/www/submitmanager.com/public_html/cache/*.css`
4. Run the verification matrix from the PR/issue.

## Rollback

Restore the backup tarball from step 1 and clear the cache (step 3). In an emergency, switch the theme to "Default Theme" in OJS Site Tools → Website → Appearance.
