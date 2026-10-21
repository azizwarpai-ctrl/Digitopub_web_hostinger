"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatCard } from "@/components/ui/stat-card"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Mail, Plus, Pencil, Trash2, MailCheck, MailX, Loader2 } from "lucide-react"

import { useGetEmailTemplates } from "@/src/features/email-templates/api/use-get-email-templates"
import { useGetEmailStatus } from "@/src/features/email-templates/api/use-get-email-status"
import { useDeleteEmailTemplate } from "@/src/features/email-templates/api/use-delete-email-template"
import { useUpdateEmailTemplate } from "@/src/features/email-templates/api/use-update-email-template"
import type { EmailTemplate, EmailTemplateCategory } from "@/src/features/email-templates/types/email-template-type"

export default function EmailTemplatesPage() {
  const limit = 20
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [category, setCategory] = useState<EmailTemplateCategory>("transactional")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [updatingTemplateId, setUpdatingTemplateId] = useState<string | null>(null)

  const { data: templatesData, isLoading: loading, isError, error } = useGetEmailTemplates(page, limit, undefined, category)
  const templates = templatesData?.data || []
  const pagination = templatesData?.pagination || null
  
  const { data: smtpStatus, isLoading: isSmtpLoading, isError: isSmtpError } = useGetEmailStatus()
  const deleteMutation = useDeleteEmailTemplate()
  const updateMutation = useUpdateEmailTemplate()

  const handleCategoryChange = (value: string) => {
    if (value === "transactional" || value === "notification") {
      setCategory(value)
      setPage(1)
    }
  }

  const handleDelete = () => {
    if (!deleteId || deleteMutation.isPending) return
    
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => setDeleteId(null)
    })
  }

  const handleToggleActive = (template: EmailTemplate) => {
    if (updateMutation.isPending) return
    setUpdatingTemplateId(template.id.toString())

    updateMutation.mutate({
      param: { id: template.id.toString() },
      json: { is_active: !template.is_active },
    }, {
      onSettled: () => setUpdatingTemplateId(null)
    })
  }

  const filteredTemplates = templates.filter((t: EmailTemplate) => {
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())

    if (activeTab === "active") return matchesSearch && t.is_active
    if (activeTab === "inactive") return matchesSearch && !t.is_active
    return matchesSearch
  })

  const activeCount = templates.filter((t: EmailTemplate) => t.is_active).length
  const inactiveCount = templates.filter((t: EmailTemplate) => !t.is_active).length

  return (
    <div className="space-y-6">
      <PageHeader title="Email Templates" subtitle="Manage reusable email templates for the platform">
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/email-templates/logs">
              View Logs
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/email-templates/new">
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Status & Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Templates" value={pagination?.totalItems || templates.length} icon={Mail} />
        <StatCard
          title="This page &mdash; Active"
          value={activeCount}
          icon={MailCheck}
          iconClassName="h-4 w-4 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="This page &mdash; Inactive"
          value={inactiveCount}
          icon={MailX}
          iconClassName="h-4 w-4 text-amber-600 dark:text-amber-400"
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMTP Status</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isSmtpLoading ? (
              <Badge variant="secondary" className="flex w-fit items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
                Checking...
              </Badge>
            ) : isSmtpError ? (
              <Badge variant="destructive" className="flex w-fit items-center gap-1">
                <MailX className="h-3 w-3" />
                Unavailable
              </Badge>
            ) : smtpStatus?.smtpConfigured ? (
              <div className="space-y-1">
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex w-fit items-center gap-1">
                  <MailCheck className="h-3 w-3" />
                  Configured
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  {smtpStatus.provider}
                </p>
              </div>
            ) : (
              <Badge variant="destructive" className="flex w-fit items-center gap-1">
                <MailX className="h-3 w-3" />
                Unconfigured
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Templates</CardTitle>
              <CardDescription>Browse and manage email templates</CardDescription>
            </div>
            <Input
              className="w-64"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={category} onValueChange={handleCategoryChange} className="mb-4 w-full">
            <TabsList aria-label="Template category">
              <TabsTrigger value="transactional">Transactional</TabsTrigger>
              <TabsTrigger value="notification">Notification</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>

            {["all", "active", "inactive"].map((tab) => (
              <TabsContent key={tab} value={tab} className="space-y-4">
                {loading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading templates...</div>
                ) : isError ? (
                  <div className="py-12 flex flex-col items-center justify-center text-destructive border border-destructive/20 rounded-md bg-destructive/5 mt-4">
                    <MailX className="h-8 w-8 mb-2 opacity-50" />
                    <p>Error loading email templates</p>
                    <p className="text-sm text-destructive/80 mt-1">{error?.message || "Check your backend connection"}</p>
                  </div>
                ) : filteredTemplates.length > 0 ? (
                  filteredTemplates.map((template: EmailTemplate) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium font-mono text-sm">{template.name}</p>
                          <Badge variant="outline" className="capitalize">
                            {template.category}
                          </Badge>
                          <Badge variant={template.is_active ? "default" : "secondary"}>
                            {template.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground">{template.subject}</p>
                        {template.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {template.variables && (template.variables as string[]).length > 0 && (
                            <span>
                              Variables:{" "}
                              {(template.variables as string[]).map((v) => `{{${v}}}`).join(", ")}
                            </span>
                          )}
                          <span>
                            Updated: {new Date(template.updated_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "numeric",
                              day: "numeric",
                              timeZone: "UTC",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateMutation.isPending && updatingTemplateId === template.id.toString()}
                          onClick={() => handleToggleActive(template)}
                        >
                          {updateMutation.isPending && updatingTemplateId === template.id.toString() ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : template.is_active ? (
                            <MailX className="h-4 w-4" />
                          ) : (
                            <MailCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/email-templates/${template.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(template.id.toString())}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No email templates found
                  </div>
                )}

                {/* Pagination Controls */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing page {pagination.page} of {pagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pagination.hasPrev}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pagination.hasNext}
                        onClick={() => setPage(p => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-opacity disabled:opacity-50"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
