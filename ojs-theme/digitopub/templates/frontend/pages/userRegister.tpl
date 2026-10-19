{**
 * Digitopub theme override: templates/frontend/pages/userRegister.tpl
 * Modern registration page with split branding + auth card.
 *}
{include file="frontend/components/header.tpl" pageTitle="user.register"}


{assign var="siteContextId" value=PKP\core\PKPApplication::SITE_CONTEXT_ID|intval}

<div class="page page_register digitopub-auth-page">
	<main class="dp-auth dp-auth--wide" id="main-content">
		<div class="dp-auth__card">
			<h1 class="dp-auth__title">Create your account</h1>
			<p class="dp-auth__lead">Register to submit to {if $currentContext}{$currentContext->getLocalizedName()|escape}{else}Submit Manager{/if}.</p>

			<form class="cmp_form register dp-auth__form" id="register" method="post" action="{url op="register"}" role="form" novalidate>
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
						<fieldset class="consent dp-auth__field">
							{if $currentContext->getData('privacyStatement')}
								<legend class="dp-auth__label">{translate key="user.register.form.privacyConsentLabel"}</legend>
								<div class="fields">
									<div class="optin optin-privacy dp-auth__check">
										<label>
											<input type="checkbox" name="privacyConsent" value="1"{if $privacyConsent} checked="checked"{/if}>
											{capture assign="privacyUrl"}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="about" op="privacy"}{/capture}
											{translate key="user.register.form.privacyConsent" privacyUrl=$privacyUrl}
										</label>
									</div>
								</div>
							{/if}
							<div class="fields">
								<div class="optin optin-email dp-auth__check">
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
							<fieldset class="reviewer dp-auth__field">
								{if $userCanRegisterReviewer > 1}
									<legend class="dp-auth__label">{translate key="user.reviewerPrompt"}</legend>
									{capture assign="checkboxLocaleKey"}user.reviewerPrompt.userGroup{/capture}
								{else}
									{capture assign="checkboxLocaleKey"}user.reviewerPrompt.optin{/capture}
								{/if}
								<div class="fields">
									<div id="reviewerOptinGroup" class="optin">
										{foreach from=$reviewerUserGroups[$contextId] item=userGroup}
											{if $userGroup->permitSelfRegistration}
												<label class="dp-auth__check">
													{assign var="userGroupId" value=$userGroup->id}
													<input type="checkbox" name="reviewerGroup[{$userGroupId}]" value="1"{if in_array($userGroupId, $userGroupIds)} checked="checked"{/if}>
													{translate key=$checkboxLocaleKey userGroup=$userGroup->getLocalizedData('name')}
												</label>
											{/if}
										{/foreach}
									</div>
									<div id="reviewerInterests" class="reviewer_interests dp-auth__field">
										<label class="dp-auth__label" for="interests">{translate key="user.interests"}</label>
										<div class="dp-auth__control">
											<input type="text" name="interests" id="interests" value="{$interests|default:""|escape}" class="dp-auth__input">
										</div>
									</div>
								</div>
							</fieldset>
						{/if}
					{/if}

					{include file="frontend/components/registrationFormContexts.tpl"}

					{* When a user is registering for no specific journal *}
					{if !$currentContext}
						<div class="fields dp-auth__field">
							<div class="reviewer_nocontext_interests">
								<label class="dp-auth__label" for="interests">{translate key="user.register.noContextReviewerInterests"}</label>
								<div class="dp-auth__control">
									<input type="text" name="interests" id="interests" value="{$interests|default:""|escape}" class="dp-auth__input">
								</div>
							</div>
						</div>

						{if $siteWidePrivacyStatement}
							<div class="fields dp-auth__check">
								<div class="optin optin-privacy">
									<label>
										<input type="checkbox" name="privacyConsent[{$siteContextId}]" id="privacyConsent[{$siteContextId}]" value="1"{if $privacyConsent[$siteContextId]} checked="checked"{/if}>
										{capture assign="privacyUrl"}{url router=PKP\core\PKPApplication::ROUTE_PAGE page="about" op="privacy"}{/capture}
										{translate key="user.register.form.privacyConsent" privacyUrl=$privacyUrl}
									</label>
								</div>
							</div>
						{/if}

						<div class="fields dp-auth__check">
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
						<fieldset class="recaptcha_wrapper dp-auth__field">
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
						<fieldset class="altcha_wrapper dp-auth__field">
							<div class="fields">
								<altcha-widget challengejson='{$altchaChallenge|@json_encode}' floating></altcha-widget>
							</div>
						</fieldset>
					{/if}

					<button class="digitopub-btn digitopub-btn--primary digitopub-btn--block" type="submit">
						<span class="digitopub-btn__spinner" aria-hidden="true"></span>
						<span class="digitopub-btn__label">{translate key="user.register"}</span>
					</button>
				</form>

				{capture assign="rolesProfileUrl"}{url page="user" op="profile" path="roles"}{/capture}
				<p class="dp-auth__switch">Already have an account? <a href="{url page="login" source=$rolesProfileUrl}">Log in</a></p>
		</div>
	</main>
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
