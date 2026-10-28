-- #231: the journal's one-sentence scope, used in its alert invitation.
-- digitopub owns it; the OJS sync never writes this column.
ALTER TABLE `journals`
  ADD COLUMN `invitation_scope` VARCHAR(500) NULL AFTER `last_synced_at`;
