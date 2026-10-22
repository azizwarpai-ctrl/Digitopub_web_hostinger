import { type Journal } from "@/src/features/journals"
import { JournalQuickActions } from "./journal-quick-actions"
import { JournalInfoCarousel } from "./journal-info-carousel"
import { JournalStatsCard } from "./journal-stats-card"
import { JournalContactCard } from "./journal-contact-card"
import { JournalIssnCard } from "./journal-issn-card"

export interface JournalSidebarProps {
  journalId: string
  journal: Journal & { contact_email?: string }
  stats?: { articles: number; issues: number } | null
  submissionUrl?: string | null
  onTabChange: (tab: string) => void
}

export function JournalSidebar({
  journalId,
  journal,
  stats,
  submissionUrl,
  onTabChange,
}: JournalSidebarProps) {
  return (
    <div className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
      {/* Quick Actions */}
      <JournalQuickActions
        submissionUrl={submissionUrl}
        onTabChange={onTabChange}
        journalId={journal.id}
        journalTitle={journal.title}
      />

      {/* Journal highlights and Custom Blocks from OJS */}
      <JournalInfoCarousel journalId={journalId} />

      {/* Statistics */}
      <JournalStatsCard stats={stats} />

      {/* Contact */}
      <JournalContactCard
        publisher={journal.publisher}
        contactEmail={journal.contact_email}
      />

      {/* ISSN */}
      <JournalIssnCard issn={journal.issn} eIssn={journal.e_issn} />
    </div>
  )
}
