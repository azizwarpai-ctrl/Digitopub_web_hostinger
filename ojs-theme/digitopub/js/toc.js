/**
 * plugins/themes/digitopub/js/toc.js
 *
 * In-page table of contents for long content pages (.dp-prose).
 * Progressive enhancement: the nav stays hidden unless the page has 3+ headings.
 */
(function () {
	'use strict';

	function slugify(text) {
		var s = String(text).toLowerCase().replace(/[^a-z0-9À-￿]+/g, '-').replace(/^-+|-+$/g, '');
		return s || 'section';
	}

	function init() {
		var nav = document.querySelector('.dp-prose__toc');
		var body = document.querySelector('.dp-prose__body');
		if (!nav || !body) return;

		var headings = body.querySelectorAll('h2, h3');
		if (headings.length < 3) return;

		var used = {};
		var i, h;
		for (i = 0; i < headings.length; i++) {
			if (headings[i].id) used[headings[i].id] = true;
		}

		var list = document.createElement('ol');
		var links = [];
		var targets = [];

		for (i = 0; i < headings.length; i++) {
			h = headings[i];
			var label = (h.textContent || '').replace(/\s+/g, ' ').trim();
			if (!label) continue;
			if (!h.id) {
				var base = slugify(label);
				var id = base;
				var n = 2;
				while (used[id] || document.getElementById(id)) {
					id = base + '-' + n++;
				}
				h.id = id;
				used[id] = true;
			}
			var li = document.createElement('li');
			if (h.tagName === 'H3') li.className = 'dp-prose__toc-sub';
			var a = document.createElement('a');
			a.href = '#' + h.id;
			a.textContent = label;
			li.appendChild(a);
			list.appendChild(li);
			links.push(a);
			targets.push(h);
		}

		if (links.length < 3) return;

		nav.appendChild(list);
		nav.hidden = false;

		if (!('IntersectionObserver' in window)) return;

		function setActive(idx) {
			for (var k = 0; k < links.length; k++) {
				if (k === idx) links[k].setAttribute('aria-current', 'true');
				else links[k].removeAttribute('aria-current');
			}
		}

		var observer = new IntersectionObserver(function (entries) {
			for (var e = 0; e < entries.length; e++) {
				if (entries[e].isIntersecting) {
					setActive(targets.indexOf(entries[e].target));
				}
			}
		}, { rootMargin: '-20% 0px -70% 0px' });

		for (i = 0; i < targets.length; i++) observer.observe(targets[i]);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
