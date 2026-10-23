"use client"

import { useState } from "react"
import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MAX_TEST_RECIPIENTS, parseEmailList } from "@/src/lib/email/email-list"

import { useNotificationSettings, useSaveNotificationSettings } from "../api/use-notification-config"

/**
 * Test recipients for a "Send test" box. Starts from the saved test list in
 * the notification settings until the admin changes it.
 */
export function useTestRecipients() {
  const { data } = useNotificationSettings()
  const saved = data?.settings.test_recipients ?? []
  const [chosen, setChosen] = useState<string[] | null>(null)
  return { recipients: chosen ?? saved, setRecipients: setChosen, saved }
}

interface Props {
  id: string
  label?: string
  recipients: string[]
  onChange: (next: string[]) => void
  saved: string[]
  /** Shown under the field, e.g. what happens when it is left empty. */
  hint?: string
}

/** Paste or type one or several addresses (commas, spaces or new lines); they become removable chips. */
export function TestRecipientsField({ id, label = "Test recipients", recipients, onChange, saved, hint }: Props) {
  const [draft, setDraft] = useState("")
  const [invalid, setInvalid] = useState<string[]>([])
  const saveSettings = useSaveNotificationSettings()

  const add = (text: string) => {
    const { valid, invalid: bad } = parseEmailList(text)
    const next = [...recipients]
    for (const v of valid) if (!next.includes(v) && next.length < MAX_TEST_RECIPIENTS) next.push(v)
    const dropped = valid.filter((v) => !next.includes(v))
    setInvalid([...bad, ...dropped.map((d) => `${d} (over ${MAX_TEST_RECIPIENTS})`)])
    onChange(next)
    setDraft("")
  }

  const sameAsSaved = saved.length === recipients.length && saved.every((s) => recipients.includes(s))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {recipients.length} of {MAX_TEST_RECIPIENTS}
        </span>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Selected test recipients">
        {recipients.map((r) => (
          <Badge key={r} variant="secondary" className="gap-1">
            {r}
            <button type="button" aria-label={`Remove ${r}`} onClick={() => onChange(recipients.filter((x) => x !== r))}>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
      </div>
      <Textarea
        id={id}
        rows={2}
        value={draft}
        placeholder="name@example.org, editor@example.org"
        disabled={recipients.length >= MAX_TEST_RECIPIENTS}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && add(draft)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
            e.preventDefault()
            add(draft)
          }
        }}
        onPaste={(e) => {
          e.preventDefault()
          add(draft + " " + e.clipboardData.getData("text"))
        }}
        aria-describedby={`${id}-help`}
      />
      {invalid.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          Not added: {invalid.join(", ")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p id={`${id}-help`} className="mr-auto text-xs text-muted-foreground">
          Separate addresses with commas or new lines.{hint ? ` ${hint}` : ""}
        </p>
        {saved.length > 0 && !sameAsSaved && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(saved)}>
            Use saved list
          </Button>
        )}
        {recipients.length > 0 && !sameAsSaved && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saveSettings.isPending}
            onClick={() => saveSettings.mutate({ test_recipients: recipients })}
          >
            Save as my test list
          </Button>
        )}
      </div>
    </div>
  )
}
