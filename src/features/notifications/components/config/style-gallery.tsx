"use client"

import { useState } from "react"
import Link from "next/link"
import DOMPurify from "dompurify"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

import {
  useApplyStyle,
  useNotificationStyles,
  useStylePreview,
  type EmailStyleSummary,
  type StylePreviewTemplate,
} from "@/src/features/notifications/api/use-notification-styles"

const TEMPLATE_LABELS: Record<StylePreviewTemplate, string> = {
  notify_new_issue: "New issue alert",
  notify_weekly_digest: "Weekly digest",
  notify_daily_digest: "Daily digest",
  notify_subscription_confirm: "Subscription confirmation",
  notify_import_invitation: "Import invitation",
  notify_welcome: "Welcome",
  notify_preferences_updated: "Preferences updated",
}

function StylePreview({ style, template }: { style: EmailStyleSummary; template: StylePreviewTemplate }) {
  const preview = useStylePreview(style.key, template)
  if (preview.isLoading) return <Skeleton className="h-[420px] w-full" />
  if (preview.isError) return <p className="text-sm text-destructive">{preview.error.message}</p>
  return (
    <div className="space-y-2">
      <p className="truncate text-xs text-muted-foreground" title={preview.data?.subject}>
        Subject: {preview.data?.subject}
      </p>
      <iframe
        className="h-[420px] w-full rounded-md border bg-white"
        srcDoc={DOMPurify.sanitize(preview.data?.html ?? "", { WHOLE_DOCUMENT: true })}
        sandbox=""
        title={`${style.name} style preview`}
      />
    </div>
  )
}

/** Ready-made email designs: preview each one, then apply it to every publication alert. */
export function StyleGallery() {
  const styles = useNotificationStyles()
  const apply = useApplyStyle()
  const [template, setTemplate] = useState<StylePreviewTemplate>("notify_new_issue")
  const [pending, setPending] = useState<EmailStyleSummary | null>(null)
  const [overwrite, setOverwrite] = useState(false)

  if (styles.isLoading) return <Skeleton className="h-96 w-full" />
  if (styles.isError) return <p className="text-sm text-destructive">{styles.error.message}</p>
  const data = styles.data!

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose a design</CardTitle>
          <CardDescription>
            Each style changes only the look of the seven alert emails. Subjects, plain-text versions and the
            required footer stay the same. To change the wording, edit the templates in{" "}
            <Link href="/admin/email-templates" className="underline underline-offset-4">
              Email templates
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="style-template">Preview email</Label>
          <Select value={template} onValueChange={(v) => setTemplate(v as StylePreviewTemplate)}>
            <SelectTrigger id="style-template" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TEMPLATE_LABELS) as StylePreviewTemplate[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TEMPLATE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {data.styles.map((style) => {
          const active = style.key === data.active
          return (
            <Card key={style.key} className={active ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {style.name}
                  {active && <Badge>Active</Badge>}
                </CardTitle>
                <CardDescription>{style.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <StylePreview style={style} template={template} />
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={active ? "outline" : "default"}
                  disabled={apply.isPending}
                  onClick={() => {
                    setOverwrite(false)
                    setPending(style)
                  }}
                >
                  {active ? "Re-apply this style" : "Apply this style"}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply the {pending?.name} style?</AlertDialogTitle>
            <AlertDialogDescription>
              The design of the seven alert emails is replaced. Subjects and plain-text versions are kept, and
              future emails use the new style. You can switch back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {data.customised.length > 0 && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p>
                These emails have edited HTML and are kept as they are unless you tick the box:{" "}
                {data.customised.map((n) => TEMPLATE_LABELS[n as StylePreviewTemplate] ?? n).join(", ")}.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox id="overwrite-customised" checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
                <Label htmlFor="overwrite-customised">Also replace my edited emails</Label>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pending && apply.mutate({ key: pending.key, overwriteCustomised: overwrite })}
            >
              Apply style
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
