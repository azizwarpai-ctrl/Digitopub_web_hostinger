{**
 * plugins/themes/digitopub/templates/frontend/pages/indexJournal.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub journal landing page.
 *
 * Phase 3.1: redesigned journal hero using the journal homepage image as the
 * primary cover, with a graceful fallback to the journal logo. Cleaner
 * spacing, larger typography, soft shadows, rounded cards, and improved
 * responsive behavior.
 *}
{include file="frontend/components/header.tpl" pageTitleTranslated=$currentJournal->getLocalizedName()}

{* Count articles in current issue for statistics *}
{assign var="currentIssueArticleCount" value=0}
{if $publishedSubmissions}
	{foreach from=$publishedSubmissions item=section}
		{assign var="currentIssueArticleCount" value=$currentIssueArticleCount + $section.articles|@count}
	{/foreach}
{/if}

{* Journal cover: prefer homepage image, fall back to journal logo, then placeholder *}
{assign var="journalCover" value=$currentJournal->getLocalizedData('homepageImage')}
{if !$journalCover}
	{assign var="journalCover" value=$currentJournal->getLocalizedData('pageHeaderLogoImage')}
{/if}

<main class="digitopub-journal-page" id="digitopub-journal-content">

	{* Hero Section *}
	<section class="digitopub-journal-hero" aria-labelledby="digitopub-journal-hero-title">
		<div class="digitopub-container">
			<div class="digitopub-journal-hero__grid">

				{* Cover *}
				<div class="digitopub-journal-hero__cover">
					{if $journalCover}
						<img src="{$publicFilesDir}/{$journalCover.uploadName|escape:"url"}" alt="{$currentJournal->getLocalizedName()|escape}" class="digitopub-journal-hero__cover-image" width="{$journalCover.width|escape}" height="{$journalCover.height|escape}">
					{else}
						<div class="digitopub-journal-hero__cover-placeholder" aria-hidden="true">
							<span>{$currentJournal->getLocalizedName()|escape|truncate:2:""}</span>
						</div>
					{/if}
				</div>

				{* Content *}
				<div class="digitopub-journal-hero__content">
					<h1 id="digitopub-journal-hero-title" class="digitopub-journal-hero__title">{$currentJournal->getLocalizedName()|escape}</h1>

					{if $journalDescription}
						<p class="digitopub-journal-hero__description">{$journalDescription|strip_tags|strip|truncate:360|escape}</p>
					{/if}

					<ul class="digitopub-journal-hero__meta">
						{if $currentJournal->getData('issn')}
							<li>
								<span class="digitopub-journal-hero__meta-label">{translate key="manager.setup.issn"}</span>
								<span class="digitopub-journal-hero__meta-value">{$currentJournal->getData('issn')|escape}</span>
							</li>
						{/if}
						{if $currentJournal->getData('onlineIssn')}
							<li>
								<span class="digitopub-journal-hero__meta-label">{translate key="manager.setup.onlineIssn"}</span>
								<span class="digitopub-journal-hero__meta-value">{$currentJournal->getData('onlineIssn')|escape}</span>
							</li>
						{/if}
						{if $currentJournal->getData('publisherInstitution')}
							<li>
								<span class="digitopub-journal-hero__meta-label">{translate key="manager.setup.publisher"}</span>
								<span class="digitopub-journal-hero__meta-value">{$currentJournal->getData('publisherInstitution')|escape}</span>
							</li>
						{/if}
					</ul>

					<div class="digitopub-journal-hero__actions">
						<a href="{url page="about"}" class="digitopub-btn digitopub-btn--outline">
							{translate key="about.aboutContext"}
						</a>
						{if $issue}
							<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}" class="digitopub-btn digitopub-btn--primary">
								{translate key="journal.currentIssue"}
							</a>
						{/if}
						<a href="{url page="submission" op="wizard"}" class="digitopub-btn digitopub-btn--accent">
							{translate key="author.submit"}
						</a>
					</div>
				</div>

			</div>
		</div>
	</section>

	{* Statistics Section *}
	<section class="digitopub-journal-stats" aria-label="{translate key="plugins.themes.digitopub.journal.stats"}">
		<div class="digitopub-container">
			<div class="digitopub-journal-stats__grid">

				{* Articles *}
				<div class="digitopub-journal-stat">
					<div class="digitopub-journal-stat__icon" aria-hidden="true">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
					</div>
					<div class="digitopub-journal-stat__value">{$currentIssueArticleCount|number_format:0}</div>
					<div class="digitopub-journal-stat__label">{translate key="article.articles"}</div>
				</div>

				{* Language *}
				<div class="digitopub-journal-stat">
					<div class="digitopub-journal-stat__icon" aria-hidden="true">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
					</div>
					<div class="digitopub-journal-stat__value">
						{if $currentJournal->getPrimaryLocale() == 'en'}
							English
						{elseif $currentJournal->getPrimaryLocale() == 'ar'}
							العربية
						{elseif $currentJournal->getPrimaryLocale() == 'fr'}
							Français
						{elseif $currentJournal->getPrimaryLocale() == 'es'}
							Español
						{elseif $currentJournal->getPrimaryLocale() == 'de'}
							Deutsch
						{else}
							{$currentJournal->getPrimaryLocale()|escape}
						{/if}
					</div>
					<div class="digitopub-journal-stat__label">{translate key="common.language"}</div>
				</div>

				{* ISSN *}
				{if $currentJournal->getData('issn') || $currentJournal->getData('onlineIssn')}
					<div class="digitopub-journal-stat">
						<div class="digitopub-journal-stat__icon" aria-hidden="true">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/></svg>
						</div>
						<div class="digitopub-journal-stat__value">
							{if $currentJournal->getData('issn')}
								{$currentJournal->getData('issn')|escape}
							{else}
								{$currentJournal->getData('onlineIssn')|escape}
							{/if}
						</div>
						<div class="digitopub-journal-stat__label">
							{if $currentJournal->getData('issn')}
								{translate key="manager.setup.issn"}
							{else}
								{translate key="manager.setup.onlineIssn"}
							{/if}
						</div>
					</div>
				{/if}

				{* Current Issue *}
				{if $issue}
					<div class="digitopub-journal-stat">
						<div class="digitopub-journal-stat__icon" aria-hidden="true">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
						</div>
						<div class="digitopub-journal-stat__value">{$issue->getIssueIdentification()|strip_tags|strip|escape}</div>
						<div class="digitopub-journal-stat__label">{translate key="journal.currentIssue"}</div>
					</div>
				{/if}

			</div>
		</div>
	</section>

	{* Main Content *}
	<div class="digitopub-journal-main">
		<div class="digitopub-container">
			<div class="digitopub-journal-main__grid">

				{* Left column: sections *}
				<div class="digitopub-journal-main__content">

					{* About the Journal *}
					{if $journalDescription}
						<section class="digitopub-journal-section" aria-labelledby="digitopub-journal-about-title">
							<h2 id="digitopub-journal-about-title" class="digitopub-journal-section__title">{translate key="about.aboutContext"}</h2>
							<div class="digitopub-journal-section__body">
								<p>{$journalDescription|strip_tags|strip|truncate:700|escape}</p>
								<a href="{url page="about"}" class="digitopub-btn digitopub-btn--outline digitopub-btn--sm">{translate key="common.more"}</a>
							</div>
						</section>
					{/if}

					{* Current Issue *}
					{if $issue}
						<section class="digitopub-journal-section" aria-labelledby="digitopub-journal-current-issue-title">
							<div class="digitopub-journal-section__header">
								<h2 id="digitopub-journal-current-issue-title" class="digitopub-journal-section__title">{translate key="journal.currentIssue"}</h2>
								<a href="{url page="issue" op="archive"}" class="digitopub-journal-section__link">{translate key="journal.viewAllIssues"}</a>
							</div>
							<div class="digitopub-journal-current-issue">
								{if $issue->getLocalizedCoverImageUrl()}
									<div class="digitopub-journal-current-issue__cover">
										<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}">
											<img src="{$issue->getLocalizedCoverImageUrl()|escape}" alt="{$issue->getIssueIdentification()|escape}" class="digitopub-journal-current-issue__cover-image">
										</a>
									</div>
								{/if}
								<div class="digitopub-journal-current-issue__content">
									<h3 class="digitopub-journal-current-issue__title">
										<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}">{$issue->getIssueIdentification()|strip_unsafe_html}</a>
									</h3>
									{if $issue->getDatePublished()}
										<p class="digitopub-journal-current-issue__date">
											{translate key="submissions.published"}: {$issue->getDatePublished()|date_format:$dateFormatShort}
										</p>
									{/if}
									{if $issue->getLocalizedDescription()}
										<p class="digitopub-journal-current-issue__description">{$issue->getLocalizedDescription()|strip_tags|strip|truncate:240|escape}</p>
									{/if}
									<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm">{translate key="issue.viewIssue"}</a>
								</div>
							</div>
						</section>
					{/if}

					{* Latest Articles *}
					{if $publishedSubmissions}
						<section class="digitopub-journal-section" aria-labelledby="digitopub-journal-articles-title">
							<div class="digitopub-journal-section__header">
								<h2 id="digitopub-journal-articles-title" class="digitopub-journal-section__title">{translate key="plugins.themes.digitopub.journal.latestArticles"}</h2>
								<a href="{url page="issue" op="archive"}" class="digitopub-journal-section__link">{translate key="plugins.themes.digitopub.journal.viewAll"}</a>
							</div>
							<div class="digitopub-journal-articles">
								{foreach from=$publishedSubmissions item=section}
									{foreach from=$section.articles item=article}
										{include file="frontend/objects/article_summary.tpl" article=$article heading="h3" hideGalleys=true}
									{/foreach}
								{/foreach}
							</div>
						</section>
					{/if}

					{* Editorial Board *}
					{if $currentJournal->getLocalizedData('editorialTeam')}
						<section class="digitopub-journal-section" aria-labelledby="digitopub-journal-editorial-title">
							<h2 id="digitopub-journal-editorial-title" class="digitopub-journal-section__title">{translate key="common.editorialMasthead"}</h2>
							<div class="digitopub-journal-section__body digitopub-journal-editorial">
								{$currentJournal->getLocalizedData('editorialTeam')|strip_unsafe_html|truncate:500}
								<a href="{url page="about" op="editorialMasthead"}" class="digitopub-btn digitopub-btn--outline digitopub-btn--sm">{translate key="common.more"}</a>
							</div>
						</section>
					{/if}

					{* Additional Homepage Content *}
					{if $additionalHomeContent}
						<section class="digitopub-journal-section" aria-label="{translate key="plugins.themes.digitopub.journal.additionalContent"}">
							<div class="digitopub-journal-section__body">
								{$additionalHomeContent}
							</div>
						</section>
					{/if}

					{* Announcements *}
					{include file="frontend/objects/announcements_list.tpl" numAnnouncements=$numAnnouncementsHomepage}

				</div>

				{* Right column: sidebar *}
				<aside class="digitopub-journal-sidebar" aria-label="{translate key="common.navigation.sidebar"}">

					{* Journal Information *}
					<div class="digitopub-journal-sidebar__block">
						<h3 class="digitopub-journal-sidebar__title">{translate key="about.aboutContext"}</h3>
						<ul class="digitopub-journal-sidebar__list">
							{if $currentJournal->getData('issn')}
								<li>
									<span class="digitopub-journal-sidebar__label">{translate key="manager.setup.issn"}</span>
									<span class="digitopub-journal-sidebar__value">{$currentJournal->getData('issn')|escape}</span>
								</li>
							{/if}
							{if $currentJournal->getData('onlineIssn')}
								<li>
									<span class="digitopub-journal-sidebar__label">{translate key="manager.setup.onlineIssn"}</span>
									<span class="digitopub-journal-sidebar__value">{$currentJournal->getData('onlineIssn')|escape}</span>
								</li>
							{/if}
							{if $currentJournal->getData('publisherInstitution')}
								<li>
									<span class="digitopub-journal-sidebar__label">{translate key="manager.setup.publisher"}</span>
									<span class="digitopub-journal-sidebar__value">{$currentJournal->getData('publisherInstitution')|escape}</span>
								</li>
							{/if}
							<li>
								<span class="digitopub-journal-sidebar__label">{translate key="common.language"}</span>
								<span class="digitopub-journal-sidebar__value">{$currentJournal->getPrimaryLocale()|escape}</span>
							</li>
						</ul>
					</div>

					{* Quick Links *}
					<div class="digitopub-journal-sidebar__block">
						<h3 class="digitopub-journal-sidebar__title">{translate key="plugins.themes.digitopub.journal.navigation"}</h3>
						<ul class="digitopub-journal-sidebar__links">
							<li><a href="{url page="about"}">{translate key="navigation.about"}</a></li>
							<li><a href="{url page="about" op="editorialMasthead"}">{translate key="common.editorialMasthead"}</a></li>
							<li><a href="{url page="issue" op="archive"}">{translate key="navigation.archives"}</a></li>
							<li><a href="{url page="submission" op="wizard"}">{translate key="author.submit"}</a></li>
							<li><a href="{url page="search"}">{translate key="common.search"}</a></li>
						</ul>
					</div>

					{* Current Issue Sidebar *}
					{if $issue}
						<div class="digitopub-journal-sidebar__block">
							<h3 class="digitopub-journal-sidebar__title">{translate key="journal.currentIssue"}</h3>
							<p class="digitopub-journal-sidebar__text">{$issue->getIssueIdentification()|strip_unsafe_html}</p>
							<a href="{url page="issue" op="view" path=$issue->getBestIssueId()}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm digitopub-btn--block">{translate key="issue.viewIssue"}</a>
						</div>
					{/if}

				</aside>

			</div>
		</div>
	</div>

</main>

{include file="frontend/components/footer.tpl"}
