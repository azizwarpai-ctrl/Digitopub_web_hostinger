"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { Pagination } from "./use-get-subscribers"

export type ImportRowFilter = "valid" | "unmapped" | "invalid_email" | "duplicate_in_file" | "exists" | "suppressed"

export interface ImportRow {
  id: string
  row_no: number
  email: string
  name: string | null
  raw_interests: string | null
  mapped_discipline_ids: string[]
  unmapped_terms: string[]
  issue: string | null
}

export function useGetImportRows(id: string | null, issue: ImportRowFilter | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: ["notification-import-rows", id, issue, page, limit],
    enabled: !!id,
    queryFn: async () => {
      const query: Record<string, string> = { page: String(page), limit: String(limit) }
      if (issue) query.issue = issue
      const res = await client.notifications.imports[":id"].rows.$get({ param: { id }, query })
      return parseRpcResponse<{ data: ImportRow[]; pagination: Pagination }>(res, "Failed to fetch import rows")
    },
  })
}
