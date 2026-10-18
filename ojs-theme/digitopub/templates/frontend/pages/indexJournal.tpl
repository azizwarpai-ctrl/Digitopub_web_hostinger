{**
 * plugins/themes/digitopub/templates/frontend/pages/indexJournal.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub journal landing page — submission portal.
 *
 * #183: SubmitManager is used only for submission, editorial workflow and
 * storage. This page shows no issues or articles; readers are sent to the
 * journal on DigitoPub (https://digitopub.com/journals/{path}), the single
 * publishing surface. Reuses the Phase 3.1 hero/section/sidebar styles.
 *}
{include file="frontend/components/header.tpl" pageTitleTranslated=$currentJournal->getLocalizedName()}

{capture assign="digitopubJournalUrl"}https://digitopub.com/journals/{$currentJournal->getPath()|escape:"url"}{/capture}

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

					<p class="digitopub-journal-hero__description">
						Submit and manage your manuscript for {$currentJournal->getLocalizedName()|escape}. Published articles and issues are available on DigitoPub.
					</p>

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
						<a href="{url page="submission" op="wizard"}" class="digitopub-btn digitopub-btn--accent">
							{translate key="author.submit"}
						</a>
						<a href="{url page="about" op="submissions"}" class="digitopub-btn digitopub-btn--outline">
							{translate key="about.submissions"}
						</a>
						<a href="{$digitopubJournalUrl}" class="digitopub-btn digitopub-btn--primary">
							Read this journal on DigitoPub
						</a>
					</div>
				</div>

			</div>
		</div>
	</section>

	{* Main Content *}
	<div class="digitopub-journal-main">
		<div class="digitopub-container">
			<div class="digitopub-journal-main__grid">

				<div class="digitopub-journal-main__content">

					{* How to submit *}
					<section class="digitopub-journal-section" aria-labelledby="digitopub-journal-submit-title">
						<h2 id="digitopub-journal-submit-title" class="digitopub-journal-section__title">Submit your manuscript</h2>
						<div class="digitopub-journal-section__body">
							<ol>
								<li>Read the <a href="{url page="about" op="submissions"}">{translate key="about.submissions"}</a>.</li>
								{if $isUserLoggedIn}
									<li>Go to your <a href="{url page="dashboard"}">{translate key="navigation.dashboard"}</a> to track existing submissions.</li>
								{else}
									<li><a href="{url page="login"}">{translate key="user.login"}</a> or <a href="{url page="user" op="register"}">{translate key="user.register"}</a>.</li>
								{/if}
								<li>Start a <a href="{url page="submission" op="wizard"}">{translate key="author.submit"}</a>.</li>
							</ol>
							<a href="{url page="submission" op="wizard"}" class="digitopub-btn digitopub-btn--accent digitopub-btn--sm">{translate key="author.submit"}</a>
						</div>
					</section>

					{* Where to read *}
					<section class="digitopub-journal-section" aria-labelledby="digitopub-journal-read-title">
						<h2 id="digitopub-journal-read-title" class="digitopub-journal-section__title">Looking for published articles?</h2>
						<div class="digitopub-journal-section__body">
							<p>Issues, articles, policies and the editorial board of {$currentJournal->getLocalizedName()|escape} are published on DigitoPub.</p>
							<a href="{$digitopubJournalUrl}" class="digitopub-btn digitopub-btn--outline digitopub-btn--sm">Go to DigitoPub</a>
						</div>
					</section>

					{* Additional Homepage Content (editor-managed) *}
					{if $additionalHomeContent}
						<section class="digitopub-journal-section" aria-label="{translate key="plugins.themes.digitopub.journal.additionalContent"}">
							<div class="digitopub-journal-section__body">
								{$additionalHomeContent}
							</div>
						</section>
					{/if}

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
							<li><a href="{url page="submission" op="wizard"}">{translate key="author.submit"}</a></li>
							<li><a href="{url page="about" op="submissions"}">{translate key="about.submissions"}</a></li>
							{if $isUserLoggedIn}
								<li><a href="{url page="dashboard"}">{translate key="navigation.dashboard"}</a></li>
							{else}
								<li><a href="{url page="login"}">{translate key="user.login"}</a></li>
								<li><a href="{url page="user" op="register"}">{translate key="user.register"}</a></li>
							{/if}
							<li><a href="{$digitopubJournalUrl}">Read on DigitoPub</a></li>
						</ul>
					</div>

				</aside>

			</div>
		</div>
	</div>

</main>

{include file="frontend/components/footer.tpl"}
