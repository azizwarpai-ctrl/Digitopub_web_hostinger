"use client"

import { useCallback, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"
import type { EmailTemplateUpdate } from "@/src/features/email-templates/schemas/email-template-schema"
import type { EditorFieldName } from "./email-content-card"

type EditorElement = HTMLInputElement | HTMLTextAreaElement

interface LastFocus {
  name: EditorFieldName
  el: EditorElement
  start: number
  end: number
}

/**
 * Tracks the last focused editor field (subject, HTML, text) and its caret, so a
 * token can be inserted at the cursor even after focus moved to a palette button.
 */
export function useEditorInsertion(form: UseFormReturn<EmailTemplateUpdate>) {
  const last = useRef<LastFocus | null>(null)

  const record = useCallback((name: EditorFieldName, el: EditorElement) => {
    last.current = {
      name,
      el,
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    }
  }, [])

  const insert = useCallback(
    (token: string, options?: { htmlOnly?: boolean }) => {
      const target = last.current
      const useTarget = target !== null && !(options?.htmlOnly && target.name !== "html_content")
      const name: EditorFieldName = useTarget && target ? target.name : "html_content"
      const current = form.getValues(name) ?? ""
      const start = useTarget && target ? Math.min(target.start, current.length) : current.length
      const end = useTarget && target ? Math.min(target.end, current.length) : current.length
      const next = current.slice(0, start) + token + current.slice(end)
      const caret = start + token.length

      form.setValue(name, next, { shouldDirty: true, shouldValidate: true })

      if (useTarget && target) {
        last.current = { ...target, start: caret, end: caret }
        const el = target.el
        if (el.isConnected) {
          requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(caret, caret)
          })
        }
      }
    },
    [form]
  )

  return { onFieldFocus: record, onFieldBlur: record, insert }
}
