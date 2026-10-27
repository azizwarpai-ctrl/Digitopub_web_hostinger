"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { DisciplineChecklist } from "@/src/features/notifications/components/get-alerts-dialog"
import {
    NotificationApiError,
    isTestLinkResult,
    usePreferencesLookup,
    useSavePreferences,
    useUnsubscribe,
    type ArticleFrequency,
    type PreferencesLookup,
} from "@/src/features/notifications/api/use-public-notifications"

const FREQUENCIES: Array<{ value: ArticleFrequency; label: string }> = [
    { value: "weekly", label: "Weekly digest" },
    { value: "daily", label: "Daily digest" },
    { value: "off", label: "No article emails" },
]

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="container max-w-[760px] py-10 lg:py-16 mx-auto px-4 sm:px-6 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                    <Settings2 className="h-7 w-7 text-primary" />
                    Manage publication alerts
                </h1>
            </header>
            {children}
        </div>
    )
}

function PreferencesForm({ token, lookup }: { token: string; lookup: PreferencesLookup }) {
    const { subscriber, options } = lookup
    const [journalIds, setJournalIds] = useState<string[]>(subscriber.journal_ids)
    const [disciplineIds, setDisciplineIds] = useState<string[]>(subscriber.discipline_ids)
    const [frequency, setFrequency] = useState<ArticleFrequency>(subscriber.article_frequency)
    const [issueAlerts, setIssueAlerts] = useState(subscriber.issue_alerts)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const save = useSavePreferences()
    const unsubscribe = useUnsubscribe()

    const readOnly = subscriber.status === "bounced" || subscriber.status === "complained"
    const unsubscribed = subscriber.status === "unsubscribed"
    const disabled = readOnly || unsubscribed || save.isPending

    const onSave = async (resume = false) => {
        try {
            await save.mutateAsync({
                token,
                journal_ids: journalIds,
                discipline_ids: disciplineIds,
                article_frequency: frequency,
                issue_alerts: issueAlerts,
                ...(resume ? { resume: true } : {}),
            })
            toast.success(resume ? "Alerts resumed." : "Preferences saved.")
        } catch (err) {
            if (err instanceof NotificationApiError && err.status === 409) {
                toast.error(err.message || "These alerts cannot be changed for this address.")
            } else if (err instanceof NotificationApiError && err.code === "INVALID_LINK") {
                toast.error("This link is not valid.")
            } else {
                toast.error("Something went wrong. Please try again.")
            }
        }
    }

    const onUnsubscribe = async () => {
        try {
            await unsubscribe.mutateAsync(token)
            setConfirmOpen(false)
            toast.success("You have been unsubscribed from all alerts.")
        } catch {
            toast.error("Something went wrong. Please try again.")
        }
    }

    return (
        <Shell>
            <p className="text-sm text-muted-foreground">
                Alerts for <span className="font-medium text-foreground">{subscriber.email}</span>
            </p>

            {subscriber.status === "pending" && (
                <div role="status" className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">
                    Alerts start after you confirm the link we emailed to you.
                </div>
            )}
            {readOnly && (
                <div role="status" className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">
                    Alerts to this address are paused because of a delivery problem or a spam report.
                    Preferences cannot be changed here.
                </div>
            )}
            {unsubscribed && (
                <div
                    role="status"
                    className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm space-y-3"
                >
                    <p>You are unsubscribed and will receive no alert emails.</p>
                    <Button onClick={() => onSave(true)} disabled={save.isPending}>
                        {save.isPending ? "Resuming…" : "Resume alerts"}
                    </Button>
                </div>
            )}

            <section className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h2 className="text-sm font-bold">Followed journals</h2>
                {options.journals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No journals available.</p>
                ) : (
                    <div className="max-h-64 overflow-y-auto space-y-2">
                        {options.journals.map((j) => {
                            const id = `journal-${j.id}`
                            return (
                                <div key={j.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={id}
                                        disabled={disabled}
                                        checked={journalIds.includes(j.id)}
                                        onCheckedChange={(v) =>
                                            setJournalIds((prev) =>
                                                v === true
                                                    ? Array.from(new Set([...prev, j.id]))
                                                    : prev.filter((x) => x !== j.id),
                                            )
                                        }
                                    />
                                    <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                                        {j.title}
                                    </Label>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h2 className="text-sm font-bold">Subject areas</h2>
                <div className="max-h-64 overflow-y-auto">
                    <DisciplineChecklist
                        disciplines={options.disciplines}
                        selected={disciplineIds}
                        onChange={setDisciplineIds}
                        idPrefix="discipline"
                        disabled={disabled}
                    />
                </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                <fieldset className="space-y-2" disabled={disabled}>
                    <legend className="text-sm font-bold mb-2">Article emails</legend>
                    {FREQUENCIES.map((f) => (
                        <label key={f.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="radio"
                                name="article_frequency"
                                value={f.value}
                                checked={frequency === f.value}
                                onChange={() => setFrequency(f.value)}
                                className="h-4 w-4 accent-primary"
                            />
                            {f.label}
                        </label>
                    ))}
                </fieldset>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="issue-alerts" className="text-sm font-bold">
                        New issue alerts
                    </Label>
                    <Switch
                        id="issue-alerts"
                        checked={issueAlerts}
                        onCheckedChange={setIssueAlerts}
                        disabled={disabled}
                    />
                </div>
            </section>

            <div className="flex flex-wrap gap-3">
                {!readOnly && !unsubscribed && (
                    <Button onClick={() => onSave(false)} disabled={save.isPending}>
                        {save.isPending ? "Saving…" : "Save preferences"}
                    </Button>
                )}
                {!unsubscribed && (
                    <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                        Unsubscribe from all
                    </Button>
                )}
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Unsubscribe from all alerts</DialogTitle>
                        <DialogDescription>
                            You will no longer receive any publication alert emails. You can subscribe
                            again at any time.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={onUnsubscribe}
                            disabled={unsubscribe.isPending}
                        >
                            {unsubscribe.isPending ? "Unsubscribing…" : "Unsubscribe"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Shell>
    )
}

export function ManageView() {
    const token = useSearchParams().get("token")
    const query = usePreferencesLookup(token)

    if (!token) {
        return (
            <Shell>
                <p className="text-sm">
                    This page needs a preferences link. Please use the link in one of your alert emails.
                </p>
            </Shell>
        )
    }
    if (query.isLoading) {
        return (
            <Shell>
                <p className="text-sm text-muted-foreground">Loading…</p>
            </Shell>
        )
    }
    if (query.isError || !query.data) {
        const invalid =
            query.error instanceof NotificationApiError && query.error.code === "INVALID_LINK"
        return (
            <Shell>
                <p role="alert" className="text-sm text-destructive">
                    {invalid
                        ? "This preferences link is not valid. Please use the link in your most recent email."
                        : "Something went wrong. Please try again."}
                </p>
            </Shell>
        )
    }
    if (isTestLinkResult(query.data)) {
        return (
            <Shell>
                <div role="status" className="rounded-xl border border-border/60 bg-card p-5 space-y-2">
                    <p className="text-sm font-medium">This link came from a test email.</p>
                    <p className="text-sm text-muted-foreground">
                        In a real email, this page shows the subscriber&apos;s alert preferences. Preference
                        changes are not saved from a test email.
                    </p>
                    <Button asChild variant="outline">
                        <Link href="/">Back to DigitoPub</Link>
                    </Button>
                </div>
            </Shell>
        )
    }
    return <PreferencesForm token={token} lookup={query.data} />
}
