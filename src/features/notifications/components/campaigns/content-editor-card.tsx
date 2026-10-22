"use client"

import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

import {
  useOverwriteCampaignTemplate,
  useSaveCampaignAsTemplate,
  useUpdateCampaign,
  type CampaignDetail,
} from "../../api/use-campaigns"

const NAME_RULE = /^[a-z0-9_-]+$/

/**
 * Edit the HTML and plain-text content of a draft, then keep the edits for
 * this message only, save them as a new template, or write them over the
 * template. The footer with the unsubscribe link and postal address must stay.
 */
export function ContentEditorCard({ detail }: { detail: CampaignDetail }) {
  const { campaign } = detail
  const template = campaign.template
  const [html, setHtml] = useState(campaign.html_override ?? template?.html_content ?? "")
  const [text, setText] = useState(campaign.text_override ?? template?.text_content ?? "")
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [overwriteOpen, setOverwriteOpen] = useState(false)
  const [name, setName] = useState("")

  const update = useUpdateCampaign()
  const saveAs = useSaveCampaignAsTemplate()
  const overwrite = useOverwriteCampaignTemplate()
  const busy = update.isPending || saveAs.isPending || overwrite.isPending

  const edited = campaign.html_override !== null || campaign.text_override !== null
  const changed = html !== (campaign.html_override ?? template?.html_content ?? "") || text !== (campaign.text_override ?? template?.text_content ?? "")
  const usage = campaign.template_usage

  /** Stores the editor's content on the campaign (only what differs from the template). */
  const persist = (then?: () => void) =>
    update.mutate(
      {
        id: campaign.id,
        json: {
          html_override: html === template?.html_content ? null : html,
          text_override: text === (template?.text_content ?? "") ? null : text,
        },
      },
      { onSuccess: () => then?.() },
    )

  // Template actions work on the saved campaign, so unsaved edits are stored first.
  const withSaved = (action: () => void) => (changed ? persist(action) : action())

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit content</CardTitle>
        <CardDescription>
          {edited ? "This message uses its own edited content. " : `This message uses the template "${template?.name}". `}
          Variables such as {"{{recipient_name}}"} are filled in for each person. Keep {"{{unsubscribe_url}}"},{" "}
          {"{{manage_url}}"} and {"{{publisher_address}}"}: every alert must offer them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="html">
          <TabsList>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="text">Plain text</TabsTrigger>
          </TabsList>
          <TabsContent value="html">
            <Label htmlFor="content-html" className="sr-only">HTML content</Label>
            <Textarea id="content-html" rows={18} className="font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} />
          </TabsContent>
          <TabsContent value="text">
            <Label htmlFor="content-text" className="sr-only">Plain-text content</Label>
            <Textarea id="content-text" rows={18} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap justify-end gap-2">
          {edited && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => update.mutate({ id: campaign.id, json: { html_override: null, text_override: null } })}
            >
              Use template content
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => setSaveAsOpen(true)}>
            Save as new template…
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setOverwriteOpen(true)}>
            Overwrite template &ldquo;{template?.name}&rdquo;…
          </Button>
          <Button disabled={busy || !changed} onClick={() => persist()}>
            {update.isPending ? "Saving..." : "Save for this message only"}
          </Button>
        </div>
      </CardContent>

      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as a new template</DialogTitle>
            <DialogDescription>
              The subject and content of this message become a new notification template that you can reuse. This
              message then uses the new template. The original template is not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input id="template-name" value={name} placeholder="call_for_papers" onChange={(e) => setName(e.target.value.trim())} />
            <p className="text-xs text-muted-foreground">Lowercase letters, digits, hyphens and underscores.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !NAME_RULE.test(name)}
              onClick={() =>
                withSaved(() => saveAs.mutate({ id: campaign.id, name }, { onSuccess: () => setSaveAsOpen(false) }))
              }
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={overwriteOpen} onOpenChange={setOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite &ldquo;{template?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The template&apos;s subject and content are replaced with this message&apos;s. Every future email that uses
              this template changes too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {usage && (usage.rules > 0 || usage.drafts > 0) && (
            <Alert>
              <AlertDescription>
                Also used by {usage.rules} notification rule(s) and {usage.drafts} other draft(s).
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => withSaved(() => overwrite.mutate({ id: campaign.id }))}
            >
              Overwrite template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
