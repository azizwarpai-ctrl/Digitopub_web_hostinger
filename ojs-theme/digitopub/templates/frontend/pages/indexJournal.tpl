{**
 * plugins/themes/digitopub/templates/frontend/pages/indexJournal.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub journal landing page: a focused submission portal.
 *
 * #183: SubmitManager is used only for submission, editorial workflow and
 * storage. This page shows no issues or articles; readers are sent to the
 * journal on DigitoPub (https://digitopub.com/journals/{path}).
 * PR 2 (P3): one primary action (New submission), a three-step path and a quiet
 * journal facts list. Styles: styles/pages/portal.less. The cover comes from
 * $digitopubCoverThumbs (WebP thumbnails) with the original upload as fallback.
 *}
{include file="frontend/components/header.tpl" pageTitleTranslated=$currentJournal->getLocalizedName()}

{capture assign="digitopubJournalUrl"}https://digitopub.com/journals/{$currentJournal->getPath()|escape:"url"}{/capture}

{* Journal cover: prefer homepage image, fall back to journal logo, then placeholder *}
{assign var="journalCover" value=$currentJournal->getLocalizedData('homepageImage')}
{if !$journalCover}
	{assign var="journalCover" value=$currentJournal->getLocalizedData('pageHeaderLogoImage')}
{/if}

<div class="dp-portal" id="digitopub-journal-content">

	<section class="dp-portal-hero" aria-labelledby="digitopub-journal-hero-title">
		<div class="dp-portal__inner dp-portal-hero__grid">

			<div class="dp-portal-hero__media">
				{if isset($digitopubCoverThumbs[$currentJournal->getId()])}
					<img class="dp-portal-hero__cover" src="{$digitopubCoverThumbs[$currentJournal->getId()].sm|escape}" srcset="{$digitopubCoverThumbs[$currentJournal->getId()].sm|escape} 480w, {$digitopubCoverThumbs[$currentJournal->getId()].md|escape} 960w" sizes="(min-width: 768px) 15rem, 5rem" width="480" height="640" fetchpriority="high" decoding="async" alt="{$currentJournal->getLocalizedName()|escape}">
				{elseif $journalCover}
					<img class="dp-portal-hero__cover" src="{$publicFilesDir}/{$journalCover.uploadName|escape:"url"}" width="{$journalCover.width|escape}" height="{$journalCover.height|escape}" fetchpriority="high" decoding="async" alt="{$currentJournal->getLocalizedName()|escape}">
				{else}
					<div class="dp-portal-hero__cover dp-portal-hero__cover--placeholder" aria-hidden="true">
						<span>{$currentJournal->getLocalizedName()|truncate:2:""|escape}</span>
					</div>
				{/if}
			</div>

			<div class="dp-portal-hero__content">
				<h1 id="digitopub-journal-hero-title" class="dp-portal-hero__title">{$currentJournal->getLocalizedName()|escape}</h1>
				{if isset($digitopubSpecializations[$currentJournal->getId()])}{assign var=dpSpec value=$digitopubSpecializations[$currentJournal->getId()]}<p class="dp-portal-hero__spec"><span class="dp-journal-card__spec">{$dpSpec|escape}</span></p>{/if}

				<p class="dp-portal-hero__lead">Submit and track manuscripts for this journal. Published articles are on DigitoPub.</p>

				{if $currentJournal->getData('issn') || $currentJournal->getData('onlineIssn') || $currentJournal->getData('publisherInstitution')}
					<p class="dp-portal-hero__meta">
						{if $currentJournal->getData('issn')}<span>{translate key="manager.setup.issn"} {$currentJournal->getData('issn')|escape}</span>{/if}
						{if $currentJournal->getData('onlineIssn')}<span>{translate key="manager.setup.onlineIssn"} {$currentJournal->getData('onlineIssn')|escape}</span>{/if}
						{if $currentJournal->getData('publisherInstitution')}<span>{$currentJournal->getData('publisherInstitution')|escape}</span>{/if}
					</p>
				{/if}

				<div class="dp-portal-hero__actions">
					<a href="{url page="submission" op="wizard"}" class="digitopub-btn digitopub-btn--primary">
						{include file="frontend/components/icons/file-plus.tpl"}
						New submission
					</a>
					<a href="{url page="about" op="submissions"}" class="digitopub-btn digitopub-btn--outline">Author guidelines</a>
					<a href="{$digitopubJournalUrl}" class="digitopub-btn digitopub-btn--link">
						View on DigitoPub
						{include file="frontend/components/icons/external-link.tpl"}
					</a>
				</div>
			</div>

		</div>
	</section>

	<div class="dp-portal__inner dp-portal__body">

		<section class="dp-portal-section" aria-labelledby="digitopub-journal-steps-title">
			<h2 id="digitopub-journal-steps-title" class="dp-portal-section__title">How to submit</h2>
			<ol class="dp-steps">
				<li class="dp-steps__item">
					{include file="frontend/components/icons/book-open.tpl"}
					<div class="dp-steps__text">
						<h3 class="dp-steps__title">Read the author guidelines</h3>
						<p>Check the scope and formatting rules in the <a href="{url page="about" op="submissions"}">author guidelines</a>.</p>
					</div>
				</li>
				<li class="dp-steps__item">
					{if $isUserLoggedIn}
						{include file="frontend/components/icons/layout-dashboard.tpl"}
						<div class="dp-steps__text">
							<h3 class="dp-steps__title">Go to your dashboard</h3>
							<p>Open your <a href="{url page="dashboard"}">dashboard</a> to follow your existing submissions.</p>
						</div>
					{else}
						{include file="frontend/components/icons/log-in.tpl"}
						<div class="dp-steps__text">
							<h3 class="dp-steps__title">Log in or register</h3>
							<p><a href="{url page="login"}">Log in</a> to your account, or <a href="{url page="user" op="register"}">register</a> if you are new.</p>
						</div>
					{/if}
				</li>
				<li class="dp-steps__item">
					{include file="frontend/components/icons/file-plus.tpl"}
					<div class="dp-steps__text">
						<h3 class="dp-steps__title">Start a new submission</h3>
						<p>Upload your manuscript and details in a few guided steps.</p>
					</div>
				</li>
			</ol>
		</section>

		<section class="dp-portal-section" aria-labelledby="digitopub-journal-facts-title">
			<h2 id="digitopub-journal-facts-title" class="dp-portal-section__title">About this journal</h2>
			<dl class="dp-facts">
				{if $currentJournal->getData('issn')}
					<div class="dp-facts__row"><dt>{translate key="manager.setup.issn"}</dt><dd>{$currentJournal->getData('issn')|escape}</dd></div>
				{/if}
				{if $currentJournal->getData('onlineIssn')}
					<div class="dp-facts__row"><dt>{translate key="manager.setup.onlineIssn"}</dt><dd>{$currentJournal->getData('onlineIssn')|escape}</dd></div>
				{/if}
				{if $currentJournal->getData('publisherInstitution')}
					<div class="dp-facts__row"><dt>{translate key="manager.setup.publisher"}</dt><dd>{$currentJournal->getData('publisherInstitution')|escape}</dd></div>
				{/if}
				<div class="dp-facts__row"><dt>{translate key="common.language"}</dt><dd>{$currentJournal->getPrimaryLocale()|escape}</dd></div>
			</dl>
		</section>

		{* Additional Homepage Content (editor-managed) *}
		{if $additionalHomeContent}
			<section class="dp-portal-section dp-portal-section--content" aria-label="{translate key="plugins.themes.digitopub.journal.additionalContent"}">
				{$additionalHomeContent}
			</section>
		{/if}

	</div>

</div>

{include file="frontend/components/footer.tpl"}
