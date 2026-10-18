#!/usr/bin/env bash
# Post-deploy check for #183 (SubmitManager submission-only). Read-only:
# issues HEAD/GET requests against the live OJS host and DigitoPub.
#
#   bash ojs-theme/verify-submission-only.sh [journal ...]   # default: ojbr ijmp jme
#
# Exits non-zero if any expectation fails.
set -u
OJS="${OJS_HOST:-https://journals.digitopub.com}"
DP="https://digitopub.com"
if [ $# -gt 0 ]; then JOURNALS=("$@"); else JOURNALS=(ojbr ijmp jme); fi
fail=0

status_location() { curl -s -o /dev/null -A "Mozilla/5.0" -w '%{http_code} %{redirect_url}' "$1"; }

expect_redirect() { # url expected-location
  read -r code loc <<<"$(status_location "$1")"
  if [ "$code" = "301" ] && [ "$loc" = "$2" ]; then echo "ok   301 $1"; else echo "FAIL $1 -> $code $loc (want 301 $2)"; fail=1; fi
}

expect_no_redirect() { # url
  read -r code loc <<<"$(status_location "$1")"
  case "$loc" in "$DP"*) echo "FAIL $1 -> $code $loc (must stay on OJS)"; fail=1 ;; *) echo "ok   $code $1" ;; esac
}

for j in "${JOURNALS[@]}"; do
  echo "== $j"
  expect_redirect "$OJS/$j/issue/archive" "$DP/journals/$j/archive"
  expect_redirect "$OJS/$j/issue/current" "$DP/journals/$j/current-issue"
  expect_redirect "$OJS/$j/about" "$DP/journals/$j"
  expect_redirect "$OJS/$j/about/editorialMasthead" "$DP/journals/$j/about-journal/editorial-board"
  expect_redirect "$OJS/$j/editorial-board" "$DP/journals/$j/about-journal/editorial-board"
  expect_redirect "$OJS/$j/policies-on-ethics" "$DP/journals/$j/policies/policies-on-ethics"
  expect_redirect "$OJS/$j/copyright-licensing-policies" "$DP/journals/$j/policies/copyright-licensing"
  expect_redirect "$OJS/$j/search/search?query=dental" "$DP/search?q=dental"
  for p in index login user/register submission/wizard about/submissions about/contact publication-fees oai; do
    expect_no_redirect "$OJS/$j/$p"
  done

  # Journal home must not list issues or articles.
  hits=$(curl -s -A "Mozilla/5.0" "$OJS/$j/index" | grep -cE 'issue/view|obj_article_summary|digitopub-journal-articles')
  if [ "$hits" = "0" ]; then echo "ok   $j/index has no issue/article markup"; else echo "FAIL $j/index shows issue/article markup ($hits)"; fail=1; fi
done

# A published issue view goes to its DigitoPub issue page (theme plugin).
read -r code loc <<<"$(status_location "$OJS/ojbr/issue/view/200009")"
case "$code $loc" in "301 $DP/journals/ojbr/issues/5/2") echo "ok   301 issue/view/200009" ;; *) echo "FAIL issue/view/200009 -> $code $loc"; fail=1 ;; esac

# Storage paths DigitoPub depends on must still serve files.
read -r code _ <<<"$(status_location "$OJS/ijmp/article/download/200048/200107")"
[ "$code" = "200" ] && echo "ok   200 article/download (PDF)" || { echo "FAIL article/download -> $code"; fail=1; }

exit $fail
