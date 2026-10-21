import { Badge } from "@/components/ui/badge"
import type { CampaignStatus, CampaignType } from "@/src/features/notifications/api/use-campaigns"

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  approving: "Approving",
  scheduled: "Scheduled",
  queued: "Queued",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
  failed: "Failed",
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approving: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  queued: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  sending: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  paused: "bg-muted text-muted-foreground",
  sent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
}

export const TYPE_LABELS: Record<CampaignType, string> = {
  issue: "Issue",
  digest_weekly: "Weekly digest",
  digest_daily: "Daily digest",
  invitation: "Invitation",
  custom: "Custom",
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge className={STATUS_STYLES[status] ?? ""}>{STATUS_LABELS[status] ?? status}</Badge>
}

export function campaignTypeLabel(type: CampaignType): string {
  return TYPE_LABELS[type] ?? type
}
