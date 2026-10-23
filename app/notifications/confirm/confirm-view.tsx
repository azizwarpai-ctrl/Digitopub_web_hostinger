"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    NotificationApiError,
    subscribeErrorMessage,
    useConfirmSubscription,
    useSubscribeAlerts,
} from "@/src/features/notifications/api/use-public-notifications"

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="container max-w-[760px] py-10 lg:py-16 mx-auto px-4 sm:px-6 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                    <MailCheck className="h-7 w-7 text-primary" />
                    Confirm publication alerts
                </h1>
            </header>
            {children}
        </div>
    )
}

function ExpiredForm() {
    const [email, setEmail] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const mutation = useSubscribeAlerts()

    if (message !== null) {
        return (
            <p role="status" className="text-sm leading-relaxed">
                {message}
            </p>
        )
    }

    return (
        <form
            className="space-y-3"
            onSubmit={async (e) => {
                e.preventDefault()
                setError(null)
                try {
                    setMessage(
                        await mutation.mutateAsync({
                            email: email.trim(),
                            journal_ids: [],
                            discipline_ids: [],
                        }),
                    )
                } catch (err) {
                    setError(subscribeErrorMessage(err))
                }
            }}
        >
            <div className="space-y-2">
                <Label htmlFor="resend-email">Email address</Label>
                <Input
                    id="resend-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <Button type="submit" disabled={mutation.isPending || !email.trim()}>
                {mutation.isPending ? "Sending…" : "Send a new confirmation link"}
            </Button>
        </form>
    )
}

export function ConfirmView() {
    const token = useSearchParams().get("token")
    const mutation = useConfirmSubscription()

    if (!token) {
        return (
            <Shell>
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-2">
                    <p className="text-sm">
                        This page needs a confirmation link. Please open the link from your confirmation
                        email.
                    </p>
                </div>
            </Shell>
        )
    }

    if (mutation.isSuccess && mutation.data.status === "test") {
        return (
            <Shell>
                <div role="status" className="rounded-xl border border-border/60 bg-card p-5 space-y-2">
                    <p className="text-sm font-medium">This link came from a test email.</p>
                    <p className="text-sm text-muted-foreground">
                        In a real invitation, this button confirms the subscription. Nothing was changed.
                    </p>
                </div>
            </Shell>
        )
    }

    if (mutation.isSuccess && mutation.data.status !== "test") {
        const { status, manage_url } = mutation.data
        return (
            <Shell>
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                    <p role="status" className="text-sm">
                        {status === "confirmed"
                            ? "Your subscription is confirmed. You will now receive publication alerts."
                            : "This subscription is already active."}
                    </p>
                    <Button asChild variant="outline">
                        <Link href={manage_url}>Manage preferences</Link>
                    </Button>
                </div>
            </Shell>
        )
    }

    const err = mutation.error instanceof NotificationApiError ? mutation.error : null
    const expired = err?.status === 410 || err?.code === "EXPIRED_LINK"
    const invalid = err?.code === "INVALID_LINK"

    if (expired) {
        return (
            <Shell>
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                    <p role="alert" className="text-sm">
                        This confirmation link has expired. Links expire 30 days after they are sent. Enter
                        your email address to receive a new link.
                    </p>
                    <ExpiredForm />
                </div>
            </Shell>
        )
    }

    return (
        <Shell>
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                {invalid ? (
                    <p role="alert" className="text-sm text-destructive">
                        This confirmation link is not valid. Please use the link in your most recent
                        email, or subscribe again.
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Select the button below to confirm that you want to receive publication alerts.
                    </p>
                )}
                {mutation.isError && !invalid && (
                    <p role="alert" className="text-sm text-destructive">
                        Something went wrong. Please try again.
                    </p>
                )}
                {!invalid && (
                    <Button onClick={() => mutation.mutate(token)} disabled={mutation.isPending}>
                        {mutation.isPending ? "Confirming…" : "Confirm subscription"}
                    </Button>
                )}
            </div>
        </Shell>
    )
}
