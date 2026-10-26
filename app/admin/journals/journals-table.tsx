"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { BookOpen, Eye, Pencil, Plus } from "lucide-react"
import { OjsImage } from "@/src/features/ojs/components/ojs-image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, sortableHeader } from "@/components/data-table/data-table"
import type { CsvColumn } from "@/components/data-table/csv-export"
import { cn, formatDate, statusBadgeClass } from "@/src/lib/utils"
import { useGetSpecializationSyncStatus } from "@/src/features/journals/api/use-specializations"

export interface JournalRow {
  id: string
  title: string
  abbreviation: string | null
  issn: string | null
  field: string
  /** OJS path; public journal URLs use it (/journals/ijmp). */
  ojsPath: string | null
  status: string
  coverImageUrl: string | null
  createdAt: string
}

const SYNC_DOT: Record<string, { className: string; label: string }> = {
  synced: { className: "bg-green-500", label: "Synced to OJS" },
  pending: { className: "bg-amber-500", label: "OJS sync pending" },
  failed: { className: "bg-red-500", label: "OJS sync failed" },
}

function FieldCell({ row }: { row: JournalRow }) {
  const { data } = useGetSpecializationSyncStatus()
  const dot = SYNC_DOT[data?.[row.id]?.state ?? ""]
  return (
    <span className="inline-flex items-center gap-2">
      {row.field}
      {dot && (
        <span title={dot.label} className="inline-flex items-center">
          <span className={cn("inline-block h-2 w-2 rounded-full", dot.className)} aria-hidden="true" />
          <span className="sr-only">{dot.label}</span>
        </span>
      )}
      {row.field === "Uncategorized" && (
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          Needs specialization
        </Badge>
      )}
    </span>
  )
}

const columns: ColumnDef<JournalRow, unknown>[] = [
  {
    id: "cover",
    header: "Cover",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.coverImageUrl ? (
        <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
          <OjsImage
            src={row.original.coverImageUrl}
            alt={row.original.title}
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <span className="text-[10px] font-bold text-muted-foreground">
            {row.original.abbreviation || "N/A"}
          </span>
        </div>
      ),
  },
  {
    accessorKey: "title",
    header: sortableHeader<JournalRow>("Title"),
    cell: ({ row }) => (
      <span className="font-medium line-clamp-2">{row.original.title}</span>
    ),
  },
  {
    accessorKey: "issn",
    header: "ISSN",
    cell: ({ row }) => row.original.issn || <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "field",
    header: sortableHeader<JournalRow>("Field"),
    cell: ({ row }) => <FieldCell row={row.original} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn("border-transparent", statusBadgeClass(row.original.status))}
      >
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "createdAt",
    header: sortableHeader<JournalRow>("Created"),
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="bg-transparent">
          <Link
            href={`/journals/${row.original.ojsPath ?? row.original.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Eye className="mr-1 h-4 w-4" />
            View
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="bg-transparent">
          <Link
            href={`/admin/journals/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>
    ),
  },
]

const csvColumns: CsvColumn<JournalRow>[] = [
  { header: "Title", accessor: (row) => row.title },
  { header: "ISSN", accessor: (row) => row.issn ?? "" },
  { header: "Field", accessor: (row) => row.field },
  { header: "Status", accessor: (row) => row.status },
  { header: "Created", accessor: (row) => formatDate(row.createdAt) },
]

export function JournalsTable({ rows }: { rows: JournalRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKey="title"
      searchPlaceholder="Search journals…"
      csv={{ filename: "journals", columns: csvColumns }}
      emptyState={
        <div className="py-6">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No journals found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Get started by adding your first journal
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/journals/new">
              <Plus className="mr-2 h-4 w-4" />
              Add New Journal
            </Link>
          </Button>
        </div>
      }
    />
  )
}
