import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DOMPurify from "dompurify"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import type { FieldValues, UseFormReturn, Path } from "react-hook-form"

export type EditorFieldName = "subject" | "html_content" | "text_content"

interface Props<T extends FieldValues> {
  form: UseFormReturn<T>
  previewHtml: string | null
  previewSubject: string | null
  /** Optional help text shown under the description. */
  helpNote?: string
  /** Optional focus/blur tracking used by the variable palette. */
  onFieldFocus?: (name: EditorFieldName, el: HTMLInputElement | HTMLTextAreaElement) => void
  onFieldBlur?: (name: EditorFieldName, el: HTMLInputElement | HTMLTextAreaElement) => void
}


export function EmailContentCard<T extends FieldValues>({
  form,
  previewHtml,
  previewSubject,
  helpNote,
  onFieldFocus,
  onFieldBlur,
}: Props<T>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Content</CardTitle>
        <CardDescription>
          Use {"{{variableName}}"} syntax for dynamic content
        </CardDescription>
        {helpNote && <p className="text-sm text-muted-foreground">{helpNote}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name={"subject" as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onFocus={(e) => onFieldFocus?.("subject", e.currentTarget)}
                  onBlur={(e) => {
                    field.onBlur()
                    onFieldBlur?.("subject", e.currentTarget)
                  }}
                  placeholder="e.g. Welcome to DigitoPub, {{userName}}"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Tabs defaultValue="html" className="w-full">
          <TabsList>
            <TabsTrigger value="html">HTML Content *</TabsTrigger>
            <TabsTrigger value="text">Plain Text</TabsTrigger>
            {previewHtml && <TabsTrigger value="preview">Preview</TabsTrigger>}
          </TabsList>

          <TabsContent value="html" className="mt-2">
            <FormField
              control={form.control}
              name={"html_content" as Path<T>}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      onFocus={(e) => onFieldFocus?.("html_content", e.currentTarget)}
                      onBlur={(e) => {
                        field.onBlur()
                        onFieldBlur?.("html_content", e.currentTarget)
                      }}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="<h1>Hello {{userName}}</h1><p>Welcome to our platform...</p>"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent value="text" className="mt-2">
            <FormField
              control={form.control}
              name={"text_content" as Path<T>}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      onFocus={(e) => onFieldFocus?.("text_content", e.currentTarget)}
                      onBlur={(e) => {
                        field.onBlur()
                        onFieldBlur?.("text_content", e.currentTarget)
                      }}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="Hello {{userName}}, Welcome to our platform..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          {previewHtml && (
            <TabsContent value="preview" className="mt-2">
              <div className="border rounded-lg p-4 space-y-3">
                <div className="text-sm text-muted-foreground">
                  <strong>Subject:</strong> {previewSubject}
                </div>
                <iframe
                  className="w-full min-h-[500px] border-t pt-3"
                  srcDoc={DOMPurify.sanitize(previewHtml)}
                  sandbox=""
                  title="Email Preview"
                  aria-label="Email Preview Content"
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
