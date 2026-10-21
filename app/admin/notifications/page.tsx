"use client"

import Link from "next/link"
import { ArrowRight, Upload, Users } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"

const SECTIONS = [
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
]

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="Manage subscribers and invitation imports" />

      <div className="grid gap-4 md:grid-cols-2">
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
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
