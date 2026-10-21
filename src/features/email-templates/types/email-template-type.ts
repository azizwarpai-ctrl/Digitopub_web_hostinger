export type EmailTemplateCategory = "transactional" | "notification"

export interface SampleVariablesResponse {
  variables: Record<string, string>
  allowed_variables: string[]
  raw_variables: string[]
}

export interface EmailTemplatePreviewResult {
  subject: string
  html: string
  text: string | null
  missingVariables: string[]
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  html_content: string
  text_content: string | null
  variables: string[] | null
  description: string | null
  is_active: boolean
  category: EmailTemplateCategory
  created_at: string
  updated_at: string
}

export interface EmailLog {
  id: string
  template_id: string | null
  to_email: string
  subject: string
  status: string
  error_message: string | null
  sent_at: string | null
  created_at: string
}
