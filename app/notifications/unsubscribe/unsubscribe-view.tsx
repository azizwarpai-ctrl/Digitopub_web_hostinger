"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    NotificationApiError,
    useUnsubscribe,
} from "@/src/features/notifications/api/use-public-notifications"

export function UnsubscribeView() {
    const token = useSearchParams().get("token")
    const mutation = useUnsubscribe()
    const invalid =
        mutation.error instanceof NotificationApiError && mutation.error.code === "INVALID_LINK"

    return (
        <div className="container max-w-[760px] py-10 lg:py-16 mx-auto px-4 sm:px-6 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                    <BellOff className="h-7 w-7 text-primary" />
                    Unsubscribe from publication alerts
                </h1>
            </header>
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                {!token ? (
                    <p className="text-sm">
                        This page needs an unsubscribe link. Please use the link at the bottom of an alert
                        email.
                    </p>
                ) : mutation.isSuccess && mutation.data.data?.status === "test" ? (
                    <div role="status" className="space-y-2">
                        <p className="text-sm font-medium">This link came from a test email.</p>
                        <p className="text-sm text-muted-foreground">
                            In a real email, this button stops all alert emails. Nothing was unsubscribed.
                        </p>
                        <Button asChild variant="outline">
                            <Link href="/">Back to DigitoPub</Link>
                        </Button>
                    </div>
                ) : mutation.isSuccess ? (
                    <div className="space-y-4">
                        <p role="status" className="text-sm">
                            You have been unsubscribed and will receive no further alerts. You can subscribe
                            again at any time from a journal page.
                        </p>
                        <Button asChild variant="outline">
                            <Link href="/">Back to DigitoPub</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Select the button below to stop all publication alert emails.
                        </p>
                        {mutation.isError && (
                            <p role="alert" className="text-sm text-destructive">
                                {invalid
                                    ? "This unsubscribe link is not valid."
                                    : "Something went wrong. Please try again."}
                            </p>
                        )}
                        <Button
                            onClick={() => mutation.mutate(token)}
                            disabled={mutation.isPending}
                            variant="destructive"
                        >
                            {mutation.isPending ? "Unsubscribing…" : "Unsubscribe"}
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}
