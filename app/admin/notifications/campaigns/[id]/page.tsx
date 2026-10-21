"use client"

import { useParams } from "next/navigation"

import { CampaignDetailView } from "@/src/features/notifications/components/campaigns/campaign-detail"

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  return <CampaignDetailView id={params.id} />
}
