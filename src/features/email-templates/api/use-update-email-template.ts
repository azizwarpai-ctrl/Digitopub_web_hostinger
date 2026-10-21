"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { toast } from "sonner"

import { type EmailTemplateUpdate } from "@/src/features/email-templates/schemas/email-template-schema"

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ param, json }: { param: { id: string }, json: EmailTemplateUpdate }) => {
      const res: Response = await client["email-templates"][":id"].$patch({ param, json })
      if (!res.ok) {
        // Surface 400 validation messages (e.g. the triple-brace rule). The error may be a
        // string or a Zod-style object with issues.
        const body = (await res.json().catch(() => null)) as {
          error?: string | { message?: string; issues?: Array<{ message?: string }> }
        } | null
        const err = body?.error
        const message =
          typeof err === "string"
            ? err
            : err?.issues?.[0]?.message || err?.message || "Failed to update template"
        throw new Error(message)
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      toast.success("Template updated successfully")
      queryClient.invalidateQueries({ queryKey: ["email-template", variables.param.id] })
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
    },
    onError: (error: Error) => {
      console.error("Error updating template:", error)
      toast.error(error.message || "Failed to update template")
    },
  })
}
