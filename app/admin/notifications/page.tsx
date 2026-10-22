"use client"

import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Mail,
  Send,
  Settings,
  SlidersHorizontal,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useNotificationOverview } from "@/src/features/notifications/api/use-campaigns"
import {
  CampaignStatusBadge,
  campaignTypeLabel,
} from "@/src/features/notifications/components/campaigns/campaign-status"

const SECTIONS: { href: string; title: string; description: string; icon: LucideIcon }[] = [
  {
    href: "/admin/notifications/campaigns",
    title: "Campaigns",
    description: "Review draft notifications, send a test, then approve, schedule, pause or cancel.",
    icon: Send,
  },
  {
    href: "/admin/notifications/subscribers",
    title: "Subscribers",
    description: "Search, filter and edit the people who receive journal updates. Export the list as CSV.",
    icon: Users,
  },
  {
    href: "/admin/notifications/imports",
    title: "Imports",
    description: "Upload a spreadsheet of researchers, map its columns and interests, then queue an invitation draft.",
    icon: Upload,
  },
  {
    href: "/admin/notifications/rules",
    title: "Rules",
    description: "Choose which publication events create draft campaigns and which template they use.",
    icon: SlidersHorizontal,
  },
  {
    href: "/admin/notifications/disciplines",
    title: "Disciplines",
    description: "Maintain the discipline taxonomy and assign disciplines to journals and sections.",
    icon: BookOpen,
  },
  {
    href: "/admin/notifications/settings",
    title: "Settings",
    description: "Publisher address, weekly digest day and read-only delivery limits.",
    icon: Settings,
  },
]

function Kpi({ label, value, href, loading }: { label: string; value?: number; href?: string; loading: boolean }) {
  const body = (
    <Card className={href ? "h-full transition-colors group-hover:border-primary/50" : "h-full"}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">
          {loading ? <Skeleton className="h-9 w-16" /> : (value ?? 0).toLocaleString()}
        </CardTitle>
      </CardHeader>
    </Card>
  )
  return href ? (
    <Link href={href} className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {body}
    </Link>
  ) : (
    body
  )
}

export default function NotificationsPage() {
  const { data, isLoading, isError, error } = useNotificationOverview()

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="Subscribers, campaigns and publication alerts" />

      {isError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error?.message || "Failed to load the overview"}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Active subscribers" value={data?.subscribers.active} loading={isLoading} />
        <Kpi label="Pending confirmation" value={data?.subscribers.pending} loading={isLoading} />
        <Kpi label="Suppressed" value={data?.subscribers.suppressed} loading={isLoading} />
        <Kpi label="Emails sent, last 7 days" value={data?.sent_7d} loading={isLoading} />
        <Kpi
          label="Drafts awaiting approval"
          value={data?.drafts_awaiting}
          href="/admin/notifications/campaigns?status=draft"
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent campaigns</CardTitle>
          <CardDescription>The latest campaigns across all types.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data || data.recent_campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <ul className="divide-y">
              {data.recent_campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/notifications/campaigns/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium">
                        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{c.subject}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {campaignTypeLabel(c.type)} - {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <CampaignStatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <CardTitle>{title}</CardTitle>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
