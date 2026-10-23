"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export type RuleScope = "global" | "journal" | "discipline"
export type RuleEventType = "issue_published" | "article_digest"

export interface NotificationRule {
  id: string
  scope: RuleScope
  scope_key: string
  journal_id: string | null
  discipline_id: string | null
  event_type: RuleEventType
  enabled: boolean
  auto_draft: boolean
  template_id: string | null
  target_name: string | null
  template_name: string | null
}

export interface RuleUpsertInput {
  scope: RuleScope
  journal_id?: string
  discipline_id?: string
  event_type: RuleEventType
  enabled: boolean
  auto_draft: boolean
  template_id?: string | null
}

export interface TaxonomyDiscipline {
  id: string
  slug: string
  name: string
  parent_id: string | null
  synonyms: string[]
  is_active: boolean
  sort_order: number
  _count: { subscribers: number; journals: number }
}

export interface TaxonomyJournal {
  id: string
  title: string
  ojs_id: number | string | null
  discipline_ids: string[]
}

export interface TaxonomySection {
  ojs_section_id: number | string
  discipline_ids: string[]
}

export interface Taxonomy {
  disciplines: TaxonomyDiscipline[]
  journals: TaxonomyJournal[]
  sections: TaxonomySection[]
}

export interface NotificationSettings {
  publisher_address: string
  weekly_digest_day: number
  consent_text_version: string
  email_style: "classic" | "modern" | "minimal"
  /** Saved addresses that pre-fill every "Send test" box. */
  test_recipients: string[]
}

/** Outcome of a test sent to one or several addresses. */
export interface TestSendResult {
  sent: string[]
  failed: { to: string; error: string }[]
}

export interface NotificationSettingsView {
  settings: NotificationSettings
  readonly: {
    from: string
    limits: { perRun: number; perHour: number; perDay: number }
    enabled: boolean
    schedule: { detect: string; digests: string; send: string }
  }
}

export interface NotificationTemplate {
  id: string
  name: string
  subject: string
}

export interface UpdateDisciplineInput {
  name?: string
  parent_id?: string | null
  synonyms?: string[]
  is_active?: boolean
  sort_order?: number
}

const RULES_KEY = ["notification-rules"]
const TAXONOMY_KEY = ["notification-taxonomy"]
const SETTINGS_KEY = ["notification-settings"]

export function useRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: async () => {
      const res = await client.notifications.rules.$get()
      const body = await parseRpcResponse<{ data: NotificationRule[] }>(res, "Failed to load rules")
      return body.data
    },
    staleTime: 30 * 1000,
  })
}

export function useUpsertRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (json: RuleUpsertInput) => {
      const res = await client.notifications.rules.$put({ json })
      return parseRpcResponse<{ success: boolean }>(res, "Failed to save rule")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save rule")
    },
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notifications.rules[":id"].$delete({ param: { id } })
      return parseRpcResponse<{ success: boolean }>(res, "Failed to delete rule")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete rule")
    },
  })
}

export function useTaxonomy() {
  return useQuery({
    queryKey: TAXONOMY_KEY,
    queryFn: async () => {
      const res = await client.notifications.taxonomy.$get()
      const body = await parseRpcResponse<{ data: Taxonomy }>(res, "Failed to load taxonomy")
      return body.data
    },
    staleTime: 30 * 1000,
  })
}

function invalidateTaxonomy(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: TAXONOMY_KEY })
  queryClient.invalidateQueries({ queryKey: ["notification-disciplines"] })
}

export function useCreateDiscipline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (json: { name: string; slug?: string; parent_id?: string | null; synonyms?: string[] }) => {
      const res = await client.notifications.disciplines.$post({ json })
      return parseRpcResponse<{ data: { id: string } }>(res, "Failed to create discipline")
    },
    onSuccess: () => {
      toast.success("Discipline added")
      invalidateTaxonomy(queryClient)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create discipline")
    },
  })
}

export function useUpdateDiscipline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, json }: { id: string; json: UpdateDisciplineInput }) => {
      const res = await client.notifications.disciplines[":id"].$patch({ param: { id }, json })
      return parseRpcResponse<{ data: { id: string } }>(res, "Failed to update discipline")
    },
    onSuccess: () => {
      toast.success("Discipline updated")
      invalidateTaxonomy(queryClient)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update discipline")
    },
  })
}

export function useSetJournalDisciplines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, discipline_ids }: { id: string; discipline_ids: string[] }) => {
      const res = await client.notifications.journals[":id"].disciplines.$put({
        param: { id },
        json: { discipline_ids },
      })
      return parseRpcResponse<{ success: boolean }>(res, "Failed to save journal mapping")
    },
    onSuccess: () => {
      toast.success("Journal mapping saved")
      invalidateTaxonomy(queryClient)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save journal mapping")
    },
  })
}

export function useSetSectionDisciplines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, discipline_ids }: { id: string; discipline_ids: string[] }) => {
      const res = await client.notifications.sections[":id"].disciplines.$put({
        param: { id },
        json: { discipline_ids },
      })
      return parseRpcResponse<{ success: boolean }>(res, "Failed to save section mapping")
    },
    onSuccess: () => {
      toast.success("Section mapping saved")
      invalidateTaxonomy(queryClient)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save section mapping")
    },
  })
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const res = await client.notifications.settings.$get()
      const body = await parseRpcResponse<{ data: NotificationSettingsView }>(res, "Failed to load settings")
      return body.data
    },
    staleTime: 30 * 1000,
  })
}

export function useSaveNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (json: Partial<NotificationSettings>) => {
      const res = await client.notifications.settings.$put({ json })
      return parseRpcResponse<{ data: NotificationSettingsView }>(res, "Failed to save settings")
    },
    onSuccess: () => {
      toast.success("Settings saved")
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
      queryClient.invalidateQueries({ queryKey: READINESS_KEY })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save settings")
    },
  })
}

// ─── Go-live setup ────────────────────────────────────────────────────

export interface ReadinessItem {
  key: string
  label: string
  ok: boolean
  detail: string
}

const READINESS_KEY = ["notification-readiness"]

export function useNotificationReadiness() {
  return useQuery({
    queryKey: READINESS_KEY,
    queryFn: async () => {
      const res = await client.notifications.settings.readiness.$get()
      const body = await parseRpcResponse<{ data: ReadinessItem[] }>(res, "Failed to load readiness")
      return body.data
    },
    staleTime: 30 * 1000,
  })
}

export function useInstallNotificationDefaults() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await client.notifications.settings["install-defaults"].$post()
      return parseRpcResponse<{
        data: { disciplines: number; rules: number; templatesCreated: number; templatesKept: number }
      }>(res, "Failed to install starter data")
    },
    onSuccess: ({ data }) => {
      toast.success(`Starter data installed: ${data.disciplines} disciplines, ${data.templatesCreated} new templates`)
      queryClient.invalidateQueries({ queryKey: READINESS_KEY })
      invalidateTaxonomy(queryClient)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to install starter data")
    },
  })
}

export function useSendDeliverabilityTest() {
  return useMutation({
    mutationFn: async (recipients: string[]) => {
      const res = await client.notifications.settings["deliverability-test"].$post({ json: { recipients } })
      return parseRpcResponse<{ data: TestSendResult; message?: string }>(res, "Failed to send the test email")
    },
    onSuccess: (body) => {
      toast.success(body.message ?? "Test email sent through the alerts mailbox")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send the test email")
    },
  })
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: ["email-templates", "notification"],
    queryFn: async () => {
      const res = await fetch("/api/email-templates?category=notification&limit=100")
      const body = await parseRpcResponse<{ data: NotificationTemplate[] }>(res, "Failed to load templates")
      return body.data
    },
    staleTime: 60 * 1000,
  })
}
