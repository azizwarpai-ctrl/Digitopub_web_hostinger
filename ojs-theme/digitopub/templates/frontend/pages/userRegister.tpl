{**
 * Digitopub theme override: templates/frontend/pages/userRegister.tpl
 * Modern registration page with split branding + auth card.
 *}
{include file="frontend/components/header.tpl" pageTitle="user.register"}

<link rel="stylesheet" href="{$baseUrl}/plugins/themes/digitopub/styles/digitopub-auth-layout.css?v=5" type="text/css">

{assign var="siteContextId" value=PKP\core\PKPApplication::SITE_CONTEXT_ID|intval}

<div class="page page_register digitopub-auth-page">
	<div class="digitopub-auth-layout">
		{* Left branding panel *}
		<div class="digitopub-auth-brand">
			<div class="digitopub-auth-brand__pattern" aria-hidden="true"></div>
			<div class="digitopub-auth-brand__illustration" aria-hidden="true">
				<svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
					<circle cx="200" cy="200" r="160" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="200" cy="200" r="110" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="200" cy="200" r="60" stroke="currentColor" stroke-width="1.5"/>
					<path d="M200 40v320M40 200h320" stroke="currentColor" stroke-width="1.5"/>
					<path d="M85 85l230 230M85 315l230-230" stroke="currentColor" stroke-width="1.5"/>
					<rect x="160" y="150" width="80" height="100" rx="6" stroke="currentColor" stroke-width="2"/>
					<path d="M175 180h50M175 205h50M175 230h30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>
			</div>
			<div class="digitopub-auth-brand__content">
				<div class="digitopub-auth-brand__logo">
					<span class="digitopub-auth-brand__logo-icon">
						<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
					</span>
					Submit Manager
				</div>
				<h1 class="digitopub-auth-brand__title">Scientific Journals Platform</h1>
				<p class="digitopub-auth-brand__subtitle">Start your publishing journey.</p>
				<p class="digitopub-auth-brand__description">
					Create your account to submit manuscripts, join peer review, and manage your editorial workflow on a modern open-access platform.
				</p>
				<ul class="digitopub-auth-brand__features">
					<li class="digitopub-auth-brand__feature">
						<span class="digitopub-auth-brand__feature-icon">
							<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
						</span>
						Submit Articles
					</li>
					<li class="digitopub-auth-brand__feature">
						<span class="digitopub-auth-brand__feature-icon">
							<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
						</span>
						Peer Review
					</li>
					<li class="digitopub-auth-brand__feature">
						<span class="digitopub-auth-brand__feature-icon">
							<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
						</span>
						Editorial Workflow
					</li>
					<li class="digitopub-auth-brand__feature">
						<span class="digitopub-auth-brand__feature-icon">
							<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
						</span>
						Open Access Publishing
					</li>
				</ul>
			</div>
		</div>

		{* Right auth card *}
		<div class="digitopub-auth-form">
			<div class="digitopub-auth-card">
				<div class="digitopub-auth-card__header">
					<span class="digitopub-auth-card__kicker">Get Started</span>
					<h2 class="digitopub-auth-card__title">Create your account</h2>
					<p class="digitopub-auth-card__subtitle">Join Submit Manager to submit, review, and publish research.</p>
				</div>

				<form class="cmp_form register digitopub-auth-form__body" id="register" method="post" action="{url op="register"}" role="form" novalidate>
					{if $orcidEnabled}
						{include file="form/orcidProfile.tpl"}
					{/if}

					{csrf}

					{if $source}
						<input type="hidden" name="source" value="{$source|escape}" />
					{/if}

					{include file="common/formErrors.tpl"}

					{include file="frontend/components/registrationForm.tpl"}

					{* When a user is registering with a specific journal *}
					{if $currentContext}
						<fieldset class="consent digitopub-auth-form__group">
							{if $currentContext->getData('privacyStatement')}
								<legend class="digitopub-auth-form__label">{translate key="user.register.form.privacyConsentLabel"}</legend>
								<div class="fields">
									<div class="optin optin-privacy digitopub-auth-form__check">
										<label>
											<input type="checkbox" name="privacyConsent" value="1"{if $privacyConsent} checked="checked"{/if}>
											{capture assign="privacyUrl"}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="about" op="privacy"}{/capture}
											{translate key="user.register.form.privacyConsent" privacyUrl=$privacyUrl}
										</label>
									</div>
								</div>
							{/if}
							<div class="fields">
								<div class="optin optin-email digitopub-auth-form__check">
									<label>
										<input type="checkbox" name="emailConsent" value="1"{if $emailConsent} checked="checked"{/if}>
										{translate key="user.register.form.emailConsent"}
									</label>
								</div>
							</div>
						</fieldset>

						{* Allow the user to sign up as a reviewer *}
						{assign var=contextId value=$currentContext->getId()}
						{assign var=userCanRegisterReviewer value=0}
						{foreach from=$reviewerUserGroups[$contextId] item=userGroup}
							{if $userGroup->permitSelfRegistration}
								{assign var=userCanRegisterReviewer value=$userCanRegisterReviewer+1}
							{/if}
						{/foreach}
						{if $userCanRegisterReviewer}
							<fieldset class="reviewer digitopub-auth-form__group">
								{if $userCanRegisterReviewer > 1}
									<legend class="digitopub-auth-form__label">{translate key="user.reviewerPrompt"}</legend>
									{capture assign="checkboxLocaleKey"}user.reviewerPrompt.userGroup{/capture}
								{else}
									{capture assign="checkboxLocaleKey"}user.reviewerPrompt.optin{/capture}
								{/if}
								<div class="fields">
									<div id="reviewerOptinGroup" class="optin">
										{foreach from=$reviewerUserGroups[$contextId] item=userGroup}
											{if $userGroup->permitSelfRegistration}
												<label class="digitopub-auth-form__check">
													{assign var="userGroupId" value=$userGroup->id}
													<input type="checkbox" name="reviewerGroup[{$userGroupId}]" value="1"{if in_array($userGroupId, $userGroupIds)} checked="checked"{/if}>
													{translate key=$checkboxLocaleKey userGroup=$userGroup->getLocalizedData('name')}
												</label>
											{/if}
										{/foreach}
									</div>
									<div id="reviewerInterests" class="reviewer_interests digitopub-auth-form__group">
										<label class="digitopub-auth-form__label" for="interests">{translate key="user.interests"}</label>
										<div class="digitopub-auth-form__input-wrap">
											<input type="text" name="interests" id="interests" value="{$interests|default:""|escape}" class="digitopub-auth-form__input">
										</div>
									</div>
								</div>
							</fieldset>
						{/if}
					{/if}

					{include file="frontend/components/registrationFormContexts.tpl"}

					{* When a user is registering for no specific journal *}
					{if !$currentContext}
						<div class="fields digitopub-auth-form__group">
							<div class="reviewer_nocontext_interests">
								<label class="digitopub-auth-form__label" for="interests">{translate key="user.register.noContextReviewerInterests"}</label>
								<div class="digitopub-auth-form__input-wrap">
									<input type="text" name="interests" id="interests" value="{$interests|default:""|escape}" class="digitopub-auth-form__input">
								</div>
							</div>
						</div>

						{if $siteWidePrivacyStatement}
							<div class="fields digitopub-auth-form__check">
								<div class="optin optin-privacy">
									<label>
										<input type="checkbox" name="privacyConsent[{$siteContextId}]" id="privacyConsent[{$siteContextId}]" value="1"{if $privacyConsent[$siteContextId]} checked="checked"{/if}>
										{capture assign="privacyUrl"}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="about" op="privacy"}{/capture}
										{translate key="user.register.form.privacyConsent" privacyUrl=$privacyUrl}
									</label>
								</div>
							</div>
						{/if}

						<div class="fields digitopub-auth-form__check">
							<div class="optin optin-email">
								<label>
									<input type="checkbox" name="emailConsent" value="1"{if $emailConsent} checked="checked"{/if}>
									{translate key="user.register.form.emailConsent"}
								</label>
							</div>
						</div>
					{/if}

					{* recaptcha spam blocker *}
					{if $recaptchaPublicKey}
						<fieldset class="recaptcha_wrapper digitopub-auth-form__group">
							<div class="fields">
								<div class="recaptcha">
									<div class="g-recaptcha" data-sitekey="{$recaptchaPublicKey|escape}"></div>
									<label for="g-recaptcha-response" style="display:none;" hidden>Recaptcha response</label>
								</div>
							</div>
						</fieldset>
					{/if}

					{* altcha spam blocker *}
					{if $altchaEnabled}
						<fieldset class="altcha_wrapper digitopub-auth-form__group">
							<div class="fields">
								<altcha-widget challengejson='{$altchaChallenge|@json_encode}' floating></altcha-widget>
							</div>
						</fieldset>
					{/if}

					<div class="digitopub-auth-form__actions">
						<button class="digitopub-btn digitopub-btn--primary digitopub-btn--block" type="submit">
							<span class="digitopub-btn__spinner" aria-hidden="true"></span>
							<span class="digitopub-btn__label">{translate key="user.register"}</span>
						</button>
						{capture assign="rolesProfileUrl"}{url page="user" op="profile" path="roles"}{/capture}
						<a href="{url page="login" source=$rolesProfileUrl}" class="digitopub-btn digitopub-btn--outline digitopub-btn--block">{translate key="user.login"}</a>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>

<script>
(function() {
	var form = document.getElementById('register');
	if (!form) return;
	form.addEventListener('submit', function() {
		var btn = form.querySelector('button[type="submit"]');
		if (btn) {
			btn.classList.add('is-loading');
			btn.disabled = true;
		}
	});
	var given = document.getElementById('givenName');
	if (given) given.focus();
})();
</script>

{include file="frontend/components/footer.tpl"}
