import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { prisma } from "@/src/lib/db/config"
import { resolveJournalOjsId } from "@/src/features/journals/server/resolve-journal"
import { getAboutTitleBySlug, resolvePolicyRoute } from "@/src/features/journals"
import { buildCanonical } from "@/src/lib/seo/canonical"
import { JournalDetailView } from "@/app/journals/[id]/journal-detail-view"
import {
  TAB_SEGMENTS,
  TAB_TITLES,
  resolveTabSegments,
} from "@/app/journals/[id]/tab-config"

interface JournalTabRouteProps {
  params: Promise<{ id: string; tab: string[] }>
}

const cachedResolveJournalOjsId = cache((id: string) => resolveJournalOjsId(id))

const getJournalTitle = cache(async (id: string): Promise<string | null> => {
  try {
    const select = { title: true } as const
    const byPath = await prisma.journal.findFirst({ where: { ojs_path: id }, select })
    if (byPath) return byPath.title
    const byOjsId = await prisma.journal.findFirst({ where: { ojs_id: id }, select })
    if (byOjsId) return byOjsId.title
    if (/^\d+$/.test(id)) {
      const byId = await prisma.journal.findUnique({ where: { id: BigInt(id) }, select })
      if (byId) return byId.title
    }
  } catch (err) {
    console.error("[journal-tab-route] failed to resolve journal title:", err)
  }
  return null
})

/**
 * Policy tabs for a journal, fetched server-side only when a dynamic
 * (non-canonical) policy slug is requested. `null` when OJS is unavailable.
 */
const getPolicyTabs = cache(async (id: string) => {
  try {
    const ojsResolved = await cachedResolveJournalOjsId(id)
    if (!ojsResolved.found || !ojsResolved.ojsId) return null
    const { isOjsConfigured } = await import("@/src/features/ojs/server/ojs-client")
    if (!isOjsConfigured()) return null
    const { fetchJournalPolicies } = await import("@/src/features/journals/server/journal-policies-service")
    return (await fetchJournalPolicies(ojsResolved.ojsId)).tabs
  } catch (err) {
    console.error("[journal-tab-route] failed to load policy tabs:", err)
    return null
  }
})

/** Shared by generateMetadata and the page so both agree on 404 + title. */
const resolvePolicySlug = cache((id: string, slug: string) =>
  resolvePolicyRoute(slug, () => getPolicyTabs(id)),
)

export async function generateMetadata({
  params,
}: JournalTabRouteProps): Promise<Metadata> {
  const { id, tab } = await params
  const resolved = resolveTabSegments(tab)
  // Signal the 404 here — generateMetadata runs before the response streams,
  // so the status is set cleanly. Doing it only in the page component is too
  // late once the shell has flushed (status stays 200).
  if (!resolved) notFound()

  const [journalTitle, ojsResolved] = await Promise.all([
    getJournalTitle(id),
    cachedResolveJournalOjsId(id),
  ])
  const canonicalId =
    ojsResolved.found && ojsResolved.ojsPath ? ojsResolved.ojsPath : id

  // Determine section title: prefer sub-tab title over main tab title.
  let sectionTitle: string
  if (resolved.tab === "policies" && resolved.policySlug) {
    const policyRoute = await resolvePolicySlug(id, resolved.policySlug)
    if (!policyRoute.found) notFound()
    sectionTitle = policyRoute.title ?? TAB_TITLES.policies
  } else if (resolved.tab === "about" && resolved.aboutSlug) {
    sectionTitle = getAboutTitleBySlug(resolved.aboutSlug) ?? TAB_TITLES.about
  } else {
    sectionTitle = TAB_TITLES[resolved.tab]
  }

  const title = [sectionTitle, journalTitle]
    .filter((part): part is string => Boolean(part))
    .join(" — ")

  // Build the canonical path based on which sub-tab (if any) is active.
  let canonicalPath: string
  if (resolved.tab === "policies" && resolved.policySlug) {
    canonicalPath = `/journals/${canonicalId}/policies/${resolved.policySlug}`
  } else if (resolved.tab === "about" && resolved.aboutSlug) {
    canonicalPath = `/journals/${canonicalId}/about-journal/${resolved.aboutSlug}`
  } else if (resolved.tab === "about") {
    // about-journal with no sub-slug — canonical is the journal root
    canonicalPath = `/journals/${canonicalId}`
  } else {
    canonicalPath = `/journals/${canonicalId}/${TAB_SEGMENTS[resolved.tab]}`
  }
  const canonicalUrl = buildCanonical(canonicalPath)

  const description = journalTitle
    ? `${sectionTitle} for ${journalTitle}.`
    : undefined

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
    },
  }
}

export default async function JournalTabRoute({ params }: JournalTabRouteProps) {
  const { id, tab } = await params
  const resolved = resolveTabSegments(tab)
  if (!resolved) notFound()
  // Repeat the policy check here: metadata may stream after the shell for
  // non-bot requests, so generateMetadata alone can't guarantee the 404.
  if (resolved.tab === "policies" && resolved.policySlug) {
    const policyRoute = await resolvePolicySlug(id, resolved.policySlug)
    if (!policyRoute.found) notFound()
  }

  return (
    <JournalDetailView
      initialTab={resolved.tab}
      initialPolicySlug={resolved.policySlug}
      initialAboutSlug={resolved.aboutSlug}
    />
  )
}
