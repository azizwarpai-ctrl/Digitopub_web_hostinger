-- Migration: journal_specializations
-- Journal specialization (#234). Additive only.
--   * journal_specializations: admin-managed list that Journal.field is
--     chosen from. Seeded with the old hardcoded form list, "General Science"
--     (what OJS sync assigns), and every value journals already use, so no
--     existing journal points at a missing name.
--   * ojs_sync_jobs: outbox for writes to OJS (save first, push later).
--   * audit_ojs_writes: orcid/ojs_user_id become optional and rows can name
--     any target plus its value before and after the write.
-- Generated: 2026-10-26

-- AlterTable
ALTER TABLE `audit_ojs_writes` ADD COLUMN `actor_admin_id` BIGINT NULL,
    ADD COLUMN `after_value` TEXT NULL,
    ADD COLUMN `before_value` TEXT NULL,
    ADD COLUMN `target_id` VARCHAR(64) NULL,
    ADD COLUMN `target_type` VARCHAR(32) NULL,
    MODIFY `orcid` VARCHAR(19) NULL,
    MODIFY `ojs_user_id` BIGINT NULL;

-- CreateIndex
CREATE INDEX `audit_ojs_writes_target_type_target_id_idx` ON `audit_ojs_writes`(`target_type`, `target_id`);

-- CreateTable
CREATE TABLE `journal_specializations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `journal_specializations_name_key`(`name`),
    INDEX `journal_specializations_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ojs_sync_jobs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `action` VARCHAR(64) NOT NULL,
    `target_type` VARCHAR(32) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `ojs_sync_jobs_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `ojs_sync_jobs_action_target_type_target_id_idx`(`action`, `target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed: the previous hardcoded form list plus the OJS-sync default.
INSERT INTO `journal_specializations` (`name`, `sort_order`) VALUES
    ('General Science', 0),
    ('Medicine', 10),
    ('Dentistry', 20),
    ('Technology', 30),
    ('Engineering', 40),
    ('Computer Science', 50),
    ('Biology', 60),
    ('Chemistry', 70),
    ('Physics', 80),
    ('Mathematics', 90),
    ('Social Sciences', 100),
    ('Business', 110),
    ('Other', 120);

-- Seed: any other value a journal already uses (e.g. "Uncategorized"), so
-- the admin can see it in the list and retire or rename it.
INSERT INTO `journal_specializations` (`name`, `sort_order`)
SELECT DISTINCT j.`field`, 1000
FROM `journals` j
WHERE j.`field` IS NOT NULL AND j.`field` <> ''
  AND NOT EXISTS (SELECT 1 FROM `journal_specializations` s WHERE s.`name` = j.`field`);
