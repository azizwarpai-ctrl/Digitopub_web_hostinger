"use client"

import { useId, useMemo, useState } from "react"
import { Bell, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    subscribeErrorMessage,
    useNotificationOptions,
    useSubscribeAlerts,
    type AlertDisciplineOption,
    type SubscribeInput,
} from "../api/use-public-notifications"

export const CONSENT_LINE =
    "We will email you a confirmation link. You will receive alerts only after you confirm, and every email has a one-click unsubscribe link."

interface DisciplineChecklistProps {
    disciplines: AlertDisciplineOption[]
    selected: string[]
    onChange: (next: string[]) => void
    idPrefix: string
    disabled?: boolean
}

/** Checkbox tree: top-level disciplines with their children indented. */
export function DisciplineChecklist({
    disciplines,
    selected,
    onChange,
    idPrefix,
    disabled,
}: DisciplineChecklistProps) {
    const { roots, childrenOf } = useMemo(() => {
        const ids = new Set(disciplines.map((d) => d.id))
        const map = new Map<string, AlertDisciplineOption[]>()
        const top: AlertDisciplineOption[] = []
        for (const d of disciplines) {
            if (d.parent_id && ids.has(d.parent_id)) {
                const list = map.get(d.parent_id) ?? []
                list.push(d)
                map.set(d.parent_id, list)
            } else {
                top.push(d)
            }
        }
        return { roots: top, childrenOf: map }
    }, [disciplines])

    const toggle = (id: string, checked: boolean) => {
        onChange(checked ? Array.from(new Set([...selected, id])) : selected.filter((x) => x !== id))
    }

    const row = (d: AlertDisciplineOption, indent: boolean) => {
        const id = `${idPrefix}-${d.id}`
        return (
            <div key={d.id} className={`flex items-center gap-2 ${indent ? "ml-6" : ""}`}>
                <Checkbox
                    id={id}
                    disabled={disabled}
                    checked={selected.includes(d.id)}
                    onCheckedChange={(v) => toggle(d.id, v === true)}
                />
                <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                    {d.name}
                </Label>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {roots.map((d) => (
                <div key={d.id} className="space-y-2">
                    {row(d, false)}
                    {(childrenOf.get(d.id) ?? []).map((c) => row(c, true))}
                </div>
            ))}
        </div>
    )
}

interface AlertsSubscribeFormProps {
    journalId?: string
    journalTitle?: string
    /** Resolves with the generic server message. */
    submit: (input: SubscribeInput) => Promise<string>
    isPending: boolean
    honeypot?: boolean
    idPrefix: string
}

/** Shared subscribe form (dialog and account page). Replaces itself with the generic message on success. */
export function AlertsSubscribeForm({
    journalId,
    journalTitle,
    submit,
    isPending,
    honeypot = true,
    idPrefix,
}: AlertsSubscribeFormProps) {
    const [email, setEmail] = useState("")
    const [name, setName] = useState("")
    const [website, setWebsite] = useState("")
    const [followJournal, setFollowJournal] = useState(true)
    const [disciplineIds, setDisciplineIds] = useState<string[]>([])
    const [showDisciplines, setShowDisciplines] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const options = useNotificationOptions(showDisciplines)

    if (message !== null) {
        return (
            <p role="status" className="text-sm leading-relaxed">
                {message}
            </p>
        )
    }

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        try {
            const msg = await submit({
                email: email.trim(),
                name: name.trim() || undefined,
                journal_ids: journalId && followJournal ? [journalId] : [],
                discipline_ids: disciplineIds,
                website,
            })
            setMessage(msg)
        } catch (err) {
            setError(subscribeErrorMessage(err))
        }
    }

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-email`}>Email address</Label>
                <Input
                    id={`${idPrefix}-email`}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-name`}>Name (optional)</Label>
                <Input
                    id={`${idPrefix}-name`}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>

            {honeypot && (
                <div
                    aria-hidden="true"
                    style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
                >
                    <input
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                    />
                </div>
            )}

            {journalId && (
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`${idPrefix}-journal`}
                        checked={followJournal}
                        onCheckedChange={(v) => setFollowJournal(v === true)}
                    />
                    <Label htmlFor={`${idPrefix}-journal`} className="text-sm font-normal cursor-pointer">
                        Follow {journalTitle || "this journal"}
                    </Label>
                </div>
            )}

            <div className="space-y-2">
                <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-medium text-primary"
                    aria-expanded={showDisciplines}
                    aria-controls={`${idPrefix}-disciplines`}
                    onClick={() => setShowDisciplines((v) => !v)}
                >
                    {showDisciplines ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                    Also follow subject areas (optional)
                </button>
                {showDisciplines && (
                    <div
                        id={`${idPrefix}-disciplines`}
                        className="max-h-48 overflow-y-auto rounded-md border border-border/60 p-3"
                    >
                        {options.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                        {options.isError && (
                            <p className="text-sm text-muted-foreground">Subject areas could not be loaded.</p>
                        )}
                        {options.data && (
                            <DisciplineChecklist
                                disciplines={options.data.disciplines}
                                selected={disciplineIds}
                                onChange={setDisciplineIds}
                                idPrefix={`${idPrefix}-disc`}
                            />
                        )}
                    </div>
                )}
            </div>

            <p className="text-xs text-muted-foreground">{CONSENT_LINE}</p>

            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}

            <Button type="submit" disabled={isPending || !email.trim()} className="w-full sm:w-auto">
                {isPending ? "Sending…" : "Subscribe"}
            </Button>
        </form>
    )
}

export interface GetAlertsButtonProps {
    journalId?: string
    journalTitle?: string
    className?: string
    variant?: React.ComponentProps<typeof Button>["variant"]
}

export function GetAlertsButton({ journalId, journalTitle, className, variant = "outline" }: GetAlertsButtonProps) {
    const [open, setOpen] = useState(false)
    const mutation = useSubscribeAlerts()
    const prefix = useId().replace(/:/g, "")

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant={variant} className={className}>
                    <Bell className="h-4 w-4" />
                    Get alerts
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Publication alerts</DialogTitle>
                    <DialogDescription>
                        Receive an email when new articles and issues are published.
                    </DialogDescription>
                </DialogHeader>
                <AlertsSubscribeForm
                    key={open ? "open" : "closed"}
                    journalId={journalId}
                    journalTitle={journalTitle}
                    submit={(input) => mutation.mutateAsync(input)}
                    isPending={mutation.isPending}
                    idPrefix={prefix}
                />
            </DialogContent>
        </Dialog>
    )
}
