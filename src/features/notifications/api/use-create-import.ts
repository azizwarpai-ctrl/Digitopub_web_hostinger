"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

import type { ColumnMap } from "./use-inspect-import"
import type { SubscriberImport } from "./use-get-imports"

export function useCreateImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, columnMap }: { file: File; columnMap: ColumnMap }) => {
      const form = new FormData()
      form.append("file", file)
      form.append("column_map", JSON.stringify(columnMap))
      const res = await fetch("/api/notifications/imports", { method: "POST", body: form })
      const body = await parseRpcResponse<{ data: SubscriberImport }>(res, "Failed to stage the import")
      return body.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-imports"] })
    },
  })
}
