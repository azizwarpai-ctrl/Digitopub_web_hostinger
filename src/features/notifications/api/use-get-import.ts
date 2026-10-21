"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { SubscriberImport } from "./use-get-imports"

export function useGetImport(id: string | null) {
  return useQuery({
    queryKey: ["notification-import", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await client.notifications.imports[":id"].$get({ param: { id } })
      const body = await parseRpcResponse<{ data: SubscriberImport }>(res, "Failed to fetch import")
      return body.data
    },
  })
}
