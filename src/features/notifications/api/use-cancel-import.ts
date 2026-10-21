"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export function useCancelImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notifications.imports[":id"].cancel.$post({ param: { id } })
      return parseRpcResponse<{ success: boolean }>(res, "Failed to cancel import")
    },
    onSuccess: (_data, variables) => {
      toast.success("Import cancelled")
      queryClient.invalidateQueries({ queryKey: ["notification-imports"] })
      queryClient.invalidateQueries({ queryKey: ["notification-import", variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel import")
    },
  })
}
