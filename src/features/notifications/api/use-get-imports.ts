"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { Pagination } from "./use-get-subscribers"

export interface ImportTotals {
  rows: number
  valid: number
  invalid: number
  duplicate: number
  existing: number
  suppressed: number
  unmapped_terms: number
  /** Subscribers actually created; set when the import is confirmed. */
  created?: number
}

export interface UnmappedTerm {
  term: string
  count: number
}

export interface SubscriberImport {
  id: string
  file_name: string
  status: "parsed" | "confirmed" | "cancelled" | "failed"
  totals: ImportTotals | null
  created_at: string
  uploader?: { full_name: string | null; email: string } | null
  /** Journal the list is assigned to; null means "General". */
  journal_id?: string | null
  journal?: { id: string; title: string } | null
  unmapped_terms?: UnmappedTerm[]
}

export function useGetImports(page = 1, limit = 20) {
  return useQuery({
    queryKey: ["notification-imports", page, limit],
    queryFn: async () => {
      const res = await client.notifications.imports.$get({
        query: { page: String(page), limit: String(limit) },
      })
      return parseRpcResponse<{ data: SubscriberImport[]; pagination: Pagination }>(res, "Failed to fetch imports")
    },
    staleTime: 30 * 1000,
  })
}
