"use client"

import {
  Send,
  ArrowRight,
  FileText,
  ChevronRight,
  Newspaper as NewspaperIcon,
  Archive as ArchiveIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { SubmitManuscriptButton } from "./submit-manuscript-button"
import { GetAlertsButton } from "@/src/features/notifications/components/get-alerts-dialog"

export interface JournalQuickActionsProps {
  submissionUrl?: string | null
  onTabChange: (tab: string) => void
  journalId?: string
  journalTitle?: string
}

export function JournalQuickActions({
  submissionUrl,
  onTabChange,
  journalId,
  journalTitle,
}: JournalQuickActionsProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
      <h3 className="text-lg font-bold mb-5 pb-3 border-b border-border/60">Quick Actions</h3>
      <div className="space-y-3">
        <SubmitManuscriptButton
          submissionUrl={submissionUrl}
          className="w-full justify-between bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Submit Now
          </span>
          <ArrowRight className="h-4 w-4" />
        </SubmitManuscriptButton>

        <GetAlertsButton
          journalId={journalId}
          journalTitle={journalTitle}
          variant="outline"
          className="w-full justify-between border-border/60 hover:bg-muted/50"
        />

        <Button
          variant="outline"
          className="w-full justify-between border-border/60 hover:bg-muted/50"
          onClick={() => onTabChange("author")}
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Author Guidelines
          </span>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          className="w-full justify-between border-border/60 hover:bg-muted/50"
          onClick={() => onTabChange("current")}
        >
          <span className="flex items-center gap-2">
            <NewspaperIcon className="h-4 w-4" />
            Current Issue
          </span>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          className="w-full justify-between border-border/60 hover:bg-muted/50"
          onClick={() => onTabChange("archive")}
        >
          <span className="flex items-center gap-2">
            <ArchiveIcon className="h-4 w-4" />
            Archive
          </span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
