"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCampaigns } from "@/src/features/notifications/api/use-campaigns"
import {
  CampaignStatusBadge,
  TYPE_LABELS,
  campaignTypeLabel,
} from "@/src/features/notifications/components/campaigns/campaign-status"

const ALL = "all"

const STATUS_TABS = [
  { value: ALL, label: "All" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "queued", label: "Queued" },
  { value: "sending", label: "Sending" },
  { value: "paused", label: "Paused" },
  { value: "sent", label: "Sent" },
  { value: "cancelled", label: "Cancelled" },
]

function CampaignsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlStatus = searchParams.get("status")
  const status = STATUS_TABS.some((t) => t.value === urlStatus) && urlStatus ? urlStatus : ALL

  const limit = 20
  const [page, setPage] = useState(1)
  const [type, setType] = useState(ALL)

  const { data, isLoading, isError, error } = useCampaigns(
    { status: status === ALL ? undefined : status, type: type === ALL ? undefined : type },
    page,
    limit,
  )
  const campaigns = data?.data ?? []
  const pagination = data?.pagination

  const changeStatus = (value: string) => {
    setPage(1)
    router.replace(value === ALL ? pathname : `${pathname}?status=${value}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Campaigns" subtitle="Review, approve and monitor notification emails" />

      <Card>
        <CardHeader>
          <CardTitle>All campaigns</CardTitle>
          <CardDescription>Open a campaign to preview it, send a test or approve it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Tabs value={status} onValueChange={changeStatus}>
              <TabsList className="h-auto flex-wrap">
                {STATUS_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="w-full space-y-1.5 sm:w-52">
              <Label htmlFor="filter-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v)
                  setPage(1)
                }}
              >
                <SelectTrigger id="filter-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading campaigns...</div>
          ) : isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
              {error?.message || "Failed to load campaigns"}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No campaigns match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients (estimate)</TableHead>
                  <TableHead>Sent / failed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-xs truncate font-medium">{c.subject}</TableCell>
                    <TableCell>{campaignTypeLabel(c.type)}</TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell>{c.recipient_estimate.toLocaleString()}</TableCell>
                    <TableCell>
                      {c.sent_count.toLocaleString()} / {c.failed_count.toLocaleString()}
                    </TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/notifications/campaigns/${c.id}`}>
                          View<span className="sr-only">: {c.subject}</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} campaigns)
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

export default function CampaignsPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading campaigns...</div>}>
      <CampaignsContent />
    </Suspense>
  )
}
