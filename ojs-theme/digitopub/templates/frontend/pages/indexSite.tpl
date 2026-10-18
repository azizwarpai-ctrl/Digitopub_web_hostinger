{**
 * plugins/themes/digitopub/templates/frontend/pages/indexSite.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub site homepage.
 *}
{include file="frontend/components/header.tpl"}









<main class="digitopub-homepage" id="digitopub-homepage-content">

	{* Hero section *}
	<section class="digitopub-hero" aria-labelledby="digitopub-hero-title">
		<div class="digitopub-hero__container">
			<div class="digitopub-hero__content">
				<h1 id="digitopub-hero-title" class="digitopub-hero__title">Scientific Journals</h1>
				<p class="digitopub-hero__subtitle">Submit and manage manuscripts for DigitoPub's peer-reviewed journals. Published articles and issues are available on <a href="https://digitopub.com/journals">DigitoPub</a>.</p>
				<a href="#digitopub-journals" class="digitopub-hero__cta">
					Browse All Journals
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>
			</div>
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

	{* Journals grid *}
	<section class="digitopub-journals" id="digitopub-journals" aria-labelledby="digitopub-journals-title">
		<div class="digitopub-container">
			<h2 id="digitopub-journals-title" class="pkp_screen_reader">{translate key="context.contexts"}</h2>

			{if !$journals|@count}
				<p class="digitopub-journals__empty">{translate key="site.noJournals"}</p>
			{else}
				<div class="digitopub-journals__layout">
					<div class="digitopub-journals__main">
						{* Filter / search toolbar *}
						<div class="digitopub-filter">
							<div class="digitopub-filter__container">
								<div class="digitopub-filter__group digitopub-filter__group--search">
									<label class="digitopub-filter__label" for="digitopub-filter-search">Search journals</label>
									<input type="search" id="digitopub-filter-search" class="digitopub-filter__input" placeholder="Search by journal name or keyword…" autocomplete="off">
								</div>
								<div class="digitopub-filter__group">
									<label class="digitopub-filter__label" for="digitopub-filter-category">Category</label>
									<select id="digitopub-filter-category" class="digitopub-filter__select">
										<option value="">All categories</option>
									</select>
								</div>
								<div class="digitopub-filter__group">
									<label class="digitopub-filter__label" for="digitopub-filter-type">Journal type</label>
									<select id="digitopub-filter-type" class="digitopub-filter__select">
										<option value="">All journals</option>
										<option value="open-access">Open Access</option>
										<option value="peer-reviewed">Peer-Reviewed</option>
									</select>
								</div>
								<div class="digitopub-filter__group digitopub-filter__group--sort">
									<label class="digitopub-filter__label" for="digitopub-filter-sort">Sort by</label>
									<select id="digitopub-filter-sort" class="digitopub-filter__select">
										<option value="az">Name A – Z</option>
										<option value="za">Name Z – A</option>
									</select>
								</div>
							</div>
							<p class="digitopub-filter__results" aria-live="polite"></p>
						</div>

						<div class="digitopub-journals__grid" role="list" id="digitopub-journals-grid">
							{foreach from=$journals item=journal}
								{capture assign="journalUrl"}{url journal=$journal->getPath()}{/capture}
								{capture assign="submitUrl"}{url journal=$journal->getPath() page="submission" op="wizard"}{/capture}
								{capture assign="digitopubJournalUrl"}https://digitopub.com/journals/{$journal->getPath()|escape:"url"}{/capture}
								{assign var="cover" value=$journal->getLocalizedData('homepageImage')}
								{assign var="issn" value=$journal->getData('issn')}
								{assign var="onlineIssn" value=$journal->getData('onlineIssn')}
								{assign var="journalDescription" value=$journal->getLocalizedData('description')}
								{assign var="journalSubject" value=$journal->getLocalizedData('subject')}

								<article class="digitopub-card"
									role="listitem"
									aria-label="{$journal->getLocalizedName()|escape}"
									data-name="{$journal->getLocalizedName()|escape}"
									data-category="{if $journalSubject && !is_array($journalSubject)}{$journalSubject|escape}{/if}"
									data-description="{if $journalDescription}{$journalDescription|strip_tags|truncate:300|escape}{/if}">
									<div class="digitopub-card__cover">
										{if $cover}
											<img class="digitopub-card__cover-image" src="{$journalFilesPath}{$journal->getId()}/{$cover.uploadName|escape:"url"}" alt="{$journal->getLocalizedName()|escape}" loading="lazy">
										{else}
											<div class="digitopub-card__cover-placeholder" aria-hidden="true">
												<span>{$journal->getLocalizedName()|escape|truncate:2:""}</span>
											</div>
										{/if}

									</div>
									<div class="digitopub-card__body">
										<h3 class="digitopub-card__title">
											<a href="{$journalUrl}">{$journal->getLocalizedName()|escape}</a>
										</h3>
									</div>
									<div class="digitopub-card__actions">
										<a href="{$submitUrl}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm digitopub-btn--block">Submit Manuscript</a>
										<a href="{$digitopubJournalUrl}" class="digitopub-btn digitopub-btn--outline digitopub-btn--sm digitopub-btn--block">View on DigitoPub</a>
									</div>
								</article>
							{/foreach}
						</div>
					</div>

					<aside class="digitopub-services" aria-labelledby="digitopub-services-heading">
						<h3 id="digitopub-services-heading" class="digitopub-services__heading">Platform Services</h3>
						<ul class="digitopub-services__list">
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">📖</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">Find a Journal</strong>
									<span class="digitopub-services__desc">Search thousands of scientific journals.</span>
								</div>
							</li>
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">🔍</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">Crossref Search</strong>
									<span class="digitopub-services__desc">Search article metadata using Crossref.</span>
								</div>
							</li>
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">🆔</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">DOI Lookup</strong>
									<span class="digitopub-services__desc">Verify DOI information.</span>
								</div>
							</li>
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">👤</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">ORCID Integration</strong>
									<span class="digitopub-services__desc">Connect and verify ORCID IDs.</span>
								</div>
							</li>
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">📊</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">Journal Metrics</strong>
									<span class="digitopub-services__desc">View journal metrics and indexing.</span>
								</div>
							</li>
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">✍️</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">Submit Your Manuscript</strong>
									<span class="digitopub-services__desc">Start a new manuscript submission.</span>
								</div>
							</li>
							<li class="digitopub-services__item">
								<span class="digitopub-services__icon" aria-hidden="true">🌍</span>
								<div class="digitopub-services__text">
									<strong class="digitopub-services__title">Open Access Journals</strong>
									<span class="digitopub-services__desc">Discover Open Access journals.</span>
								</div>
							</li>
						</ul>
					</aside>
				</div>
{/if}
		</div>
	</section>







<script>
{literal}
/**
 * plugins/themes/digitopub/js/digitopub.js
 *
 * DigitoPub theme frontend script.
 */

(function () {
	'use strict';

	if (window.__digitopubInitialized) {
		return;
	}
	window.__digitopubInitialized = true;

	// Mobile navbar toggle
	var toggle = document.querySelector('.digitopub-navbar__toggle');
	var mobileMenu = document.getElementById('digitopub-navbar-mobile');

	if (toggle && mobileMenu) {
		toggle.addEventListener('click', function () {
			var isOpen = mobileMenu.classList.toggle('is-open');
			toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
		});
	}

	// Smooth scroll for anchor links
	document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
		anchor.addEventListener('click', function (event) {
			var targetId = anchor.getAttribute('href');
			if (targetId === '#') return;

			var target = document.querySelector(targetId);
			if (target) {
				event.preventDefault();
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		});
	});

	// Journal grid filtering, sorting, and reveal animations
	var grid = document.getElementById('digitopub-journals-grid');
	if (!grid) return;

	var cards = Array.from(grid.querySelectorAll('.digitopub-card'));
	var searchInput = document.getElementById('digitopub-filter-search');
	var categorySelect = document.getElementById('digitopub-filter-category');
	var typeSelect = document.getElementById('digitopub-filter-type');
	var sortSelect = document.getElementById('digitopub-filter-sort');
	var resultsText = document.querySelector('.digitopub-filter__results');

	// Infer journal type from hidden description text when not already set
	function inferType(card) {
		if (card.dataset.journalType) return;

		var text = (card.dataset.description || '').toLowerCase();
		var types = [];

		if (text.indexOf('open access') !== -1) {
			types.push('open-access');
		}
		if (text.indexOf('peer-reviewed') !== -1 || text.indexOf('peer reviewed') !== -1) {
			types.push('peer-reviewed');
		}

		// Default to peer-reviewed for academic journals if no keyword found
		if (types.length === 0) {
			types.push('peer-reviewed');
		}

		card.dataset.journalType = types.join(' ');
	}

	// Populate category dropdown from data-category attributes
	function populateCategories() {
		if (!categorySelect) return;

		var categories = {};
		cards.forEach(function (card) {
			var value = (card.dataset.category || '').trim();
			if (!value) return;
			value.split(/[,;]/).forEach(function (part) {
				var cat = part.trim();
				if (cat) {
					categories[cat.toLowerCase()] = cat;
				}
			});
		});

		var sorted = Object.keys(categories).sort().map(function (key) {
			return categories[key];
		});

		if (sorted.length === 0) {
			categorySelect.disabled = true;
			categorySelect.innerHTML = '<option value="">No categories</option>';
			return;
		}

		var optionsHtml = '<option value="">All categories</option>';
		sorted.forEach(function (cat) {
			optionsHtml += '<option value="' + escapeHtml(cat.toLowerCase()) + '">' + escapeHtml(cat) + '</option>';
		});
		categorySelect.innerHTML = optionsHtml;
	}

	function escapeHtml(text) {
		var div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	function matchesSearch(card, term) {
		if (!term) return true;
		var name = (card.dataset.name || '').toLowerCase();
		var descText = (card.dataset.description || '').toLowerCase();
		return name.indexOf(term) !== -1 || descText.indexOf(term) !== -1;
	}

	function matchesCategory(card, category) {
		if (!category) return true;
		var value = (card.dataset.category || '').toLowerCase();
		return value.split(/[,;]/).some(function (part) {
			return part.trim() === category;
		});
	}

	function matchesType(card, type) {
		if (!type) return true;
		inferType(card);
		var value = (card.dataset.journalType || '').toLowerCase();
		return value.indexOf(type) !== -1;
	}

	function sortCards(order) {
		cards.sort(function (a, b) {
			var nameA = (a.dataset.name || '').toLowerCase();
			var nameB = (b.dataset.name || '').toLowerCase();
			if (nameA < nameB) return order === 'az' ? -1 : 1;
			if (nameA > nameB) return order === 'az' ? 1 : -1;
			return 0;
		});

		cards.forEach(function (card) {
			grid.appendChild(card);
		});
	}

	function revealVisibleCards() {
		cards.forEach(function (card) {
			if (card.style.display !== 'none' && !card.classList.contains('digitopub-animate')) {
				card.classList.add('digitopub-animate');
			}
		});
	}

	function applyFilters() {
		var term = searchInput ? searchInput.value.trim().toLowerCase() : '';
		var category = categorySelect ? categorySelect.value : '';
		var type = typeSelect ? typeSelect.value : '';
		var sort = sortSelect ? sortSelect.value : 'az';

		var visibleCount = 0;

		cards.forEach(function (card) {
			var show = matchesSearch(card, term) &&
				matchesCategory(card, category) &&
				matchesType(card, type);

			if (show) {
				card.style.display = '';
				visibleCount++;
			} else {
				card.style.display = 'none';
			}
		});

		sortCards(sort);
		revealVisibleCards();

		if (resultsText) {
			if (visibleCount === 0) {
				resultsText.textContent = 'No journals match your filters.';
			} else {
				resultsText.textContent = 'Showing ' + visibleCount + ' journal' + (visibleCount === 1 ? '' : 's');
			}
		}
	}

	// Reveal cards as they scroll into view
	if ('IntersectionObserver' in window) {
		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					entry.target.classList.add('digitopub-animate');
					observer.unobserve(entry.target);
				}
			});
		}, {
			threshold: 0.1,
			rootMargin: '0px 0px -50px 0px'
		});

		cards.forEach(function (card) {
			observer.observe(card);
		});
	} else {
		// Fallback for older browsers
		cards.forEach(function (card) {
			card.classList.add('digitopub-animate');
		});
	}

	// Bind filter events
	if (searchInput) {
		searchInput.addEventListener('input', debounce(applyFilters, 150));
	}
	if (categorySelect) {
		categorySelect.addEventListener('change', applyFilters);
	}
	if (typeSelect) {
		typeSelect.addEventListener('change', applyFilters);
	}
	if (sortSelect) {
		sortSelect.addEventListener('change', applyFilters);
	}

	populateCategories();
	applyFilters();

	function debounce(fn, wait) {
		var timeout;
		return function () {
			var context = this;
			var args = arguments;
			clearTimeout(timeout);
			timeout = setTimeout(function () {
				fn.apply(context, args);
			}, wait);
		};
	}
})();
{/literal}
</script>

</main>

{include file="frontend/components/footer.tpl"}
