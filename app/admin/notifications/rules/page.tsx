"use client"

import { PageHeader } from "@/components/ui/page-header"
import { RulesMatrix } from "@/src/features/notifications/components/config/rules-matrix"

export default function NotificationRulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notification rules" subtitle="Choose which alerts are created and drafted automatically" />
      <RulesMatrix />
    </div>
  )
}
