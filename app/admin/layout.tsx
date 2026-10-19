"use client"

import type React from "react"
export const dynamic = "force-dynamic"
import { usePathname } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

// Pages that should NOT show the sidebar/header (auth-related pages)
const AUTH_PAGES = [
  "/admin/login",
  "/admin/verify-code",
  "/admin/forgot-password",
  "/admin/reset-password",
]

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p))

  // Auth pages render without the dashboard shell
  if (isAuthPage) {
    return <>{children}</>
  }

  // Dashboard pages render with sidebar + header
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <AdminHeader />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
