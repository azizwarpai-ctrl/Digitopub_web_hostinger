{**
 * plugins/themes/digitopub/templates/frontend/components/header.tpl
 *
 * Copyright (c) 2026 DigitoPub
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * DigitoPub theme header.
 *
 * Phase 3: the custom DigitoPub navbar is rendered on every public frontend
 * page. The Default Theme header is no longer used. The site logo variable
 * exposed by DigitopubThemePlugin::loadTemplateData() keeps the brand
 * identical across homepage, journal, article, search, login/register and
 * all other frontend contexts.
 *}
{strip}
	{* Determine whether a logo or title string is being displayed *}
	{assign var="showingLogo" value=true}
	{if !$digitopubSiteLogo && !$displayPageHeaderLogo}
		{assign var="showingLogo" value=false}
	{/if}
{/strip}
<!DOCTYPE html>
<html lang="{$currentLocale|replace:"_":"-"}" xml:lang="{$currentLocale|replace:"_":"-"}">
{if !$pageTitleTranslated}{capture assign="pageTitleTranslated"}{translate key=$pageTitle}{/capture}{/if}
{include file="frontend/components/headerHead.tpl"}
<body class="pkp_page_{$requestedPage|escape|default:"index"} pkp_op_{$requestedOp|escape|default:"index"}{if $showingLogo} has_site_logo{/if}" dir="{$currentLocaleLangDir|escape|default:"ltr"}">

	<div class="pkp_structure_page">

		{* Header *}
		<header class="pkp_structure_head" id="headerNavigationContainer" role="banner">

			{* Accessibility skip links *}
			{include file="frontend/components/skipLinks.tpl"}

			{* Shared DigitoPub navbar (homepage, journal pages, article pages, search, auth, etc.) *}
			{include file="frontend/components/digitopubNavbar.tpl"}

		</header><!-- .pkp_structure_head -->

		{* Wrapper for page content and sidebars *}
		{if $isFullWidth}
			{assign var=hasSidebar value=0}
		{/if}
		<div class="pkp_structure_content{if $hasSidebar} has_sidebar{/if}">
			<div class="pkp_structure_main" role="main">
				<a id="pkp_content_main"></a>
