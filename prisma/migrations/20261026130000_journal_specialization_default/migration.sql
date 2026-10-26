-- Keep a durable default for journals discovered from OJS. Its name may be
-- renamed, but the specialization service refuses to retire this row.
ALTER TABLE `journal_specializations`
  ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT false AFTER `is_active`;

UPDATE `journal_specializations`
SET `is_default` = true
WHERE `name` = 'General Science';
