/**
 * OJS user linkage for the ORCID OAuth callback.
 *
 * Order:
 *   1. ORCID match in OJS user_settings (canonical).
 *   2. Email match in OJS users — guarded by users.disabled.
 *   3. If matched and ENABLE_ORCID_OJS_BACKFILL=true, audited write to OJS.
 *   4. Always upsert the digitopub-side UserOrcidLink cache.
 */

import { emailHash } from "@/src/lib/email-hash"
import { ojsQuery, isOjsConfigured } from "@/src/features/ojs/server/ojs-client"
import { prisma } from "@/src/lib/db/config"
import { writeOrcidToOjsWithAudit, isBackfillEnabled } from "@/src/lib/ojs-write-guard"

export class BlockedAccountError extends Error {
    constructor() {
        super("ACCOUNT_DISABLED")
        this.name = "BlockedAccountError"
    }
}

export interface LinkOjsUserInput {
    orcid: string
    email?: string | null
    requestId: string
}

export interface LinkOjsUserResult {
    ojs_user_id: number | null
    /** Why ojs_user_id was set (or not). */
    linkSource: "orcid_match" | "email_match" | "no_match"
    ojsBackfilled: boolean
}


export async function linkOjsUser(
    input: LinkOjsUserInput
): Promise<LinkOjsUserResult> {
    const ehash = emailHash(input.email)

    // Short-circuit when OJS is not configured at all (dev / first-boot).
    if (!isOjsConfigured()) {
        return { ojs_user_id: null, linkSource: "no_match", ojsBackfilled: false }
    }

    // 1) ORCID match.
    try {
        const byOrcid = await ojsQuery<{ user_id: number }>(
            "SELECT user_id FROM user_settings WHERE setting_name='orcid' AND setting_value=? LIMIT 1",
            [input.orcid]
        )
        if (byOrcid.length > 0) {
            const ojsUserId = Number(byOrcid[0].user_id)
            await prisma.userOrcidLink.upsert({
                where: { orcid: input.orcid },
                create: {
                    orcid: input.orcid,
                    ojs_user_id: BigInt(ojsUserId),
                    email_hash: ehash,
                    link_source: "orcid_match",
                    ojs_backfilled: true,
                },
                update: {
                    ojs_user_id: BigInt(ojsUserId),
                    email_hash: ehash,
                    link_source: "orcid_match",
                    ojs_backfilled: true,
                },
            })
            return {
                ojs_user_id: ojsUserId,
                linkSource: "orcid_match",
                ojsBackfilled: true,
            }
        }
    } catch (err) {
        console.warn("[linkOjsUser] ORCID lookup failed:", err)
    }

    // 2) Email match.
    if (!input.email) {
        return { ojs_user_id: null, linkSource: "no_match", ojsBackfilled: false }
    }

    let matched: { user_id: number; disabled: number } | null = null
    try {
        const rows = await ojsQuery<{ user_id: number; disabled: number }>(
            "SELECT user_id, disabled FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
            [input.email]
        )
        if (rows.length > 0) {
            matched = rows[0]
        }
    } catch (err) {
        console.warn("[linkOjsUser] email lookup failed:", err)
        return { ojs_user_id: null, linkSource: "no_match", ojsBackfilled: false }
    }

    if (!matched) {
        return { ojs_user_id: null, linkSource: "no_match", ojsBackfilled: false }
    }

    if (matched.disabled === 1) {
        throw new BlockedAccountError()
    }

    // 3) Backfill (audited, feature-flagged).
    let backfilled = false
    if (isBackfillEnabled()) {
        const result = await writeOrcidToOjsWithAudit({
            orcid: input.orcid,
            ojsUserId: matched.user_id,
            requestId: input.requestId,
        })
        backfilled = result.success
    }

    // 4) Always cache the link on the digitopub side.
    await prisma.userOrcidLink.upsert({
        where: { orcid: input.orcid },
        create: {
            orcid: input.orcid,
            ojs_user_id: BigInt(matched.user_id),
            email_hash: ehash,
            link_source: "email_match",
            ojs_backfilled: backfilled,
        },
        update: {
            ojs_user_id: BigInt(matched.user_id),
            email_hash: ehash,
            link_source: "email_match",
            ojs_backfilled: backfilled,
        },
    })

    return {
        ojs_user_id: matched.user_id,
        linkSource: "email_match",
        ojsBackfilled: backfilled,
    }
}

export { emailHash }
