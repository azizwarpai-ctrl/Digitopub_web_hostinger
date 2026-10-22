"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  useDeleteRule,
  useNotificationTemplates,
  useRules,
  useTaxonomy,
  useUpsertRule,
  type NotificationRule,
  type NotificationTemplate,
  type RuleEventType,
  type RuleScope,
  type RuleUpsertInput,
} from "@/src/features/notifications/api/use-notification-config"

const DEFAULT_TEMPLATE = "default"
const EVENT_TYPES: RuleEventType[] = ["issue_published", "article_digest"]

interface Target {
  key: string
  scope: RuleScope
  journalId: string | null
  disciplineId: string | null
  name: string
}

interface RuleValues {
  enabled: boolean
  auto_draft: boolean
  template_id: string | null
}

const GLOBAL_TARGET: Target = {
  key: "global",
  scope: "global",
  journalId: null,
  disciplineId: null,
  name: "Global defaults",
}

function ruleValues(rule: NotificationRule | undefined): RuleValues {
  // A missing global rule behaves as enabled with auto-draft.
  return rule
    ? { enabled: rule.enabled, auto_draft: rule.auto_draft, template_id: rule.template_id }
    : { enabled: true, auto_draft: true, template_id: null }
}

function buildInput(target: Target, eventType: RuleEventType, values: RuleValues): RuleUpsertInput {
  const input: RuleUpsertInput = {
    scope: target.scope,
    event_type: eventType,
    enabled: values.enabled,
    auto_draft: values.auto_draft,
    template_id: values.template_id,
  }
  if (target.scope === "journal" && target.journalId) input.journal_id = target.journalId
  if (target.scope === "discipline" && target.disciplineId) input.discipline_id = target.disciplineId
  return input
}

function targetKey(rule: NotificationRule): string {
  if (rule.scope === "global") return "global"
  return rule.scope === "journal" ? `journal:${rule.journal_id}` : `discipline:${rule.discipline_id}`
}

interface RuleRowProps {
  target: Target
  rules: Partial<Record<RuleEventType, NotificationRule>>
  templates: NotificationTemplate[]
  busy: boolean
  onChange: (target: Target, eventType: RuleEventType, patch: Partial<RuleValues>) => void
  onTemplate: (target: Target, eventType: RuleEventType, templateId: string | null) => void
  onDelete?: (target: Target) => void
}

function RuleRow({ target, rules, templates, busy, onChange, onTemplate, onDelete }: RuleRowProps) {
  const issue = ruleValues(rules.issue_published)
  const digest = ruleValues(rules.article_digest)
  const slug = target.key.replace(/[^a-z0-9]+/gi, "-")

  const switchPair = (eventType: RuleEventType, values: RuleValues, label: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Switch
          id={`${slug}-${eventType}-enabled`}
          checked={values.enabled}
          disabled={busy}
          aria-label={`${label} enabled for ${target.name}`}
          onCheckedChange={(v) => onChange(target, eventType, { enabled: v })}
        />
        <Label htmlFor={`${slug}-${eventType}-enabled`} className="text-xs font-normal">
          Enabled
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={`${slug}-${eventType}-draft`}
          checked={values.auto_draft}
          disabled={busy}
          aria-label={`${label} auto-draft for ${target.name}`}
          onCheckedChange={(v) => onChange(target, eventType, { auto_draft: v })}
        />
        <Label htmlFor={`${slug}-${eventType}-draft`} className="text-xs font-normal">
          Auto-draft
        </Label>
      </div>
    </div>
  )

  return (
    <TableRow>
      <TableCell className="font-medium">
        {target.name}
        {target.scope !== "global" && (
          <span className="block text-xs font-normal capitalize text-muted-foreground">{target.scope}</span>
        )}
      </TableCell>
      <TableCell>{switchPair("issue_published", issue, "New issue alerts")}</TableCell>
      <TableCell>{switchPair("article_digest", digest, "Article digests")}</TableCell>
      <TableCell>
        {/* Issue alerts and digests use different templates, so each event type has its own override. */}
        <div className="flex flex-col gap-2">
          {(
            [
              ["issue_published", "Issue"],
              ["article_digest", "Digest"],
            ] as const
          ).map(([eventType, label]) => (
            <Select
              key={eventType}
              value={rules[eventType]?.template_id ?? DEFAULT_TEMPLATE}
              disabled={busy}
              onValueChange={(v) => onTemplate(target, eventType, v === DEFAULT_TEMPLATE ? null : v)}
            >
              <SelectTrigger className="w-full min-w-40" aria-label={`${label} template override for ${target.name}`}>
                <span className="mr-1 text-xs text-muted-foreground">{label}:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_TEMPLATE}>Default</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(target)}
            aria-label={`Delete override for ${target.name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function RulesMatrix() {
  const rulesQuery = useRules()
  const taxonomy = useTaxonomy()
  const templatesQuery = useNotificationTemplates()
  const upsert = useUpsertRule()
  const remove = useDeleteRule()

  const [busyKeys, setBusyKeys] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null)
  const [addScope, setAddScope] = useState<"journal" | "discipline">("journal")
  const [addTargetId, setAddTargetId] = useState("")

  const templates = templatesQuery.data ?? []

  const { groups, order } = useMemo(() => {
    const map = new Map<string, { target: Target; rules: Partial<Record<RuleEventType, NotificationRule>> }>()
    const keys: string[] = []
    for (const rule of rulesQuery.data ?? []) {
      const key = targetKey(rule)
      let entry = map.get(key)
      if (!entry) {
        const target: Target =
          rule.scope === "global"
            ? GLOBAL_TARGET
            : {
                key,
                scope: rule.scope,
                journalId: rule.journal_id,
                disciplineId: rule.discipline_id,
                name: rule.target_name ?? key,
              }
        entry = { target, rules: {} }
        map.set(key, entry)
        if (key !== "global") keys.push(key)
      }
      entry.rules[rule.event_type] = rule
    }
    if (!map.has("global")) map.set("global", { target: GLOBAL_TARGET, rules: {} })
    keys.sort((a, b) => {
      const ea = map.get(a)
      const eb = map.get(b)
      return (ea?.target.name ?? "").localeCompare(eb?.target.name ?? "")
    })
    return { groups: map, order: keys }
  }, [rulesQuery.data])

  const global = groups.get("global")
  const globalRules = global?.rules ?? {}

  const withBusy = async (key: string, fn: () => Promise<unknown>) => {
    setBusyKeys((k) => [...k, key])
    try {
      await fn()
    } catch {
      // The mutation hooks already show an error toast.
    } finally {
      setBusyKeys((k) => k.filter((x) => x !== key))
    }
  }

  const handleChange = (target: Target, eventType: RuleEventType, patch: Partial<RuleValues>) => {
    const entry = groups.get(target.key)
    const current = ruleValues(entry?.rules[eventType])
    return withBusy(target.key, () => upsert.mutateAsync(buildInput(target, eventType, { ...current, ...patch })))
  }

  const handleTemplate = (target: Target, eventType: RuleEventType, templateId: string | null) => {
    const entry = groups.get(target.key)
    const current = ruleValues(entry?.rules[eventType])
    return withBusy(target.key, () => upsert.mutateAsync(buildInput(target, eventType, { ...current, template_id: templateId })))
  }

  const confirmDelete = () => {
    const target = deleteTarget
    if (!target) return
    setDeleteTarget(null)
    const entry = groups.get(target.key)
    const ids = EVENT_TYPES.map((e) => entry?.rules[e]?.id).filter((id): id is string => !!id)
    void withBusy(target.key, async () => {
      for (const id of ids) await remove.mutateAsync({ id })
      toast.success("Override removed")
    })
  }

  const usedKeys = new Set(order)
  const addOptions =
    addScope === "journal"
      ? (taxonomy.data?.journals ?? [])
          .filter((j) => !usedKeys.has(`journal:${j.id}`))
          .map((j) => ({ id: j.id, label: j.title }))
      : (taxonomy.data?.disciplines ?? [])
          .filter((d) => !usedKeys.has(`discipline:${d.id}`))
          .map((d) => ({ id: d.id, label: d.name }))

  const addOverride = () => {
    const option = addOptions.find((o) => o.id === addTargetId)
    if (!option) return
    const target: Target = {
      key: `${addScope}:${option.id}`,
      scope: addScope,
      journalId: addScope === "journal" ? option.id : null,
      disciplineId: addScope === "discipline" ? option.id : null,
      name: option.label,
    }
    void withBusy("add", async () => {
      for (const eventType of EVENT_TYPES) {
        await upsert.mutateAsync(buildInput(target, eventType, ruleValues(globalRules[eventType])))
      }
      setAddTargetId("")
      toast.success("Override added")
    })
  }

  const isLoading = rulesQuery.isLoading || templatesQuery.isLoading
  const adding = busyKeys.includes("add")

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notification rules</CardTitle>
          <CardDescription>
            The most specific rule applies: journal, then discipline, then global. Changes are saved as you make them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : rulesQuery.isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
              {rulesQuery.error?.message || "Failed to load rules"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope target</TableHead>
                    <TableHead>New issue alerts</TableHead>
                    <TableHead>Article digests</TableHead>
                    <TableHead>Template override</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <RuleRow
                    target={GLOBAL_TARGET}
                    rules={globalRules}
                    templates={templates}
                    busy={busyKeys.includes("global")}
                    onChange={handleChange}
                    onTemplate={handleTemplate}
                  />
                  {order.map((key) => {
                    const entry = groups.get(key)
                    if (!entry) return null
                    return (
                      <RuleRow
                        key={key}
                        target={entry.target}
                        rules={entry.rules}
                        templates={templates}
                        busy={busyKeys.includes(key)}
                        onChange={handleChange}
                        onTemplate={handleTemplate}
                        onDelete={setDeleteTarget}
                      />
                    )
                  })}
                  {order.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No overrides yet. Every journal and discipline follows the global defaults.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add override</CardTitle>
          <CardDescription>
            The new override starts with a copy of the current global values for both alert types.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="override-scope">Applies to</Label>
              <Select
                value={addScope}
                onValueChange={(v) => {
                  setAddScope(v === "discipline" ? "discipline" : "journal")
                  setAddTargetId("")
                }}
              >
                <SelectTrigger id="override-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="journal">Journal</SelectItem>
                  <SelectItem value="discipline">Discipline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="override-target">{addScope === "journal" ? "Journal" : "Discipline"}</Label>
              <Select value={addTargetId} onValueChange={setAddTargetId}>
                <SelectTrigger id="override-target" className="w-full">
                  <SelectValue placeholder={`Choose a ${addScope}`} />
                </SelectTrigger>
                <SelectContent>
                  {addOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addOverride} disabled={!addTargetId || adding}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {adding ? "Adding..." : "Add override"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this override?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} will go back to following the global defaults for both new issue alerts and
              article digests.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
