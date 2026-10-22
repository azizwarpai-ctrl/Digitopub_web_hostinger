"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

import {
  useInstallNotificationDefaults,
  useNotificationReadiness,
  useSendDeliverabilityTest,
} from "@/src/features/notifications/api/use-notification-config"

/** Go-live checklist and the two one-off actions that would otherwise need a shell. */
export function GoLiveCard() {
  const readiness = useNotificationReadiness()
  const install = useInstallNotificationDefaults()
  const test = useSendDeliverabilityTest()
  const [to, setTo] = useState("")

  const items = readiness.data ?? []
  const done = items.filter((i) => i.ok).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Go-live setup</CardTitle>
        <CardDescription>
          Work through this list before setting NOTIFICATIONS_ENABLED=true. The full steps are in
          docs/ops/notifications-go-live.md.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {readiness.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : readiness.isError ? (
          <p className="text-sm text-destructive">{readiness.error.message}</p>
        ) : (
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              {done} of {items.length} ready
            </p>
            <dl>
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-col gap-1 border-b py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <dt className="flex items-center gap-2 text-sm font-medium">
                    <Badge variant={item.ok ? "default" : "secondary"}>{item.ok ? "Ready" : "To do"}</Badge>
                    {item.label}
                  </dt>
                  <dd className="text-sm text-muted-foreground sm:text-right">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="space-y-2">
          <Label>Starter data</Label>
          <p className="text-sm text-muted-foreground">
            Adds the starter discipline list, the global rules and the seven email templates. Existing entries and
            your edits are kept, so it is safe to click again.
          </p>
          <Button onClick={() => install.mutate()} disabled={install.isPending}>
            {install.isPending ? "Installing…" : "Install starter data"}
          </Button>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (to.trim()) test.mutate(to.trim())
          }}
        >
          <Label htmlFor="deliverability-to">Deliverability test</Label>
          <p className="text-sm text-muted-foreground">
            Sends a sample new-issue alert through the alerts mailbox, with the same headers as real alerts. Paste the
            address shown on mail-tester.com, then check the score there. It works while sending is still disabled.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="deliverability-to"
              type="email"
              placeholder="test-xxxx@srv1.mail-tester.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={test.isPending || !to.trim()}>
              {test.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
