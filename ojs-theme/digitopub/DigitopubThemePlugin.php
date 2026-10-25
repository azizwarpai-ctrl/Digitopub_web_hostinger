<?php

/**
 * @file plugins/themes/digitopub/DigitopubThemePlugin.php
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class DigitopubThemePlugin
 *
 * @brief Digitopub child theme for OJS 3.5
 */

namespace APP\plugins\themes\digitopub;

use APP\core\Application;
use APP\template\TemplateManager;
use PKP\plugins\Hook;
use PKP\plugins\ThemePlugin;
use Illuminate\Support\Facades\DB;

class DigitopubThemePlugin extends ThemePlugin
{
    /** DigitoPub is the single publishing surface; SubmitManager is submission-only (#183). */
    public const DIGITOPUB_BASE_URL = 'https://digitopub.com';

    /**
     * Largest cover (width x height) we decode for thumbnails. GD needs ~4
     * bytes per pixel, and exhausting memory_limit is a fatal error that
     * try/catch cannot catch, so bigger sources fall back to the original.
     */
    private const MAX_THUMB_SOURCE_PIXELS = 12000000;

    /**
     * @copydoc Plugin::register()
     */
    public function register($category, $path, $mainContextId = null)
    {
        $success = parent::register($category, $path, $mainContextId);

        if ($success) {
            $this->addLocaleData();
        }

        return $success;
    }

    /**
     * Initialize the theme by loading the parent Default Theme.
     *
     * Phase 3: custom DigitoPub navbar and footer are shared across every
     * public frontend page. The site logo is exposed to Smarty so the navbar
     * brand remains identical on the homepage, journal pages, article pages,
     * search, login/register, and all other frontend contexts.
     */
    public function init()
    {
        // Inherit all styles, scripts, templates, options and menu areas
        // from the official OJS Default Theme.
        $this->setParent('defaultthemeplugin');

        // Re-skin the parent Default Theme at its LESS-variable source so every
        // default-theme component uses DigitoPub's type and colour (D6).
        // #0056a4 is the sRGB value of DigitoPub's --primary oklch(0.45 0.15 250);
        // the parent runs colour functions on @bg-base, so it must be a hex.
        // setParent() has already run the parent's init(), so its styles exist
        // and our variables are appended after (and win over) its own.
        $this->modifyStyle('stylesheet', ['addLessVariables' => join("\n", [
            '@font: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;',
            '@font-heading: @font;',
            '@bg-base: #0056a4;',
            '@text-bg-base: #ffffff;',
        ])]);
        // The parent's Noto Sans webfont is no longer used.
        $this->removeStyle('font');

        // SiteGround's proxy caches the cookie-less css?name=<style> responses
        // indefinitely (no purge available), so every release must produce
        // new stylesheet URLs (D7). Re-key the parent's stylesheet (after the
        // D6 variables above) and name ours with the same content version.
        $version = $this->assetVersion();
        if (isset($this->parent->styles['stylesheet'])) {
            $this->parent->styles['stylesheet-' . $version] = $this->parent->styles['stylesheet'];
            unset($this->parent->styles['stylesheet']);
        }

        // Load DigitoPub custom styles and scripts for the global redesign.
        $this->addStyle('digitopub-styles-' . $version, 'styles/digitopub.less');
        $this->addScript('digitopub-scripts', 'js/digitopub.js?v=' . $version);
        // In-page table of contents for long content pages (progressive).
        $this->addScript('digitopub-toc', 'js/toc.js?v=' . $version);

        // Make the site logo available in every frontend template so the
        // navbar brand is consistent regardless of journal context.
        Hook::add('TemplateManager::display', [$this, 'loadTemplateData']);

        // #183: issue pages are published on DigitoPub only. Other reader
        // pages are redirected by .htaccess (ojs-theme/htaccess/
        // submission-only.conf); issue/view needs the issue's volume/number,
        // so it is redirected here once the handler has loaded the issue.
        Hook::add('TemplateManager::display', [$this, 'redirectIssuePage']);
    }

    /**
     * 301 a published issue's OJS page to its DigitoPub issue page
     * (/journals/{path}/issues/{volume}/{number}), or to the journal archive
     * when the issue has no volume/number. Unpublished issues are left alone
     * so editors can still preview them from the workflow.
     *
     * @param string $hookName
     * @param array $args [$templateMgr, &$template, &$output]
     */
    public function redirectIssuePage($hookName, $args)
    {
        if ($args[1] !== 'frontend/pages/issue.tpl') {
            return false;
        }

        /** @var TemplateManager $templateMgr */
        $templateMgr = $args[0];
        $issue = $templateMgr->getTemplateVars('issue');
        $journal = Application::get()->getRequest()->getContext();
        if (!$issue || !$journal || !$issue->getPublished()) {
            return false;
        }

        $journalUrl = self::DIGITOPUB_BASE_URL . '/journals/' . rawurlencode($journal->getPath());
        $volume = (string) $issue->getVolume();
        $number = (string) $issue->getNumber();
        $target = ($volume !== '' && $number !== '')
            ? $journalUrl . '/issues/' . rawurlencode($volume) . '/' . rawurlencode($number)
            : $journalUrl . '/archive';

        header('Location: ' . $target, true, 301);
        exit;
    }

    /**
     * Short content version of the theme's assets: changes whenever any
     * stylesheet, the script or this plugin file changes (each deploy writes
     * new files, so their mtimes change). Only stat() calls, no file reads.
     */
    public function assetVersion(): string
    {
        $parts = [filemtime(__FILE__) . ':' . filesize(__FILE__)];
        foreach (['styles', 'js'] as $dir) {
            $files = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator(__DIR__ . '/' . $dir, \FilesystemIterator::SKIP_DOTS)
            );
            foreach ($files as $file) {
                $parts[] = $file->getPathname() . ':' . $file->getMTime() . ':' . $file->getSize();
            }
        }
        sort($parts);

        return substr(md5(implode('|', $parts)), 0, 8);
    }

    /**
     * Assign globally shared template variables.
     *
     * @param string $hookName
     * @param array $args [$templateMgr, &$template, &$output]
     */
    public function loadTemplateData($hookName, $args)
    {
        /** @var TemplateManager $templateMgr */
        $templateMgr = $args[0];

        $site = Application::get()->getRequest()->getSite();
        $siteLogo = $site->getLocalizedData('pageHeaderTitleImage');
        if ($siteLogo) {
            $templateMgr->assign('digitopubSiteLogo', $siteLogo);
        }

        // Cover thumbnails (E3) only where covers render, so other pages pay
        // no filesystem cost. Contract C2: [journalId => ['sm' => url, 'md' => url]].
        $template = $args[1] ?? '';
        if ($template === 'frontend/pages/indexJournal.tpl' || $template === 'frontend/pages/indexSite.tpl') {
            $journals = $template === 'frontend/pages/indexSite.tpl'
                ? ($templateMgr->getTemplateVars('journals') ?? [])
                : array_filter([Application::get()->getRequest()->getContext()]);
            $thumbs = [];
            foreach ($journals as $journal) {
                $thumb = $this->coverThumb((int) $journal->getId(), $journal->getLocalizedData('homepageImage'));
                if ($thumb) {
                    $thumbs[(int) $journal->getId()] = $thumb;
                }
            }
            $templateMgr->assign('digitopubCoverThumbs', $thumbs);
            $templateMgr->assign('digitopubSpecializations', $this->journalSpecializations());
        }
    }

    /**
     * Journal specializations set in the digitopub dashboard (#234), as
     * [journalId => name]. digitopub stores them in journal_settings
     * (digitopubSpecialization, locale ''). Read directly rather than through
     * $journal->getData(): OJS only loads settings declared in the context
     * schema, and that schema is built and cached before theme plugins load.
     */
    private function journalSpecializations(): array
    {
        try {
            return DB::table('journal_settings')
                ->where('setting_name', 'digitopubSpecialization')
                ->where('locale', '')
                ->pluck('setting_value', 'journal_id')
                ->mapWithKeys(fn ($value, $id) => [(int) $id => (string) $value])
                ->all();
        } catch (\Throwable $e) {
            error_log('[digitopub theme] could not read journal specializations: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * WebP thumbnails of a journal's homepage image (E3): ['sm' => 480w url,
     * 'md' => 960w url], or null to make templates fall back to the original.
     * Implemented in task P2.
     *
     * @param array|null $image Localized homepageImage data (uploadName, ...)
     */
    public function coverThumb(int $journalId, $image): ?array
    {
        try {
            if (empty($image) || !is_array($image) || empty($image['uploadName'])) {
                return null;
            }
            // OJS 3.5: APP\file\PublicFileManager::getContextFilesPath() returns
            // "<public_files_dir>/journals/<id>", relative to the OJS base dir.
            $publicFileManager = new \APP\file\PublicFileManager();
            $relPath = $publicFileManager->getContextFilesPath($journalId);
            $dir = \PKP\core\Core::getBaseDir() . '/' . $relPath;
            $baseUrl = Application::get()->getRequest()->getBaseUrl() . '/' . $relPath;
            // basename() keeps a hostile setting value inside the journal dir.
            return $this->buildThumbs($dir . '/' . basename((string) $image['uploadName']), $dir, $baseUrl);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Create (or reuse) dp-thumb-{W}-{mtime}.webp files for $source inside
     * $dir. The mtime in the name busts caches when the cover is replaced.
     * The source file is only ever read. Returns null on any failure.
     */
    private function buildThumbs(string $source, string $dir, string $baseUrl): ?array
    {
        try {
            if (!is_file($source) || !function_exists('imagewebp') || !function_exists('imagecreatefromstring')) {
                return null;
            }
            $mtime = filemtime($source);
            if ($mtime === false) {
                return null;
            }
            $urls = [];
            $img = null;
            foreach (['sm' => 480, 'md' => 960] as $key => $width) {
                $name = "dp-thumb-{$width}-{$mtime}.webp";
                $target = $dir . '/' . $name;
                if (!is_file($target)) {
                    if ($img === null) {
                        // Cheap checks before the expensive decode, so a bad
                        // dir or an oversized source costs nothing per request.
                        if (!is_writable($dir)) {
                            return null;
                        }
                        $size = @getimagesize($source);
                        if (!$size || $size[0] * $size[1] > self::MAX_THUMB_SOURCE_PIXELS) {
                            return null;
                        }
                        $data = file_get_contents($source);
                        $img = $data === false ? false : @imagecreatefromstring($data);
                        if (!$img) {
                            return null;
                        }
                        imagepalettetotruecolor($img);
                    }
                    // Never upscale: use the source width when it is smaller.
                    $w = min($width, imagesx($img));
                    // Bicubic returns false on some GD builds (verified on the
                    // SiteGround host), so fall back to bilinear.
                    $dst = @imagescale($img, $w, -1, IMG_BICUBIC)
                        ?: imagescale($img, $w, -1, IMG_BILINEAR_FIXED);
                    if (!$dst) {
                        return null;
                    }
                    imagealphablending($dst, false);
                    imagesavealpha($dst, true);
                    // Write to a temp file, then atomically rename the TEMP file.
                    $tmp = $dir . '/dp-thumb-tmp-' . uniqid('', true) . '.webp';
                    $ok = @imagewebp($dst, $tmp, 78);
                    imagedestroy($dst);
                    if (!$ok || !rename($tmp, $target)) {
                        if (is_file($tmp)) {
                            unlink($tmp);
                        }
                        return null;
                    }
                    // Drop stale thumbs of this width (other mtimes); prefix-matched only.
                    foreach (glob($dir . "/dp-thumb-{$width}-*.webp") ?: [] as $old) {
                        if (basename($old) !== $name) {
                            unlink($old);
                        }
                    }
                }
                $urls[$key] = $baseUrl . '/' . $name;
            }
            if ($img) {
                imagedestroy($img);
            }
            return $urls;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * @copydoc Plugin::getDisplayName()
     */
    public function getDisplayName()
    {
        return __('plugins.themes.digitopub.name');
    }

    /**
     * @copydoc Plugin::getDescription()
     */
    public function getDescription()
    {
        return __('plugins.themes.digitopub.description');
    }
}

if (!PKP_STRICT_MODE) {
    class_alias('\APP\plugins\themes\digitopub\DigitopubThemePlugin', '\DigitopubThemePlugin');
}
