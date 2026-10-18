{**
 * Digitopub theme override: templates/frontend/pages/search.tpl
 *}
{include file="frontend/components/header.tpl" pageTitle="common.search"}

<link rel="stylesheet" href="{$baseUrl}/plugins/themes/digitopub/styles/digitopub-search-layout.css?v=3" type="text/css">

{if !$heading}
	{assign var="heading" value="h2"}
{/if}

<div class="page page_search digitopub-search-page">
	<div class="digitopub-container">
		{include file="frontend/components/breadcrumbs.tpl" currentTitleKey="common.search"}

		{* Hero / results header *}
		<section class="digitopub-search-hero">
			<span class="digitopub-search-hero__kicker">Article Search</span>
			<h1 class="digitopub-search-hero__title">{translate key="common.search"}</h1>
			{if $query}
				<p class="digitopub-search-hero__subtitle">
					Searching for <strong>"{$query|escape}"</strong>
				</p>
			{else}
				<p class="digitopub-search-hero__subtitle">
					Search across all published articles in our open access journals.
				</p>
			{/if}
			{if !$results->wasEmpty()}
				<div class="digitopub-search-hero__count">
					{$results->count|escape} result{if $results->count != 1}s{/if} found
				</div>
			{/if}
		</section>

		{* Search form card *}
		<section class="digitopub-search-card">
			{capture name="searchFormUrl"}{url escape=false}{/capture}
			{assign var=formUrlParameters value=[]}{* Prevent Smarty warning *}
			{$smarty.capture.searchFormUrl|parse_url:$smarty.const.PHP_URL_QUERY|default:""|parse_str:$formUrlParameters}
			<form class="digitopub-search-form" method="get" action="{$smarty.capture.searchFormUrl|strtok:"?"|escape}" role="form">
				{foreach from=$formUrlParameters key=paramKey item=paramValue}
					<input type="hidden" name="{$paramKey|escape}" value="{$paramValue|escape}"/>
				{/foreach}

				<div class="digitopub-search-bar">
					<label class="pkp_screen_reader" for="query">
						{translate key="search.searchFor"}
					</label>
					<div class="digitopub-search-bar__input-wrap">
						<svg class="digitopub-search-bar__icon" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.49.49 1.28.49 1.77 0s.49-1.28 0-1.77L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
						{block name=searchQuery}
							<input type="text" id="query" name="query" value="{$query|escape}" class="digitopub-search-bar__input" placeholder="{translate|escape key="common.search"}">
						{/block}
						{if $query}
							<a href="{url page="search" op="search"}" class="digitopub-search-bar__clear" aria-label="Clear search">&times;</a>
						{/if}
					</div>
					<button class="digitopub-btn digitopub-btn--primary digitopub-search-bar__button" type="submit">
						{translate key="common.search"}
					</button>
				</div>

				<fieldset class="digitopub-search-filters">
					<legend class="digitopub-search-filters__legend">
						{translate key="search.advancedFilters"}
					</legend>
					<div class="digitopub-search-filters__grid">
						<div class="digitopub-search-filter">
							<label class="digitopub-search-filter__label" for="authors">
								{translate key="search.author"}
							</label>
							{block name=searchAuthors}
								<input type="text" id="authors" name="authors" value="{$authors|escape}" class="digitopub-search-filter__input" placeholder="e.g. Smith, J.">
							{/block}
						</div>

						{if $searchableContexts}
							<div class="digitopub-search-filter">
								<label class="digitopub-search-filter__label" for="searchJournal">
									{translate key="search.journal"}
								</label>
								<select name="searchJournal" id="searchJournal" class="digitopub-search-filter__select">
									<option value="">{translate key="common.all"}</option>
									{foreach from=$searchableContexts item="searchableContext"}
										<option value="{$searchableContext->id}" {if $searchJournal == $searchableContext->id}selected{/if}>
											{$searchableContext->name|escape}
										</option>
									{/foreach}
								</select>
							</div>
						{/if}

						<div class="digitopub-search-filter">
							<label class="digitopub-search-filter__label">{translate key="search.dateFrom"}</label>
							<div class="digitopub-search-filter__date">
								{html_select_date_a11y legend="" prefix="dateFrom" time=$dateFrom start_year=$yearStart end_year=$yearEnd field_order="YMD" field_separator="-"}
							</div>
						</div>

						<div class="digitopub-search-filter">
							<label class="digitopub-search-filter__label">{translate key="search.dateTo"}</label>
							<div class="digitopub-search-filter__date">
								{html_select_date_a11y legend="" prefix="dateTo" time=$dateTo start_year=$yearStart end_year=$yearEnd field_order="YMD" field_separator="-"}
							</div>
						</div>
					</div>
				</fieldset>

				<div class="digitopub-search-form__submit">
					<button class="digitopub-btn digitopub-btn--primary" type="submit">{translate key="common.search"}</button>
					<a href="{url page="search" op="search"}" class="digitopub-btn digitopub-btn--ghost">Clear Filters</a>
				</div>
			</form>
		</section>

		{call_hook name="Templates::Search::SearchResults::PreResults"}

		<h2 class="pkp_screen_reader">{translate key="search.searchResults"}</h2>

		{* Results *}
		{if !$results->wasEmpty()}
			<div class="digitopub-search-results" role="list">
				{iterate from=results item=result}
					{include file="frontend/objects/article_summary.tpl" article=$result.publishedSubmission journal=$result.journal issue=$result.issue showDatePublished=true hideGalleys=false showAbstract=true heading="h3"}
				{/iterate}
			</div>

			{* Pagination *}
			<div class="digitopub-search-pagination">
				<div class="digitopub-search-pagination__info">
					{page_info iterator=$results}
				</div>
				<div class="digitopub-search-pagination__links">
					{page_links anchor="results" iterator=$results name="search" query=$query searchJournal=$searchJournal authors=$authors dateFromMonth=$dateFromMonth dateFromDay=$dateFromDay dateFromYear=$dateFromYear dateToMonth=$dateToMonth dateToDay=$dateToDay dateToYear=$dateToYear}
				</div>
			</div>

		{* Empty state *}
		{else}
			<div class="digitopub-search-empty">
				<div class="digitopub-search-empty__icon">
					<svg viewBox="0 0 24 24" aria-hidden="true" width="64" height="64"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.49.49 1.28.49 1.77 0s.49-1.28 0-1.77L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM2 19h8v2H2z"/></svg>
				</div>
				<h3 class="digitopub-search-empty__title">No articles matched your search.</h3>
				<p class="digitopub-search-empty__text">
					{if $error}
						{$error|escape}
					{else}
						Try adjusting your keywords, filters, or browse all publications.
					{/if}
				</p>
				<div class="digitopub-search-empty__actions">
					<a href="{url page="index"}" class="digitopub-btn digitopub-btn--primary">Return to Homepage</a>
					<a href="{url page="issue" op="archive"}" class="digitopub-btn digitopub-btn--ghost">Browse Archives</a>
				</div>
			</div>
		{/if}
	</div>
</div><!-- .page -->

{include file="frontend/components/footer.tpl"}
