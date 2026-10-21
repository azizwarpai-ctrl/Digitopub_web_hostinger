import {
    LayoutDashboard,
    BarChart3,
    BookOpen,
    FileText,
    Eye,
    Users,
    Info,
    LifeBuoy,
    Music,
    Mail,
    MailPlus,
    Settings,
    CreditCard,
    BellRing,
    type LucideIcon,
} from "lucide-react"

export interface AdminNavItem {
    title: string
    href: string
    icon: LucideIcon
}

export interface AdminNavGroup {
    label: string
    items: AdminNavItem[]
}

/**
 * Single source of truth for admin navigation — consumed by the sidebar,
 * the header breadcrumbs, and the command palette's admin group. Parallel
 * work streams add routes by appending ONE entry here instead of editing
 * the sidebar component.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
    {
        label: "Overview",
        items: [
            { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
            { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
        ],
    },
    {
        label: "Publishing",
        items: [
            { title: "Journals", href: "/admin/journals", icon: BookOpen },
            { title: "Submissions", href: "/admin/submissions", icon: FileText },
            { title: "Reviews", href: "/admin/reviews", icon: Eye },
            { title: "Authors", href: "/admin/authors", icon: Users },
        ],
    },
    {
        label: "Content",
        items: [
            { title: "About Page", href: "/admin/about", icon: Info },
            { title: "Help Content", href: "/admin/help-content", icon: LifeBuoy },
            { title: "Article Audio", href: "/admin/article-audio", icon: Music },
        ],
    },
    {
        label: "Communication",
        items: [
            { title: "Messages", href: "/admin/messages", icon: Mail },
            { title: "Email Templates", href: "/admin/email-templates", icon: MailPlus },
            { title: "Notifications", href: "/admin/notifications", icon: BellRing },
        ],
    },
    {
        label: "System",
        items: [
            { title: "Pricing", href: "/admin/pricing", icon: CreditCard },
            { title: "Settings", href: "/admin/settings", icon: Settings },
        ],
    },
]

export const ADMIN_NAV_FLAT: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items)

/** Longest-prefix match so /admin/journals/new resolves to "Journals". */
export function findAdminNavItem(pathname: string): AdminNavItem | undefined {
    let best: AdminNavItem | undefined
    for (const item of ADMIN_NAV_FLAT) {
        if (pathname === item.href || pathname.startsWith(item.href + "/")) {
            if (!best || item.href.length > best.href.length) best = item
        }
    }
    return best
}
