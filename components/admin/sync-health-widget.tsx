"use client"

import { RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { statusBadgeClass, cn } from "@/src/lib/utils"
import { useSyncHealth } from "@/src/features/admin-analytics/api/use-sync-health"

const JOB_LABELS: Record<string, string> = {
    ojs_journals_sync: "OJS journals sync",
    metrics_daily_aggregation: "Daily metrics",
    metrics_monthly_aggregation: "Monthly rollup",
    user_metrics_update: "User metrics",
    retention_cleanup: "Retention cleanup",
    "ojs-legacy-backfill": "Legacy backfill",
}

function relativeTime(iso: string): string {
    const deltaMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(deltaMs / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

/**
 * Recurring-job health from the sync_runs ledger. Empty ledger renders an
 * explicit "no runs recorded" state — jobs that never ran are not "healthy".
 */
export function SyncHealthWidget() {
    const { data, isLoading, isError } = useSyncHealth()

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Sync health
                </CardTitle>
                <CardDescription>Recurring jobs, from the sync_runs ledger</CardDescription>
            </CardHeader>
            <CardContent>
                {data?.covers && data.covers.broken.length > 0 && (
                    <div role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        <p className="font-medium text-destructive">
                            {data.covers.broken.length} of {data.covers.checked} journal covers are not loading
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {data.covers.broken.join(", ")} · checked {relativeTime(data.covers.checkedAt)} by the OJS
                            journal sync. See docs/ojs-image-pipeline.md.
                        </p>
                    </div>
                )}
                {data?.covers && data.covers.keptOld.length > 0 && (
                    <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                        The last sync refused new cover URLs that did not load and kept the working covers for{" "}
                        {data.covers.keptOld.join(", ")}. Check the OJS image settings or the cover parser.
                    </p>
                )}
                {isLoading ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-9 animate-pulse rounded bg-muted" />
                        ))}
                    </div>
                ) : isError ? (
                    <p className="py-4 text-sm text-destructive">Failed to load sync health.</p>
                ) : !data || data.jobs.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                        No job runs recorded yet. Once the scheduled cron endpoints fire (see
                        docs/ops/cron-schedule.md), runs appear here.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {data.jobs.map((job) => (
                            <li key={job.jobName} className="flex items-center justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {JOB_LABELS[job.jobName] ?? job.jobName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {relativeTime(job.lastRun.startedAt)}
                                        {job.lastRun.durationMs !== null &&
                                            ` · ${(job.lastRun.durationMs / 1000).toFixed(1)}s`}
                                        {` · via ${job.lastRun.triggeredBy}`}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {job.failureStreak > 0 && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="outline" className={cn(statusBadgeClass("failed"))}>
                                                    ×{job.failureStreak}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {job.failureStreak} consecutive incomplete run
                                                {job.failureStreak === 1 ? "" : "s"}
                                                {job.lastRun.error ? ` — ${job.lastRun.error}` : ""}
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                    <Badge variant="outline" className={cn(statusBadgeClass(job.lastRun.status))}>
                                        {job.lastRun.status}
                                    </Badge>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
