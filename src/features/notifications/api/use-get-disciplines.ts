"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export interface Discipline {
  id: string
  slug: string
  name: string
  parent_id: string | null
}

export function useGetDisciplines() {
  return useQuery({
    queryKey: ["notification-disciplines"],
    queryFn: async () => {
      const res = await client.notifications.disciplines.$get()
      const body = await parseRpcResponse<{ data: Discipline[] }>(res, "Failed to fetch disciplines")
      return body.data
    },
    staleTime: 10 * 60 * 1000,
  })
}
