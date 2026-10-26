import { prisma } from "@/src/lib/db/config"

/**
 * TOCTOU-safe distributed job lock backed by `system_settings` — the same
 * pattern the OJS sync endpoint has used since its introduction (raw
 * INSERT … ON DUPLICATE KEY UPDATE with an in-SQL expiry check, then a
 * read-back), generalized for any job key.
 *
 * Returns true when the lock was acquired; false when another run holds it
 * (caller should respond 429). The lock self-expires after `windowMs` — no
 * explicit release, which also throttles rapid retries after completion.
 */
export async function acquireJobLock(lockKey: string, windowMs: number): Promise<boolean> {
    const now = Date.now()

    await prisma.$executeRaw`
      INSERT INTO system_settings (setting_key, setting_value, description)
      VALUES (${lockKey}, ${now}, 'Job lock — Unix epoch milliseconds of last attempt')
      ON DUPLICATE KEY UPDATE
        setting_value = CASE
          WHEN (UNIX_TIMESTAMP(NOW()) * 1000) - CASE
            WHEN TRIM(BOTH '"' FROM CAST(setting_value AS CHAR)) REGEXP '^[0-9]+$'
            THEN CAST(TRIM(BOTH '"' FROM CAST(setting_value AS CHAR)) AS SIGNED)
            ELSE 0
          END >= ${windowMs}
          THEN ${now}
          ELSE setting_value
        END
    `

    const lockCheck = await prisma.systemSetting.findUnique({
        where: { setting_key: lockKey },
        select: { setting_value: true },
    })
    return lockCheck?.setting_value === now
}
