"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export interface CreateSubscriberInput {
  email: string
  name?: string
  affiliation?: string
  discipline_ids?: string[]
  journal_ids?: string[]
}

export function useCreateSubscriber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (json: CreateSubscriberInput) => {
      const res = await client.notifications.subscribers.$post({ json })
      return parseRpcResponse<{ data: { id: string } }>(res, "Failed to add subscriber")
    },
    onSuccess: () => {
      toast.success("Subscriber added as pending")
      queryClient.invalidateQueries({ queryKey: ["notification-subscribers"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add subscriber")
    },
  })
}
