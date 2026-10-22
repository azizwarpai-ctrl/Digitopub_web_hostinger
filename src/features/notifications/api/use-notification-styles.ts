"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { STYLE_PREVIEW_TEMPLATES } from "@/src/features/notifications/schemas/notification-schemas"

export type EmailStyleKey = "classic" | "modern" | "minimal"
export type StylePreviewTemplate = (typeof STYLE_PREVIEW_TEMPLATES)[number]

export interface EmailStyleSummary {
  key: EmailStyleKey
  name: string
  description: string
}

export interface EmailStylesView {
  active: EmailStyleKey
  styles: EmailStyleSummary[]
  /** Notification templates whose HTML an admin has edited. */
  customised: string[]
}

const STYLES_KEY = ["notification-styles"]

export function useNotificationStyles() {
  return useQuery({
    queryKey: STYLES_KEY,
    queryFn: async () => {
      const res = await client.notifications.styles.$get()
      const body = await parseRpcResponse<{ data: EmailStylesView }>(res, "Failed to load email styles")
      return body.data
    },
    staleTime: 30 * 1000,
  })
}

export function useStylePreview(key: EmailStyleKey, template: StylePreviewTemplate) {
  return useQuery({
    queryKey: [...STYLES_KEY, "preview", key, template],
    queryFn: async () => {
      const res = await client.notifications.styles[":key"].preview.$get({ param: { key }, query: { template } })
      const body = await parseRpcResponse<{ data: { subject: string; html: string } }>(res, "Failed to load preview")
      return body.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useApplyStyle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, overwriteCustomised }: { key: EmailStyleKey; overwriteCustomised: boolean }) => {
      const res = await client.notifications.styles[":key"].apply.$post({ param: { key }, json: { overwriteCustomised } })
      return parseRpcResponse<{ data: { applied: string[]; skipped: string[] } }>(res, "Failed to apply style")
    },
    onSuccess: ({ data }) => {
      toast.success(
        data.skipped.length
          ? `Style applied to ${data.applied.length} email(s); ${data.skipped.length} edited email(s) kept`
          : `Style applied to ${data.applied.length} email(s)`,
      )
      queryClient.invalidateQueries({ queryKey: STYLES_KEY })
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] })
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
      queryClient.invalidateQueries({ queryKey: ["email-template"] })
      queryClient.invalidateQueries({ queryKey: ["email-template-sample-variables"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to apply style")
    },
  })
}
