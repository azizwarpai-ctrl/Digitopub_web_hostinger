{**
 * Digitopub theme override: templates/frontend/pages/userLostPassword.tpl
 * Single focused reset form. Form contract (id, method, action, field names) is the OJS one.
 *}
{include file="frontend/components/header.tpl" pageTitle="user.login.resetPassword"}

<div class="page page_lost_password digitopub-auth-page">
	<div class="dp-auth" id="main-content">
		<div class="dp-auth__card">
			<h1 class="dp-auth__title">Reset your password</h1>
			<p class="dp-auth__lead">Enter the email address for your {if $currentContext}{$currentContext->getLocalizedName()|escape}{else}Submit Manager{/if} account and we will send you a reset link.</p>

			<form class="cmp_form lost_password dp-auth__form" id="lostPasswordForm" action="{url page="login" op="requestResetPassword"}" method="post" role="form" novalidate>
				{csrf}

				{if $error}
					<div class="dp-auth__message pkp_form_error" role="alert">
						{translate key=$error reason=$reason}
					</div>
				{/if}

				<div class="dp-auth__field">
					<label class="dp-auth__label" for="email">
						{translate key="user.login.registeredEmail"}
						<span class="required" aria-hidden="true">*</span>
						<span class="pkp_screen_reader">{translate key="common.required"}</span>
					</label>
					<input type="email" name="email" id="email" value="{$email|escape}" required aria-required="true" autocomplete="email" class="dp-auth__input">
				</div>

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
					<span class="digitopub-btn__label">{translate key="user.login.resetPassword"}</span>
				</button>
			</form>

			<p class="dp-auth__switch">Remembered it? <a href="{url page="login"}">Log in</a></p>
		</div>
	</div>
</div>

<script>
(function() {
	var form = document.getElementById('lostPasswordForm');
	if (!form) return;
	form.addEventListener('submit', function() {
		var btn = form.querySelector('button[type="submit"]');
		if (btn) {
			btn.classList.add('is-loading');
			btn.disabled = true;
		}
	});
	// Back/forward cache restores the disabled state; re-enable the button.
	window.addEventListener('pageshow', function(event) {
		if (!event.persisted) return;
		var btn = form.querySelector('button[type="submit"]');
		if (btn) {
			btn.disabled = false;
			btn.classList.remove('is-loading');
		}
	});
	var email = document.getElementById('email');
	if (email) email.focus();
})();
</script>

{include file="frontend/components/footer.tpl"}
