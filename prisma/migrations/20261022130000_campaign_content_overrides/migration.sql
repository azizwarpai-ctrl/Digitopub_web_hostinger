-- Migration: campaign_content_overrides
-- Journal messaging (#218). Additive only: a draft campaign can carry its own
-- edited HTML and plain-text content instead of its template's. NULL means
-- "use the template", which is every existing campaign.
-- Generated: 2026-10-22

ALTER TABLE `notification_campaigns` ADD COLUMN `html_override` LONGTEXT NULL,
    ADD COLUMN `text_override` LONGTEXT NULL;
