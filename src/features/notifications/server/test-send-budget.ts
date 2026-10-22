/**
 * One hourly budget for every test email an admin sends (campaign tests,
 * template tests, deliverability tests). Tests go through the same mailbox
 * as OTP codes and real alerts, so they must not eat its hourly limit.
 * In memory: the app runs as a single instance on the host.
 */

export const TEST_EMAILS_PER_HOUR = 50
const HOUR = 60 * 60 * 1000

const sentAt: number[] = []

/** Reserves `count` test emails; false (and nothing reserved) when that would exceed the hourly budget. */
export function takeTestSendBudget(count: number, now = Date.now()): boolean {
    while (sentAt.length && now - sentAt[0] > HOUR) sentAt.shift()
    if (sentAt.length + count > TEST_EMAILS_PER_HOUR) return false
    for (let i = 0; i < count; i++) sentAt.push(now)
    return true
}

export const TEST_BUDGET_MESSAGE = `At most ${TEST_EMAILS_PER_HOUR} test emails per hour. Try again later or send to fewer addresses.`

export interface TestSendResult {
    sent: string[]
    failed: Array<{ to: string; error: string }>
}

/** Sends to each address in turn; one failing address does not stop the others. */
export async function sendToEach(
    recipients: readonly string[],
    sendOne: (to: string) => Promise<{ ok: true } | { ok: false; error: string }>,
): Promise<TestSendResult> {
    const result: TestSendResult = { sent: [], failed: [] }
    for (const to of recipients) {
        try {
            const outcome = await sendOne(to)
            if (outcome.ok) result.sent.push(to)
            else result.failed.push({ to, error: outcome.error })
        } catch (e) {
            result.failed.push({ to, error: e instanceof Error ? e.message : "Send failed" })
        }
    }
    return result
}

/** "Test sent to a@x.org" or "Test sent to 3 of 4 addresses". */
export function describeTestSend(r: TestSendResult): string {
    const total = r.sent.length + r.failed.length
    if (total === 1) return r.sent.length ? `Test sent to ${r.sent[0]}` : `Test to ${r.failed[0].to} failed: ${r.failed[0].error}`
    return `Test sent to ${r.sent.length} of ${total} addresses`
}
