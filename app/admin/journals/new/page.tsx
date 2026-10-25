"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useGetSpecializations } from "@/src/features/journals/api/use-specializations"


export default function NewJournalPage() {
  const router = useRouter()
  const { data: specializations, isLoading: specsLoading, isError: specsError } = useGetSpecializations()
  const fields = (specializations ?? []).map((s) => s.name)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: "",
    abbreviation: "",
    issn: "",
    e_issn: "",
    description: "",
    field: "",
    publisher: "",
    editor_in_chief: "",
    frequency: "",
    submission_fee: "",
    publication_fee: "",
    cover_image_url: "",
    website_url: "",
    status: "active",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/journals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          abbreviation: formData.abbreviation,
          issn: formData.issn,
          e_issn: formData.e_issn,
          description: formData.description,
          field: formData.field,
          publisher: formData.publisher,
          editor_in_chief: formData.editor_in_chief,
          frequency: formData.frequency,
          submission_fee: formData.submission_fee ? parseFloat(formData.submission_fee) : 0,
          publication_fee: formData.publication_fee ? parseFloat(formData.publication_fee) : 0,
          cover_image_url: formData.cover_image_url,
          website_url: formData.website_url,
          status: formData.status,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create journal")
      }

      router.push("/admin/journals")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon">
          <Link href="/admin/journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Add New Journal</h1>
          <p className="text-muted-foreground mt-1">Create a new scientific journal in the system</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Journal Title *</Label>
                <Input
                  id="title"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Journal of Advanced Medicine"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="abbreviation">Abbreviation</Label>
                <Input
                  id="abbreviation"
                  value={formData.abbreviation}
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                  placeholder="e.g., J Adv Med"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issn">ISSN</Label>
                <Input
                  id="issn"
                  value={formData.issn}
                  onChange={(e) => setFormData({ ...formData, issn: e.target.value })}
                  placeholder="e.g., 2234-5678"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="e_issn">E-ISSN</Label>
                <Input
                  id="e_issn"
                  value={formData.e_issn}
                  onChange={(e) => setFormData({ ...formData, e_issn: e.target.value })}
                  placeholder="e.g., 2234-5679"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="field">Field *</Label>
                <Select
                  required
                  value={formData.field}
                  onValueChange={(value) => setFormData({ ...formData, field: value })}
                  disabled={specsLoading || fields.length === 0}
                >
                  <SelectTrigger id="field">
                    <SelectValue
                      placeholder={
                        specsLoading
                          ? "Loading fields…"
                          : fields.length === 0
                            ? "No fields available"
                            : "Select field"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(specsError || (!specsLoading && fields.length === 0)) && (
                  <p className="text-sm text-destructive">
                    No active specializations available.{" "}
                    <Link href="/admin/journals/specializations" className="underline">Manage list</Link>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="publisher">Publisher</Label>
                <Input
                  id="publisher"
                  value={formData.publisher}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                  placeholder="e.g., Medical Publishing House"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editor_in_chief">Editor-in-Chief</Label>
                <Input
                  id="editor_in_chief"
                  value={formData.editor_in_chief}
                  onChange={(e) => setFormData({ ...formData, editor_in_chief: e.target.value })}
                  placeholder="e.g., Dr. Sarah Johnson"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="frequency">Publication Frequency</Label>
                <Input
                  id="frequency"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  placeholder="e.g., Monthly, Quarterly"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="submission_fee">Submission Fee ($)</Label>
                <Input
                  id="submission_fee"
                  type="number"
                  step="0.01"
                  value={formData.submission_fee}
                  onChange={(e) => setFormData({ ...formData, submission_fee: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="publication_fee">Publication Fee ($)</Label>
                <Input
                  id="publication_fee"
                  type="number"
                  step="0.01"
                  value={formData.publication_fee}
                  onChange={(e) => setFormData({ ...formData, publication_fee: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cover_image_url">Cover Image URL</Label>
                <Input
                  id="cover_image_url"
                  type="url"
                  value={formData.cover_image_url}
                  onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                  placeholder="/images/journal-cover.jpg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  type="url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  placeholder="https://journal.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter journal description..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading || !formData.field}>
                {isLoading ? "Creating..." : "Create Journal"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/journals">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
