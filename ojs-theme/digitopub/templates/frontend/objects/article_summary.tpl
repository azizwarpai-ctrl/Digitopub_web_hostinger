{**
 * plugins/themes/digitopub/templates/frontend/objects/article_summary.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub article summary card.
 *
 * Phase 4: modern article card for the Current Issue page and other article
 * listings.
 * Phase 7: enhanced for search results with abstract, journal and issue info.
 *
 * @uses $article Article The article
 * @uses $authorUserGroups Traversible The set of author user groups
 * @uses $hasAccess bool Can this user access galleys for this context?
 * @uses $showDatePublished bool Show the date this article was published?
 * @uses $hideGalleys bool Hide the article galleys for this article?
 * @uses $primaryGenreIds array List of file genre ids for primary file types
 * @uses $heading string HTML heading element, default: h2
 * @uses $sectionTitle string Optional section title displayed as article type
 * @uses $showAbstract bool Show a short abstract preview?
 * @uses $journal Journal Optional journal context (used in search)
 * @uses $issue Issue Optional issue context (used in search)
 * @hook Templates::Issue::Issue::Article []
 *}
{assign var=publication value=$article->getCurrentPublication()}
{assign var=articlePath value=$publication->getData('urlPath')|default:$article->getId()}
{if !$heading}
	{assign var="heading" value="h2"}
{/if}

{* Determine author display *}
{if (!$section.hideAuthor && $publication->getData('hideAuthor') == APP\submission\Submission::AUTHOR_TOC_DEFAULT) || $publication->getData('hideAuthor') == APP\submission\Submission::AUTHOR_TOC_SHOW}
	{assign var="showAuthor" value=true}
{/if}

{* Article DOI *}
{assign var="articleDoiObject" value=$publication->getData('doiObject')}

{* Article keywords *}
{assign var="articleKeywords" value=$publication->getLocalizedData('keywords')}

{* Article abstract *}
{if $showAbstract}
	{assign var="articleAbstract" value=$publication->getLocalizedData('abstract')}
{/if}

<article class="digitopub-article-card {if $publication->getLocalizedData('coverImage')}digitopub-article-card--has-cover{/if}" id="article-{$article->getId()}">

	{* Article cover image *}
	{if $publication->getLocalizedData('coverImage')}
		{assign var="coverImage" value=$publication->getLocalizedData('coverImage')}
		<div class="digitopub-article-card__cover">
			<a {if $journal}href="{url journal=$journal->getPath() page="article" op="view" path=$articlePath}"{else}href="{url page="article" op="view" path=$articlePath}"{/if}>
				<img src="{$publication->getLocalizedCoverImageUrl($article->getData('contextId'))|escape}" alt="{$coverImage.altText|escape|default:''}">
			</a>
		</div>
	{/if}

	<div class="digitopub-article-card__body">

		{* Article type / section *}
		{if $sectionTitle}
			<span class="digitopub-article-card__type">{$sectionTitle|escape}</span>
		{/if}

		{* Journal name (search context) *}
		{if $journal}
			<div class="digitopub-article-card__journal">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
				{$journal->getLocalizedName()|escape}
			</div>
		{/if}

		{* Title *}
		<{$heading} class="digitopub-article-card__title">
			<a {if $journal}href="{url journal=$journal->getPath() page="article" op="view" path=$articlePath}"{else}href="{url page="article" op="view" path=$articlePath}"{/if}>
				{if $currentContext}
					{$publication->getLocalizedTitle(null, 'html')|strip_unsafe_html}
					{assign var=localizedSubtitle value=$publication->getLocalizedSubtitle(null, 'html')|strip_unsafe_html}
					{if $localizedSubtitle}
						<span class="digitopub-article-card__subtitle">{$localizedSubtitle}</span>
					{/if}
				{else}
					{$publication->getLocalizedFullTitle(null, 'html')|strip_unsafe_html}
				{/if}
			</a>
		</{$heading}>

		{* Authors *}
		{if $showAuthor}
			<div class="digitopub-article-card__authors">
				{$publication->getAuthorString($authorUserGroups)|escape}
			</div>
		{/if}

		{* Metadata row *}
		{assign var=submissionPages value=$publication->getData('pages')}
		{assign var=submissionDatePublished value=$publication->getData('datePublished')}
		{if $issue || $submissionPages || ($submissionDatePublished && $showDatePublished) || $articleDoiObject}
			<div class="digitopub-article-card__meta">
				{if $issue}
					<span class="digitopub-article-card__meta-item">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
						{$issue->getIssueSeries()|escape}
					</span>
				{/if}
				{if $submissionPages}
					<span class="digitopub-article-card__meta-item">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
						{$submissionPages|escape}
					</span>
				{/if}
				{if $showDatePublished && $submissionDatePublished}
					<span class="digitopub-article-card__meta-item">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
						{$submissionDatePublished|truncate:10:""}
					</span>
				{/if}
				{if $articleDoiObject}
					{assign var="articleDoiUrl" value=$articleDoiObject->getData('resolvingUrl')|escape}
					<span class="digitopub-article-card__meta-item digitopub-article-card__doi">
						<a href="{$articleDoiUrl|escape}" target="_blank" rel="noopener">{$articleDoiUrl}</a>
					</span>
				{/if}
			</div>
		{/if}

		{* Abstract preview *}
		{if $showAbstract && $articleAbstract}
			<div class="digitopub-article-card__abstract">
				{$articleAbstract|strip_unsafe_html|truncate:220:"...":true}
			</div>
		{/if}

		{* Keywords *}
		{if $articleKeywords && is_array($articleKeywords) && $articleKeywords|@count > 0}
			<div class="digitopub-article-card__keywords">
				{foreach from=$articleKeywords item=keyword name=keywords}
					<span class="digitopub-article-card__keyword">{$keyword|escape}</span>{if !$smarty.foreach.keywords.last}<span class="digitopub-article-card__keyword-sep">,</span>{/if}
				{/foreach}
			</div>
		{/if}

	</div>

	{* Actions *}
	<div class="digitopub-article-card__actions">
		<a {if $journal}href="{url journal=$journal->getPath() page="article" op="view" path=$articlePath}"{else}href="{url page="article" op="view" path=$articlePath}"{/if} class="digitopub-btn digitopub-btn--outline digitopub-btn--sm">
			{translate key="article.abstract"}
		</a>

		{if !$hideGalleys}
			{foreach from=$publication->getData('galleys') item=galley}
				{if $primaryGenreIds}
					{assign var="file" value=$galley->getFile()}
					{if !$galley->getData('urlRemote') && !($file && in_array($file->getGenreId(), $primaryGenreIds))}
						{continue}
					{/if}
				{/if}
				{assign var="hasArticleAccess" value=$hasAccess}
				{if $currentContext->getSetting('publishingMode') == APP\journal\Journal::PUBLISHING_MODE_OPEN || $publication->getData('accessStatus') == APP\submission\Submission::ARTICLE_ACCESS_OPEN}
					{assign var="hasArticleAccess" value=1}
				{/if}
				{assign var="id" value="article-{$article->getId()}-galley-{$galley->getId()}"}
				{include file="frontend/objects/galley_link.tpl" parent=$article publication=$publication id=$id labelledBy="{$id} article-{$article->getId()}" hasAccess=$hasArticleAccess purchaseFee=$currentJournal->getData('purchaseArticleFee') purchaseCurrency=$currentJournal->getData('currency')}
			{/foreach}
		{/if}

		<a {if $journal}href="{url journal=$journal->getPath() page="article" op="view" path=$articlePath}"{else}href="{url page="article" op="view" path=$articlePath}"{/if} class="digitopub-btn digitopub-btn--primary digitopub-btn--sm">
			{translate key="common.view"} {translate key="article.article"}
		</a>
	</div>

	{call_hook name="Templates::Issue::Issue::Article"}
</article>
