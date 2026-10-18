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

class DigitopubThemePlugin extends ThemePlugin
{
    /** DigitoPub is the single publishing surface; SubmitManager is submission-only (#183). */
    public const DIGITOPUB_BASE_URL = 'https://digitopub.com';

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

        // Load DigitoPub custom styles and scripts for the global redesign.
        $this->addStyle('digitopub-styles-v10', 'styles/digitopub.less');
        $this->addScript('digitopub-scripts', 'js/digitopub.js');

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
