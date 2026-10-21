"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export interface UpdateSubscriberInput {
  name?: string | null
  affiliation?: string | null
  article_frequency?: "weekly" | "daily" | "off"
  issue_alerts?: boolean
  status?: "unsubscribed" | "bounced" | "complained"
  discipline_ids?: string[]
  journal_ids?: string[]
}

export function useUpdateSubscriber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, json }: { id: string; json: UpdateSubscriberInput }) => {
      const res = await client.notifications.subscribers[":id"].$patch({ param: { id }, json })
      return parseRpcResponse<{ data: { id: string } }>(res, "Failed to update subscriber")
    },
    onSuccess: (_data, variables) => {
      toast.success("Subscriber updated")
      queryClient.invalidateQueries({ queryKey: ["notification-subscribers"] })
      queryClient.invalidateQueries({ queryKey: ["notification-subscriber", variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update subscriber")
    },
  })
}
