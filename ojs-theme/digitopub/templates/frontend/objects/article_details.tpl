{**
 * plugins/themes/digitopub/templates/frontend/objects/article_details.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub article details / abstract page.
 *
 * Phase 5: modern academic layout sharing the same design system as the
 * homepage, journal page, and current issue page.
 *
 * @uses $article Submission This article
 * @uses $publication Publication The publication being displayed
 * @uses $firstPublication Publication The first published version of this article
 * @uses $currentPublication Publication The most recently published version of this article
 * @uses $issue Issue The issue this article is assigned to
 * @uses $section Section The journal section this article is assigned to
 * @uses $categories Category The category this article is assigned to
 * @uses $primaryGalleys array List of article galleys that are not supplementary or dependent
 * @uses $supplementaryGalleys array List of article galleys that are supplementary
 * @uses $keywords array List of keywords assigned to this article
 * @uses $pubIdPlugins Array of pubId plugins which this article may be assigned
 * @uses $licenseTerms string License terms.
 * @uses $licenseUrl string URL to license. Only assigned if license should be
 *   included with published submissions.
 * @uses $ccLicenseBadge string An image and text with details about the license
 *
 * @hook Templates::Article::Main []
 * @hook Templates::Article::Details::Reference []
 * @hook Templates::Article::Details []
 *}
{if !$heading}
	{assign var="heading" value="h3"}
{/if}

{* Determine author display *}
{assign var="showAuthor" value=true}
{if ($publication->getData('hideAuthor') == APP\submission\Submission::AUTHOR_TOC_DEFAULT && $section && $section->getHideAuthor()) || $publication->getData('hideAuthor') == APP\submission\Submission::AUTHOR_TOC_HIDE}
	{assign var="showAuthor" value=false}
{/if}

{* DOI *}
{assign var="doiObject" value=$publication->getData('doiObject')}

{* Keywords *}
{assign var="articleKeywords" value=$publication->getLocalizedData('keywords')}

{* Pages *}
{assign var="articlePages" value=$publication->getData('pages')}

<article class="digitopub-article-details" id="article-{$article->getId()}">

	{* Indicate if this is only a preview *}
	{if $publication->getData('status') !== PKP\submission\PKPSubmission::STATUS_PUBLISHED}
		<div class="digitopub-container">
			<div class="cmp_notification notice">
				{capture assign="submissionUrl"}{url page="dashboard" op="editorial" workflowSubmissionId=$article->getId()}{/capture}
				{translate key="submission.viewingPreview" url=$submissionUrl}
			</div>
		</div>

	{* Notification that this is an old version *}
	{elseif $currentPublication->getId() !== $publication->getId()}
		<div class="digitopub-container">
			<div class="cmp_notification notice">
				{capture assign="latestVersionUrl"}{url page="article" op="view" path=$article->getBestId()}{/capture}
				{translate key="submission.outdatedVersion"
					datePublished=$publication->getData('datePublished')|date_format:$dateFormatShort
					urlRecentVersion=$latestVersionUrl|escape
				}
			</div>
		</div>
	{/if}

	{* Article Header *}
	<header class="digitopub-article-header">
		<div class="digitopub-container">
			<div class="digitopub-article-header__card">

				{if $section}
					<span class="digitopub-article-header__type">{$section->getLocalizedTitle()|escape}</span>
				{/if}

				<h1 class="digitopub-article-header__title">
					{$publication->getLocalizedTitle(null, 'html')|strip_unsafe_html}
				</h1>

				{if $publication->getLocalizedData('subtitle')}
					<h2 class="digitopub-article-header__subtitle">
						{$publication->getLocalizedSubTitle(null, 'html')|strip_unsafe_html}
					</h2>
				{/if}

				{if $showAuthor && $publication->getData('authors')}
					<div class="digitopub-article-header__authors">
						{foreach from=$publication->getData('authors') item=author name=authors}
							<span class="digitopub-article-header__author">
								<span class="digitopub-article-header__author-name">{$author->getFullName()|escape}</span>
								{if count($author->getAffiliations()) > 0}
									<span class="digitopub-article-header__author-affiliation">
										{foreach name="affiliations" from=$author->getAffiliations() item="affiliation"}
											{$affiliation->getLocalizedName()|escape}
											{if $affiliation->getRor()}<a href="{$affiliation->getRor()|escape}" target="_blank" rel="noopener">{$rorIdIcon}</a>{/if}
											{if !$smarty.foreach.affiliations.last}{translate key="common.commaListSeparator"}{/if}
										{/foreach}
									</span>
								{/if}
								{if $author->getData('orcid')}
									<span class="digitopub-article-header__orcid">
										{if $author->hasVerifiedOrcid()}
											{$orcidIcon}
										{else}
											{$orcidUnauthenticatedIcon}
										{/if}
										<a href="{$author->getData('orcid')|escape}" target="_blank" rel="noopener">
											{$author->getOrcidDisplayValue()|escape}
										</a>
									</span>
								{/if}
							</span>
							{if !$smarty.foreach.authors.last}<span class="digitopub-article-header__author-sep">,</span>{/if}
						{/foreach}
					</div>
				{/if}

				<div class="digitopub-article-header__meta">
					{if $publication->getData('datePublished')}
						<span class="digitopub-article-header__meta-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
							{translate key="submissions.published"}: {$publication->getData('datePublished')|date_format:$dateFormatShort}
						</span>
					{/if}
					{if $articlePages}
						<span class="digitopub-article-header__meta-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
							{$articlePages|escape}
						</span>
					{/if}
					{if $doiObject}
						{assign var="doiUrl" value=$doiObject->getData('resolvingUrl')|escape}
						<span class="digitopub-article-header__meta-item digitopub-article-header__doi">
							<a href="{$doiUrl}" target="_blank" rel="noopener">{$doiUrl}</a>
						</span>
					{/if}
				</div>

				{if $articleKeywords && is_array($articleKeywords) && $articleKeywords|@count > 0}
					<div class="digitopub-article-header__keywords">
						{foreach from=$articleKeywords item=keyword name=keywords}
							<span class="digitopub-article-header__keyword">{$keyword|escape}</span>
						{/foreach}
					</div>
				{/if}

				{if $currentContext->getLocalizedData('licenseTerms') || $publication->getData('licenseUrl')}
					<div class="digitopub-article-header__license">
						{if $publication->getData('licenseUrl')}
							{if $ccLicenseBadge}
								{if $publication->getLocalizedData('copyrightHolder')}
									<span class="digitopub-article-header__license-text">{translate key="submission.copyrightStatement" copyrightHolder=$publication->getLocalizedData('copyrightHolder') copyrightYear=$publication->getData('copyrightYear')}</span>
								{/if}
								{$ccLicenseBadge}
							{else}
								<a href="{$publication->getData('licenseUrl')|escape}" target="_blank" rel="noopener">
									{if $publication->getLocalizedData('copyrightHolder')}
										{translate key="submission.copyrightStatement" copyrightHolder=$publication->getLocalizedData('copyrightHolder') copyrightYear=$publication->getData('copyrightYear')}
									{else}
										{translate key="submission.license"}
									{/if}
								</a>
							{/if}
						{/if}
						{$currentContext->getLocalizedData('licenseTerms')}
					</div>
				{/if}

			</div>
		</div>
	</header>

	{* Article Body *}
	<div class="digitopub-article-body">
		<div class="digitopub-container">
			<div class="digitopub-article-body__grid">

				{* Main column *}
				<div class="digitopub-article-body__main">

					{* Abstract *}
					{if $publication->getLocalizedData('abstract')}
						<section class="digitopub-article-block digitopub-article-block--abstract" id="abstract" aria-labelledby="digitopub-abstract-title">
							<h2 id="digitopub-abstract-title" class="digitopub-article-block__title">{translate key="article.abstract"}</h2>
							<div class="digitopub-article-block__body">
								{$publication->getLocalizedData('abstract')|strip_unsafe_html}
							</div>
						</section>
					{/if}

					{call_hook name="Templates::Article::Main"}

					{* Usage statistics chart *}
					{if $activeTheme && $activeTheme->getOption('displayStats') != 'none'}
						{$activeTheme->displayUsageStatsGraph($article->getId())}
						<section class="digitopub-article-block digitopub-article-block--stats">
							<h2 class="digitopub-article-block__title">{translate key="plugins.themes.default.displayStats.downloads"}</h2>
							<div class="digitopub-article-block__body">
								<canvas class="usageStatsGraph" data-object-type="Submission" data-object-id="{$article->getId()|escape}"></canvas>
								<div class="usageStatsUnavailable" data-object-type="Submission" data-object-id="{$article->getId()|escape}">
									{translate key="plugins.themes.default.displayStats.noStats"}
								</div>
							</div>
						</section>
					{/if}

					{* Author biographies *}
					{assign var="hasBiographies" value=0}
					{foreach from=$publication->getData('authors') item=author}
						{if $author->getLocalizedData('biography')}
							{assign var="hasBiographies" value=$hasBiographies+1}
						{/if}
					{/foreach}
					{if $hasBiographies}
						<section class="digitopub-article-block digitopub-article-block--bios">
							<h2 class="digitopub-article-block__title">
								{if $hasBiographies > 1}
									{translate key="submission.authorBiographies"}
								{else}
									{translate key="submission.authorBiography"}
								{/if}
							</h2>
							<div class="digitopub-article-block__body">
								<ul class="digitopub-author-bios">
									{foreach from=$publication->getData('authors') item=author}
										{if $author->getLocalizedData('biography')}
											<li class="digitopub-author-bio">
												<h3 class="digitopub-author-bio__name">
													{if $author->getLocalizedAffiliationNamesAsString()}
														{capture assign="authorName"}{$author->getFullName()|escape}{/capture}
														{capture assign="authorAffiliations"} {$author->getLocalizedAffiliationNamesAsString(null, ', ')|escape} {/capture}
														{translate key="submission.authorWithAffiliation" name=$authorName affiliation=$authorAffiliations}
													{else}
														{$author->getFullName()|escape}
													{/if}
												</h3>
												<div class="digitopub-author-bio__text">
													{$author->getLocalizedData('biography')|strip_unsafe_html}
												</div>
											</li>
										{/if}
									{/foreach}
								</ul>
							</div>
						</section>
					{/if}

					{* References *}
					{if $parsedCitations || (string) $publication->getData('citationsRaw')}
						<section class="digitopub-article-block digitopub-article-block--references">
							<h2 class="digitopub-article-block__title">{translate key="submission.citations"}</h2>
							<div class="digitopub-article-block__body">
								{if $parsedCitations}
									{foreach from=$parsedCitations item="parsedCitation"}
										<p>{$parsedCitation->getCitationWithLinks()|strip_unsafe_html} {call_hook name="Templates::Article::Details::Reference" citation=$parsedCitation}</p>
									{/foreach}
								{else}
									{$publication->getData('citationsRaw')|escape|nl2br}
								{/if}
							</div>
						</section>
					{/if}

				</div><!-- .digitopub-article-body__main -->

				{* Sidebar *}
				<aside class="digitopub-article-body__sidebar">

					{* Download / View buttons *}
					{if $primaryGalleys || $supplementaryGalleys}
						<div class="digitopub-article-block digitopub-article-block--downloads">
							<h2 class="digitopub-article-block__title">{translate key="submission.downloads"}</h2>
							<div class="digitopub-article-block__body">
								<div class="digitopub-article-actions">
									{foreach from=$primaryGalleys item=galley}
										{include file="frontend/objects/galley_link.tpl" parent=$article publication=$publication galley=$galley purchaseFee=$currentJournal->getData('purchaseArticleFee') purchaseCurrency=$currentJournal->getData('currency')}
									{/foreach}
									{foreach from=$supplementaryGalleys item=galley}
										{include file="frontend/objects/galley_link.tpl" parent=$article publication=$publication galley=$galley isSupplementary="1"}
									{/foreach}
								</div>
							</div>
						</div>
					{/if}

					{* Article cover image *}
					{if $publication->getLocalizedData('coverImage') || ($issue && $issue->getLocalizedCoverImage())}
						<div class="digitopub-article-block digitopub-article-block--cover">
							<div class="digitopub-article-block__body">
								{if $publication->getLocalizedData('coverImage')}
									{assign var="coverImage" value=$publication->getLocalizedData('coverImage')}
									<img src="{$publication->getLocalizedCoverImageUrl($article->getData('contextId'))|escape}" alt="{$coverImage.altText|escape|default:''}">
								{else}
									<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}">
										<img src="{$issue->getLocalizedCoverImageUrl()|escape}" alt="{$issue->getLocalizedCoverImageAltText()|escape|default:''}">
									</a>
								{/if}
							</div>
						</div>
					{/if}

					{* Metadata *}
					<div class="digitopub-article-block digitopub-article-block--metadata">
						<h2 class="digitopub-article-block__title">{translate key="common.details"}</h2>
						<div class="digitopub-article-block__body">
							<ul class="digitopub-article-meta-list">
								{if $section}
									<li>
										<span class="digitopub-article-meta-list__label">{translate key="section.section"}</span>
										<span class="digitopub-article-meta-list__value">{$section->getLocalizedTitle()|escape}</span>
									</li>
								{/if}
								{if $articlePages}
									<li>
										<span class="digitopub-article-meta-list__label">{translate key="issue.pages"}</span>
										<span class="digitopub-article-meta-list__value">{$articlePages|escape}</span>
									</li>
								{/if}
								{if $publication->getData('datePublished')}
									<li>
										<span class="digitopub-article-meta-list__label">{translate key="submissions.published"}</span>
										<span class="digitopub-article-meta-list__value">
											{if $firstPublication->getId() === $publication->getId()}
												{$firstPublication->getData('datePublished')|date_format:$dateFormatShort}
											{else}
												{translate key="submission.updatedOn" datePublished=$firstPublication->getData('datePublished')|date_format:$dateFormatShort dateUpdated=$publication->getData('datePublished')|date_format:$dateFormatShort}
											{/if}
										</span>
									</li>
								{/if}
								{if $issue}
									<li>
										<span class="digitopub-article-meta-list__label">{translate key="issue.issue"}</span>
										<span class="digitopub-article-meta-list__value">
											<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}">{$issue->getIssueIdentification()|escape}</a>
										</span>
									</li>
								{/if}
								{if $doiObject}
									<li>
										<span class="digitopub-article-meta-list__label">DOI</span>
										<span class="digitopub-article-meta-list__value">
											<a href="{$doiObject->getData('resolvingUrl')|escape}" target="_blank" rel="noopener">{$doiObject->getData('resolvingUrl')|escape}</a>
										</span>
									</li>
								{/if}
								{if $categories}
									<li>
										<span class="digitopub-article-meta-list__label">{translate key="category.category"}</span>
										<span class="digitopub-article-meta-list__value">
											{foreach from=$categories item=category name=categories}
												<a href="{url router=PKP\core\PKPApplication::ROUTE_PAGE page="catalog" op="category" path=$category->getPath()|escape}">{$category->getLocalizedTitle()|escape}</a>{if !$smarty.foreach.categories.last}, {/if}
											{/foreach}
										</span>
									</li>
								{/if}
							</ul>
						</div>
					</div>

					{* PubIds (requires plugins) *}
					{foreach from=$pubIdPlugins item=pubIdPlugin}
						{if $pubIdPlugin->getPubIdType() == 'doi'}
							{continue}
						{/if}
						{assign var=pubId value=$publication->getStoredPubId($pubIdPlugin->getPubIdType())}
						{if $pubId}
							<div class="digitopub-article-block digitopub-article-block--pubid">
								<h2 class="digitopub-article-block__title">{$pubIdPlugin->getPubIdDisplayType()|escape}</h2>
								<div class="digitopub-article-block__body">
									{if $pubIdPlugin->getResolvingURL($currentJournal->getId(), $pubId)|escape}
										<a id="pub-id::{$pubIdPlugin->getPubIdType()|escape}" href="{$pubIdPlugin->getResolvingURL($currentJournal->getId(), $pubId)|escape}">
											{$pubIdPlugin->getResolvingURL($currentJournal->getId(), $pubId)|escape}
										</a>
									{else}
										{$pubId|escape}
									{/if}
								</div>
							</div>
						{/if}
					{/foreach}

					{* Licensing info *}
					{if $currentContext->getLocalizedData('licenseTerms') || $publication->getData('licenseUrl')}
						<div class="digitopub-article-block digitopub-article-block--license">
							<h2 class="digitopub-article-block__title">{translate key="submission.license"}</h2>
							<div class="digitopub-article-block__body">
								{if $publication->getData('licenseUrl')}
									{if $ccLicenseBadge}
										{if $publication->getLocalizedData('copyrightHolder')}
											<p>{translate key="submission.copyrightStatement" copyrightHolder=$publication->getLocalizedData('copyrightHolder') copyrightYear=$publication->getData('copyrightYear')}</p>
										{/if}
										{$ccLicenseBadge}
									{else}
										<a href="{$publication->getData('licenseUrl')|escape}" target="_blank" rel="noopener">
											{if $publication->getLocalizedData('copyrightHolder')}
												{translate key="submission.copyrightStatement" copyrightHolder=$publication->getLocalizedData('copyrightHolder') copyrightYear=$publication->getData('copyrightYear')}
											{else}
												{translate key="submission.license"}
											{/if}
										</a>
									{/if}
								{/if}
								{$currentContext->getLocalizedData('licenseTerms')}
							</div>
						</div>
					{/if}

					{call_hook name="Templates::Article::Details"}

				</aside><!-- .digitopub-article-body__sidebar -->

			</div><!-- .digitopub-article-body__grid -->
		</div><!-- .digitopub-container -->
	</div><!-- .digitopub-article-body -->

</article>
