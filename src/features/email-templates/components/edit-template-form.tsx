"use client"

import { useState, useMemo } from "react"
import { useForm, type FieldErrors } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { TemplateDetailsCard } from "@/src/features/email-templates/components/template-details-card"
import { EmailContentCard } from "@/src/features/email-templates/components/email-content-card"
import { TemplateVariablePaletteCard } from "@/src/features/email-templates/components/template-variable-palette-card"
import { SamplePreviewCard } from "@/src/features/email-templates/components/sample-preview-card"
import { ResetTemplateCard } from "@/src/features/email-templates/components/reset-template-card"
import { useEditorInsertion } from "@/src/features/email-templates/components/use-editor-insertion"
import { TemplateActionsCard } from "@/src/features/email-templates/components/template-actions-card"
import { SendTestEmailCard } from "@/src/features/email-templates/components/send-test-email-card"
import { useTestRecipients } from "@/src/features/notifications/components/test-recipients-field"
import { useUpdateEmailTemplate } from "@/src/features/email-templates/api/use-update-email-template"
import { useSendTestEmail } from "@/src/features/email-templates/api/use-send-test-email"
import { useGetSampleVariables } from "@/src/features/email-templates/api/use-get-sample-variables"
import { usePreviewEmailTemplate } from "@/src/features/email-templates/api/use-preview-email-template"
import { useResetEmailTemplate } from "@/src/features/email-templates/api/use-reset-email-template"
import { Form } from "@/components/ui/form"
import { toast } from "sonner"
import type { EmailTemplate, EmailTemplatePreviewResult } from "@/src/features/email-templates/types/email-template-type"
import { extractAllVariables } from "@/src/lib/email/renderer"
import { emailTemplateUpdateSchema, type EmailTemplateUpdate } from "@/src/features/email-templates/schemas/email-template-schema"

interface Props {
  template: EmailTemplate
}

const NOTIFICATION_HELP =
  "Use {{name}} for values (escaped). Only toc_html and articles_html may use {{{ }}}."

function firstErrorMessage(errors: FieldErrors<EmailTemplateUpdate>): string | null {
  for (const value of Object.values(errors)) {
    const message = (value as { message?: unknown } | undefined)?.message
    if (typeof message === "string" && message) return message
  }
  return null
}

export function EditTemplateForm({ template }: Props) {
  const form = useForm<EmailTemplateUpdate>({
    resolver: zodResolver(emailTemplateUpdateSchema),
    defaultValues: {

      name: template.name,
      subject: template.subject,
      html_content: template.html_content,
      text_content: template.text_content || "",
      description: template.description || "",
      is_active: template.is_active,
    },
  })

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string | null>(null)
  const { recipients: testRecipients, setRecipients: setTestRecipients, saved: savedTestRecipients } = useTestRecipients()

  const { mutate: updateTemplate, isPending: saving } = useUpdateEmailTemplate()
  const { mutate: sendTestEmail, isPending: sendingTest } = useSendTestEmail()
  const templateId = String(template.id)
  const isNotification = template.category === "notification"
  const canReset = isNotification && template.name.startsWith("notify_")

  const { data: sampleData, isLoading: sampleLoading } = useGetSampleVariables(templateId)
  const { mutate: previewWithSample, isPending: previewingSample } = usePreviewEmailTemplate()
  const { mutateAsync: resetTemplate, isPending: resetting } = useResetEmailTemplate()
  const [samplePreview, setSamplePreview] = useState<EmailTemplatePreviewResult | null>(null)
  const { onFieldFocus, onFieldBlur, insert } = useEditorInsertion(form)

  const currentHtmlContent = form.watch("html_content")
  const currentSubject = form.watch("subject")
  const currentTextContent = form.watch("text_content")

  const allVariables = useMemo(() => {
    return extractAllVariables(currentHtmlContent || "", currentSubject || "", currentTextContent || "")
  }, [currentHtmlContent, currentSubject, currentTextContent])

  // Clear any generated preview the moment the edited content diverges from
  // what was previewed. Adjusted during render with a previous-value guard
  // (instead of a post-render effect) so there is never an extra frame where
  // a stale preview is shown against freshly-edited content.
  const [previewedContent, setPreviewedContent] = useState({
    html: currentHtmlContent,
    subject: currentSubject,
    text: currentTextContent,
  })
  if (
    previewedContent.html !== currentHtmlContent ||
    previewedContent.subject !== currentSubject ||
    previewedContent.text !== currentTextContent
  ) {
    setPreviewedContent({ html: currentHtmlContent, subject: currentSubject, text: currentTextContent })
    setPreviewHtml(null)
    setPreviewSubject(null)
  }


  const onSubmit = (values: EmailTemplateUpdate) => {
    updateTemplate({
      param: { id: String(template.id) },
      json: {
        ...values,
        variables: allVariables.length > 0 ? allVariables : undefined,
      },
    })
  }

  const handlePreview = () => {
    let previewContent = currentHtmlContent || ""
    let previewSub = currentSubject || ""
    allVariables.forEach((v) => {
      const sampleValue = `<strong style="color:#3b82f6">[${v}]</strong>`
      previewContent = previewContent.replace(new RegExp(`\\{\\{${v}\\}\\}`, "g"), sampleValue)
      previewSub = previewSub.replace(new RegExp(`\\{\\{${v}\\}\\}`, "g"), `[${v}]`)
    })
    setPreviewHtml(previewContent)
    setPreviewSubject(previewSub)
  }

  const paletteVariables = useMemo(() => {
    const allowed = sampleData?.allowed_variables ?? []
    if (allowed.length > 0) return allowed
    if (template.variables && template.variables.length > 0) return template.variables
    return allVariables
  }, [sampleData, template.variables, allVariables])

  const handleSamplePreview = () => {
    previewWithSample(
      { id: templateId, variables: sampleData?.variables ?? {} },
      { onSuccess: (result) => setSamplePreview(result) }
    )
  }

  const handleReset = async () => {
    const response = await resetTemplate({ id: templateId })
    const fresh = response.data
    form.reset({
      name: fresh.name,
      subject: fresh.subject,
      html_content: fresh.html_content,
      text_content: fresh.text_content || "",
      description: fresh.description || "",
      is_active: fresh.is_active,
    })
    setSamplePreview(null)
  }

  const onInvalid = (errors: FieldErrors<EmailTemplateUpdate>) => {
    toast.error(firstErrorMessage(errors) ?? "Please correct the highlighted fields")
  }

  const handleSendTest = () => {
    if (testRecipients.length === 0) {
      toast.error("Please enter at least one test email address")
      return
    }

    const sampleVars: Record<string, string> = {}
    allVariables.forEach((v) => {
      sampleVars[v] = `[Sample ${v}]`
    })
    Object.assign(sampleVars, sampleData?.variables ?? {})

    sendTestEmail({
      param: { id: String(template.id) },
      json: { recipients: testRecipients, variables: sampleVars },
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <TemplateDetailsCard form={form} />
            <EmailContentCard 
              form={form} 
              previewHtml={previewHtml} 
              previewSubject={previewSubject}
              helpNote={isNotification ? NOTIFICATION_HELP : undefined}
              onFieldFocus={onFieldFocus}
              onFieldBlur={onFieldBlur}
            />
            <SamplePreviewCard
              result={samplePreview}
              isLoading={previewingSample}
              onPreview={handleSamplePreview}
              disabled={sampleLoading}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <TemplateVariablePaletteCard
              variables={paletteVariables}
              rawVariables={sampleData?.raw_variables ?? []}
              isLoading={sampleLoading}
              onInsert={insert}
            />
            <TemplateActionsCard 
              saving={saving} 
              handlePreview={handlePreview} 
              hasHtmlContent={!!currentHtmlContent} 
            />
            {canReset && <ResetTemplateCard isResetting={resetting} onConfirm={handleReset} />}
            <SendTestEmailCard 
              recipients={testRecipients}
              setRecipients={setTestRecipients}
              savedRecipients={savedTestRecipients}
              sendingTest={sendingTest}
              handleSendTest={handleSendTest}
            />
          </div>
        </div>
      </form>
    </Form>
  )
}
