{**
 * plugins/themes/digitopub/templates/frontend/components/footer.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub theme footer.
 *}
	</div><!-- pkp_structure_main -->

	{* Sidebars *}
	{if empty($isFullWidth)}
		{capture assign="sidebarCode"}{call_hook name="Templates::Common::Sidebar"}{/capture}
		{if $sidebarCode}
			<div class="pkp_structure_sidebar left" role="complementary">
				{$sidebarCode}
			</div><!-- pkp_sidebar.left -->
		{/if}
	{/if}
</div><!-- pkp_structure_content -->

<footer class="digitopub-footer" role="contentinfo">
	<a id="pkp_content_footer"></a>
	<div class="digitopub-footer__inner">

		{* Main footer body: four-column layout *}
		<div class="digitopub-footer__main">
			<div class="digitopub-footer__grid">

				{* Column 1: Platform description *}
				<div class="digitopub-footer__brand">
					<p class="digitopub-footer__description">Open-access, peer-reviewed scientific publishing platform connecting researchers with trusted academic journals.</p>
				</div>

				{* Column 2: Quick links *}
				<div class="digitopub-footer__column">
					<h3 class="digitopub-footer__heading">Quick Links</h3>
					<ul>
						<li><a href="https://digitopub.com/journals">Browse Journals</a></li>
						<li><a href="{url page="submission" op="wizard"}">Submit a Manuscript</a></li>
						<li><a href="https://digitopub.com/about">About</a></li>
					</ul>
				</div>

				{* Column 3: Research tools *}
				<div class="digitopub-footer__column">
					<h3 class="digitopub-footer__heading">Research Tools</h3>
					<ul>
						<li><a href="https://search.crossref.org/" target="_blank" rel="noopener">Crossref Search</a></li>
						<li><a href="https://doi.org/" target="_blank" rel="noopener">DOI Lookup</a></li>
						<li><a href="https://orcid.org/" target="_blank" rel="noopener">ORCID</a></li>
					</ul>
				</div>

				{* Column 4: Contact *}
				<div class="digitopub-footer__column">
					<h3 class="digitopub-footer__heading">Contact</h3>
					<ul>
						<li><a href="https://digitopub.com/about">Platform Information</a></li>
						<li><a href="{url page="login"}">Editorial Login</a></li>
						<li><a href="https://digitopub.com/search">Search Publications</a></li>
					</ul>
				</div>

			</div>
		</div>

		{* Partner logos row *}
		<div class="digitopub-footer__logos" role="list" aria-label="Partner organizations">
			<div class="digitopub-footer__logo" role="listitem">
				<img src="{$baseUrl}/plugins/themes/digitopub/images/mceclip2.png" alt="DigitoPub" class="digitopub-footer__logo-img" width="97" height="105">
			</div>
			<div class="digitopub-footer__logo" role="listitem">
				<img src="{$baseUrl}/plugins/themes/digitopub/images/mceclip3.png" alt="DIA — Digitodontics International Academy" class="digitopub-footer__logo-img" width="249" height="105">
			</div>
			<div class="digitopub-footer__logo" role="listitem">
				<img src="{$baseUrl}/plugins/themes/digitopub/images/mceclip1.png" alt="Submit Manager" class="digitopub-footer__logo-img" width="298" height="105">
			</div>
		</div>

		{* Bottom Area: Copyright and badges *}
		<div class="digitopub-footer__copyright">
			<p class="digitopub-footer__copy-text">&copy; 2026 Submit Manager. All rights reserved.</p>
			<div class="digitopub-footer__badges">
				<span class="digitopub-footer__badge">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
					Open Access
				</span>
				<span class="digitopub-footer__badge">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
					Peer Reviewed
				</span>
				<span class="digitopub-footer__badge">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
					International Publishing
				</span>
			</div>
		</div>

	</div>
</footer><!-- digitopub-footer -->

</div><!-- pkp_structure_page -->

{load_script context="frontend"}

{call_hook name="Templates::Common::Footer::PageFooter"}
</body>
</html>
