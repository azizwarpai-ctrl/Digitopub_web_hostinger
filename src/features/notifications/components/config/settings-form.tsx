"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import {
  useNotificationSettings,
  useSaveNotificationSettings,
  type NotificationSettings,
  type NotificationSettingsView,
} from "@/src/features/notifications/api/use-notification-config"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function SettingsFields({ view }: { view: NotificationSettingsView }) {
  const save = useSaveNotificationSettings()
  const [address, setAddress] = useState(view.settings.publisher_address)
  const [day, setDay] = useState(String(view.settings.weekly_digest_day))
  const [consent, setConsent] = useState(view.settings.consent_text_version)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<NotificationSettings> = {
      publisher_address: address.trim(),
      weekly_digest_day: Number.parseInt(day, 10),
      consent_text_version: consent.trim(),
    }
    save.mutate(payload)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email settings</CardTitle>
        <CardDescription>These values apply to every notification email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-xl space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="publisher-address">Publisher address</Label>
            <Textarea
              id="publisher-address"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-describedby="publisher-address-help"
            />
            <p id="publisher-address-help" className="text-xs text-muted-foreground">
              Shown in every email footer; required by anti-spam law.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="digest-day">Weekly digest day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger id="digest-day" className="w-full sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consent-version">Consent text version</Label>
            <Input
              id="consent-version"
              value={consent}
              onChange={(e) => setConsent(e.target.value)}
              aria-describedby="consent-version-help"
            />
            <p id="consent-version-help" className="text-xs text-muted-foreground">
              Change this when you change the sign-up consent wording.
            </p>
          </div>
          <Button type="submit" disabled={save.isPending || !address.trim() || !consent.trim()}>
            {save.isPending ? "Saving..." : "Save settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ReadonlyCard({ view }: { view: NotificationSettingsView }) {
  const { readonly } = view
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="text-sm text-muted-foreground">{value}</dd>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery</CardTitle>
        <CardDescription>These values come from the server configuration and cannot be edited here.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          {row("Sender", readonly.from)}
          {row(
            "Send limits",
            `${readonly.limits.perRun} per run, ${readonly.limits.perHour} per hour, ${readonly.limits.perDay} per day`,
          )}
          {row(
            "Sending",
            <span className="flex items-center gap-2">
              <Badge variant={readonly.enabled ? "default" : "secondary"}>
                {readonly.enabled ? "Enabled" : "Disabled"}
              </Badge>
              <span className="text-xs">Controlled by NOTIFICATIONS_ENABLED on the server.</span>
            </span>,
          )}
          {row("Publication detection schedule", readonly.schedule.detect)}
          {row("Digest schedule", readonly.schedule.digests)}
          {row("Sending schedule", readonly.schedule.send)}
        </dl>
      </CardContent>
    </Card>
  )
}

export function NotificationSettingsPanel() {
  const { data, isLoading, isError, error } = useNotificationSettings()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 py-8 text-center text-destructive">
        {error?.message || "Failed to load settings"}
      </div>
    )
  }

  // Remount the form when saved values change on the server.
  const formKey = `${data.settings.publisher_address}|${data.settings.weekly_digest_day}|${data.settings.consent_text_version}`
  return (
    <div className="space-y-6">
      <SettingsFields key={formKey} view={data} />
      <ReadonlyCard view={data} />
    </div>
  )
}
