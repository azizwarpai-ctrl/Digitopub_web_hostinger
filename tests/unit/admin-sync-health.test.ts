import { describe, it, expect } from 'vitest'
import { summarizeSyncRuns } from '@/src/features/admin-analytics/server/sync-health'

let idCounter = 0
function run(jobName: string, status: string, startedAtMsAgo: number, opts: { finished?: boolean } = {}) {
    const startedAt = new Date(Date.now() - startedAtMsAgo)
    return {
        id: BigInt(++idCounter),
        job_name: jobName,
        status,
        triggered_by: 'http',
        started_at: startedAt,
        finished_at: opts.finished === false ? null : new Date(startedAt.getTime() + 1500),
        stats: null,
        error: status === 'failed' ? 'boom' : null,
    }
}

describe('summarizeSyncRuns', () => {
    it('returns empty response for no runs', () => {
        const result = summarizeSyncRuns([], 10)
        expect(result.jobs).toEqual([])
        expect(result.totalFailureStreak).toBe(0)
    })

    it('computes failure streak from most recent backwards, reset by success', () => {
        // newest-first: failed, failed, success, failed
        const rows = [
            run('ojs_journals_sync', 'failed', 1000),
            run('ojs_journals_sync', 'failed', 2000),
            run('ojs_journals_sync', 'success', 3000),
            run('ojs_journals_sync', 'failed', 4000),
        ]
        const result = summarizeSyncRuns(rows, 10)
        expect(result.jobs[0].failureStreak).toBe(2)
        expect(result.jobs[0].lastSuccessAt).not.toBeNull()
        expect(result.totalFailureStreak).toBe(2)
    })

    it('counts partial toward the streak', () => {
        const rows = [
            run('metrics_daily_aggregation', 'partial', 1000),
            run('metrics_daily_aggregation', 'failed', 2000),
            run('metrics_daily_aggregation', 'success', 3000),
        ]
        expect(summarizeSyncRuns(rows, 10).jobs[0].failureStreak).toBe(2)
    })

    it('ignores in-flight running runs for the streak', () => {
        const rows = [
            run('ojs_journals_sync', 'running', 500, { finished: false }),
            run('ojs_journals_sync', 'failed', 1000),
            run('ojs_journals_sync', 'success', 2000),
        ]
        expect(summarizeSyncRuns(rows, 10).jobs[0].failureStreak).toBe(1)
    })

    it('zero streak when the latest run succeeded', () => {
        const rows = [
            run('retention_cleanup', 'success', 1000),
            run('retention_cleanup', 'failed', 2000),
        ]
        const result = summarizeSyncRuns(rows, 10)
        expect(result.jobs[0].failureStreak).toBe(0)
        expect(result.totalFailureStreak).toBe(0)
    })

    it('groups multiple jobs, sums streaks, and respects perJobLimit', () => {
        const rows = [
            run('job_a', 'failed', 1000),
            run('job_b', 'failed', 1100),
            run('job_a', 'failed', 2000),
            run('job_b', 'success', 2100),
            run('job_a', 'success', 3000),
            run('job_a', 'success', 4000),
        ]
        const result = summarizeSyncRuns(rows, 2)
        expect(result.jobs.map((j) => j.jobName)).toEqual(['job_a', 'job_b'])
        expect(result.totalFailureStreak).toBe(3)
        expect(result.jobs[0].recentRuns).toHaveLength(2)
        expect(result.jobs[0].lastRun.durationMs).toBe(1500)
    })

    it('null lastSuccessAt and durationMs for a never-succeeded, unfinished job', () => {
        const rows = [run('new_job', 'running', 500, { finished: false })]
        const job = summarizeSyncRuns(rows, 10).jobs[0]
        expect(job.lastSuccessAt).toBeNull()
        expect(job.lastRun.durationMs).toBeNull()
        expect(job.failureStreak).toBe(0)
    })
})

describe('summarizeSyncRuns cover check (#239)', () => {
    it('is null until a journal sync records covers', () => {
        expect(summarizeSyncRuns([run('ojs_journals_sync', 'success', 1000)], 10).covers).toBeNull()
    })

    it('reports broken and kept covers from the newest journal sync that checked them', () => {
        const newest = { ...run('ojs_journals_sync', 'success', 1000), stats: { covers: { checked: 13, ok: 11, broken: ['jod', 'ojbr'], kept_old: ['ijmp'] } } }
        const older = { ...run('ojs_journals_sync', 'success', 5000), stats: { covers: { checked: 13, ok: 13, broken: [], kept_old: [] } } }
        const other = { ...run('metrics_daily_aggregation', 'success', 500), stats: { covers: { checked: 1, broken: ['x'] } } }

        expect(summarizeSyncRuns([other, newest, older], 10).covers).toEqual({
            checked: 13,
            broken: ['jod', 'ojbr'],
            keptOld: ['ijmp'],
            checkedAt: newest.started_at.toISOString(),
        })
    })
})
