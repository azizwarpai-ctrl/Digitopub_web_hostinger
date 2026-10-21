"use client"

import { useId } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { OrcidSignInCard } from "@/components/auth/orcid-sign-in-card"
import { useIdentity } from "@/src/hooks/use-identity"
import { AlertsSubscribeForm } from "@/src/features/notifications/components/get-alerts-dialog"
import {
    useAccountNotifications,
    useAccountSubscribe,
    useLinkAccountNotifications,
} from "@/src/features/notifications/api/use-public-notifications"

const FREQUENCY_LABEL = { weekly: "Weekly digest", daily: "Daily digest", off: "No article emails" } as const

export default function AccountNotificationsPage() {
    const { data: identity, isLoading } = useIdentity()
    const authenticated = !!identity?.authenticated
    const query = useAccountNotifications()
    const link = useLinkAccountNotifications()
    const subscribe = useAccountSubscribe()
    const prefix = useId().replace(/:/g, "")

    const wrapper = "container max-w-[760px] py-10 lg:py-16 mx-auto px-4 sm:px-6"

    if (isLoading) {
        return (
            <div className={wrapper}>
                <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
        )
    }

    if (!authenticated) {
        return (
            <div className={wrapper}>
                <OrcidSignInCard returnUrl="/account/notifications" />
            </div>
        )
    }

    const state = query.data

    const onLink = async () => {
        try {
            await link.mutateAsync()
            toast.success("Your alerts are now linked to your account.")
        } catch {
            toast.error("We could not link your alerts. Please try again.")
        }
    }

    return (
        <div className={`${wrapper} space-y-6`}>
            <header className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                    <Bell className="h-7 w-7 text-primary" />
                    Publication alerts
                </h1>
                <p className="text-sm text-muted-foreground">
                    Receive email when new articles and issues are published in the journals and subject
                    areas you follow.
                </p>
            </header>

            {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {query.isError && (
                <p role="alert" className="text-sm text-destructive">
                    Something went wrong. Please try again.
                </p>
            )}

            {state?.state === "none" && (
                <div className="rounded-xl border border-border/60 bg-card p-5">
                    <AlertsSubscribeForm
                        submit={(input) =>
                            subscribe.mutateAsync({
                                email: input.email,
                                name: input.name,
                                journal_ids: input.journal_ids,
                                discipline_ids: input.discipline_ids,
                            })
                        }
                        isPending={subscribe.isPending}
                        honeypot={false}
                        idPrefix={prefix}
                    />
                </div>
            )}

            {state?.state === "matchable" && (
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                    <p className="text-sm">We found alerts sent to your verified email.</p>
                    <Button onClick={onLink} disabled={link.isPending}>
                        {link.isPending ? "Linking…" : "Link my alerts"}
                    </Button>
                </div>
            )}

            {state?.state === "linked" && (
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="capitalize">{state.subscriber.status}</dd>
                        <dt className="text-muted-foreground">Article emails</dt>
                        <dd>{FREQUENCY_LABEL[state.subscriber.article_frequency]}</dd>
                        <dt className="text-muted-foreground">New issue alerts</dt>
                        <dd>{state.subscriber.issue_alerts ? "On" : "Off"}</dd>
                    </dl>
                    <Button asChild variant="outline">
                        <Link href={state.manage_url}>Manage preferences</Link>
                    </Button>
                </div>
            )}
        </div>
    )
}
