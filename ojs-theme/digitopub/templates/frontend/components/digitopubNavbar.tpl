{**
 * plugins/themes/digitopub/templates/frontend/components/digitopubNavbar.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * Custom DigitoPub shared navbar.
 *
 * Phase 3.1: rendered on every public frontend page. The site logo provided
 * by DigitopubThemePlugin::loadTemplateData() is used first so the brand
 * stays identical on the homepage, journal pages, article pages, search,
 * login/register and all other frontend contexts.
 *
 * Logged-in users see a Dashboard link with an icon; guests see Login and
 * Register. An avatar and username are shown when available.
 *}
{capture assign="homeUrl"}{url page="index" router=PKP\core\PKPApplication::ROUTE_PAGE}{/capture}

{* Inline logo override: ensures the larger, fully-clickable logo is visible immediately without requiring a CSS-cache clear. The same rules are also present in digitopub.less for long-term consistency. *}
<style>
	.digitopub-navbar__brand {
		align-self: stretch;
	}
	.digitopub-navbar__brand img {
		max-height: 48px;
		width: auto;
		object-fit: contain;
	}
	@media (max-width: 991px) {
		.digitopub-navbar__brand img {
			max-height: 42px;
		}
	}
</style>

<nav class="digitopub-navbar" id="siteNav" aria-label="{translate|escape key="common.navigation.site"}">
	<div class="digitopub-navbar__container">

		<a href="{$homeUrl}" class="digitopub-navbar__brand">
			{if $digitopubSiteLogo}
				<img src="{$baseUrl}/public/site/{$digitopubSiteLogo.uploadName|escape:"url"}" alt="{if $digitopubSiteLogo.altText}{$digitopubSiteLogo.altText|escape}{else}Submit Manager{/if}" width="{$digitopubSiteLogo.width|escape}" height="{$digitopubSiteLogo.height|escape}">
			{elseif $displayPageHeaderLogo}
				<img src="{$publicFilesDir}/{$displayPageHeaderLogo.uploadName|escape:"url"}" alt="{if $displayPageHeaderLogo.altText}{$displayPageHeaderLogo.altText|escape}{else}Submit Manager{/if}" width="{$displayPageHeaderLogo.width|escape}" height="{$displayPageHeaderLogo.height|escape}">
			{/if}
			<span class="digitopub-navbar__brand-text">Submit Manager</span>
		</a>

		<form class="digitopub-navbar__search" method="get" action="https://digitopub.com/search" role="search" aria-label="{translate|escape key="common.search"}">
			<label for="digitopub-search-query" class="pkp_screen_reader">{translate key="common.search"}</label>
			<input type="search" id="digitopub-search-query" name="q" class="digitopub-navbar__search-input" placeholder="Search articles on DigitoPub...">
			<button type="submit" class="digitopub-navbar__search-button" aria-label="{translate|escape key="common.search"}">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
			</button>
		</form>

		<div class="digitopub-navbar__actions">
			{if $isUserLoggedIn}
				<a href="{url page="dashboard"}" class="digitopub-navbar__btn digitopub-navbar__btn--primary">
					<svg class="digitopub-navbar__btn-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
					<span>{translate key="navigation.dashboard"}</span>
				</a>
				{if $currentUser}
					{assign var="userProfileImage" value=$currentUser->getData('profileImage')}
					{if $userProfileImage}
						<img src="{$baseUrl}/public/site/{$userProfileImage.uploadName|escape:"url"}" alt="{$loggedInUsername|escape}" class="digitopub-navbar__avatar">
					{/if}
				{/if}
				{if $loggedInUsername}
					<span class="digitopub-navbar__username">{$loggedInUsername|escape}</span>
				{/if}
			{else}
				<a href="{url page="login"}" class="digitopub-navbar__btn">Login</a>
				<a href="{url page="user" op="register"}" class="digitopub-navbar__btn digitopub-navbar__btn--primary">Register</a>
			{/if}
		</div>

		<button class="digitopub-navbar__toggle" aria-expanded="false" aria-controls="digitopub-navbar-mobile" aria-label="{translate|escape key="common.navigation.site"}">
			<span aria-hidden="true"></span>
			<span aria-hidden="true"></span>
			<span aria-hidden="true"></span>
		</button>
	</div>

	<div class="digitopub-navbar__mobile" id="digitopub-navbar-mobile">
		<form class="digitopub-navbar__search digitopub-navbar__search--mobile" method="get" action="https://digitopub.com/search" role="search" aria-label="{translate|escape key="common.search"}">
			<label for="digitopub-search-query-mobile" class="pkp_screen_reader">{translate key="common.search"}</label>
			<input type="search" id="digitopub-search-query-mobile" name="q" class="digitopub-navbar__search-input" placeholder="Search articles on DigitoPub...">
			<button type="submit" class="digitopub-navbar__search-button" aria-label="{translate|escape key="common.search"}">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
			</button>
		</form>
		<div class="digitopub-navbar__actions digitopub-navbar__actions--mobile">
			{if $isUserLoggedIn}
				<a href="{url page="dashboard"}" class="digitopub-navbar__btn digitopub-navbar__btn--primary digitopub-navbar__btn--block">
					<svg class="digitopub-navbar__btn-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
					<span>{translate key="navigation.dashboard"}</span>
				</a>
				{if $loggedInUsername}
					<span class="digitopub-navbar__username digitopub-navbar__username--mobile">{$loggedInUsername|escape}</span>
				{/if}
			{else}
				<a href="{url page="login"}" class="digitopub-navbar__btn">Login</a>
				<a href="{url page="user" op="register"}" class="digitopub-navbar__btn digitopub-navbar__btn--primary">Register</a>
			{/if}
		</div>
	</div>
</nav>
