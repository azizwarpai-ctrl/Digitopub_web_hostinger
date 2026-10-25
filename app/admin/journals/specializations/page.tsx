"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Pencil, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  useCreateSpecialization,
  useGetManagedSpecializations,
  useUpdateSpecialization,
} from "@/src/features/journals/api/use-specializations"

export default function SpecializationsPage() {
  const { data, isLoading, isError, error } = useGetManagedSpecializations()
  const create = useCreateSpecialization()
  const update = useUpdateSpecialization()

  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    create.mutate({ name }, { onSuccess: () => setNewName("") })
  }

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
  }

  const saveEdit = (id: string, original: string) => {
    const name = editName.trim()
    if (!name || name === original) {
      setEditingId(null)
      return
    }
    update.mutate({ id, name }, { onSuccess: () => setEditingId(null) })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon">
          <Link href="/admin/journals" aria-label="Back to journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journal Specializations</h1>
          <p className="text-muted-foreground mt-1">
            Renaming updates every journal using that name and syncs it to OJS; retiring keeps existing journals but hides the name from choices.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add specialization</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2 sm:w-80">
              <Label htmlFor="new-specialization">Name</Label>
              <Input
                id="new-specialization"
                value={newName}
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Dentistry"
              />
            </div>
            <Button type="submit" disabled={create.isPending || !newName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              {create.isPending ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All specializations</CardTitle>
          <CardDescription>Usage count is the number of journals currently using the name.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-40 w-full" />}
          {isError && <p className="text-sm text-destructive">Error loading specializations: {error.message}</p>}
          {data && data.length === 0 && <p className="text-sm text-muted-foreground">No specializations yet.</p>}
          {data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Journals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sort order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => {
                  const editing = editingId === s.id
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {editing ? (
                          <form
                            className="flex items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault()
                              saveEdit(s.id, s.name)
                            }}
                          >
                            <Input
                              aria-label={`New name for ${s.name}`}
                              value={editName}
                              maxLength={100}
                              autoFocus
                              onChange={(e) => setEditName(e.target.value)}
                              className="max-w-xs"
                            />
                            <Button type="submit" size="sm" disabled={update.isPending}>
                              <Check className="mr-1 h-4 w-4" />
                              Save
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              <X className="mr-1 h-4 w-4" />
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          s.name
                        )}
                      </TableCell>
                      <TableCell>{s.usage_count}</TableCell>
                      <TableCell>
                        <Badge variant={s.is_active ? "default" : "outline"}>{s.is_active ? "Active" : "Retired"}</Badge>
                      </TableCell>
                      <TableCell>{s.sort_order}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!editing && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="bg-transparent"
                              onClick={() => startEdit(s.id, s.name)}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Rename
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-transparent"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: s.id, is_active: !s.is_active })}
                          >
                            {s.is_active ? "Retire" : "Restore"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
