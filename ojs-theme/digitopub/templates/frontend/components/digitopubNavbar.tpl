{**
 * plugins/themes/digitopub/templates/frontend/components/digitopubNavbar.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * Shared Submit Manager navbar, rendered on every public frontend page.
 * Submission-focused: no article search (reading lives on DigitoPub).
 * The site logo provided by DigitopubThemePlugin::loadTemplateData() is used
 * first; the text brand is shown only when no logo exists.
 *}
{capture assign="homeUrl"}{url page="index" router=PKP\core\PKPApplication::ROUTE_PAGE}{/capture}

<nav class="digitopub-navbar" id="siteNav" aria-label="{translate|escape key="common.navigation.site"}">
	<div class="digitopub-navbar__container">

		<a href="{$homeUrl}" class="digitopub-navbar__brand">
			{if $digitopubSiteLogo}
				<img src="{$baseUrl}/public/site/{$digitopubSiteLogo.uploadName|escape:"url"}" alt="Submit Manager" width="{$digitopubSiteLogo.width|escape}" height="{$digitopubSiteLogo.height|escape}">
			{elseif $displayPageHeaderLogo}
				<img src="{$publicFilesDir}/{$displayPageHeaderLogo.uploadName|escape:"url"}" alt="Submit Manager" width="{$displayPageHeaderLogo.width|escape}" height="{$displayPageHeaderLogo.height|escape}">
			{else}
				<span class="digitopub-navbar__brand-text">Submit Manager</span>
			{/if}
		</a>

		<ul class="digitopub-navbar__links">
			<li><a href="https://digitopub.com/journals">Journals</a></li>
			{if $currentContext}
				<li><a href="{url page="about" op="submissions"}">Author guidelines</a></li>
			{/if}
		</ul>

		<div class="digitopub-navbar__actions">
			{if $isUserLoggedIn}
				<a href="{url page="dashboard"}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm">
					{include file="frontend/components/icons/layout-dashboard.tpl"}
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
				<a href="{url page="login"}" class="digitopub-btn digitopub-btn--outline digitopub-btn--sm">Log in</a>
				<a href="{url page="user" op="register"}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm">Register</a>
			{/if}
		</div>

		<button type="button" class="digitopub-navbar__toggle" aria-expanded="false" aria-controls="digitopub-navbar-mobile">
			{include file="frontend/components/icons/menu.tpl"}
			{include file="frontend/components/icons/x.tpl"}
			<span class="digitopub-navbar__sr">Menu</span>
		</button>
	</div>

	<div class="digitopub-navbar__mobile" id="digitopub-navbar-mobile">
		<ul class="digitopub-navbar__links">
			<li><a href="https://digitopub.com/journals">Journals</a></li>
			{if $currentContext}
				<li><a href="{url page="about" op="submissions"}">Author guidelines</a></li>
			{/if}
		</ul>
		<div class="digitopub-navbar__actions">
			{if $isUserLoggedIn}
				<a href="{url page="dashboard"}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm">
					{include file="frontend/components/icons/layout-dashboard.tpl"}
					<span>{translate key="navigation.dashboard"}</span>
				</a>
				{if $loggedInUsername}
					<span class="digitopub-navbar__username">{$loggedInUsername|escape}</span>
				{/if}
			{else}
				<a href="{url page="login"}" class="digitopub-btn digitopub-btn--outline digitopub-btn--sm">Log in</a>
				<a href="{url page="user" op="register"}" class="digitopub-btn digitopub-btn--primary digitopub-btn--sm">Register</a>
			{/if}
		</div>
	</div>
</nav>
