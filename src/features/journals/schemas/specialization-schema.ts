import { z } from "zod"

// A specialization name becomes Journal.field (VARCHAR 100) and the OJS
// setting digitopubSpecialization (utf8mb3): no 4-byte characters, no
// control characters.
const specializationName = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be at most 100 characters")
  .refine((v) => !/[\u{10000}-\u{10FFFF}]|\p{Cc}/u.test(v), "Name may only contain plain characters")

export const specializationCreateSchema = z.object({
  name: specializationName,
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
})

export const specializationUpdateSchema = z
  .object({
    name: specializationName.optional(),
    sort_order: z.coerce.number().int().min(0).max(100000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update")

export const specializationIdParamSchema = z.object({
  specId: z.string().regex(/^\d+$/, "Invalid specialization ID"),
})

export const journalSpecializationSchema = z.object({
  name: specializationName,
})

export type SpecializationCreate = z.infer<typeof specializationCreateSchema>
export type SpecializationUpdate = z.infer<typeof specializationUpdateSchema>

export type SyncState = "synced" | "pending" | "failed" | "not_linked" | "never"

export interface SpecializationSyncStatus {
  state: SyncState
  attempts: number
  last_error: string | null
  next_attempt_at: string | null
  completed_at: string | null
  updated_at: string | null
}

export interface SpecializationItem {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  usage_count: number
}
