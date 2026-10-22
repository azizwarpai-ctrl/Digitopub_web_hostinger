"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"
import { toast } from "sonner"
import type { EmailTemplate } from "../types/email-template-type"

export function useResetEmailTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client["email-templates"][":id"].reset.$post({ param: { id } })
      return parseRpcResponse<{ success: boolean; data: EmailTemplate; message?: string }>(
        res,
        "Failed to reset template"
      )
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["email-template", variables.id] }),
        queryClient.invalidateQueries({ queryKey: ["email-template-sample-variables", variables.id] }),
        queryClient.invalidateQueries({ queryKey: ["email-templates"] }),
      ])
      toast.success("Template restored to its default")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reset template")
    },
  })
}
