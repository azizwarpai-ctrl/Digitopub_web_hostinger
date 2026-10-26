import { Hono, type Context } from "hono"
import { zValidator } from "@hono/zod-validator"
import { requireAdmin } from "@/src/lib/auth-middleware"
import { serializeRecord } from "@/src/lib/serialize"
import { journalIdParamSchema } from "@/src/features/journals/schemas/journal-schema"
import {
  journalSpecializationSchema,
  specializationCreateSchema,
  specializationIdParamSchema,
  specializationUpdateSchema,
} from "@/src/features/journals/schemas/specialization-schema"
import {
  SpecializationError,
  createSpecialization,
  getAllJournalSyncStatuses,
  getJournalSpecialization,
  listSpecializations,
  pushAllSpecializationsToOjs,
  retryJournalSpecializationSync,
  setJournalSpecialization,
  updateSpecialization,
} from "./specialization-service"

/**
 * Journal specialization (#234). Mounted on the journals router before its
 * `/:id` routes, so "/specializations" is never read as a journal id.
 */
const app = new Hono()

// ─── GET /journals/specializations — active names (public: filters, forms) ──
app.get("/specializations", async (c) => {
  try {
    return c.json({ success: true, data: await listSpecializations({ includeInactive: false }) })
  } catch (error) {
    console.error("Error listing specializations:", error)
    return c.json({ success: false, error: "Failed to load specializations" }, 500)
  }
})

// ─── GET /journals/specializations/manage — all names + usage (admin) ──
app.get("/specializations/manage", requireAdmin, async (c) => {
  try {
    return c.json({ success: true, data: await listSpecializations({ includeInactive: true }) })
  } catch (error) {
    console.error("Error listing specializations:", error)
    return c.json({ success: false, error: "Failed to load specializations" }, 500)
  }
})

// ─── GET /journals/specializations/sync-status — OJS sync per journal (admin) ──
app.get("/specializations/sync-status", requireAdmin, async (c) => {
  try {
    return c.json({ success: true, data: await getAllJournalSyncStatuses() })
  } catch (error) {
    console.error("Error loading specialization sync status:", error)
    return c.json({ success: false, error: "Failed to load sync status" }, 500)
  }
})

// ─── POST /journals/specializations — add a name (admin) ──
app.post("/specializations", requireAdmin, zValidator("json", specializationCreateSchema), async (c) => {
  try {
    const created = await createSpecialization(c.req.valid("json"))
    return c.json({ success: true, data: serializeRecord(created), message: "Specialization added" }, 201)
  } catch (error) {
    return fail(c, error, "Failed to add specialization")
  }
})

// ─── POST /journals/specializations/push-all — re-send every journal to OJS (admin) ──
// Backfill at go-live (existing values were never sent) and recovery after an
// OJS restore. Each journal is queued and attempted once; failures retry.
app.post("/specializations/push-all", requireAdmin, async (c) => {
  try {
    const data = await pushAllSpecializationsToOjs(actorId(c))
    return c.json({ success: true, data, message: `Queued ${data.queued} journals for OJS` })
  } catch (error) {
    return fail(c, error, "Failed to queue journals for OJS")
  }
})

// ─── PATCH /journals/specializations/:specId — rename / reorder / retire (admin) ──
app.patch(
  "/specializations/:specId",
  requireAdmin,
  zValidator("param", specializationIdParamSchema),
  zValidator("json", specializationUpdateSchema),
  async (c) => {
    try {
      const { specId } = c.req.valid("param")
      const result = await updateSpecialization(BigInt(specId), c.req.valid("json"), actorId(c))
      return c.json({
        success: true,
        data: { specialization: serializeRecord(result.specialization), journals_updated: result.journalsUpdated },
        message: "Specialization updated",
      })
    } catch (error) {
      return fail(c, error, "Failed to update specialization")
    }
  }
)

// ─── GET /journals/:id/specialization — one journal by numeric id (admin edit page) ──
app.get("/:id/specialization", requireAdmin, zValidator("param", journalIdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid("param")
    return c.json({ success: true, data: await getJournalSpecialization(BigInt(id)) })
  } catch (error) {
    return fail(c, error, "Failed to load journal")
  }
})

// ─── PUT /journals/:id/specialization — change a journal's specialization (admin) ──
app.put(
  "/:id/specialization",
  requireAdmin,
  zValidator("param", journalIdParamSchema),
  zValidator("json", journalSpecializationSchema),
  async (c) => {
    try {
      const { id } = c.req.valid("param")
      const data = await setJournalSpecialization(BigInt(id), c.req.valid("json").name, actorId(c))
      return c.json({ success: true, data, message: "Specialization updated" })
    } catch (error) {
      return fail(c, error, "Failed to update specialization")
    }
  }
)

// ─── POST /journals/:id/specialization/retry — retry the OJS sync now (admin) ──
app.post("/:id/specialization/retry", requireAdmin, zValidator("param", journalIdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid("param")
    return c.json({ success: true, data: await retryJournalSpecializationSync(BigInt(id)) })
  } catch (error) {
    return fail(c, error, "Failed to retry sync")
  }
})

function actorId(c: Context): bigint | null {
  const session = c.get("session") as { id?: string } | undefined
  return session?.id && /^\d+$/.test(session.id) ? BigInt(session.id) : null
}

function fail(c: Context, error: unknown, fallback: string) {
  if (error instanceof SpecializationError) {
    return c.json({ success: false, error: error.message }, error.status)
  }
  console.error(`${fallback}:`, error)
  return c.json({ success: false, error: fallback }, 500)
}

export { app as specializationRouter }
