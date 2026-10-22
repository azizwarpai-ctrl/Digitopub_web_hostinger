-- Migration: notifications_foundation
-- Publication notification system, phase 1 (#197, epic #204). Additive only:
-- twelve new tables plus email_templates.category (existing rows default to
-- 'transactional'). No existing column, index or row is changed.
-- Generated: 2026-10-21 via prisma migrate diff
-- AlterTable
ALTER TABLE `email_templates` ADD COLUMN `category` VARCHAR(30) NOT NULL DEFAULT 'transactional';

-- CreateTable
CREATE TABLE `disciplines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `parent_id` BIGINT NULL,
    `synonyms` JSON NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `disciplines_slug_key`(`slug`),
    INDEX `disciplines_parent_id_idx`(`parent_id`),
    INDEX `disciplines_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_disciplines` (
    `journal_id` BIGINT NOT NULL,
    `discipline_id` BIGINT NOT NULL,

    INDEX `journal_disciplines_discipline_id_idx`(`discipline_id`),
    PRIMARY KEY (`journal_id`, `discipline_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ojs_section_disciplines` (
    `ojs_section_id` BIGINT NOT NULL,
    `discipline_id` BIGINT NOT NULL,

    INDEX `ojs_section_disciplines_discipline_id_idx`(`discipline_id`),
    PRIMARY KEY (`ojs_section_id`, `discipline_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_subscribers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `email_hash` CHAR(64) NOT NULL,
    `name` VARCHAR(255) NULL,
    `affiliation` VARCHAR(255) NULL,
    `orcid` VARCHAR(19) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `source` VARCHAR(20) NOT NULL,
    `import_id` BIGINT NULL,
    `confirm_token_hash` CHAR(64) NULL,
    `confirm_expires_at` DATETIME(3) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `consent_text_version` VARCHAR(32) NOT NULL,
    `consent_ip_hash` CHAR(64) NULL,
    `article_frequency` VARCHAR(10) NOT NULL DEFAULT 'weekly',
    `issue_alerts` BOOLEAN NOT NULL DEFAULT true,
    `unsubscribed_at` DATETIME(3) NULL,
    `last_sent_at` DATETIME(3) NULL,
    `raw_interests` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notification_subscribers_email_key`(`email`),
    INDEX `notification_subscribers_status_idx`(`status`),
    INDEX `notification_subscribers_email_hash_idx`(`email_hash`),
    INDEX `notification_subscribers_orcid_idx`(`orcid`),
    INDEX `notification_subscribers_import_id_idx`(`import_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriber_disciplines` (
    `subscriber_id` BIGINT NOT NULL,
    `discipline_id` BIGINT NOT NULL,

    INDEX `subscriber_disciplines_discipline_id_idx`(`discipline_id`),
    PRIMARY KEY (`subscriber_id`, `discipline_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriber_journals` (
    `subscriber_id` BIGINT NOT NULL,
    `journal_id` BIGINT NOT NULL,

    INDEX `subscriber_journals_journal_id_idx`(`journal_id`),
    PRIMARY KEY (`subscriber_id`, `journal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriber_imports` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `file_name` VARCHAR(255) NOT NULL,
    `file_type` VARCHAR(10) NOT NULL,
    `uploaded_by` BIGINT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'parsed',
    `totals` JSON NOT NULL,
    `column_map` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `subscriber_imports_uploaded_by_idx`(`uploaded_by`),
    INDEX `subscriber_imports_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriber_import_rows` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `import_id` BIGINT NOT NULL,
    `row_no` INTEGER NOT NULL,
    `email` VARCHAR(255) NULL,
    `name` VARCHAR(255) NULL,
    `raw_interests` TEXT NULL,
    `mapped_discipline_ids` JSON NOT NULL,
    `unmapped_terms` JSON NOT NULL,
    `issue` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `subscriber_import_rows_import_id_issue_idx`(`import_id`, `issue`),
    INDEX `subscriber_import_rows_created_at_idx`(`created_at`),
    UNIQUE INDEX `subscriber_import_rows_import_id_row_no_key`(`import_id`, `row_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_rules` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `scope` VARCHAR(20) NOT NULL,
    `scope_key` VARCHAR(40) NOT NULL,
    `journal_id` BIGINT NULL,
    `discipline_id` BIGINT NULL,
    `event_type` VARCHAR(30) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `template_id` BIGINT NULL,
    `auto_draft` BOOLEAN NOT NULL DEFAULT true,
    `updated_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_rules_journal_id_idx`(`journal_id`),
    INDEX `notification_rules_discipline_id_idx`(`discipline_id`),
    INDEX `notification_rules_template_id_idx`(`template_id`),
    INDEX `notification_rules_updated_by_idx`(`updated_by`),
    UNIQUE INDEX `notification_rules_scope_key_event_type_key`(`scope_key`, `event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `publication_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(10) NOT NULL,
    `dedupe_key` VARCHAR(40) NOT NULL,
    `ojs_journal_id` VARCHAR(50) NOT NULL,
    `ojs_issue_id` BIGINT NULL,
    `ojs_submission_id` BIGINT NULL,
    `ojs_publication_id` BIGINT NULL,
    `published_at` DATETIME(3) NOT NULL,
    `snapshot` JSON NOT NULL,
    `discipline_ids` JSON NOT NULL,
    `campaign_id` BIGINT NULL,
    `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `publication_events_dedupe_key_key`(`dedupe_key`),
    INDEX `publication_events_published_at_idx`(`published_at`),
    INDEX `publication_events_kind_published_at_idx`(`kind`, `published_at`),
    INDEX `publication_events_ojs_journal_id_idx`(`ojs_journal_id`),
    INDEX `publication_events_campaign_id_idx`(`campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_campaigns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `template_id` BIGINT NOT NULL,
    `subject_override` VARCHAR(500) NULL,
    `payload` JSON NOT NULL,
    `recipient_estimate` INTEGER NOT NULL DEFAULT 0,
    `scheduled_at` DATETIME(3) NULL,
    `approved_by` BIGINT NULL,
    `approved_at` DATETIME(3) NULL,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_campaigns_status_scheduled_at_idx`(`status`, `scheduled_at`),
    INDEX `notification_campaigns_type_created_at_idx`(`type`, `created_at`),
    INDEX `notification_campaigns_template_id_idx`(`template_id`),
    INDEX `notification_campaigns_approved_by_idx`(`approved_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_deliveries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT NOT NULL,
    `subscriber_id` BIGINT NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_deliveries_campaign_id_status_idx`(`campaign_id`, `status`),
    INDEX `notification_deliveries_sent_at_idx`(`sent_at`),
    INDEX `notification_deliveries_subscriber_id_idx`(`subscriber_id`),
    UNIQUE INDEX `notification_deliveries_campaign_id_subscriber_id_key`(`campaign_id`, `subscriber_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `email_templates_category_idx` ON `email_templates`(`category`);

-- AddForeignKey
ALTER TABLE `disciplines` ADD CONSTRAINT `disciplines_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `disciplines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_disciplines` ADD CONSTRAINT `journal_disciplines_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_disciplines` ADD CONSTRAINT `journal_disciplines_discipline_id_fkey` FOREIGN KEY (`discipline_id`) REFERENCES `disciplines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ojs_section_disciplines` ADD CONSTRAINT `ojs_section_disciplines_discipline_id_fkey` FOREIGN KEY (`discipline_id`) REFERENCES `disciplines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_subscribers` ADD CONSTRAINT `notification_subscribers_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `subscriber_imports`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_disciplines` ADD CONSTRAINT `subscriber_disciplines_subscriber_id_fkey` FOREIGN KEY (`subscriber_id`) REFERENCES `notification_subscribers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_disciplines` ADD CONSTRAINT `subscriber_disciplines_discipline_id_fkey` FOREIGN KEY (`discipline_id`) REFERENCES `disciplines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_journals` ADD CONSTRAINT `subscriber_journals_subscriber_id_fkey` FOREIGN KEY (`subscriber_id`) REFERENCES `notification_subscribers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_journals` ADD CONSTRAINT `subscriber_journals_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_imports` ADD CONSTRAINT `subscriber_imports_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_import_rows` ADD CONSTRAINT `subscriber_import_rows_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `subscriber_imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_rules` ADD CONSTRAINT `notification_rules_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_rules` ADD CONSTRAINT `notification_rules_discipline_id_fkey` FOREIGN KEY (`discipline_id`) REFERENCES `disciplines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_rules` ADD CONSTRAINT `notification_rules_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `email_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_rules` ADD CONSTRAINT `notification_rules_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `publication_events` ADD CONSTRAINT `publication_events_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `notification_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_campaigns` ADD CONSTRAINT `notification_campaigns_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `email_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_campaigns` ADD CONSTRAINT `notification_campaigns_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `notification_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_subscriber_id_fkey` FOREIGN KEY (`subscriber_id`) REFERENCES `notification_subscribers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

