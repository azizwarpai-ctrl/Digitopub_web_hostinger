{**
 * Digitopub theme override: templates/frontend/pages/userLogin.tpl
 * Single focused login form. Form contract (id, method, action, field names) is the OJS one.
 *}
{include file="frontend/components/header.tpl" pageTitle="user.login"}

<div class="page page_login digitopub-auth-page">
	<div class="dp-auth" id="main-content">
		<div class="dp-auth__card">
			<h1 class="dp-auth__title">Log in</h1>
			<p class="dp-auth__lead">Log in to {if $currentContext}{$currentContext->getLocalizedName()|escape}{else}Submit Manager{/if}.</p>

			<form class="cmp_form login dp-auth__form" id="login" method="post" action="{$loginUrl}" role="form" novalidate>
				{csrf}

				{if $loginMessage}
					<div class="dp-auth__message cmp_notification" role="status">
						{translate key=$loginMessage}
					</div>
				{/if}

				{if $error}
					<div class="dp-auth__message pkp_form_error" role="alert">
						{translate key=$error reason=$reason}
					</div>
				{/if}

				<input type="hidden" name="source" value="{$source|default:""|escape}" />

				<fieldset class="fields dp-auth__fields">
					<legend class="pkp_screen_reader">{translate key="user.login"}</legend>

					<div class="dp-auth__field">
						<label class="dp-auth__label" for="username">
							{translate key="user.usernameOrEmail"}
							<span class="required" aria-hidden="true">*</span>
							<span class="pkp_screen_reader">{translate key="common.required"}</span>
						</label>
						<input type="text" name="username" id="username" value="{$username|default:""|escape}" required aria-required="true" autocomplete="username" class="dp-auth__input">
					</div>

					<div class="dp-auth__field">
						<label class="dp-auth__label" for="password">
							{translate key="user.password"}
							<span class="required" aria-hidden="true">*</span>
							<span class="pkp_screen_reader">{translate key="common.required"}</span>
						</label>
						<div class="dp-auth__control">
							<input type="password" name="password" id="password" value="{$password|default:""|escape}" password="true" maxlength="32" required aria-required="true" autocomplete="current-password" class="dp-auth__input dp-auth__input--has-toggle">
							<button type="button" class="dp-auth__toggle" aria-label="Show password" aria-pressed="false" onclick="var p=document.getElementById('password'),t=this;t.setAttribute('aria-pressed',p.type==='password'?'true':'false');p.type=p.type==='password'?'text':'password';">
								<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
							</button>
						</div>
					</div>

					<div class="dp-auth__row">
						<label class="dp-auth__check" for="remember">
							<input type="checkbox" name="remember" id="remember" value="1" checked="$remember">
							<span>{translate key="user.login.rememberUsernameAndPassword"}</span>
						</label>
						<a href="{url page="login" op="lostPassword"}" class="dp-auth__link">{translate key="user.login.forgotPassword"}</a>
					</div>

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
						<span class="digitopub-btn__label">{translate key="user.login"}</span>
					</button>
				</fieldset>
			</form>

			{if !$disableUserReg}
				{capture assign=registerUrl}{url page="user" op="register" source=$source}{/capture}
				<p class="dp-auth__switch">New to Submit Manager? <a href="{$registerUrl}">Register</a></p>
			{/if}
		</div>
	</div>
</div>

<script>
(function() {
	var form = document.getElementById('login');
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
	var user = document.getElementById('username');
	if (user) user.focus();
})();
</script>

{include file="frontend/components/footer.tpl"}
