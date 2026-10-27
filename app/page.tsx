import type { Metadata } from "next"

import { prisma } from "@/src/lib/db/config"
import { serializeMany } from "@/src/lib/serialize"
import { buildCanonical } from "@/src/lib/seo/canonical"
import { normalizeOjsAssetUrl } from "@/src/features/ojs/utils/ojs-config"
import type { Journal } from "@/src/features/journals"
import HomePageClient from "@/app/home-page-client"

// Regenerate from the database at most every 5 minutes (ISR). Without this
// the page is built once per deploy and keeps whatever cover URLs the DB held
// at build time: after the 2026-10-27 deploy it served the broken covers for
// hours although the data was already repaired (#148, #239).
export const revalidate = 300

export const metadata: Metadata = {
  title: "DigitoPub — Scientific Journals Platform",
  description:
    "Open-access scientific publishing. Browse peer-reviewed journals, current issues, and archived research articles on DigitoPub.",
  alternates: {
    canonical: buildCanonical("/"),
  },
}

// Fetch a bounded list of journals at request time so the hero / featured
// carousel ships in the initial server HTML. Prisma is local — no OJS call —
// so this is fast and degrades safely if the DB is empty or unreachable.
async function getInitialJournals(): Promise<Journal[]> {
  try {
    const journals = await prisma.journal.findMany({
      orderBy: { created_at: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        cover_image_url: true,
        ojs_id: true,
        ojs_path: true,
      },
    })
    const serialized = serializeMany(journals) as unknown as Journal[]
    return serialized.map((j) => ({
      ...j,
      cover_image_url: normalizeOjsAssetUrl(j.cover_image_url),
    }))
  } catch (err) {
    console.error("[home] prisma.journal.findMany failed; rendering empty initial state:", err)
    return []
  }
}

export default async function HomePage() {
  const initialJournals = await getInitialJournals()
  return <HomePageClient initialJournals={initialJournals} />
}
