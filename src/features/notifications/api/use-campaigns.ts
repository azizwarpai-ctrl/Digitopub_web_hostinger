"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"
import type { Pagination } from "./use-get-subscribers"

export type CampaignType = "issue" | "digest_weekly" | "digest_daily" | "invitation" | "custom"
export type CampaignStatus =
  | "draft"
  | "approving"
  | "scheduled"
  | "queued"
  | "sending"
  | "paused"
  | "sent"
  | "cancelled"
  | "failed"

export interface CampaignRow {
  id: string
  type: CampaignType
  status: CampaignStatus
  subject: string
  template_name: string | null
  template_id: string | null
  recipient_estimate: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  approved_at: string | null
  approved_by: string | null
  subject_override: string | null
  created_at: string
  updated_at: string
}

export interface CampaignEvent {
  id: string
  kind: "issue" | "article"
  title: string
  journal_title: string | null
  published_at: string | null
  url: string | null
  excluded: boolean
}

export interface CountItem {
  id: string
  name: string
  count: number
}

export interface CampaignDetail {
  campaign: CampaignRow & {
    editor_note: string | null
    window: { from: string; to: string } | null
    template: { id: string; name: string; subject: string } | null
    approver: { full_name: string | null; email: string } | null
  }
  events: CampaignEvent[]
  recipients: { total: number; by_journal: CountItem[]; by_discipline: CountItem[] }
}

export interface CampaignPreview {
  subject: string
  html: string
  text: string
}

export interface CampaignProgress {
  status: CampaignStatus
  queued: number
  sent: number
  failed: number
  skipped: number
  remaining: number
  eta_minutes: number | null
}

export interface NotificationOverview {
  subscribers: { active: number; pending: number; suppressed: number }
  sent_7d: number
  drafts_awaiting: number
  recent_campaigns: CampaignRow[]
}

export interface CampaignFilters {
  status?: string
  type?: string
}

export interface UpdateCampaignInput {
  subject_override?: string | null
  editor_note?: string | null
  excluded_event_ids?: string[]
}

export function useNotificationOverview() {
  return useQuery({
    queryKey: ["notification-overview"],
    queryFn: async () => {
      const res = await client.notifications.overview.$get()
      const body = await parseRpcResponse<{ data: NotificationOverview }>(res, "Failed to load overview")
      return body.data
    },
    staleTime: 30 * 1000,
  })
}

export function useCampaigns(filters: CampaignFilters, page = 1, limit = 20) {
  return useQuery({
    queryKey: ["notification-campaigns", filters, page, limit],
    queryFn: async () => {
      const query: Record<string, string> = { page: String(page), limit: String(limit) }
      if (filters.status) query.status = filters.status
      if (filters.type) query.type = filters.type
      const res = await client.notifications.campaigns.$get({ query })
      return parseRpcResponse<{ data: CampaignRow[]; pagination: Pagination }>(res, "Failed to load campaigns")
    },
    staleTime: 15 * 1000,
  })
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["notification-campaign", id],
    queryFn: async () => {
      const res = await client.notifications.campaigns[":id"].$get({ param: { id } })
      const body = await parseRpcResponse<{ data: CampaignDetail }>(res, "Failed to load campaign")
      return body.data
    },
    staleTime: 10 * 1000,
  })
}

export function useCampaignPreview(id: string) {
  return useQuery({
    queryKey: ["notification-campaign-preview", id],
    queryFn: async () => {
      const res = await client.notifications.campaigns[":id"].preview.$get({ param: { id } })
      const body = await parseRpcResponse<{ data: CampaignPreview }>(res, "Failed to load preview")
      return body.data
    },
    staleTime: 10 * 1000,
  })
}

export function useCampaignProgress(id: string, enabled: boolean, poll = enabled) {
  return useQuery({
    queryKey: ["notification-campaign-progress", id],
    enabled,
    refetchInterval: enabled && poll ? 10000 : false,
    queryFn: async () => {
      const res = await client.notifications.campaigns[":id"].progress.$get({ param: { id } })
      const body = await parseRpcResponse<{ data: CampaignProgress }>(res, "Failed to load progress")
      return body.data
    },
  })
}

function useInvalidateCampaign() {
  const queryClient = useQueryClient()
  return (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["notification-campaign", id] })
    queryClient.invalidateQueries({ queryKey: ["notification-campaign-preview", id] })
    queryClient.invalidateQueries({ queryKey: ["notification-campaign-progress", id] })
    queryClient.invalidateQueries({ queryKey: ["notification-campaigns"] })
    queryClient.invalidateQueries({ queryKey: ["notification-overview"] })
  }
}

export function useUpdateCampaign() {
  const invalidate = useInvalidateCampaign()
  return useMutation({
    mutationFn: async ({ id, json }: { id: string; json: UpdateCampaignInput }) => {
      const res = await client.notifications.campaigns[":id"].$patch({ param: { id }, json })
      return parseRpcResponse<{ data: { id: string; recipient_estimate: number } }>(res, "Failed to save campaign")
    },
    onSuccess: (_d, v) => {
      toast.success("Campaign saved")
      invalidate(v.id)
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save campaign"),
  })
}

export function useSendCampaignTest() {
  return useMutation({
    mutationFn: async ({ id, to }: { id: string; to?: string }) => {
      const res = await client.notifications.campaigns[":id"].test.$post({
        param: { id },
        json: to ? { to } : {},
      })
      return parseRpcResponse<{ success: boolean; message?: string }>(res, "Failed to send test email")
    },
    onSuccess: (d) => toast.success(d.message || "Test email sent"),
    onError: (error: Error) => toast.error(error.message || "Failed to send test email"),
  })
}

export function useApproveCampaign() {
  const invalidate = useInvalidateCampaign()
  return useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: string; scheduled_at?: string }) => {
      const res = await client.notifications.campaigns[":id"].approve.$post({
        param: { id },
        json: scheduled_at ? { scheduled_at } : {},
      })
      return parseRpcResponse<{ data: { status: string; recipients: number } }>(res, "Failed to approve campaign")
    },
    onSuccess: (d, v) => {
      toast.success(v.scheduled_at ? "Campaign scheduled" : "Campaign approved and queued")
      invalidate(v.id)
      return d
    },
    onError: (error: Error) => toast.error(error.message || "Failed to approve campaign"),
  })
}

function useStateAction(action: "pause" | "resume" | "cancel", okMessage: string) {
  const invalidate = useInvalidateCampaign()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notifications.campaigns[":id"][action].$post({ param: { id } })
      return parseRpcResponse<{ data: { status: string } }>(res, `Failed to ${action} campaign`)
    },
    onSuccess: (_d, v) => {
      toast.success(okMessage)
      invalidate(v.id)
    },
    onError: (error: Error) => toast.error(error.message || `Failed to ${action} campaign`),
  })
}

export function usePauseCampaign() {
  return useStateAction("pause", "Campaign paused")
}

export function useResumeCampaign() {
  return useStateAction("resume", "Campaign resumed")
}

export function useCancelCampaign() {
  return useStateAction("cancel", "Campaign cancelled")
}
