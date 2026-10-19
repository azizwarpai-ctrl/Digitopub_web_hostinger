{**
 * DigitoPub theme override of the OJS core template (lib/pkp/templates/frontend/pages/navigationMenuItemViewContent.tpl).
 * Only wrappers, classes and presentation differ; all includes, translations, URLs and branches are core's.
 *
 * frontend/pages/navigationMenuItemViewContent.tpl
 *
 * Copyright (c) 2014-2021 Simon Fraser University
 * Copyright (c) 2003-2021 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * Display NavigationMenuItem content
 *}
{include file="frontend/components/header.tpl" pageTitleTranslated=$title}

<div class="dp-prose">
<div class="dp-prose__layout">
<nav class="dp-prose__toc" aria-label="On this page" hidden></nav>
<div class="dp-prose__body page">
	{include file="frontend/components/breadcrumbs.tpl" currentTitle=$title}
	<h1 class="page_title">{$title|escape}</h1>
	{$content}
</div><!-- .dp-prose__body -->
</div><!-- .dp-prose__layout -->
</div><!-- .dp-prose -->

{include file="frontend/components/footer.tpl"}
