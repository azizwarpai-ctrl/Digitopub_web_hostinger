import type { SpecializationSyncStatus } from "../schemas/specialization-schema"

/** Journals whose specialization still has to reach OJS (#252): failed or pending, not synced or unlinked. */
export function unsyncedCount(statuses: Record<string, Pick<SpecializationSyncStatus, "state">> | undefined): number {
  if (!statuses) return 0
  return Object.values(statuses).filter((s) => s.state === "failed" || s.state === "pending").length
}
