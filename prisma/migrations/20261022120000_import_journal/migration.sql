-- Migration: import_journal
-- Journal messaging (#216). Additive only: an uploaded list can be assigned to
-- one journal (NULL = "General"). People created from a journal list follow
-- that journal once they confirm, and its invitation is sent in the journal's name.
-- Generated: 2026-10-22

ALTER TABLE `subscriber_imports` ADD COLUMN `journal_id` BIGINT NULL;

CREATE INDEX `subscriber_imports_journal_id_idx` ON `subscriber_imports`(`journal_id`);

ALTER TABLE `subscriber_imports` ADD CONSTRAINT `subscriber_imports_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
