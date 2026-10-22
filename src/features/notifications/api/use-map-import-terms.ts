"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { SubscriberImport } from "./use-get-imports"

export function useMapImportTerms() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, mappings }: { id: string; mappings: { term: string; discipline_id: string }[] }) => {
      const res = await client.notifications.imports[":id"].mapping.$patch({ param: { id }, json: { mappings } })
      const body = await parseRpcResponse<{ data: SubscriberImport }>(res, "Failed to save mappings")
      return body.data
    },
    onSuccess: (_data, variables) => {
      toast.success("Mappings saved")
      queryClient.invalidateQueries({ queryKey: ["notification-import", variables.id] })
      queryClient.invalidateQueries({ queryKey: ["notification-import-rows", variables.id] })
      queryClient.invalidateQueries({ queryKey: ["notification-imports"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save mappings")
    },
  })
}
