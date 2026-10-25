import { redirect } from "next/navigation"
import { getSession } from "@/src/lib/db/auth"
import { prisma } from "@/src/lib/db/config"
import { normalizeOjsAssetUrl } from "@/src/features/ojs/utils/ojs-config"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { JournalsTable, type JournalRow } from "./journals-table"
import { PageHeader } from "@/components/ui/page-header"

export default async function JournalsPage() {
  const session = await getSession()

  if (!session) {
    redirect("/admin/login")
  }

  // Fetch all journals
  let journals: any[] = []
  let error: Error | null = null

  try {
    journals = await prisma.journal.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        creator: {
          select: {
            full_name: true
          }
        }
      }
    })
    journals = journals.map((j) => ({
      ...j,
      cover_image_url: normalizeOjsAssetUrl(j.cover_image_url),
    }))
  } catch (e) {
    error = e as Error
  }

  // Serialize BigInt-safe plain rows for the client table
  const rows: JournalRow[] = journals.map((j) => ({
    id: String(j.id),
    title: j.title,
    abbreviation: j.abbreviation ?? null,
    issn: j.issn ?? null,
    field: j.field,
    ojsPath: j.ojs_path ?? null,
    status: j.status ?? "unknown",
    coverImageUrl: j.cover_image_url ?? null,
    createdAt: new Date(j.created_at).toISOString(),
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Journal Management" subtitle="Manage all scientific journals in the system">
        <Button asChild>
          <Link href="/admin/journals/new">
            <Plus className="mr-2 h-4 w-4" />
            Add New Journal
          </Link>
        </Button>
      </PageHeader>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">Error loading journals: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}

      <JournalsTable rows={rows} />
    </div>
  )
}
