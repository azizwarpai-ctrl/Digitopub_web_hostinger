import type { Metadata } from "next"
import { Suspense } from "react"
import { ManageView } from "./manage-view"

export const metadata: Metadata = {
    title: "Manage publication alerts",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
}

export default function ManageAlertsPage() {
    return (
        <Suspense
            fallback={
                <div className="container max-w-[760px] py-10 lg:py-16 mx-auto px-4 sm:px-6">
                    <p className="text-sm text-muted-foreground">Loading…</p>
                </div>
            }
        >
            <ManageView />
        </Suspense>
    )
}
