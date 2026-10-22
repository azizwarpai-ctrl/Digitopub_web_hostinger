"use client"

import { PageHeader } from "@/components/ui/page-header"
import { GoLiveCard } from "@/src/features/notifications/components/config/go-live-card"
import { NotificationSettingsPanel } from "@/src/features/notifications/components/config/settings-form"

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notification settings" subtitle="Go-live checklist, email footer, digest timing and delivery status" />
      <GoLiveCard />
      <NotificationSettingsPanel />
    </div>
  )
}
