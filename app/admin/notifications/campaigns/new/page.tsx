"use client"

import { PageHeader } from "@/components/ui/page-header"
import { NewMessageForm } from "@/src/features/notifications/components/campaigns/new-message-form"

export default function NewMessagePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New message" subtitle="Write to a journal's members, an uploaded list or specific people" />
      <NewMessageForm />
    </div>
  )
}
