"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { SubscriberImport } from "./use-get-imports"

/** Stages one journal's OJS authors as an import assigned to that journal. Nothing is sent. */
export function useCreateOjsAuthorImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ journal_id }: { journal_id: string }) => {
      const res = await client.notifications.imports["from-ojs"].$post({ json: { journal_id } })
      const body = await parseRpcResponse<{ data: SubscriberImport }>(res, "Failed to read authors from OJS")
      return body.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-imports"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to read authors from OJS")
    },
  })
}
