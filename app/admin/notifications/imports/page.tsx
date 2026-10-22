"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

export default function ImportsPage() {
  const limit = 20
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useGetImports(page, limit)
  const imports = data?.data ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      <PageHeader title="Imports" subtitle="Subscriber lists uploaded for invitation">
        <Button asChild>
          <Link href="/admin/notifications/imports/new">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New import
          </Link>
        </Button>
      </PageHeader>

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
