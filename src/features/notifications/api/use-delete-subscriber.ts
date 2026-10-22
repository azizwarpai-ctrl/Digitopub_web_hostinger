"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export function useDeleteSubscriber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notifications.subscribers[":id"].$delete({ param: { id } })
      return parseRpcResponse<{ success: boolean }>(res, "Failed to delete subscriber")
    },
    onSuccess: () => {
      toast.success("Subscriber deleted")
      queryClient.invalidateQueries({ queryKey: ["notification-subscribers"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete subscriber")
    },
  })
}
