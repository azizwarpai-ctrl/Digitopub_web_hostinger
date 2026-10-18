#!/usr/bin/env bash
# Compile the theme's LESS with OJS's own compiler (less.php on SiteGround),
# using the exact options PKPTemplateManager::compileLess() uses. Catches
# less.php traps that local tooling would not (e.g. clamp() silently
# collapsing to its first argument, calc(var()) / min() compile errors).
#
#   bash ojs-theme/check-less.sh [--out compiled.css]
#
# Uploads styles/ to ~/deploy-redesign/check/ on the server (never the live
# theme). Prints "LESS OK <bytes>" (exit 0) or "LESS ERROR <message>" (exit 1).
set -euo pipefail
cd "$(dirname "$0")"

OUT=""
if [ "${1:-}" = "--out" ]; then OUT="${2:?--out needs a file}"; fi

SSH=(ssh -i "$HOME/.ssh/ai_agent_key_siteGround" -o IdentitiesOnly=yes -o BatchMode=yes -p 18765 u1135-vfzcqxwgpglc@ssh.submitmanager.com)

tar -cf - -C digitopub styles | "${SSH[@]}" 'set -e
CHECK=~/deploy-redesign/check
rm -rf "$CHECK" && mkdir -p "$CHECK" && tar -xf - -C "$CHECK"
cd ~/www/submitmanager.com/public_html
php -r '"'"'
require "lib/pkp/lib/vendor/autoload.php";
$file = getenv("HOME") . "/deploy-redesign/check/styles/digitopub.less";
$less = new Less_Parser(["relativeUrls" => false, "compress" => true]);
try {
    $less->parseFile($file);
    $less->parse("@baseUrl: '"'"'"'"'"'https://journals.digitopub.com'"'"'"'"'"';");
    $css = $less->getCSS();
    file_put_contents(getenv("HOME") . "/deploy-redesign/check/compiled.css", $css);
    fwrite(STDERR, "LESS OK " . strlen($css) . "\n");
} catch (Throwable $e) {
    fwrite(STDERR, "LESS ERROR " . $e->getMessage() . "\n");
    exit(1);
}
'"'"'
cat ~/deploy-redesign/check/compiled.css' > "${OUT:-/dev/null}"
