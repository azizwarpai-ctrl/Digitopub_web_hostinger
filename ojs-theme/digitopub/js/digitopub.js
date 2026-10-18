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
