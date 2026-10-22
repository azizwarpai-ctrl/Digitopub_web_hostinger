"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Pencil, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
  useCreateDiscipline,
  useSetJournalDisciplines,
  useSetSectionDisciplines,
  useTaxonomy,
  useUpdateDiscipline,
  type Taxonomy,
  type TaxonomyDiscipline,
  type TaxonomyJournal,
} from "@/src/features/notifications/api/use-notification-config"

const NO_PARENT = "none"

function parseSynonyms(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function bySortOrder(a: TaxonomyDiscipline, b: TaxonomyDiscipline): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

interface TreeItem {
  discipline: TaxonomyDiscipline
  depth: number
}

function buildTree(disciplines: TaxonomyDiscipline[]): TreeItem[] {
  const ids = new Set(disciplines.map((d) => d.id))
  const children = new Map<string, TaxonomyDiscipline[]>()
  const roots: TaxonomyDiscipline[] = []
  for (const d of disciplines) {
    if (d.parent_id && ids.has(d.parent_id)) {
      const list = children.get(d.parent_id) ?? []
      list.push(d)
      children.set(d.parent_id, list)
    } else {
      roots.push(d)
    }
  }
  const out: TreeItem[] = []
  const visit = (d: TaxonomyDiscipline, depth: number, seen: Set<string>) => {
    if (seen.has(d.id)) return
    seen.add(d.id)
    out.push({ discipline: d, depth })
    for (const child of (children.get(d.id) ?? []).sort(bySortOrder)) visit(child, depth + 1, seen)
  }
  const seen = new Set<string>()
  for (const root of roots.sort(bySortOrder)) visit(root, 0, seen)
  return out
}

function descendantIds(disciplines: TaxonomyDiscipline[], id: string): Set<string> {
  const result = new Set<string>()
  const walk = (parent: string) => {
    for (const d of disciplines) {
      if (d.parent_id === parent && !result.has(d.id)) {
        result.add(d.id)
        walk(d.id)
      }
    }
  }
  walk(id)
  return result
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
      {message}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

interface DisciplineChecksProps {
  idPrefix: string
  legend: string
  disciplines: TaxonomyDiscipline[]
  selected: string[]
  onChange: (ids: string[]) => void
}

function DisciplineChecks({ idPrefix, legend, disciplines, selected, onChange }: DisciplineChecksProps) {
  const items = useMemo(() => buildTree(disciplines), [disciplines])
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((s) => s !== id))

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No disciplines available.</p>
        ) : (
          items.map(({ discipline, depth }) => (
            <div key={discipline.id} className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
              <Checkbox
                id={`${idPrefix}-${discipline.id}`}
                checked={selected.includes(discipline.id)}
                onCheckedChange={(c) => toggle(discipline.id, c === true)}
              />
              <Label htmlFor={`${idPrefix}-${discipline.id}`} className="font-normal">
                {discipline.name}
                {!discipline.is_active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
              </Label>
            </div>
          ))
        )}
      </div>
    </fieldset>
  )
}

/* ------------------------------ Disciplines tab ------------------------------ */

interface DisciplineFormProps {
  mode: "create" | "edit"
  discipline?: TaxonomyDiscipline
  disciplines: TaxonomyDiscipline[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DisciplineDialog({ mode, discipline, disciplines, open, onOpenChange }: DisciplineFormProps) {
  const create = useCreateDiscipline()
  const update = useUpdateDiscipline()
  const [name, setName] = useState(discipline?.name ?? "")
  const [parentId, setParentId] = useState(discipline?.parent_id ?? NO_PARENT)
  const [synonyms, setSynonyms] = useState((discipline?.synonyms ?? []).join("\n"))
  const [sortOrder, setSortOrder] = useState(String(discipline?.sort_order ?? 0))

  const blocked = useMemo(() => {
    if (!discipline) return new Set<string>()
    const set = descendantIds(disciplines, discipline.id)
    set.add(discipline.id)
    return set
  }, [disciplines, discipline])
  const parentOptions = buildTree(disciplines).filter((i) => !blocked.has(i.discipline.id))
  const pending = create.isPending || update.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parent = parentId === NO_PARENT ? null : parentId
    const synonymList = parseSynonyms(synonyms)
    const done = { onSuccess: () => onOpenChange(false) }
    if (mode === "create") {
      create.mutate({ name: name.trim(), parent_id: parent, synonyms: synonymList }, done)
    } else if (discipline) {
      const order = Number.parseInt(sortOrder, 10)
      update.mutate(
        {
          id: discipline.id,
          json: {
            name: name.trim(),
            parent_id: parent,
            synonyms: synonymList,
            sort_order: Number.isNaN(order) ? discipline.sort_order : order,
          },
        },
        done,
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Add discipline" : "Edit discipline"}</DialogTitle>
            <DialogDescription>
              Synonyms help match imported subscriber terms to this discipline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${mode}-discipline-name`}>Name</Label>
            <Input
              id={`${mode}-discipline-name`}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${mode}-discipline-parent`}>Parent discipline (optional)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id={`${mode}-discipline-parent`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>No parent</SelectItem>
                {parentOptions.map(({ discipline: d, depth }) => (
                  <SelectItem key={d.id} value={d.id}>
                    {`${"  ".repeat(depth)}${d.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${mode}-discipline-synonyms`}>Synonyms</Label>
            <Textarea
              id={`${mode}-discipline-synonyms`}
              rows={4}
              value={synonyms}
              onChange={(e) => setSynonyms(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Separate synonyms with commas or new lines.</p>
          </div>
          {mode === "edit" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-discipline-sort">Sort order</Label>
              <Input
                id="edit-discipline-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving..." : mode === "create" ? "Add discipline" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DisciplinesTab() {
  const { data, isLoading, isError, error } = useTaxonomy()
  const update = useUpdateDiscipline()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<TaxonomyDiscipline | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const disciplines = useMemo(() => data?.disciplines ?? [], [data])
  const tree = useMemo(() => buildTree(disciplines), [disciplines])

  const toggleActive = (d: TaxonomyDiscipline, isActive: boolean) => {
    setPendingId(d.id)
    update.mutate({ id: d.id, json: { is_active: isActive } }, { onSettled: () => setPendingId(null) })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Disciplines</CardTitle>
          <CardDescription>
            Subscribers choose from active disciplines. Deactivating a discipline hides it from the sign-up form.
          </CardDescription>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add discipline
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <LoadError message={error?.message || "Failed to load disciplines"} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Subscribers</TableHead>
                  <TableHead className="text-right">Journals</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tree.map(({ discipline: d, depth }) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium" style={{ paddingLeft: 16 + depth * 20 }}>
                      {d.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.slug}</TableCell>
                    <TableCell>
                      <Switch
                        checked={d.is_active}
                        disabled={pendingId === d.id}
                        aria-label={`Active: ${d.name}`}
                        onCheckedChange={(v) => toggleActive(d, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">{d._count.subscribers}</TableCell>
                    <TableCell className="text-right">{d._count.journals}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(d)}
                        aria-label={`Edit ${d.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {tree.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No disciplines yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {addOpen && (
        <DisciplineDialog mode="create" disciplines={disciplines} open onOpenChange={setAddOpen} />
      )}
      {editing && (
        <DisciplineDialog
          key={editing.id}
          mode="edit"
          discipline={editing}
          disciplines={disciplines}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </Card>
  )
}

/* ---------------------------- Journal mapping tab ---------------------------- */

function JournalMappingRow({ journal, disciplines }: { journal: TaxonomyJournal; disciplines: TaxonomyDiscipline[] }) {
  const save = useSetJournalDisciplines()
  const [selected, setSelected] = useState<string[]>(journal.discipline_ids)
  const dirty =
    selected.length !== journal.discipline_ids.length || selected.some((id) => !journal.discipline_ids.includes(id))
  const names = disciplines.filter((d) => selected.includes(d.id)).map((d) => d.name)

  return (
    <TableRow>
      <TableCell className="font-medium">{journal.title}</TableCell>
      <TableCell>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-xs justify-between">
              <span className="truncate">
                {names.length === 0 ? "No disciplines" : `${names.length} selected`}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <DisciplineChecks
              idPrefix={`journal-${journal.id}`}
              legend={`Disciplines for ${journal.title}`}
              disciplines={disciplines}
              selected={selected}
              onChange={setSelected}
            />
          </PopoverContent>
        </Popover>
        {names.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{names.join(", ")}</p>}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate({ id: journal.id, discipline_ids: selected })}
        >
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function JournalMappingTab() {
  const { data, isLoading, isError, error } = useTaxonomy()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal mapping</CardTitle>
        <CardDescription>
          Publications from a journal are matched to subscribers who follow its disciplines.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton />
        ) : isError || !data ? (
          <LoadError message={error?.message || "Failed to load journals"} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Journal</TableHead>
                  <TableHead>Disciplines</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.journals.map((j) => (
                  <JournalMappingRow
                    key={`${j.id}:${j.discipline_ids.join(",")}`}
                    journal={j}
                    disciplines={data.disciplines}
                  />
                ))}
                {data.journals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No journals found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------- Section mapping tab ---------------------------- */

function SectionMappingBody({ data }: { data: Taxonomy }) {
  const save = useSetSectionDisciplines()
  const [sectionId, setSectionId] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const validId = /^\d+$/.test(sectionId.trim())
  const nameOf = (id: string) => data.disciplines.find((d) => d.id === id)?.name ?? id

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validId) return
    save.mutate(
      { id: sectionId.trim(), discipline_ids: selected },
      {
        onSuccess: () => {
          setSectionId("")
          setSelected([])
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="section-id">OJS section id</Label>
          <Input
            id="section-id"
            inputMode="numeric"
            placeholder="For example 12"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Saving an existing id replaces its disciplines. Saving with none selected removes the mapping.
          </p>
        </div>
        <DisciplineChecks
          idPrefix="section"
          legend="Disciplines"
          disciplines={data.disciplines}
          selected={selected}
          onChange={setSelected}
        />
        <Button type="submit" disabled={!validId || save.isPending}>
          {save.isPending ? "Saving..." : "Save section mapping"}
        </Button>
      </form>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OJS section id</TableHead>
              <TableHead>Disciplines</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sections.map((s) => (
              <TableRow key={String(s.ojs_section_id)}>
                <TableCell className="font-medium">{String(s.ojs_section_id)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.discipline_ids.length === 0 ? (
                      <span className="text-sm text-muted-foreground">None</span>
                    ) : (
                      s.discipline_ids.map((id) => (
                        <Badge key={id} variant="secondary">
                          {nameOf(id)}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSectionId(String(s.ojs_section_id))
                      setSelected(s.discipline_ids)
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.sections.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  No section mappings yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function SectionMappingTab() {
  const { data, isLoading, isError, error } = useTaxonomy()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section mapping</CardTitle>
        <CardDescription>
          Map an OJS section to disciplines when it differs from its journal, for example a section on a single topic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton />
        ) : isError || !data ? (
          <LoadError message={error?.message || "Failed to load section mappings"} />
        ) : (
          <SectionMappingBody data={data} />
        )}
      </CardContent>
    </Card>
  )
}
