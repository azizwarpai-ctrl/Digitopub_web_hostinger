-- Migration: notification_token_version
-- Publication notifications phase 3 (#199). Additive only: a version counter
-- embedded in signed confirm/manage/unsubscribe links so they can be revoked.
-- Generated: 2026-10-21

ALTER TABLE `notification_subscribers` ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 0;
