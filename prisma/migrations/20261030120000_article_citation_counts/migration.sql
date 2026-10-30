-- #232: citation counts per DigitoPub DOI (Crossref, OpenAlex fallback).
CREATE TABLE `article_citation_counts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `doi` VARCHAR(255) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(16) NOT NULL,
    `fetched_at` DATETIME(3) NULL,
    `checked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `error` VARCHAR(255) NULL,

    UNIQUE INDEX `article_citation_counts_doi_key`(`doi`),
    INDEX `article_citation_counts_checked_at_idx`(`checked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
