"use client"

import { useMutation } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"
import { toast } from "sonner"

import { emailTemplateSendTestSchema } from "@/src/features/email-templates/schemas/email-template-schema"
import { z } from "zod"

type EmailTemplateSendTest = z.infer<typeof emailTemplateSendTestSchema>

export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({ param, json }: { param: { id: string }, json: EmailTemplateSendTest }) => {
      const res = await client["email-templates"][":id"]["send-test"].$post({ param, json })
      return parseRpcResponse<{ message?: string }>(res, "Failed to send test email")
    },
    onSuccess: (body) => {
      toast.success(body.message ?? "Test email sent")
    },
    onError: (error: Error) => {
      console.error("Error sending test email:", error)
      toast.error(error.message || "Failed to send test email")
    },
  })
}
