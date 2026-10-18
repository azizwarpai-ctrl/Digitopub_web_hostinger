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

		<div class="digitopub-footer__grid">

			<div class="digitopub-footer__column">
				<h3 class="digitopub-footer__heading">DigitoPub</h3>
				<ul>
					<li><a href="https://digitopub.com/journals">Journals</a></li>
					<li><a href="https://digitopub.com/search">Search articles</a></li>
					<li><a href="https://digitopub.com/about">About</a></li>
				</ul>
			</div>

			<div class="digitopub-footer__column">
				<h3 class="digitopub-footer__heading">Authors</h3>
				<ul>
					{if $currentContext}
						<li><a href="{url page="submission" op="wizard"}">Submit a manuscript</a></li>
						<li><a href="{url page="about" op="submissions"}">Author guidelines</a></li>
					{/if}
					<li><a href="{url page="login"}">Log in</a></li>
					<li><a href="{url page="user" op="register"}">Register</a></li>
				</ul>
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

		<div class="digitopub-footer__copyright">
			<p class="digitopub-footer__copy-text">&copy; 2026 Submit Manager, part of DigitoPub.</p>
		</div>

	</div>
</footer><!-- digitopub-footer -->

</div><!-- pkp_structure_page -->

{load_script context="frontend"}

{call_hook name="Templates::Common::Footer::PageFooter"}
</body>
</html>
