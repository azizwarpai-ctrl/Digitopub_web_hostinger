{**
 * Digitopub theme override: templates/frontend/objects/issue_summary.tpl
 * Phase 8 – Modern archive issue card.
 *}
{if $issue->getShowTitle()}
	{assign var=issueTitle value=$issue->getLocalizedTitle()}
{/if}
{assign var=issueSeries value=$issue->getIssueSeries()}
{assign var=issueCover value=$issue->getLocalizedCoverImageUrl()}
{assign var=issueDoi value=$issue->getStoredPubId('doi')}
{assign var=issueVolume value=$issue->getVolume()}
{assign var=issueNumber value=$issue->getNumber()}
{assign var=issueYear value=$issue->getYear()}
{assign var=issueDate value=$issue->getDatePublished()}
{assign var=issueArticles value=$issue->getNumArticles()}

<article class="obj_issue_summary digitopub-issue-card {if $isCurrent}digitopub-issue-card--current{/if}" role="listitem">
	{if $isCurrent}
		<span class="digitopub-issue-card__badge">Current Issue</span>
	{/if}

	<a class="digitopub-issue-card__cover-link" href="{url op='view' path=$issue->getBestIssueId()}" aria-label="View {$issueSeries|escape}">
		{if $issueCover}
			<img src="{$issueCover|escape}" alt="{$issue->getLocalizedCoverImageAltText()|escape|default:''}" class="digitopub-issue-card__cover" loading="lazy">
		{else}
			<div class="digitopub-issue-card__cover digitopub-issue-card__cover--placeholder">
				<span class="digitopub-issue-card__cover-series">{$issueSeries|escape}</span>
			</div>
		{/if}
	</a>

	<div class="digitopub-issue-card__body">
		{if $journalName}
			<div class="digitopub-issue-card__journal">{$journalName|escape}</div>
		{/if}

		<h2 class="digitopub-issue-card__title">
			<a href="{url op='view' path=$issue->getBestIssueId()}">
				{if $issueTitle}
					{$issueTitle|escape}
				{else}
					{$issueSeries|escape}
				{/if}
			</a>
		</h2>

		{if $issueTitle && $issueSeries}
			<p class="digitopub-issue-card__series">{$issueSeries|escape}</p>
		{/if}

		<div class="digitopub-issue-card__meta">
			{if $issueVolume}
				<span class="digitopub-issue-card__meta-item">
					<svg class="digitopub-issue-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/></svg>
					Volume {$issueVolume|escape}
				</span>
			{/if}
			{if $issueNumber}
				<span class="digitopub-issue-card__meta-item">
					<svg class="digitopub-issue-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 2h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 16h14v2H5v-2zm0-11h5v10H5V5z"/></svg>
					Issue {$issueNumber|escape}
				</span>
			{/if}
			{if $issueYear}
				<span class="digitopub-issue-card__meta-item">
					<svg class="digitopub-issue-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/></svg>
					{$issueYear|escape}
				</span>
			{/if}
			{if $issueDate}
				<span class="digitopub-issue-card__meta-item">
					<svg class="digitopub-issue-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
					{$issueDate|truncate:10:''}
				</span>
			{/if}
			{if $issueArticles}
				<span class="digitopub-issue-card__meta-item">
					<svg class="digitopub-issue-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
					{$issueArticles|escape} Articles
				</span>
			{/if}
		</div>

		{if $issueDoi}
			<p class="digitopub-issue-card__doi">
				<svg class="digitopub-issue-card__doi-icon" viewBox="0 0 24 24" aria-hidden="true" width="14" height="14"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
				<strong>DOI</strong>
				<a href="https://doi.org/{$issueDoi|escape}" target="_blank" rel="noopener">{$issueDoi|escape}</a>
			</p>
		{/if}

		<div class="digitopub-issue-card__actions">
			<a href="{url op='view' path=$issue->getBestIssueId()}" class="digitopub-btn digitopub-btn--primary">
				<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
				View Issue
			</a>
		</div>
	</div>
</article><!-- .digitopub-issue-card -->
