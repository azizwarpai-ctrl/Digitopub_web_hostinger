{**
 * plugins/themes/digitopub/templates/frontend/pages/article.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub article page (abstract + galley view entry point).
 *
 * Phase 5: modern academic layout for the Abstract / View Article page,
 * sharing the same container and design system as the homepage, journal
 * landing page, and current issue page.
 *
 * @uses $article Submission This article
 * @uses $publication Publication The publication being displayed
 * @uses $firstPublication Publication The first published version of this article
 * @uses $currentPublication Publication The most recently published version of this article
 * @uses $issue Issue The issue this article is assigned to
 * @uses $section Section The journal section this article is assigned to
 * @uses $journal Journal The journal currently being viewed.
 * @uses $primaryGalleys array List of article galleys that are not supplementary or dependent
 * @uses $supplementaryGalleys array List of article galleys that are supplementary
 *
 * @hook Templates::Article::Footer::PageFooter []
 *}
{include file="frontend/components/header.tpl" pageTitleTranslated=$article->getCurrentPublication()->getLocalizedFullTitle(null, 'html')|strip_unsafe_html}


<div class="page page_article digitopub-article-page">
	{if $section}
		{include file="frontend/components/breadcrumbs_article.tpl" currentTitle=$section->getLocalizedTitle()}
	{else}
		{include file="frontend/components/breadcrumbs_article.tpl" currentTitleKey="common.publication"}
	{/if}

	{* Show article overview *}
	{include file="frontend/objects/article_details.tpl"}

	{call_hook name="Templates::Article::Footer::PageFooter"}

</div><!-- .page -->

{include file="frontend/components/footer.tpl"}
