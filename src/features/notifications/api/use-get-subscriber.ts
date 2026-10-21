"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { Subscriber } from "./use-get-subscribers"

export function useGetSubscriber(id: string | null) {
  return useQuery({
    queryKey: ["notification-subscriber", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await client.notifications.subscribers[":id"].$get({ param: { id } })
      const body = await parseRpcResponse<{ data: Subscriber }>(res, "Failed to fetch subscriber")
      return body.data
    },
  })
}
