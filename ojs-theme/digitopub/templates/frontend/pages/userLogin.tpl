{**
 * Digitopub theme override: templates/frontend/pages/userLogin.tpl
 * Modern login page with split branding + auth card.
 *}
{include file="frontend/components/header.tpl" pageTitle="user.login"}

<link rel="stylesheet" href="{$baseUrl}/plugins/themes/digitopub/styles/digitopub-auth-layout.css?v=5" type="text/css">

<div class="page page_login digitopub-auth-page">
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
				<p class="digitopub-auth-brand__subtitle">Welcome back to your research community.</p>
				<p class="digitopub-auth-brand__description">
					Access your journals, submissions, reviews, and editorial dashboard in one secure place.
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
					<span class="digitopub-auth-card__kicker">Welcome Back</span>
					<h2 class="digitopub-auth-card__title">Sign in to your account</h2>
					<p class="digitopub-auth-card__subtitle">Sign in to your Submit Manager account.</p>
				</div>

				<form class="cmp_form login digitopub-auth-form__body" id="login" method="post" action="{$loginUrl}" role="form" novalidate>
					{csrf}

					{if $loginMessage}
						<div class="digitopub-auth-alert digitopub-auth-alert--info" role="status">
							<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
							<span>{translate key=$loginMessage}</span>
						</div>
					{/if}

					{if $error}
						<div class="digitopub-auth-alert digitopub-auth-alert--error" role="alert">
							<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
							<span>{translate key=$error reason=$reason}</span>
						</div>
					{/if}

					<input type="hidden" name="source" value="{$source|default:""|escape}" />

					<fieldset class="fields">
						<legend class="pkp_screen_reader">{translate key="user.login"}</legend>

						<div class="digitopub-auth-form__group">
							<label class="digitopub-auth-form__label" for="username">
								{translate key="user.usernameOrEmail"}
								<span class="required" aria-hidden="true">*</span>
								<span class="pkp_screen_reader">{translate key="common.required"}</span>
							</label>
							<div class="digitopub-auth-form__field">
								<span class="digitopub-auth-form__field-icon" aria-hidden="true">
									<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
								</span>
								<input type="text" name="username" id="username" value="{$username|default:""|escape}" required aria-required="true" autocomplete="username" class="digitopub-auth-form__field-input" placeholder="{translate key="user.usernameOrEmail"}">
							</div>
						</div>

						<div class="digitopub-auth-form__group">
							<label class="digitopub-auth-form__label" for="password">
								{translate key="user.password"}
								<span class="required" aria-hidden="true">*</span>
								<span class="pkp_screen_reader">{translate key="common.required"}</span>
							</label>
							<div class="digitopub-auth-form__field">
								<span class="digitopub-auth-form__field-icon" aria-hidden="true">
									<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
								</span>
								<input type="password" name="password" id="password" value="{$password|default:""|escape}" password="true" maxlength="32" required aria-required="true" autocomplete="current-password" class="digitopub-auth-form__field-input" placeholder="{translate key="user.password"}">
								<button type="button" class="digitopub-auth-form__field-toggle" aria-label="Show password" aria-pressed="false" onclick="var p=document.getElementById('password'),t=this;t.setAttribute('aria-pressed',p.type==='password'?'true':'false');p.type=p.type==='password'?'text':'password';">
									<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
								</button>
							</div>
						</div>

						<div class="digitopub-auth-form__row">
							<label class="digitopub-auth-form__check" for="remember">
								<input type="checkbox" name="remember" id="remember" value="1" checked="$remember">
								<span>{translate key="user.login.rememberUsernameAndPassword"}</span>
							</label>
							<a href="{url page="login" op="lostPassword"}" class="digitopub-auth-form__link">{translate key="user.login.forgotPassword"}</a>
						</div>

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
								<span class="digitopub-btn__label">{translate key="user.login"}</span>
							</button>
							{if !$disableUserReg}
								{capture assign=registerUrl}{url page="user" op="register" source=$source}{/capture}
								<a href="{$registerUrl}" class="digitopub-btn digitopub-btn--outline digitopub-btn--block">{translate key="user.login.registerNewAccount"}</a>
							{/if}
						</div>
					</fieldset>
				</form>
			</div>
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
	var user = document.getElementById('username');
	if (user) user.focus();
})();
</script>

{include file="frontend/components/footer.tpl"}
