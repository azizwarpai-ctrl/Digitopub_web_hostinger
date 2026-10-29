"use client"

import { useState, useMemo, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { TemplateDetailsCard } from "@/src/features/email-templates/components/template-details-card"
import { EmailContentCard } from "@/src/features/email-templates/components/email-content-card"
import { TemplateCategoryField } from "@/src/features/email-templates/components/template-category-field"
import { TemplateVariablesCard } from "@/src/features/email-templates/components/template-variables-card"
import { TemplateActionsCard } from "@/src/features/email-templates/components/template-actions-card"
import { useCreateEmailTemplate } from "@/src/features/email-templates/api/use-create-email-template"
import { Form } from "@/components/ui/form"
import { extractAllVariables } from "@/src/lib/email/renderer"
import { buildPlaceholderPreview } from "@/src/features/email-templates/utils/placeholder-preview"
import { useNewTemplateStore } from "@/src/features/email-templates/stores/new-template-store"
import { emailTemplateCreateSchema, type EmailTemplateCreate } from "@/src/features/email-templates/schemas/email-template-schema"

export function NewTemplateForm() {
  const { formData, setFormData, reset } = useNewTemplateStore()

  const form = useForm<EmailTemplateCreate>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(emailTemplateCreateSchema) as any,
    defaultValues: formData,
  })


  // Sync form values to Zustand store for local draft saving whenever they change
  useEffect(() => {
    const subscription = form.watch((value) => {
      setFormData(value as Partial<EmailTemplateCreate>)
    })
    return () => subscription.unsubscribe()
  }, [form, setFormData])

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string | null>(null)

  const { mutate: createTemplate, isPending: saving } = useCreateEmailTemplate()

  // Watch HTML, Subject and Text content to update extracted variables interactively
  const currentHtmlContent = form.watch("html_content")
  const currentSubject = form.watch("subject")
  const currentTextContent = form.watch("text_content")

  const allVariables = useMemo(() => {
    return extractAllVariables(currentHtmlContent || "", currentSubject || "", currentTextContent || "")
  }, [currentHtmlContent, currentSubject, currentTextContent])

  // Clear preview when content changes to avoid stale previews
  useEffect(() => {
    setPreviewHtml(null)
    setPreviewSubject(null)
  }, [currentHtmlContent, currentSubject, currentTextContent])

  const onSubmit = (values: EmailTemplateCreate) => {
    createTemplate({
      json: {
        ...values,
        variables: allVariables.length > 0 ? allVariables : undefined,
      },
    }, {
      onSuccess: () => {
        // Clear draft after successful creation
        reset()
        // Reset RHF internal state
        form.reset()
        // Clear preview UI
        setPreviewHtml(null)
        setPreviewSubject(null)
      }
    })
  }

  const handlePreview = () => {
    const preview = buildPlaceholderPreview(currentHtmlContent, currentSubject, allVariables)
    setPreviewHtml(preview.html)
    setPreviewSubject(preview.subject)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <TemplateCategoryField form={form} />
            <TemplateDetailsCard form={form} />
            <EmailContentCard 
              form={form} 
              previewHtml={previewHtml} 
              previewSubject={previewSubject} 
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <TemplateVariablesCard allVariables={allVariables} />
            <TemplateActionsCard 
              saving={saving} 
              handlePreview={handlePreview} 
              hasHtmlContent={!!currentHtmlContent} 
              isNew={true}
            />
          </div>
        </div>
      </form>
    </Form>
  )
}
