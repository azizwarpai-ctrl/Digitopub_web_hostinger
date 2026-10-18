export { journalCreateSchema, journalUpdateSchema, journalIdParamSchema } from "./schemas/journal-schema"
export type { JournalCreate, JournalUpdate } from "./schemas/journal-schema"
export type { Journal, JournalResponse } from "./types/journal-type"
export { useCreateJournal } from "./api/use-create-journal"
export { useGetJournals } from "./api/use-get-journals"
export { useGetJournal } from "./api/use-get-journal"
export { useGetJournalStats } from "@/src/features/journals/api/use-get-journal-stats"
export { useGetCurrentIssue } from "@/src/features/journals/api/use-get-current-issue"
export { useGetArchiveIssues } from "@/src/features/journals/api/use-get-archive-issues"
export { useGetIssueDetail } from "@/src/features/journals/api/use-get-issue-detail"
export type { CurrentIssue, CurrentIssueArticle, CurrentIssueAuthor } from "@/src/features/journals/types/current-issue-types"
export type { ArchiveIssue, IssueDetail } from "@/src/features/journals/types/archive-issue-types"
export type { ArticleDetail, ArticleDetailAuthor, ArticleGalley } from "@/src/features/journals/types/article-detail-types"
export { useJournalId } from "./hooks/use-journal-id"
export { useGetArticleDetail } from "./api/use-get-article-detail"
export { useGetEditorialBoard } from "./api/use-get-editorial-board"
export { useGetCustomBlocks } from "./api/use-get-custom-blocks"
export { useGetJournalFees } from "./api/use-get-journal-fees"
export { useGetJournalAboutContent } from "./api/use-get-journal-about-content"
export {
  APPROVED_POLICY_SLUGS,
  POLICY_METADATA,
  isValidPolicySlug,
  getPolicyTitleBySlug,
  isPolicySlugShape,
  resolvePolicyRoute,
} from "@/src/features/journals/policy-slugs"
export type { PolicyMeta } from "@/src/features/journals/policy-slugs"
export {
  APPROVED_ABOUT_SLUGS,
  ABOUT_METADATA,
  isValidAboutSlug,
  getAboutTitleBySlug,
} from "@/src/features/journals/about-slugs"
export type { AboutMeta } from "@/src/features/journals/about-slugs"
// Journal Registration Multi-Step Wizard
export { 
  journalRegistrationPayloadSchema,
  JOURNAL_REGISTRATION_STEPS
} from "./schemas/journal-registration-schemas"

export type { JournalRegistrationPayload } from "./schemas/journal-registration-schemas"
export { useJournalRegistrationStore } from "./stores/journal-registration-store"
export { JournalRegistrationWizard } from "./components/register/journal-registration-wizard"

// Extracted Utilities & Hooks
export { sanitizeContent, sanitizeRichContent } from "./utils/sanitize-html"
export { resolveOjsUrls } from "./utils/ojs-url"
export type { OjsUrls } from "./utils/ojs-url"
export { formatCurrency } from "./utils/format-currency"
export { useTabSync } from "./hooks/use-tab-sync"
export type { UseTabSyncOptions, UseTabSyncReturn } from "./hooks/use-tab-sync"
export { useAboutScrollSpy } from "./hooks/use-about-scroll-spy"
export type { UseAboutScrollSpyOptions, UseAboutScrollSpyReturn } from "./hooks/use-about-scroll-spy"

