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

        // Load DigitoPub custom styles and scripts for the global redesign.
        $this->addStyle('digitopub-styles-v10', 'styles/digitopub.less');
        $this->addScript('digitopub-scripts', 'js/digitopub.js');

        // Make the site logo available in every frontend template so the
        // navbar brand is consistent regardless of journal context.
        Hook::add('TemplateManager::display', [$this, 'loadTemplateData']);
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
