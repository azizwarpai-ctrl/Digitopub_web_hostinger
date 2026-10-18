{**
 * plugins/themes/digitopub/templates/frontend/objects/issue_toc.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub issue table of contents.
 *
 * Phase 4: redesigned issue hero and article sections for a modern scientific
 * publishing layout.
 *}
{if !$heading}
	{assign var="heading" value="h2"}
{/if}
{assign var="articleHeading" value="h3"}
{if $heading == "h3"}
	{assign var="articleHeading" value="h4"}
{elseif $heading == "h4"}
	{assign var="articleHeading" value="h5"}
{elseif $heading == "h5"}
	{assign var="articleHeading" value="h6"}
{/if}

{* Issue cover: prefer issue cover, fall back to journal homepage image *}
{assign var="issueCoverUrl" value=$issue->getLocalizedCoverImageUrl()}
{if !$issueCoverUrl}
	{assign var="journalCover" value=$currentJournal->getLocalizedData('homepageImage')}
	{if $journalCover}
		{assign var="issueCoverUrl" value=$publicFilesDir|cat:"/"|cat:$journalCover.uploadName}
	{/if}
{/if}

{* Issue DOI *}
{assign var="issueDoiObject" value=$issue->getData('doiObject')}

<div class="digitopub-issue-toc">

	{* Indicate if this is only a preview *}
	{if !$issue->getPublished()}
		<div class="digitopub-container">
			{include file="frontend/components/notification.tpl" type="warning" messageKey="editor.issues.preview"}
		</div>
	{/if}

	{* Issue Hero *}
	<section class="digitopub-issue-hero" aria-labelledby="digitopub-issue-hero-title">
		<div class="digitopub-container">
			<div class="digitopub-issue-hero__card {if !$issueCoverUrl}digitopub-issue-hero__card--no-cover{/if}">

				{if $issueCoverUrl}
					<div class="digitopub-issue-hero__cover">
						{capture assign="defaultAltText"}{translate key="issue.viewIssueIdentification" identification=$issue->getIssueIdentification()|escape}{/capture}
						<img src="{$issueCoverUrl|escape}" alt="{$issue->getLocalizedCoverImageAltText()|escape|default:$defaultAltText}">
					</div>
				{/if}

				<div class="digitopub-issue-hero__content">
					<p class="digitopub-issue-hero__journal">{$currentJournal->getLocalizedName()|escape}</p>
					<h1 id="digitopub-issue-hero-title" class="digitopub-issue-hero__title">
						{if $issue->getVolume()}{translate key="issue.volume"} {$issue->getVolume()|escape}{/if}
						{if $issue->getVolume() && ($issue->getNumber() || $issue->getYear())}<span class="digitopub-issue-hero__separator">&bull;</span>{/if}
						{if $issue->getNumber()}{translate key="issue.issue"} {$issue->getNumber()|escape}{/if}
						{if $issue->getNumber() && $issue->getYear()}<span class="digitopub-issue-hero__separator">&bull;</span>{/if}
						{if $issue->getYear()}{$issue->getYear()|escape}{/if}
					</h1>

					<div class="digitopub-issue-hero__meta">
						{if $issue->getDatePublished()}
							<p class="digitopub-issue-hero__date">
								<span class="digitopub-issue-hero__label">{translate key="submissions.published"}:</span>
								{$issue->getDatePublished()|date_format:$dateFormatShort}
							</p>
						{/if}

						{if $issueDoiObject}
							{assign var="issueDoiUrl" value=$issueDoiObject->getData('resolvingUrl')|escape}
							<p class="digitopub-issue-hero__doi">
								<span class="digitopub-issue-hero__label">DOI:</span>
								<a href="{$issueDoiUrl|escape}" target="_blank" rel="noopener">{$issueDoiUrl}</a>
							</p>
						{/if}
					</div>
				</div>

			</div>
		</div>
	</section>

	{* Issue description *}
	{if $issue->hasDescription()}
		<section class="digitopub-issue-description" aria-label="{translate key="common.description"}">
			<div class="digitopub-container">
				<div class="digitopub-issue-description__card">
					<h2 class="digitopub-issue-description__title">{translate key="common.description"}</h2>
					{$issue->getLocalizedDescription()|strip_unsafe_html}
				</div>
			</div>
		</section>
	{/if}

	{* Full-issue galleys *}
	{if $issueGalleys}
		<section class="digitopub-issue-galleys" aria-labelledby="issueTocGalleyLabel">
			<div class="digitopub-container">
				<{$heading} id="issueTocGalleyLabel" class="digitopub-issue-section__title">{translate key="issue.fullIssue"}</{$heading}>
				<div class="digitopub-issue-galleys__list">
					{foreach from=$issueGalleys item=galley}
						{include file="frontend/objects/galley_link.tpl" parent=$issue labelledBy="issueTocGalleyLabel" purchaseFee=$currentJournal->getData('purchaseIssueFee') purchaseCurrency=$currentJournal->getData('currency')}
					{/foreach}
				</div>
			</div>
		</section>
	{/if}

	{* Articles *}
	<div class="digitopub-issue-articles">
		<div class="digitopub-container">
			{foreach name=sections from=$publishedSubmissions item=section}
				{if $section.articles}
					<section class="digitopub-issue-section" aria-labelledby="digitopub-issue-section-{$smarty.foreach.sections.index}">
						{if $section.title}
							<{$heading} id="digitopub-issue-section-{$smarty.foreach.sections.index}" class="digitopub-issue-section__title">{$section.title|escape}</{$heading}>
						{/if}
						<div class="digitopub-issue-section__articles">
							{foreach from=$section.articles item=article}
								{include file="frontend/objects/article_summary.tpl" article=$article heading=$articleHeading sectionTitle=$section.title}
							{/foreach}
						</div>
					</section>
				{/if}
			{/foreach}
		</div>
	</div>

</div>
