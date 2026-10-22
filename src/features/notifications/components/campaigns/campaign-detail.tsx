"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Pause, Play, Send, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  useApproveCampaign,
  useCampaign,
  useCampaignPreview,
  useCampaignProgress,
  useCancelCampaign,
  usePauseCampaign,
  useResumeCampaign,
  useSendCampaignTest,
  useUpdateCampaign,
  type CampaignDetail,
  type CampaignStatus,
  type CountItem,
} from "../../api/use-campaigns"
import { CampaignStatusBadge, campaignTypeLabel } from "./campaign-status"

const PROGRESS_STATUSES: CampaignStatus[] = ["scheduled", "queued", "sending", "paused", "sent"]
/** Only campaigns that can still change on their own are polled. */
const LIVE_STATUSES: CampaignStatus[] = ["scheduled", "queued", "sending"]

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "-"
}

/** Value for a datetime-local input's min attribute (local time, minute precision). */
function localInputNow(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

function PreviewCard({ id, status }: { id: string; status: CampaignStatus }) {
  const { data, isLoading, isError, error } = useCampaignPreview(id)
  // Refetch is driven by invalidation after saves; status is part of the key only for clarity.
  void status

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          {data ? `Subject: ${data.subject}` : "How the email will look to recipients."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : isError || !data ? (
          <p className="text-sm text-destructive">{error?.message || "Failed to load the preview"}</p>
        ) : (
          <Tabs defaultValue="email">
            <TabsList>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="text">Plain text</TabsTrigger>
            </TabsList>
            <TabsContent value="email">
              <iframe
                sandbox=""
                srcDoc={data.html}
                title="Email preview"
                className="h-[720px] w-full rounded-md border bg-white"
              />
            </TabsContent>
            <TabsContent value="text">
              <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-4 text-sm">
                {data.text}
              </pre>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

function CountList({ title, items }: { title: string; items: CountItem[] }) {
  const top = [...items].sort((a, b) => b.count - a.count).slice(0, 8)
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {top.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="truncate">{i.name}</span>
              <span className="tabular-nums text-muted-foreground">{i.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DraftEditor({ detail }: { detail: CampaignDetail }) {
  const { campaign, events, recipients } = detail
  const update = useUpdateCampaign()
  const [fromName, setFromName] = useState(campaign.from_name ?? "")
  const [subject, setSubject] = useState(campaign.subject_override ?? "")
  const [note, setNote] = useState(campaign.editor_note ?? "")
  const [excluded, setExcluded] = useState<string[]>(events.filter((e) => e.excluded).map((e) => e.id))

  const toggle = (id: string, include: boolean) =>
    setExcluded((cur) => (include ? cur.filter((x) => x !== id) : cur.includes(id) ? cur : [...cur, id]))

  const save = () =>
    update.mutate({
      id: campaign.id,
      json: {
        from_name: fromName.trim() || null,
        subject_override: subject.trim() || null,
        editor_note: note.trim() || null,
        excluded_event_ids: excluded,
      },
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit draft</CardTitle>
        <CardDescription>
          Changes apply to this campaign only. {recipients.total.toLocaleString()} recipients would receive it now.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="from-name">Sender name</Label>
          <Input
            id="from-name"
            value={fromName}
            maxLength={100}
            placeholder={campaign.automatic_from_name}
            onChange={(e) => setFromName(e.target.value)}
            aria-describedby="from-name-help"
          />
          <p id="from-name-help" className="text-xs text-muted-foreground">
            The name shown in the inbox. Leave empty to use &ldquo;{campaign.automatic_from_name}&rdquo;. The sending
            address does not change.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subject-override">Subject override</Label>
          <Input
            id="subject-override"
            value={subject}
            placeholder={campaign.template?.subject ?? "Template subject"}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-note">Editor note</Label>
          <Textarea
            id="editor-note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby="editor-note-help"
          />
          <p id="editor-note-help" className="text-xs text-muted-foreground">
            Shown in issue emails. Leave empty to omit it.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Events</legend>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">This campaign has no publication events.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    id={`event-${ev.id}`}
                    checked={!excluded.includes(ev.id)}
                    onCheckedChange={(c) => toggle(ev.id, c === true)}
                    className="mt-1"
                  />
                  <Label htmlFor={`event-${ev.id}`} className="flex-1 flex-col items-start gap-0.5 font-normal">
                    <span className="font-medium">
                      Include: {ev.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ev.kind === "issue" ? "Issue" : "Article"}
                      {ev.journal_title ? ` - ${ev.journal_title}` : ""}
                      {ev.published_at ? ` - ${new Date(ev.published_at).toLocaleDateString()}` : ""}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <CountList title="Recipients by journal" items={recipients.by_journal} />
          <CountList title="Recipients by discipline" items={recipients.by_discipline} />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ProgressPanel({ id, status }: { id: string; status: CampaignStatus }) {
  const { data, isLoading } = useCampaignProgress(id, PROGRESS_STATUSES.includes(status), LIVE_STATUSES.includes(status))
  const queryClient = useQueryClient()
  // The send cron moves campaigns on by itself (queued → sending → sent): refresh the header and actions.
  useEffect(() => {
    if (data && data.status !== status) void queryClient.invalidateQueries({ queryKey: ["notification-campaign", id] })
  }, [data, status, id, queryClient])
  const total = data ? data.sent + data.failed + data.skipped + data.remaining : 0
  const done = data ? data.sent + data.failed + data.skipped : 0
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery progress</CardTitle>
        <CardDescription>Updates every 10 seconds while the campaign is active.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <Progress value={percent} aria-label="Delivery progress" />
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Sent", data.sent],
                ["Failed", data.failed],
                ["Skipped", data.skipped],
                ["Remaining", data.remaining],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{(value as number).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {data.remaining > 0 && data.eta_minutes != null && (
              <p className="text-sm text-muted-foreground">
                Estimated time remaining: about {Math.max(1, Math.round(data.eta_minutes))} minutes.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ActionsCard({ detail }: { detail: CampaignDetail }) {
  const { campaign, recipients } = detail
  const id = campaign.id
  const status = campaign.status

  const test = useSendCampaignTest()
  const approve = useApproveCampaign()
  const pause = usePauseCampaign()
  const resume = useResumeCampaign()
  const cancel = useCancelCampaign()

  const [testTo, setTestTo] = useState("")
  const [approveOpen, setApproveOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [when, setWhen] = useState("")
  const [whenError, setWhenError] = useState<string | null>(null)

  const busy =
    test.isPending || approve.isPending || pause.isPending || resume.isPending || cancel.isPending

  const canEdit = status === "draft"
  const canPause = status === "scheduled" || status === "queued" || status === "sending"
  const canResume = status === "paused"
  const canCancel = canEdit || canPause || canResume

  if (!canEdit && !canPause && !canResume) return null

  const submitSchedule = () => {
    const date = new Date(when)
    if (!when || Number.isNaN(date.getTime())) {
      setWhenError("Enter a valid date and time.")
      return
    }
    if (date.getTime() <= Date.now()) {
      setWhenError("The scheduled time must be in the future.")
      return
    }
    setWhenError(null)
    approve.mutate(
      { id, scheduled_at: date.toISOString() },
      {
        onSuccess: () => {
          setScheduleOpen(false)
          setWhen("")
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>
          {canEdit
            ? "Send yourself a test before approving. Sending is throttled to protect the mail server."
            : "Control delivery of this campaign."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canEdit && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="test-to">Test recipient (optional)</Label>
              <Input
                id="test-to"
                type="email"
                placeholder="Defaults to your own address"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => test.mutate({ id, to: testTo.trim() || undefined })}
            >
              {test.isPending ? "Sending..." : "Send test to me"}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Button disabled={busy} onClick={() => setApproveOpen(true)}>
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                Approve and send now
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setScheduleOpen(true)}>
                <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                Schedule
              </Button>
            </>
          )}
          {canPause && (
            <Button variant="outline" disabled={busy} onClick={() => pause.mutate({ id })}>
              <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
              Pause
            </Button>
          )}
          {canResume && (
            <Button disabled={busy} onClick={() => resume.mutate({ id })}>
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              Resume
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" disabled={busy} onClick={() => setCancelOpen(true)}>
              <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Cancel campaign
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve and send now?</DialogTitle>
            <DialogDescription>
              This campaign will be sent to {recipients.total.toLocaleString()} recipients. Sending is throttled, so
              delivery may take some time to complete. You can pause or cancel while it runs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Go back
            </Button>
            <Button
              disabled={approve.isPending}
              onClick={() => approve.mutate({ id }, { onSuccess: () => setApproveOpen(false) })}
            >
              {approve.isPending ? "Approving..." : "Approve and send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule campaign</DialogTitle>
            <DialogDescription>
              Choose a future date and time in your local time zone. The campaign will be sent to{" "}
              {recipients.total.toLocaleString()} recipients, with throttled delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-at">Send at</Label>
            <Input
              id="schedule-at"
              type="datetime-local"
              min={localInputNow()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-invalid={whenError ? true : undefined}
              aria-describedby={whenError ? "schedule-at-error" : undefined}
            />
            {whenError && (
              <p id="schedule-at-error" role="alert" className="text-sm text-destructive">
                {whenError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Go back
            </Button>
            <Button disabled={approve.isPending || !when} onClick={submitSchedule}>
              {approve.isPending ? "Scheduling..." : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this campaign?</DialogTitle>
            <DialogDescription>
              Emails that have not yet been sent will not be delivered. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep campaign
            </Button>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id }, { onSuccess: () => setCancelOpen(false) })}
            >
              {cancel.isPending ? "Cancelling..." : "Cancel campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export function CampaignDetailView({ id }: { id: string }) {
  const { data: detail, isLoading, isError, error } = useCampaign(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (isError || !detail) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/notifications/campaigns">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to campaigns
          </Link>
        </Button>
        <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
          {error?.message || "Failed to load the campaign"}
        </div>
      </div>
    )
  }

  const { campaign } = detail
  const approverName = campaign.approver?.full_name || campaign.approver?.email

  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" asChild>
        <Link href="/admin/notifications/campaigns">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to campaigns
        </Link>
      </Button>

      <PageHeader
        title={campaign.subject}
        subtitle={`${campaignTypeLabel(campaign.type)} - created ${formatDateTime(campaign.created_at)}`}
      >
        <CampaignStatusBadge status={campaign.status} />
      </PageHeader>

      <p className="text-sm text-muted-foreground">
        {campaign.approved_at
          ? `Approved ${formatDateTime(campaign.approved_at)}${approverName ? ` by ${approverName}` : ""}. `
          : ""}
        {campaign.scheduled_at ? `Scheduled for ${formatDateTime(campaign.scheduled_at)}. ` : ""}
        {campaign.window
          ? `Covers ${new Date(campaign.window.from).toLocaleDateString()} to ${new Date(campaign.window.to).toLocaleDateString()}. `
          : ""}
        {campaign.template ? `Template: ${campaign.template.name}.` : ""}
      </p>

      <ActionsCard key={campaign.status} detail={detail} />

      {PROGRESS_STATUSES.includes(campaign.status) && <ProgressPanel id={campaign.id} status={campaign.status} />}

      <div className="grid gap-6 xl:grid-cols-2">
        {campaign.status === "draft" && (
          <DraftEditor key={`${campaign.id}-${campaign.updated_at}`} detail={detail} />
        )}
        <div className={campaign.status === "draft" ? "" : "xl:col-span-2"}>
          <PreviewCard id={campaign.id} status={campaign.status} />
        </div>
      </div>
    </div>
  )
}
