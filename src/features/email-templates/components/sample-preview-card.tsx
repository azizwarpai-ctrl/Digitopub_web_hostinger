import DOMPurify from "dompurify"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Eye, Loader2 } from "lucide-react"
import type { EmailTemplatePreviewResult } from "@/src/features/email-templates/types/email-template-type"

interface Props {
  result: EmailTemplatePreviewResult | null
  isLoading: boolean
  onPreview: () => void
  disabled?: boolean
}

export function SamplePreviewCard({ result, isLoading, onPreview, disabled = false }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample data preview</CardTitle>
        <CardDescription>
          Renders the saved version of this template with sample values. Save your changes first to preview them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" variant="outline" onClick={onPreview} disabled={disabled || isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
          Preview with sample data
        </Button>

        {result && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm">
              <span className="font-medium">Subject:</span> {result.subject}
            </p>
            {result.missingVariables.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Missing sample values: {result.missingVariables.join(", ")}
              </p>
            )}
            <iframe
              className="min-h-[500px] w-full border-t pt-3"
              srcDoc={DOMPurify.sanitize(result.html)}
              sandbox=""
              title="Sample data preview"
              aria-label="Sample data preview content"
            />
            {result.text && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Plain text</p>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">{result.text}</pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
