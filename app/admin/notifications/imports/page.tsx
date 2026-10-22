"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGetJournals } from "@/src/features/journals/api/use-get-journals"
import { useCreateOjsAuthorImport } from "@/src/features/notifications/api/use-create-ojs-author-import"
import { useGetImports } from "@/src/features/notifications/api/use-get-imports"

const STATUS_STYLES: Record<string, string> = {
  parsed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
}

const STATUS_LABELS: Record<string, string> = {
  parsed: "Awaiting confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  failed: "Failed",
}

/** Picks a journal and stages its OJS authors, then opens the review step of the import wizard. */
function OjsAuthorsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { data: journals } = useGetJournals()
  const linked = (journals ?? []).filter((j) => j.ojs_id && (j.status ?? "active") === "active")
  const [journalId, setJournalId] = useState("")
  const create = useCreateOjsAuthorImport()

  const start = () =>
    create.mutate(
      { journal_id: journalId },
      { onSuccess: (imp) => router.push(`/admin/notifications/imports/new?import=${imp.id}`) },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import authors from OJS</DialogTitle>
          <DialogDescription>
            Collects the authors of a journal&apos;s submissions on SubmitManager (read only). You review the list
            before anything happens. Confirmed people are invited in the journal&apos;s name and receive its alerts
            only if they accept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ojs-journal">Journal</Label>
          <Select value={journalId} onValueChange={setJournalId}>
            <SelectTrigger id="ojs-journal" className="w-full">
              <SelectValue placeholder="Choose a journal" />
            </SelectTrigger>
            <SelectContent>
              {linked.map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>
                  {j.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!journalId || create.isPending}>
            {create.isPending ? "Reading OJS..." : "Collect authors"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ImportsPage() {
  const limit = 20
  const [page, setPage] = useState(1)
  const [ojsOpen, setOjsOpen] = useState(false)
  const { data, isLoading, isError, error } = useGetImports(page, limit)
  const imports = data?.data ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      <PageHeader title="Imports" subtitle="Subscriber lists uploaded for invitation">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOjsOpen(true)}>
            <Users className="mr-2 h-4 w-4" aria-hidden="true" />
            Import authors from OJS
          </Button>
          <Button asChild>
            <Link href="/admin/notifications/imports/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New import
            </Link>
          </Button>
        </div>
      </PageHeader>
      <OjsAuthorsDialog open={ojsOpen} onOpenChange={setOjsOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Subscribers are created only when an import is confirmed.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading imports...</div>
          ) : isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
              {error?.message || "Failed to load imports"}
            </div>
          ) : imports.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No imports yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Uploaded by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valid</TableHead>
                  <TableHead className="text-right">Invalid</TableHead>
                  <TableHead className="text-right">Duplicate</TableHead>
                  <TableHead className="text-right">Existing</TableHead>
                  <TableHead className="text-right">Suppressed</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="max-w-[220px] truncate font-medium" title={imp.file_name}>
                      {imp.file_name}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={imp.journal?.title}>
                      {imp.journal?.title ?? (imp.status === "parsed" ? "Not yet assigned" : "General")}
                    </TableCell>
                    <TableCell>{imp.uploader?.full_name || imp.uploader?.email || "Unknown"}</TableCell>
                    <TableCell>{new Date(imp.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[imp.status] ?? ""}>
                        {STATUS_LABELS[imp.status] ?? imp.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{imp.totals?.valid ?? 0}</TableCell>
                    <TableCell className="text-right">{imp.totals?.invalid ?? 0}</TableCell>
                    <TableCell className="text-right">{imp.totals?.duplicate ?? 0}</TableCell>
                    <TableCell className="text-right">{imp.totals?.existing ?? 0}</TableCell>
                    <TableCell className="text-right">{imp.totals?.suppressed ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {imp.totals?.created ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
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
    </div>
  )
}
