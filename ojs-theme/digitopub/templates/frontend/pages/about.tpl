{**
 * Digitopub theme override: lib/pkp/templates/frontend/pages/about.tpl
 *}
{include file="frontend/components/header.tpl" pageTitle="about.aboutContext"}


<div class="page page_about digitopub-about-page">
	<div class="digitopub-container">
		{include file="frontend/components/breadcrumbs.tpl" currentTitleKey="about.aboutContext"}

		{* Hero *}
		<section class="digitopub-about-hero">
			<div class="digitopub-about-hero__body">
				<span class="digitopub-about-hero__kicker">Journal Profile</span>
				<h1 class="digitopub-about-hero__title">{translate key="about.aboutContext"}</h1>
				<p class="digitopub-about-hero__subtitle">
					{$currentContext->getLocalizedName()|escape} is an international, peer-reviewed, open access journal committed to advancing high-quality biomedical research.
				</p>
				<div class="digitopub-about-hero__meta">
					{if $currentContext->getData("issn")}
						<span class="digitopub-meta-pill"><strong>ISSN:</strong> {$currentContext->getData("issn")|escape}</span>
					{/if}
					{if $currentContext->getData("onlineIssn")}
						<span class="digitopub-meta-pill"><strong>eISSN:</strong> {$currentContext->getData("onlineIssn")|escape}</span>
					{/if}
					<span class="digitopub-meta-pill"><strong>Model:</strong> Continuous Publication</span>
					<span class="digitopub-meta-pill"><strong>Access:</strong> Open Access</span>
				</div>
			</div>
		</section>

		{* Stats / highlights *}
		<section class="digitopub-about-stats" aria-label="Journal highlights">
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">CC BY</div>
				<div class="digitopub-stat-card__label">Open License</div>
			</div>
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">D-Blind</div>
				<div class="digitopub-stat-card__label">Peer Review</div>
			</div>
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">Global</div>
				<div class="digitopub-stat-card__label">Reach</div>
			</div>
			<div class="digitopub-stat-card">
				<div class="digitopub-stat-card__value">24/7</div>
				<div class="digitopub-stat-card__label">Online Access</div>
			</div>
		</section>

		{* Main two-column layout *}
		<div class="digitopub-about-grid">
			<div class="digitopub-about-content">
				{$currentContext->getLocalizedData("about")}
			</div>

			<aside class="digitopub-about-sidebar">
				{* Editorial Board *}
				<div class="digitopub-about-sidebar__card">
					<h3>Editorial Board</h3>
					<p>Meet the editors, editorial board members, and peer reviewers who guide the journal.</p>
					<a href="{url page="about" op="editorialMasthead"}" class="digitopub-btn digitopub-btn--primary">View Masthead</a>
					<a href="{url page="about" op="editorialHistory"}" class="digitopub-btn digitopub-btn--ghost">Editorial History</a>
				</div>

				{* Indexing & Memberships *}
				<div class="digitopub-about-sidebar__card">
					<h3>Indexing & Memberships</h3>
					<div class="digitopub-index-badges">
						<span class="digitopub-index-badge">COPE</span>
						<span class="digitopub-index-badge">DOAJ</span>
						<span class="digitopub-index-badge">OASPA</span>
						<span class="digitopub-index-badge">Crossref</span>
						<span class="digitopub-index-badge">Google Scholar</span>
						<span class="digitopub-index-badge">ORCID</span>
					</div>
				</div>

				{* Submit CTA *}
				<div class="digitopub-about-sidebar__card digitopub-about-sidebar__card--cta">
					<h3>Publish with Us</h3>
					<p>Submit your original research, reviews, or case reports to {$currentContext->getLocalizedName()|escape}.</p>
					<a href="{url page="submission"}" class="digitopub-btn digitopub-btn--primary">Start Submission</a>
				</div>
			</aside>
		</div>
	</div>
</div><!-- .page -->

{include file="frontend/components/footer.tpl"}
