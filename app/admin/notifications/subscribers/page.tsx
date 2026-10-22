"use client"

import { useEffect, useState } from "react"
import { Download, MoreHorizontal, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/ui/page-header"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"

import { useGetDisciplines } from "@/src/features/notifications/api/use-get-disciplines"
import {
  buildSubscriberQuery,
  useGetSubscribers,
  type Subscriber,
  type SubscriberFilters,
} from "@/src/features/notifications/api/use-get-subscribers"
import { useGetSubscriber } from "@/src/features/notifications/api/use-get-subscriber"
import { useCreateSubscriber } from "@/src/features/notifications/api/use-create-subscriber"
import { useUpdateSubscriber } from "@/src/features/notifications/api/use-update-subscriber"
import { useDeleteSubscriber } from "@/src/features/notifications/api/use-delete-subscriber"
import { useGetJournals } from "@/src/features/journals/api/use-get-journals"

const ALL = "all"

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Complained" },
]

const SOURCE_OPTIONS = [
  { value: "import", label: "Import" },
  { value: "public_form", label: "Public form" },
  { value: "orcid_account", label: "ORCID account" },
  { value: "admin_manual", label: "Added by admin" },
]

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  unsubscribed: "bg-muted text-muted-foreground",
  bounced: "bg-destructive/10 text-destructive",
  complained: "bg-destructive/10 text-destructive",
}

const SUPPRESS_ACTIONS = [
  { value: "unsubscribed", label: "Mark unsubscribed" },
  { value: "bounced", label: "Mark bounced" },
  { value: "complained", label: "Mark complained" },
] as const

type SuppressStatus = (typeof SUPPRESS_ACTIONS)[number]["value"]

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
  return <Badge className={STATUS_STYLES[status] ?? ""}>{label}</Badge>
}

interface CheckListProps {
  legend: string
  idPrefix: string
  items: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  loading?: boolean
}

/** Scrollable checkbox group used for discipline and journal pickers. */
function CheckList({ legend, idPrefix, items, selected, onChange, loading }: CheckListProps) {
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((s) => s !== id))

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
        {loading ? (
          <Skeleton className="h-4 w-1/2" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to choose from.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <Checkbox
                id={`${idPrefix}-${item.id}`}
                checked={selected.includes(item.id)}
                onCheckedChange={(c) => toggle(item.id, c === true)}
              />
              <Label htmlFor={`${idPrefix}-${item.id}`} className="font-normal">
                {item.label}
              </Label>
            </div>
          ))
        )}
      </div>
    </fieldset>
  )
}

function usePickerItems() {
  const { data: disciplines, isLoading: disciplinesLoading } = useGetDisciplines()
  const { data: journals, isLoading: journalsLoading } = useGetJournals()
  return {
    disciplineItems: (disciplines ?? []).map((d) => ({ id: d.id, label: d.name })),
    journalItems: (journals ?? []).map((j) => ({ id: j.id, label: j.title })),
    disciplinesLoading,
    journalsLoading,
  }
}

function AddSubscriberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateSubscriber()
  const picker = usePickerItems()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [affiliation, setAffiliation] = useState("")
  const [disciplineIds, setDisciplineIds] = useState<string[]>([])
  const [journalIds, setJournalIds] = useState<string[]>([])

  const reset = () => {
    setEmail("")
    setName("")
    setAffiliation("")
    setDisciplineIds([])
    setJournalIds([])
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        email: email.trim(),
        name: name.trim() || undefined,
        affiliation: affiliation.trim() || undefined,
        discipline_ids: disciplineIds,
        journal_ids: journalIds,
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add subscriber</DialogTitle>
            <DialogDescription>
              The subscriber is saved as pending. They only start receiving updates after they confirm by email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email</Label>
            <Input
              id="add-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-name">Name</Label>
            <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-affiliation">Affiliation</Label>
            <Input id="add-affiliation" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
          </div>
          <CheckList
            legend="Disciplines"
            idPrefix="add-discipline"
            items={picker.disciplineItems}
            selected={disciplineIds}
            onChange={setDisciplineIds}
            loading={picker.disciplinesLoading}
          />
          <CheckList
            legend="Journals followed"
            idPrefix="add-journal"
            items={picker.journalItems}
            selected={journalIds}
            onChange={setJournalIds}
            loading={picker.journalsLoading}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !email.trim()}>
              {create.isPending ? "Adding..." : "Add subscriber"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SubscriberSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: subscriber } = useGetSubscriber(id)

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{subscriber?.email ?? "Subscriber"}</SheetTitle>
          <SheetDescription>Edit details, interests and follows.</SheetDescription>
        </SheetHeader>
        {subscriber && subscriber.id === id ? (
          <SubscriberEditor key={subscriber.id} subscriber={subscriber} onClose={onClose} />
        ) : (
          <div className="space-y-3 px-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SubscriberEditor({ subscriber, onClose }: { subscriber: Subscriber; onClose: () => void }) {
  const update = useUpdateSubscriber()
  const remove = useDeleteSubscriber()
  const picker = usePickerItems()
  const id = subscriber.id

  const [name, setName] = useState(subscriber.name ?? "")
  const [affiliation, setAffiliation] = useState(subscriber.affiliation ?? "")
  const [frequency, setFrequency] = useState<"weekly" | "daily" | "off">(
    (subscriber.article_frequency as "weekly" | "daily" | "off") ?? "weekly",
  )
  const [issueAlerts, setIssueAlerts] = useState(subscriber.issue_alerts)
  const [disciplineIds, setDisciplineIds] = useState<string[]>(subscriber.disciplines.map((d) => d.id))
  const [journalIds, setJournalIds] = useState<string[]>(subscriber.journals.map((j) => j.id))
  const [suppressTarget, setSuppressTarget] = useState<SuppressStatus | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = () => {
    update.mutate({
      id,
      json: {
        name: name.trim() || null,
        affiliation: affiliation.trim() || null,
        article_frequency: frequency,
        issue_alerts: issueAlerts,
        discipline_ids: disciplineIds,
        journal_ids: journalIds,
      },
    })
  }

  const suppressedAlready = ["unsubscribed", "bounced", "complained"].includes(subscriber.status)

  return (
    <>
      <div className="space-y-4 px-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={subscriber.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={suppressedAlready}>
                <MoreHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
                Change status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SUPPRESS_ACTIONS.map((a) => (
                <DropdownMenuItem key={a.value} onSelect={() => setSuppressTarget(a.value)}>
                  {a.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-affiliation">Affiliation</Label>
          <Input id="edit-affiliation" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-frequency">Article frequency</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "daily" | "off")}>
            <SelectTrigger id="edit-frequency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="edit-issue-alerts">Issue alerts</Label>
          <Switch id="edit-issue-alerts" checked={issueAlerts} onCheckedChange={setIssueAlerts} />
        </div>
        <CheckList
          legend="Disciplines"
          idPrefix="edit-discipline"
          items={picker.disciplineItems}
          selected={disciplineIds}
          onChange={setDisciplineIds}
          loading={picker.disciplinesLoading}
        />
        <CheckList
          legend="Journals followed"
          idPrefix="edit-journal"
          items={picker.journalItems}
          selected={journalIds}
          onChange={setJournalIds}
          loading={picker.journalsLoading}
        />
        <p className="text-xs text-muted-foreground">
          Source: {SOURCE_OPTIONS.find((s) => s.value === subscriber.source)?.label ?? subscriber.source}. Added{" "}
          {new Date(subscriber.created_at).toLocaleDateString()}.
          {subscriber.confirmed_at && ` Confirmed ${new Date(subscriber.confirmed_at).toLocaleDateString()}.`}
        </p>
      </div>

      <SheetFooter className="flex-row justify-between">
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving..." : "Save changes"}
        </Button>
      </SheetFooter>

      <AlertDialog open={!!suppressTarget} onOpenChange={(o) => !o && setSuppressTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {SUPPRESS_ACTIONS.find((a) => a.value === suppressTarget)?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This suppresses {subscriber.email}. Suppression is permanent: they will never receive notifications or
              invitations again, and an import cannot bring them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (suppressTarget) update.mutate({ id, json: { status: suppressTarget } })
                setSuppressTarget(null)
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this subscriber?</AlertDialogTitle>
            <AlertDialogDescription>
              {subscriber.email} and their follows will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                remove.mutate({ id }, { onSuccess: onClose })
                setConfirmDelete(false)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function SubscribersPage() {
  const limit = 20
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<SubscriberFilters>({})
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: disciplines } = useGetDisciplines()
  const { data: journals } = useGetJournals()
  const { data, isLoading, isError, error } = useGetSubscribers(filters, page, limit)
  const subscribers = data?.data ?? []
  const pagination = data?.pagination

  // Debounce the search box so each keystroke does not trigger a request.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === (search || undefined) ? f : { ...f, q: search || undefined }))
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const setFilter = (key: keyof SubscriberFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value === ALL ? undefined : value }))
    setPage(1)
  }

  const exportHref = `/api/notifications/subscribers/export?${buildSubscriberQuery(filters)}`

  const filterSelect = (
    key: keyof SubscriberFilters,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`filter-${key}`}>{label}</Label>
      <Select value={filters[key] ?? ALL} onValueChange={(v) => setFilter(key, v)}>
        <SelectTrigger id={`filter-${key}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Subscribers" subtitle="People who receive journal notifications">
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={exportHref} download>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add subscriber
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>All subscribers</CardTitle>
          <CardDescription>Select a row to edit a subscriber. The CSV export honors the filters below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="filter-q">Search</Label>
              <Input
                id="filter-q"
                placeholder="Email or name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {filterSelect("status", "Status", STATUS_OPTIONS)}
            {filterSelect("source", "Source", SOURCE_OPTIONS)}
            {filterSelect(
              "discipline_id",
              "Discipline",
              (disciplines ?? []).map((d) => ({ value: d.id, label: d.name })),
            )}
            {filterSelect(
              "journal_id",
              "Journal",
              (journals ?? []).map((j) => ({ value: j.id, label: j.title })),
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading subscribers...</div>
          ) : isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
              {error?.message || "Failed to load subscribers"}
            </div>
          ) : subscribers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No subscribers match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Disciplines</TableHead>
                  <TableHead>Journals</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((s: Subscriber) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setSelectedId(s.id)
                      }
                    }}
                  >
                    <TableCell className="font-medium">{s.email}</TableCell>
                    <TableCell>{s.name || "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>{SOURCE_OPTIONS.find((o) => o.value === s.source)?.label ?? s.source}</TableCell>
                    <TableCell>{s.disciplines.length}</TableCell>
                    <TableCell>{s.journals.length}</TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} subscribers)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!pagination.hasPrev} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={!pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AddSubscriberDialog open={addOpen} onOpenChange={setAddOpen} />
      <SubscriberSheet id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
