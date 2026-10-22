"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Check, CheckCircle2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatCard } from "@/components/ui/stat-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useGetDisciplines } from "@/src/features/notifications/api/use-get-disciplines"
import { useInspectImport, type ColumnMap, type InspectResult } from "@/src/features/notifications/api/use-inspect-import"
import { useCreateImport } from "@/src/features/notifications/api/use-create-import"
import { useGetImport } from "@/src/features/notifications/api/use-get-import"
import { useGetImportRows, type ImportRowFilter } from "@/src/features/notifications/api/use-get-import-rows"
import { useMapImportTerms } from "@/src/features/notifications/api/use-map-import-terms"
import { useConfirmImport } from "@/src/features/notifications/api/use-confirm-import"
import { useCancelImport } from "@/src/features/notifications/api/use-cancel-import"

const MAX_ROWS = 10000
const ACCEPT = ".xlsx,.xls,.csv,.txt"
const NONE = "none"

const STEPS = ["Upload", "Map columns", "Review", "Confirm"]

const FIELDS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: "email", label: "Email", required: true },
  { key: "name", label: "Name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "interests", label: "Interests" },
]

const ROW_FILTERS: { value: ImportRowFilter | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "unmapped", label: "Unmapped interests" },
  { value: "invalid_email", label: "Invalid email" },
  { value: "duplicate_in_file", label: "Duplicate" },
  { value: "exists", label: "Already subscribed" },
  { value: "suppressed", label: "Suppressed" },
]

const ISSUE_LABELS: Record<string, string> = {
  invalid_email: "Invalid email",
  duplicate_in_file: "Duplicate in file",
  exists: "Already subscribed",
  suppressed: "Suppressed",
}

function formatBytes(n: number) {
  return n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Import steps">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>
              {label}
              {done && <span className="sr-only"> (completed)</span>}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

export default function NewImportPage() {
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [inspect, setInspect] = useState<InspectResult | null>(null)
  const [map, setMap] = useState<Record<string, string>>({})
  const [importId, setImportId] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [rowFilter, setRowFilter] = useState<ImportRowFilter | "all">("all")
  const [rowPage, setRowPage] = useState(1)
  const [termChoices, setTermChoices] = useState<Record<string, string>>({})
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const inspectMutation = useInspectImport()
  const createMutation = useCreateImport()
  const mapMutation = useMapImportTerms()
  const confirmMutation = useConfirmImport()
  const cancelMutation = useCancelImport()

  const { data: disciplines } = useGetDisciplines()
  const { data: imp } = useGetImport(importId)
  const { data: rows, isLoading: rowsLoading } = useGetImportRows(
    importId,
    rowFilter === "all" ? undefined : rowFilter,
    rowPage,
    10,
  )

  const totals = imp?.totals
  const unmapped = imp?.unmapped_terms ?? []

  const chooseFile = (f: File | null) => {
    if (!f) return
    setFile(f)
    setMapError(null)
    inspectMutation.mutate(f, {
      onSuccess: (result) => {
        setInspect(result)
        const detected = result.detected_column_map
        const next: Record<string, string> = {}
        for (const field of FIELDS) {
          const idx = detected?.[field.key]
          next[field.key] = idx === undefined ? NONE : String(idx)
        }
        setMap(next)
        setStep(1)
      },
      onError: (e) => {
        setFile(null)
        toast.error(e.message)
      },
    })
  }

  const stage = () => {
    if (!file) return
    if (map.email === undefined || map.email === NONE) {
      setMapError("Choose the column that holds email addresses.")
      return
    }
    setMapError(null)
    const columnMap: ColumnMap = { email: Number(map.email) }
    for (const field of FIELDS) {
      if (field.key !== "email" && map[field.key] && map[field.key] !== NONE) {
        columnMap[field.key] = Number(map[field.key])
      }
    }
    createMutation.mutate(
      { file, columnMap },
      {
        onSuccess: (created) => {
          setImportId(created.id)
          setRowFilter("all")
          setRowPage(1)
          setStep(2)
        },
        onError: (e) => setMapError(e.message),
      },
    )
  }

  const saveMappings = () => {
    if (!importId) return
    const mappings = Object.entries(termChoices)
      .filter(([, disciplineId]) => disciplineId)
      .map(([term, discipline_id]) => ({ term, discipline_id }))
    if (mappings.length === 0) return
    mapMutation.mutate(
      { id: importId, mappings },
      { onSuccess: () => setTermChoices({}) },
    )
  }

  const confirm = () => {
    if (!importId) return
    confirmMutation.mutate(
      { id: importId },
      { onSuccess: (res) => setConfirmedCount(res.data.created) },
    )
  }

  const cancel = () => {
    if (!importId) return
    cancelMutation.mutate(
      { id: importId },
      {
        onSuccess: () => setCancelled(true),
        onSettled: () => setCancelOpen(false),
      },
    )
  }

  const finished = confirmedCount !== null || cancelled
  const validCount = totals?.valid ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title="New import" subtitle="Upload a list of researchers to invite" />
      <Stepper current={finished ? STEPS.length : step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a file</CardTitle>
            <CardDescription>
              Accepted formats: .xlsx, .xls, .csv, .txt. Up to {MAX_ROWS.toLocaleString()} rows. The server rejects files
              over its size limit (50 MB by default). The file is read in your next step and is never stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a file to upload"
              className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                chooseFile(e.dataTransfer.files?.[0] ?? null)
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
            >
              <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
              {inspectMutation.isPending && file ? (
                <p className="text-sm font-medium">Reading {file.name}...</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Drag and drop a file here</p>
                  <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                aria-label="Subscriber file"
                onChange={(e) => {
                  chooseFile(e.target.files?.[0] ?? null)
                  e.target.value = ""
                }}
              />
            </div>
            {inspectMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {inspectMutation.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && inspect && file && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <CardDescription>
              {file.name} ({formatBytes(file.size)}), {inspect.row_count.toLocaleString()} rows.{" "}
              {inspect.detected_column_map
                ? "We matched columns from the headers. Check them before continuing."
                : "We could not detect the columns. Choose them below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {inspect.row_count > MAX_ROWS && (
              <Alert variant="destructive">
                <AlertTitle>Too many rows</AlertTitle>
                <AlertDescription>Files are limited to {MAX_ROWS.toLocaleString()} rows.</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`map-${field.key}`}>
                    {field.label}
                    {field.required && <span className="text-destructive"> (required)</span>}
                  </Label>
                  <Select value={map[field.key] ?? NONE} onValueChange={(v) => setMap((m) => ({ ...m, [field.key]: v }))}>
                    <SelectTrigger id={`map-${field.key}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!field.required && <SelectItem value={NONE}>Not in file</SelectItem>}
                      {inspect.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Preview</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    {inspect.headers.map((h, i) => (
                      <TableHead key={i}>{h || `Column ${i + 1}`}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspect.sample_rows.map((r, ri) => (
                    <TableRow key={ri}>
                      {inspect.headers.map((_, ci) => (
                        <TableCell key={ci} className="max-w-[200px] truncate">
                          {r[ci] ?? ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {mapError && (
              <p role="alert" className="text-sm text-destructive">
                {mapError}
              </p>
            )}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep(0)
                  setFile(null)
                  setInspect(null)
                }}
              >
                Back
              </Button>
              <Button onClick={stage} disabled={createMutation.isPending || inspect.row_count > MAX_ROWS}>
                {createMutation.isPending ? "Checking rows..." : "Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && importId && !finished && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard title="Valid" value={totals?.valid ?? "-"} />
            <StatCard title="Invalid" value={totals?.invalid ?? "-"} />
            <StatCard title="Duplicate" value={totals?.duplicate ?? "-"} />
            <StatCard title="Already subscribed" value={totals?.existing ?? "-"} />
            <StatCard title="Suppressed" value={totals?.suppressed ?? "-"} />
          </div>
          <p className="text-sm text-muted-foreground">
            Suppressed addresses (unsubscribed, bounced or complained) are never re-invited, even if they appear in your file.
          </p>

          {unmapped.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Unmapped interests</CardTitle>
                <CardDescription>
                  These terms did not match a discipline. Pick one for each and it is remembered as a synonym for future imports.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-3">
                  {unmapped.map((t, i) => (
                    <li key={t.term} className="flex flex-wrap items-center gap-3">
                      <span className="min-w-40 flex-1 text-sm">
                        {t.term} <Badge variant="secondary">{t.count}</Badge>
                      </span>
                      <Label htmlFor={`term-${i}`} className="sr-only">
                        Discipline for {t.term}
                      </Label>
                      <Select
                        value={termChoices[t.term] ?? NONE}
                        onValueChange={(v) =>
                          setTermChoices((c) => {
                            const next = { ...c }
                            if (v === NONE) delete next[t.term]
                            else next[t.term] = v
                            return next
                          })
                        }
                      >
                        <SelectTrigger id={`term-${i}`} className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Leave unmapped</SelectItem>
                          {(disciplines ?? []).map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={saveMappings}
                  disabled={mapMutation.isPending || Object.keys(termChoices).length === 0}
                >
                  {mapMutation.isPending ? "Saving..." : "Save mappings"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Rows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs
                value={rowFilter}
                onValueChange={(v) => {
                  setRowFilter(v as ImportRowFilter | "all")
                  setRowPage(1)
                }}
              >
                <TabsList className="h-auto flex-wrap">
                  {ROW_FILTERS.map((f) => (
                    <TabsTrigger key={f.value} value={f.value}>
                      {f.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {rowsLoading ? (
                <div className="py-6 text-center text-muted-foreground">Loading rows...</div>
              ) : (rows?.data.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-muted-foreground">No rows in this view.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Interests</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows?.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.row_no}</TableCell>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{r.name || "-"}</TableCell>
                        <TableCell className="max-w-[240px] truncate" title={r.raw_interests ?? ""}>
                          {r.raw_interests || "-"}
                          {r.unmapped_terms.length > 0 && (
                            <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">
                              ({r.unmapped_terms.length} unmapped)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.issue ? (
                            <Badge variant="secondary">{ISSUE_LABELS[r.issue] ?? r.issue}</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Valid</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {rows?.pagination && rows.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {rows.pagination.page} of {rows.pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={!rows.pagination.hasPrev} onClick={() => setRowPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={!rows.pagination.hasNext} onClick={() => setRowPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              Cancel import
            </Button>
            <Button onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && importId && !finished && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm import</CardTitle>
            <CardDescription>{file?.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-inside list-disc text-sm">
              <li>{totals?.valid ?? 0} valid addresses will be added</li>
              <li>{totals?.invalid ?? 0} invalid, {totals?.duplicate ?? 0} duplicate, {totals?.existing ?? 0} already subscribed and {totals?.suppressed ?? 0} suppressed rows are skipped</li>
              <li>{unmapped.length} interest terms remain unmapped</li>
            </ul>
            <Alert>
              <AlertTitle>Nothing is sent now</AlertTitle>
              <AlertDescription>
                {validCount} pending subscribers are created and an invitation campaign is saved as a draft for approval.
              </AlertDescription>
            </Alert>
            <div className="flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} disabled={confirmMutation.isPending}>
                  Back
                </Button>
                <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={confirmMutation.isPending}>
                  Cancel import
                </Button>
              </div>
              <Button onClick={confirm} disabled={confirmMutation.isPending || validCount === 0}>
                {confirmMutation.isPending ? "Confirming..." : "Confirm import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {finished && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <CardTitle>{cancelled ? "Import cancelled" : "Import confirmed"}</CardTitle>
            </div>
            <CardDescription>
              {cancelled
                ? "No subscribers were created."
                : `${confirmedCount} pending subscribers were created. The invitation campaign is a draft awaiting approval, so nothing has been sent.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild>
              <Link href="/admin/notifications/imports">Back to imports</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/notifications/subscribers">View subscribers</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {confirmMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {confirmMutation.error.message}
        </p>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this import?</AlertDialogTitle>
            <AlertDialogDescription>
              No subscribers will be created. You can upload the file again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep import</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} disabled={cancelMutation.isPending}>
              Cancel import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
