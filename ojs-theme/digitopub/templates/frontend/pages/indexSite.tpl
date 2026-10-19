{**
 * plugins/themes/digitopub/templates/frontend/pages/indexSite.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub site homepage: short hero plus a searchable grid of journals.
 * PR 2 (P3): search-only filter (js/digitopub.js), cards use
 * $digitopubCoverThumbs with the original upload as fallback.
 * Styles: styles/pages/portal.less.
 *}
{include file="frontend/components/header.tpl"}

<main class="dp-portal digitopub-homepage" id="digitopub-homepage-content">

	<section class="dp-site-hero" aria-labelledby="digitopub-hero-title">
		<div class="dp-portal__inner">
			<h1 id="digitopub-hero-title" class="dp-site-hero__title">Submit to a DigitoPub journal</h1>
			<p class="dp-site-hero__lead">Choose a journal to submit your manuscript. Published articles live on <a href="https://digitopub.com/journals">DigitoPub</a>.</p>
		</div>
	</section>

	{* Highlights *}
	{if $highlights->count()}
		{include file="frontend/components/highlights.tpl" highlights=$highlights}
	{/if}

	{* About *}
	{if $about}
		<section class="digitopub-about" aria-label="{translate|escape key="about.aboutContext"}">
			<div class="digitopub-container">
				{$about}
			</div>
		</section>
	{/if}

	{* Announcements *}
	{include file="frontend/objects/announcements_list.tpl" numAnnouncements=$numAnnouncementsHomepage}

	<section class="dp-journals" id="digitopub-journals" aria-labelledby="digitopub-journals-title">
		<div class="dp-portal__inner">
			<h2 id="digitopub-journals-title" class="pkp_screen_reader">{translate key="context.contexts"}</h2>

			{if !$journals|@count}
				<p class="dp-journals__empty">{translate key="site.noJournals"}</p>
			{else}
				<div class="dp-journals__toolbar">
					<label class="dp-journals__label" for="digitopub-filter-search">Find a journal</label>
					<input type="search" id="digitopub-filter-search" class="dp-journal-search" placeholder="Search by journal name" autocomplete="off">
					<p class="dp-journals__count" id="digitopub-filter-count" role="status" aria-live="polite"></p>
				</div>

				<div class="dp-journal-grid" id="digitopub-journals-grid" role="list">
					{foreach from=$journals item=journal}
						{capture assign="journalUrl"}{url journal=$journal->getPath()}{/capture}
						{capture assign="submitUrl"}{url journal=$journal->getPath() page="submission" op="wizard"}{/capture}
						{capture assign="digitopubJournalUrl"}https://digitopub.com/journals/{$journal->getPath()|escape:"url"}{/capture}
						{assign var="cover" value=$journal->getLocalizedData('homepageImage')}

						<article class="dp-journal-card" role="listitem" data-name="{$journal->getLocalizedName()|escape}">
							<div class="dp-journal-card__cover">
								{if isset($digitopubCoverThumbs[$journal->getId()])}
									<img src="{$digitopubCoverThumbs[$journal->getId()].sm|escape}" srcset="{$digitopubCoverThumbs[$journal->getId()].sm|escape} 480w, {$digitopubCoverThumbs[$journal->getId()].md|escape} 960w" sizes="(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 90vw" width="480" height="640" loading="lazy" decoding="async" alt="{$journal->getLocalizedName()|escape}">
								{elseif $cover}
									<img src="{$journalFilesPath}{$journal->getId()}/{$cover.uploadName|escape:"url"}" width="{$cover.width|escape}" height="{$cover.height|escape}" loading="lazy" decoding="async" alt="{$journal->getLocalizedName()|escape}">
								{else}
									<div class="dp-journal-card__placeholder" aria-hidden="true">
										<span>{$journal->getLocalizedName()|escape|truncate:2:""}</span>
									</div>
								{/if}
							</div>
							<div class="dp-journal-card__body">
								<h3 class="dp-journal-card__title"><a href="{$journalUrl}">{$journal->getLocalizedName()|escape}</a></h3>
							</div>
							<div class="dp-journal-card__actions">
								<a href="{$submitUrl}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm digitopub-btn--block">Submit</a>
								<a href="{$digitopubJournalUrl}" class="digitopub-btn digitopub-btn--link digitopub-btn--sm">View on DigitoPub</a>
							</div>
						</article>
					{/foreach}
				</div>

				<p class="dp-journals__empty" id="digitopub-no-match" hidden>No journals match your search.</p>
			{/if}
		</div>
	</section>

</main>

{include file="frontend/components/footer.tpl"}
