"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, RotateCcw } from "lucide-react"

interface Props {
  isResetting: boolean
  onConfirm: () => Promise<void>
}

export function ResetTemplateCard({ isResetting, onConfirm }: Props) {
  const [open, setOpen] = useState(false)

  const handleConfirm = async () => {
    try {
      await onConfirm()
      setOpen(false)
    } catch {
      // The mutation hook already reports the error; keep the dialog open.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Default content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to default
        </Button>
        <p className="text-xs text-muted-foreground">
          Restores the shipped subject and content for this notification template.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={(next) => !isResetting && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to default</DialogTitle>
            <DialogDescription>
              This replaces the current subject, HTML and text content with the shipped default. Your edits will be
              lost. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isResetting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isResetting}>
              {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
