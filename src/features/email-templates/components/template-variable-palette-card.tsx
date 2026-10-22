import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Props {
  /** Variables that may be used with {{name}}. */
  variables: string[]
  /** Variables that may be used raw with {{{name}}} (HTML blocks). */
  rawVariables: string[]
  isLoading?: boolean
  onInsert: (token: string, options?: { htmlOnly?: boolean }) => void
}

export function TemplateVariablePaletteCard({ variables, rawVariables, isLoading = false, onInsert }: Props) {
  const rawSet = new Set(rawVariables)
  const plain = variables.filter((v) => !rawSet.has(v))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Variables</CardTitle>
        <CardDescription>
          Select a variable to insert it at the cursor of the field you last edited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading variables...</p>
        ) : plain.length === 0 && rawVariables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variables available.</p>
        ) : null}

        {plain.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Text variables">
            {plain.map((v) => (
              <Button
                key={v}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 font-mono text-xs"
                aria-label={`Insert variable ${v}`}
                onClick={() => onInsert(`{{${v}}}`)}
              >
                {`{{${v}}}`}
              </Button>
            ))}
          </div>
        )}

        {rawVariables.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              HTML block (inserted into the HTML content)
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="HTML block variables">
              {rawVariables.map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 font-mono text-xs"
                  aria-label={`Insert HTML block ${v}`}
                  onClick={() => onInsert(`{{{${v}}}}`, { htmlOnly: true })}
                >
                  {`{{{${v}}}}`}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
