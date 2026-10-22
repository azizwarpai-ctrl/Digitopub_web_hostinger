"use client"

import { useMutation } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"
import { toast } from "sonner"
import type { EmailTemplatePreviewResult } from "../types/email-template-type"

export function usePreviewEmailTemplate() {
  return useMutation({
    mutationFn: async ({ id, variables }: { id: string; variables: Record<string, string> }) => {
      const res = await client["email-templates"][":id"].preview.$post({
        param: { id },
        json: { variables },
      })
      const body = await parseRpcResponse<{ success: boolean; data: EmailTemplatePreviewResult }>(
        res,
        "Failed to preview template"
      )
      return body.data
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to preview template")
    },
  })
}
