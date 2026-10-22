import { Hono, type Context } from "hono"
import { zValidator } from "@hono/zod-validator"

import { requireAdmin } from "@/src/lib/auth-middleware"
import { prisma } from "@/src/lib/db/config"
import { serializeMany, serializeRecord } from "@/src/lib/serialize"
import { paginatedResponse, parsePagination } from "@/src/lib/pagination"

import {
    columnMapSchema,
    idParamSchema,
    importRowsQuerySchema,
    subscriberCreateSchema,
    subscriberListQuerySchema,
    subscriberUpdateSchema,
    termMappingSchema,
} from "../schemas/notification-schemas"
import { getImportMaxBytes } from "./config"
import { campaignProgress, cancelCampaign, pauseCampaign, resumeCampaign } from "./send-service"
import {
    CampaignStateError,
    approveCampaign,
    getCampaignDetail,
    getOverview,
    listCampaigns,
    previewCampaign,
    sendCampaignTest,
    updateDraft,
} from "./campaign-service"
import {
    DisciplineInputError,
    RuleInputError,
    createDiscipline,
    deleteRule,
    getSettingsView,
    listAllDisciplines,
    listJournalMappings,
    listRules,
    listSectionMappings,
    saveSettings,
    setJournalDisciplines,
    setSectionDisciplines,
    updateDiscipline,
    upsertRule,
} from "./admin-config-service"
import {
    campaignApproveSchema,
    campaignEditSchema,
    campaignListQuerySchema,
    campaignTestSchema,
    disciplineCreateSchema,
    disciplineIdsSchema,
    disciplineUpdateSchema,
    ruleUpsertSchema,
    settingsSchema,
} from "../schemas/notification-schemas"
import { ImportParseError } from "./import/parse"
import {
    applyTermMappings,
    cancelImport,
    confirmImport,
    createImport,
    getImport,
    ImportStateError,
    inspectImportFile,
    listImportRows,
    listImports,
} from "./import-service"
import {
    createSubscriber,
    deleteSubscriber,
    exportSubscribersCsv,
    getSubscriber,
    listSubscribers,
    SubscriberConflictError,
    updateSubscriber,
} from "./subscriber-service"

const fail = (c: Context, error: string, status: 400 | 404 | 409 | 413) =>
    c.json({ success: false as const, error }, status)

/** Reads the multipart `file` field and enforces the size limit. */
async function readUpload(c: Context): Promise<
    | { ok: true; bytes: Uint8Array; fileName: string; body: Record<string, unknown> }
    | { ok: false; res: Response }
> {
    let body: Record<string, unknown>
    try {
        body = await c.req.parseBody()
    } catch {
        return { ok: false, res: fail(c, "Invalid multipart body", 400) }
    }
    const file = body.file
    if (!(file instanceof File)) {
        return { ok: false, res: fail(c, "Missing 'file' field (multipart upload required)", 400) }
    }
    const max = getImportMaxBytes()
    if (file.size > max) {
        return {
            ok: false,
            res: fail(c, `The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${max / 1048576} MB.`, 413),
        }
    }
    return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name, body }
}

function handleKnownErrors(c: Context, e: unknown) {
    if (e instanceof ImportParseError) return fail(c, e.message, 400)
    if (e instanceof ImportStateError) return fail(c, e.message, 409)
    if (e instanceof SubscriberConflictError) return fail(c, e.message, 409)
    throw e
}

const app = new Hono()
    .use("*", requireAdmin)

    // ─── Disciplines (read-only here; the editor arrives in Phase 6) ─────────
    .get("/disciplines", async (c) => {
        const rows = await prisma.discipline.findMany({
            where: { is_active: true },
            orderBy: [{ parent_id: "asc" }, { sort_order: "asc" }, { name: "asc" }],
            select: { id: true, slug: true, name: true, parent_id: true },
        })
        return c.json({ success: true, data: serializeMany(rows) })
    })

    // ─── Imports ────────────────────────────────────────────────────────────
    .post("/imports/inspect", async (c) => {
        const up = await readUpload(c)
        if (!up.ok) return up.res
        try {
            return c.json({ success: true, data: inspectImportFile(up.bytes, up.fileName) })
        } catch (e) {
            return handleKnownErrors(c, e)
        }
    })

    .post("/imports", async (c) => {
        const up = await readUpload(c)
        if (!up.ok) return up.res

        let columnMap
        if (typeof up.body.column_map === "string" && up.body.column_map) {
            let raw: unknown
            try {
                raw = JSON.parse(up.body.column_map)
            } catch {
                return fail(c, "column_map must be JSON", 400)
            }
            const parsed = columnMapSchema.safeParse(raw)
            if (!parsed.success) return fail(c, "Invalid column_map", 400)
            columnMap = parsed.data
        }

        const session = c.get("session" as never) as { id: string }
        try {
            const created = await createImport({
                buffer: up.bytes,
                fileName: up.fileName,
                columnMap,
                uploadedBy: BigInt(session.id),
            })
            return c.json({ success: true, data: serializeRecord(created) }, 201)
        } catch (e) {
            return handleKnownErrors(c, e)
        }
    })

    .get("/imports", async (c) => {
        const p = parsePagination(c)
        const { rows, total } = await listImports(p.offset, p.limit)
        return c.json(paginatedResponse(serializeMany(rows), total, p))
    })

    .get("/imports/:id", zValidator("param", idParamSchema), async (c) => {
        const imp = await getImport(BigInt(c.req.valid("param").id))
        if (!imp) return fail(c, "Import not found", 404)
        return c.json({ success: true, data: serializeRecord(imp) })
    })

    .get("/imports/:id/rows", zValidator("param", idParamSchema), zValidator("query", importRowsQuerySchema), async (c) => {
        const p = parsePagination(c)
        const { rows, total } = await listImportRows(BigInt(c.req.valid("param").id), c.req.valid("query").issue, p.offset, p.limit)
        return c.json(paginatedResponse(serializeMany(rows), total, p))
    })

    .patch("/imports/:id/mapping", zValidator("param", idParamSchema), zValidator("json", termMappingSchema), async (c) => {
        try {
            const updated = await applyTermMappings(BigInt(c.req.valid("param").id), c.req.valid("json").mappings)
            if (!updated) return fail(c, "Import not found", 404)
            return c.json({ success: true, data: serializeRecord(updated), message: "Terms saved as synonyms" })
        } catch (e) {
            return handleKnownErrors(c, e)
        }
    })

    .post("/imports/:id/confirm", zValidator("param", idParamSchema), async (c) => {
        try {
            const result = await confirmImport(BigInt(c.req.valid("param").id))
            if (!result) return fail(c, "Import not found", 404)
            return c.json({
                success: true,
                data: serializeRecord(result),
                message: `${result.created} pending subscribers created. The invitation campaign is a draft awaiting approval.`,
            })
        } catch (e) {
            return handleKnownErrors(c, e)
        }
    })

    .post("/imports/:id/cancel", zValidator("param", idParamSchema), async (c) => {
        try {
            const imp = await cancelImport(BigInt(c.req.valid("param").id))
            if (!imp) return fail(c, "Import not found", 404)
            return c.json({ success: true, data: serializeRecord(imp) })
        } catch (e) {
            return handleKnownErrors(c, e)
        }
    })

    // ─── Subscribers ────────────────────────────────────────────────────────
    .get("/subscribers/export", zValidator("query", subscriberListQuerySchema), async (c) => {
        const csv = await exportSubscribersCsv(c.req.valid("query"))
        const stamp = new Date().toISOString().slice(0, 10)
        return c.body(`﻿${csv}`, 200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="subscribers-${stamp}.csv"`,
        })
    })

    .get("/subscribers", zValidator("query", subscriberListQuerySchema), async (c) => {
        const p = parsePagination(c)
        const { rows, total } = await listSubscribers(c.req.valid("query"), p.offset, p.limit)
        return c.json(paginatedResponse(serializeMany(rows), total, p))
    })

    .get("/subscribers/:id", zValidator("param", idParamSchema), async (c) => {
        const s = await getSubscriber(BigInt(c.req.valid("param").id))
        if (!s) return fail(c, "Subscriber not found", 404)
        return c.json({ success: true, data: serializeRecord(s) })
    })

    .post("/subscribers", zValidator("json", subscriberCreateSchema), async (c) => {
        try {
            const s = await createSubscriber(c.req.valid("json"))
            return c.json({ success: true, data: serializeRecord(s), message: "Subscriber added as pending" }, 201)
        } catch (e) {
            return handleKnownErrors(c, e)
        }
    })

    .patch("/subscribers/:id", zValidator("param", idParamSchema), zValidator("json", subscriberUpdateSchema), async (c) => {
        const s = await updateSubscriber(BigInt(c.req.valid("param").id), c.req.valid("json"))
        if (!s) return fail(c, "Subscriber not found", 404)
        return c.json({ success: true, data: serializeRecord(s) })
    })

    .delete("/subscribers/:id", zValidator("param", idParamSchema), async (c) => {
        const ok = await deleteSubscriber(BigInt(c.req.valid("param").id))
        if (!ok) return fail(c, "Subscriber not found", 404)
        return c.json({ success: true, data: null, message: "Subscriber deleted" })
    })

    // ─── Campaign send controls (#201) ────────────────────────────────
    .post("/campaigns/:id/pause", zValidator("param", idParamSchema), async (c) => {
        const r = await pauseCampaign(BigInt(c.req.valid("param").id))
        return r.ok ? c.json({ success: true, data: { status: r.status } }) : fail(c, r.error, 409)
    })
    .post("/campaigns/:id/resume", zValidator("param", idParamSchema), async (c) => {
        const r = await resumeCampaign(BigInt(c.req.valid("param").id))
        return r.ok ? c.json({ success: true, data: { status: r.status } }) : fail(c, r.error, 409)
    })
    .post("/campaigns/:id/cancel", zValidator("param", idParamSchema), async (c) => {
        const r = await cancelCampaign(BigInt(c.req.valid("param").id))
        return r.ok ? c.json({ success: true, data: { status: r.status } }) : fail(c, r.error, 409)
    })
    .get("/campaigns/:id/progress", zValidator("param", idParamSchema), async (c) => {
        const p = await campaignProgress(BigInt(c.req.valid("param").id))
        if (!p) return fail(c, "Campaign not found", 404)
        return c.json({ success: true, data: p })
    })

    // ─── Overview & campaign review (#202) ────────────────────────────
    .get("/overview", async (c) => c.json({ success: true, data: serializeRecord(await getOverview()) }))
    .get("/campaigns", zValidator("query", campaignListQuerySchema), async (c) => {
        const pagination = parsePagination(c)
        const { rows, total } = await listCampaigns(c.req.valid("query"), pagination.offset, pagination.limit)
        return c.json(paginatedResponse(serializeMany(rows), total, pagination))
    })
    .get("/campaigns/:id", zValidator("param", idParamSchema), async (c) => {
        const detail = await getCampaignDetail(BigInt(c.req.valid("param").id))
        if (!detail) return fail(c, "Campaign not found", 404)
        return c.json({ success: true, data: serializeRecord(detail) })
    })
    .get("/campaigns/:id/preview", zValidator("param", idParamSchema), async (c) => {
        const preview = await previewCampaign(BigInt(c.req.valid("param").id))
        if (!preview) return fail(c, "Campaign not found", 404)
        return c.json({ success: true, data: preview })
    })
    .patch("/campaigns/:id", zValidator("param", idParamSchema), zValidator("json", campaignEditSchema), async (c) => {
        try {
            const r = await updateDraft(BigInt(c.req.valid("param").id), c.req.valid("json"))
            if (!r) return fail(c, "Campaign not found", 404)
            return c.json({ success: true, data: serializeRecord(r) })
        } catch (e) {
            if (e instanceof CampaignStateError) return fail(c, e.message, 409)
            throw e
        }
    })
    .post("/campaigns/:id/test", zValidator("param", idParamSchema), zValidator("json", campaignTestSchema), async (c) => {
        const session = c.get("session" as never) as { email: string; full_name?: string }
        const to = c.req.valid("json").to || session.email
        try {
            const r = await sendCampaignTest(BigInt(c.req.valid("param").id), to, session.full_name || "Colleague")
            if (!r) return fail(c, "Campaign not found", 404)
            if (!r.ok) return c.json({ success: false, error: r.error }, 502)
            return c.json({ success: true, message: `Test sent to ${to}` })
        } catch (e) {
            if (e instanceof CampaignStateError) return fail(c, e.message, 409)
            throw e
        }
    })
    .post("/campaigns/:id/approve", zValidator("param", idParamSchema), zValidator("json", campaignApproveSchema), async (c) => {
        const session = c.get("session" as never) as { id: string }
        const at = c.req.valid("json").scheduled_at
        try {
            const r = await approveCampaign(BigInt(c.req.valid("param").id), BigInt(session.id), at ? new Date(at) : null)
            if (!r) return fail(c, "Campaign not found", 404)
            return c.json({ success: true, data: r, message: r.status === "scheduled" ? "Campaign scheduled" : "Campaign queued for sending" })
        } catch (e) {
            if (e instanceof CampaignStateError) return fail(c, e.message, 409)
            throw e
        }
    })

    // ─── Rules ────────────────────────────────────────────────────────
    .get("/rules", async (c) => c.json({ success: true, data: serializeMany(await listRules()) }))
    .put("/rules", zValidator("json", ruleUpsertSchema), async (c) => {
        const session = c.get("session" as never) as { id: string }
        try {
            const rule = await upsertRule(c.req.valid("json"), BigInt(session.id))
            return c.json({ success: true, data: serializeRecord(rule) })
        } catch (e) {
            if (e instanceof RuleInputError) return fail(c, e.message, 400)
            throw e
        }
    })
    .delete("/rules/:id", zValidator("param", idParamSchema), async (c) => {
        const r = await deleteRule(BigInt(c.req.valid("param").id))
        if (r === "not_found") return fail(c, "Rule not found", 404)
        if (r === "global") return fail(c, "Global rules can be switched off but not deleted", 409)
        return c.json({ success: true, data: null, message: "Rule deleted" })
    })

    // ─── Taxonomy ─────────────────────────────────────────────────────
    .get("/taxonomy", async (c) => {
        const [disciplines, journals, sections] = await Promise.all([listAllDisciplines(), listJournalMappings(), listSectionMappings()])
        return c.json({ success: true, data: serializeRecord({ disciplines, journals, sections }) })
    })
    .post("/disciplines", zValidator("json", disciplineCreateSchema), async (c) => {
        try {
            return c.json({ success: true, data: serializeRecord(await createDiscipline(c.req.valid("json"))) }, 201)
        } catch (e) {
            if (e instanceof DisciplineInputError) return fail(c, e.message, 409)
            throw e
        }
    })
    .patch("/disciplines/:id", zValidator("param", idParamSchema), zValidator("json", disciplineUpdateSchema), async (c) => {
        try {
            const d = await updateDiscipline(BigInt(c.req.valid("param").id), c.req.valid("json"))
            if (!d) return fail(c, "Discipline not found", 404)
            return c.json({ success: true, data: serializeRecord(d) })
        } catch (e) {
            if (e instanceof DisciplineInputError) return fail(c, e.message, 409)
            throw e
        }
    })
    .put("/journals/:id/disciplines", zValidator("param", idParamSchema), zValidator("json", disciplineIdsSchema), async (c) => {
        await setJournalDisciplines(BigInt(c.req.valid("param").id), c.req.valid("json").discipline_ids)
        return c.json({ success: true, data: null, message: "Journal disciplines saved" })
    })
    .put("/sections/:id/disciplines", zValidator("param", idParamSchema), zValidator("json", disciplineIdsSchema), async (c) => {
        await setSectionDisciplines(BigInt(c.req.valid("param").id), c.req.valid("json").discipline_ids)
        return c.json({ success: true, data: null, message: "Section disciplines saved" })
    })

    // ─── Settings ─────────────────────────────────────────────────────
    .get("/settings", async (c) => c.json({ success: true, data: await getSettingsView() }))
    .put("/settings", zValidator("json", settingsSchema), async (c) => {
        const session = c.get("session" as never) as { id: string }
        await saveSettings(c.req.valid("json"), BigInt(session.id))
        return c.json({ success: true, data: await getSettingsView(), message: "Settings saved" })
    })

export { app as notificationsRouter }
