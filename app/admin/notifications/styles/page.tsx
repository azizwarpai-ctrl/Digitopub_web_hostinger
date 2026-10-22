"use client"

import { PageHeader } from "@/components/ui/page-header"
import { StyleGallery } from "@/src/features/notifications/components/config/style-gallery"

export default function NotificationStylesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Email style" subtitle="Ready-made designs for every publication alert email" />
      <StyleGallery />
    </div>
  )
}
