"use client"

import { PageHeader } from "@/components/ui/page-header"
import { NotificationSettingsPanel } from "@/src/features/notifications/components/config/settings-form"

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notification settings" subtitle="Email footer, digest timing and delivery status" />
      <NotificationSettingsPanel />
    </div>
  )
}
