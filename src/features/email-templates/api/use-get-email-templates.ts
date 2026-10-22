"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import type { EmailTemplateCategory } from "../types/email-template-type"

export function useGetEmailTemplates(page = 1, limit = 20, active?: boolean, category?: EmailTemplateCategory) {
  return useQuery({
    queryKey: ["email-templates", page, limit, active, category],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      }
      if (active !== undefined) params.active = String(active)

      if (category !== undefined) params.category = category

      const res = await client["email-templates"].index.$get({ query: params })
      if (!res.ok) throw new Error("Failed to fetch email templates")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
