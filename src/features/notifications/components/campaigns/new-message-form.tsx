"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { useGetEmailTemplates } from "@/src/features/email-templates/api/use-get-email-templates"
import { useGetJournals } from "@/src/features/journals/api/use-get-journals"
import { useCreateCampaign, type CustomAudience } from "@/src/features/notifications/api/use-campaigns"
import { useGetImports } from "@/src/features/notifications/api/use-get-imports"
import { useGetSubscribers } from "@/src/features/notifications/api/use-get-subscribers"

type AudienceKind = CustomAudience["kind"]
const LETTER = "letter"
const ALL_JOURNALS = "all"

const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  all: "Everyone (all confirmed subscribers)",
  journal: "Members of one journal",
  import: "One uploaded list",
  people: "Specific people",
}

interface Picked {
  id: string
  label: string
}

/** Searches confirmed subscribers (optionally within one journal) and collects the people the message goes to. */
function PeoplePicker({ picked, onChange }: { picked: Picked[]; onChange: (next: Picked[]) => void }) {
  const [q, setQ] = useState("")
  const [journalId, setJournalId] = useState(ALL_JOURNALS)
  const { data: journals } = useGetJournals()
  const { data, isFetching } = useGetSubscribers(
    { status: "active", q: q.trim() || undefined, journal_id: journalId === ALL_JOURNALS ? undefined : journalId },
    1,
    10,
  )
  const chosen = new Set(picked.map((p) => p.id))

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="people-q">Search name or email</Label>
          <Input id="people-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Haddad" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="people-journal">Journal</Label>
          <Select value={journalId} onValueChange={setJournalId}>
            <SelectTrigger id="people-journal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_JOURNALS}>All journals</SelectItem>
              {(journals ?? []).map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>
                  {j.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ul className="divide-y rounded-md border" aria-busy={isFetching}>
        {(data?.data ?? []).length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">No confirmed subscribers match.</li>
        ) : (
          data!.data.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <span className="truncate">
                {s.name ? `${s.name} · ` : ""}
                <span className="text-muted-foreground">{s.email}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={chosen.has(s.id) || picked.length >= 500}
                onClick={() => onChange([...picked, { id: s.id, label: s.name || s.email }])}
              >
                {chosen.has(s.id) ? "Added" : "Add"}
              </Button>
            </li>
          ))
        )}
      </ul>
      <div className="flex flex-wrap gap-2" aria-label="Selected people">
        {picked.map((p) => (
          <Badge key={p.id} variant="secondary" className="gap-1">
            {p.label}
            <button
              type="button"
              aria-label={`Remove ${p.label}`}
              onClick={() => onChange(picked.filter((x) => x.id !== p.id))}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        {picked.length === 0 && <p className="text-sm text-muted-foreground">Nobody selected yet.</p>}
      </div>
    </div>
  )
}

/** "New message": audience, sender, subject and text. Creates a draft; nothing is sent until it is approved. */
export function NewMessageForm() {
  const router = useRouter()
  const create = useCreateCampaign()
  const { data: journals } = useGetJournals()
  const { data: importPage } = useGetImports(1, 100)
  const { data: templatePage } = useGetEmailTemplates(1, 100, true, "notification")

  const [kind, setKind] = useState<AudienceKind>("journal")
  const [journalId, setJournalId] = useState("")
  const [importId, setImportId] = useState("")
  const [people, setPeople] = useState<Picked[]>([])
  const [templateId, setTemplateId] = useState(LETTER)
  const [fromName, setFromName] = useState("")
  const [subject, setSubject] = useState("")
  const [heading, setHeading] = useState("")
  const [message, setMessage] = useState("")

  const activeJournals = (journals ?? []).filter((j) => (j.status ?? "active") === "active")
  const lists = (importPage?.data ?? []).filter((i) => i.status === "confirmed")
  const templates = ((templatePage as { data?: Array<{ id: string; name: string }> } | undefined)?.data ?? [])
    .filter((t) => t.name !== "notify_custom_message")
  const journal = activeJournals.find((j) => String(j.id) === journalId)
  const list = lists.find((i) => i.id === importId)
  const automaticSender = (kind === "journal" && journal?.title) || (kind === "import" && list?.journal?.title) || "DigitoPub"

  const audience: CustomAudience | null =
    kind === "all" ? { kind: "all" }
    : kind === "journal" ? (journalId ? { kind: "journal", journal_id: journalId } : null)
    : kind === "import" ? (importId ? { kind: "import", import_id: importId } : null)
    : people.length ? { kind: "people", subscriber_ids: people.map((p) => p.id) } : null

  const usesLetter = templateId === LETTER
  const ready = !!audience && subject.trim().length > 0 && (!usesLetter || message.trim().length > 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!audience || !ready) return
    create.mutate(
      {
        audience,
        subject: subject.trim(),
        message_heading: heading.trim() || null,
        message: message.trim() || null,
        from_name: fromName.trim() || null,
        template_id: usesLetter ? null : templateId,
      },
      { onSuccess: (body) => router.push(`/admin/notifications/campaigns/${body.data.id}`) },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Only people who confirmed their subscription receive messages. People still waiting to accept an invitation
            are never included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="audience-kind">Send to</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AudienceKind)}>
              <SelectTrigger id="audience-kind" className="w-full sm:w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABELS) as AudienceKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {AUDIENCE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === "journal" && (
            <div className="space-y-1.5">
              <Label htmlFor="audience-journal">Journal</Label>
              <Select value={journalId} onValueChange={setJournalId}>
                <SelectTrigger id="audience-journal" className="w-full sm:w-96">
                  <SelectValue placeholder="Choose a journal" />
                </SelectTrigger>
                <SelectContent>
                  {activeJournals.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>
                      {j.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Everyone who follows the journal, including confirmed people from lists assigned to it and its OJS
                authors who accepted the invitation.
              </p>
            </div>
          )}

          {kind === "import" && (
            <div className="space-y-1.5">
              <Label htmlFor="audience-import">Uploaded list</Label>
              <Select value={importId} onValueChange={setImportId}>
                <SelectTrigger id="audience-import" className="w-full sm:w-96">
                  <SelectValue placeholder="Choose a list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.file_name} ({i.journal?.title ?? "General"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "people" && <PeoplePicker picked={people} onChange={setPeople} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>
            Write in plain text; links starting with https:// become clickable. The footer with the unsubscribe link and
            postal address is added automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="msg-from">Sender name</Label>
              <Input id="msg-from" value={fromName} maxLength={100} placeholder={automaticSender} onChange={(e) => setFromName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msg-template">Design</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="msg-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LETTER}>Letter (your text below)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      Template: {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg-subject">
              Subject <span className="text-destructive">(required)</span>
            </Label>
            <Input id="msg-subject" value={subject} maxLength={500} onChange={(e) => setSubject(e.target.value)} />
          </div>
          {usesLetter && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="msg-heading">Heading</Label>
                <Input id="msg-heading" value={heading} maxLength={200} onChange={(e) => setHeading(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msg-body">
                  Message <span className="text-destructive">(required)</span>
                </Label>
                <Textarea id="msg-body" rows={10} value={message} maxLength={20000} onChange={(e) => setMessage(e.target.value)} />
                <p className="text-xs text-muted-foreground">Leave an empty line between paragraphs.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/notifications/campaigns")}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || create.isPending}>
          {create.isPending ? "Creating..." : "Create draft"}
        </Button>
      </div>
    </form>
  )
}
