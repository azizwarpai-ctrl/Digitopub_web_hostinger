{**
 * Digitopub theme override: templates/frontend/pages/issueArchive.tpl
 * Phase 8 – Modern academic archives page.
 *}
{capture assign="pageTitle"}
	{if $prevPage}
		{translate key="archive.archivesPageNumber" pageNumber=$prevPage+1}
	{else}
		{translate key="archive.archives"}
	{/if}
{/capture}
{include file="frontend/components/header.tpl" pageTitleTranslated=$pageTitle}

<link rel="stylesheet" href="{$baseUrl}/plugins/themes/digitopub/styles/digitopub-archive-layout.css?v=3" type="text/css">

{* Compute archive statistics *}
{assign var="totalArticles" value=0}
{assign var="volumeList" value=[]}
{foreach from=$issues item="issue"}
	{assign var="issueVolume" value=$issue->getVolume()}
	{if $issueVolume && !in_array($issueVolume, $volumeList)}
		{append var="volumeList" value=$issueVolume}
	{/if}
	{if $issue->getNumArticles()}
		{assign var="totalArticles" value=$totalArticles+$issue->getNumArticles()}
	{/if}
{/foreach}
{assign var="totalVolumes" value=$volumeList|@count}

<div class="page page_issue_archive digitopub-archive-page">
	<div class="digitopub-container">
		{include file="frontend/components/breadcrumbs.tpl" currentTitle=$pageTitle}

		{* Hero *}
		<section class="digitopub-archive-hero">
			<span class="digitopub-archive-hero__kicker">Issue Archive</span>
			<h1 class="digitopub-archive-hero__title">Archives</h1>
			<p class="digitopub-archive-hero__subtitle">
				Browse all published volumes and issues of {$currentJournal->getLocalizedName()|escape}.
			</p>
		</section>

		{* Statistics *}
		<section class="digitopub-archive-stats" aria-label="Archive statistics">
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">{$totalVolumes|default:0|escape}</div>
				<div class="digitopub-stat-card__label">Total Volumes</div>
			</div>
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">{$total|default:0|escape}</div>
				<div class="digitopub-stat-card__label">Total Issues</div>
			</div>
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">{$totalArticles|default:0|escape}</div>
				<div class="digitopub-stat-card__label">Total Articles</div>
			</div>
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">Open</div>
				<div class="digitopub-stat-card__label">Access</div>
			</div>
		</section>

		{* Empty state *}
		{if empty($issues)}
			<div class="digitopub-archive-empty">
				<div class="digitopub-archive-empty__icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 2h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 16h14v2H5v-2zm0-11h5v10H5V5z"/></svg>
				</div>
				<h3 class="digitopub-archive-empty__title">No archived issues available.</h3>
				<p class="digitopub-archive-empty__text">Check back soon for newly published volumes and issues.</p>
			</div>

		{* Issue grid *}
		{else}
			<div class="digitopub-archive-grid" role="list">
				{foreach from=$issues item="issue"}
					{include file="frontend/objects/issue_summary.tpl" isCurrent=$issue@first journalName=$currentJournal->getLocalizedName()}
				{/foreach}
			</div>

			{* Pagination *}
			{if $prevPage > 1}
				{capture assign=prevUrl}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="issue" op="archive" path=$prevPage}{/capture}
			{elseif $prevPage === 1}
				{capture assign=prevUrl}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="issue" op="archive"}{/capture}
			{/if}
			{if $nextPage}
				{capture assign=nextUrl}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="issue" op="archive" path=$nextPage}{/capture}
			{/if}
			<div class="digitopub-archive-pagination-wrap">
				{include
					file="frontend/components/pagination.tpl"
					prevUrl=$prevUrl
					nextUrl=$nextUrl
					showingStart=$showingStart
					showingEnd=$showingEnd
					total=$total
				}
			</div>
		{/if}
	</div>
</div>

{include file="frontend/components/footer.tpl"}
