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

		var closeMenu = function (returnFocus) {
			mobileMenu.classList.remove('is-open');
			toggle.setAttribute('aria-expanded', 'false');
			if (returnFocus) toggle.focus();
		};

		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
				closeMenu(true);
			}
		});

		mobileMenu.addEventListener('click', function (event) {
			if (event.target.closest && event.target.closest('a')) {
				closeMenu(false);
			}
		});
	}

	// Smooth scroll for anchor links
	document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
		anchor.addEventListener('click', function (event) {
			var targetId = anchor.getAttribute('href');
			if (targetId === '#') return;

			// By id, not querySelector: an id such as "1-intro" is not a valid
			// CSS selector and would throw, aborting this handler.
			var target = document.getElementById(targetId.slice(1));
			if (target) {
				event.preventDefault();
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		});
	});

	// Journal grid: search-only filter on the site home
	var grid = document.getElementById('digitopub-journals-grid');
	var searchInput = document.getElementById('digitopub-filter-search');
	if (!grid || !searchInput) return;

	var cards = Array.prototype.slice.call(grid.querySelectorAll('.dp-journal-card'));
	var countText = document.getElementById('digitopub-filter-count');
	var noMatch = document.getElementById('digitopub-no-match');
	var timer;

	function applyFilter() {
		var term = searchInput.value.trim().toLowerCase();
		var visible = 0;

		cards.forEach(function (card) {
			var name = (card.getAttribute('data-name') || '').toLowerCase();
			var show = !term || name.indexOf(term) !== -1;
			card.hidden = !show;
			if (show) visible++;
		});

		if (countText) {
			countText.textContent = term
				? 'Showing ' + visible + ' of ' + cards.length + ' journals'
				: '';
		}
		if (noMatch) {
			noMatch.hidden = visible !== 0;
		}
	}

	searchInput.addEventListener('input', function () {
		clearTimeout(timer);
		timer = setTimeout(applyFilter, 150);
	});
})();
