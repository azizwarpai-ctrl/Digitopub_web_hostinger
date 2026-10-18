{**
 * plugins/themes/digitopub/templates/frontend/pages/issue.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub single issue page.
 *
 * Phase 4: modern scientific publishing layout for the Current Issue page.
 *}
{include file="frontend/components/header.tpl" pageTitleTranslated=$issueIdentification}

<link rel="stylesheet" href="{$baseUrl}/plugins/themes/digitopub/styles/digitopub-issue-layout.css?v=2" type="text/css">

<div class="page page_issue digitopub-issue-page">

	{* Display a message if no current issue exists *}
	{if !$issue}
		{include file="frontend/components/breadcrumbs_issue.tpl" currentTitleKey="current.noCurrentIssue"}
		<div class="digitopub-container">
			<h1>{translate key="current.noCurrentIssue"}</h1>
			{include file="frontend/components/notification.tpl" type="warning" messageKey="current.noCurrentIssueDesc"}
		</div>

	{* Display an issue with the Table of Contents *}
	{else}
		{include file="frontend/components/breadcrumbs_issue.tpl" currentTitle=$issueIdentification}
		{include file="frontend/objects/issue_toc.tpl"}
	{/if}
</div>

{include file="frontend/components/footer.tpl"}
