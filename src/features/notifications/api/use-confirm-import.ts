"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export function useConfirmImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notifications.imports[":id"].confirm.$post({ param: { id } })
      return parseRpcResponse<{ data: { created: number }; message?: string }>(res, "Failed to confirm import")
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notification-imports"] })
      queryClient.invalidateQueries({ queryKey: ["notification-import", variables.id] })
      queryClient.invalidateQueries({ queryKey: ["notification-subscribers"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to confirm import")
    },
  })
}
