"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export interface Subscriber {
  id: string
  email: string
  name: string | null
  affiliation: string | null
  status: string
  source: string
  article_frequency: string
  issue_alerts: boolean
  confirmed_at: string | null
  created_at: string
  disciplines: { id: string; name: string; slug: string }[]
  journals: { id: string; title: string }[]
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface SubscriberFilters {
  status?: string
  source?: string
  discipline_id?: string
  journal_id?: string
  import_id?: string
  q?: string
}

/** Builds the query string shared by the list and the CSV export link. */
export function buildSubscriberQuery(filters: SubscriberFilters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value) params.set(key, value)
  }
  return params.toString()
}

export function useGetSubscribers(filters: SubscriberFilters, page = 1, limit = 20) {
  return useQuery({
    queryKey: ["notification-subscribers", filters, page, limit],
    queryFn: async () => {
      const query: Record<string, string> = { page: String(page), limit: String(limit) }
      for (const [key, value] of Object.entries(filters)) {
        if (value) query[key] = value
      }
      const res = await client.notifications.subscribers.$get({ query })
      return parseRpcResponse<{ data: Subscriber[]; pagination: Pagination }>(res, "Failed to fetch subscribers")
    },
    staleTime: 30 * 1000,
  })
}
