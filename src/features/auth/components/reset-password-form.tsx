"use client"

import type React from "react"
import { useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import { AlertBanner } from "@/components/ui/alert-banner"
import { PasswordInput } from "@/src/features/auth/components/password-input"
import { PasswordRecoveryError } from "@/src/features/auth/api/use-forgot-password"
import { resetPassword } from "@/src/features/auth/api/use-reset-password"

const INVALID_LINK_MESSAGE = "This reset link is invalid or has expired."
const MIN_PASSWORD_LENGTH = 6

function Shell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-8 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src="/images/logodigitopub.png"
            alt="DigitoPub"
            width={180}
            height={60}
            className="mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Portal</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [invalidLink, setInvalidLink] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const inFlight = useRef(false)

  if (!id || !token || invalidLink) {
    return (
      <Shell title="Reset your password">
        <div className="flex flex-col gap-6">
          <div role="alert">
            <AlertBanner variant="error" message={INVALID_LINK_MESSAGE} />
          </div>
          <div className="text-center text-sm text-muted-foreground">
            <Link href="/admin/forgot-password" className="underline underline-offset-4 hover:text-primary">
              Request a new link
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell title="Password updated">
        <div className="flex flex-col gap-6">
          <div role="status">
            <AlertBanner variant="success" message={done} />
          </div>
          <Button asChild className="w-full">
            <Link href="/admin/login">Log in</Link>
          </Button>
        </div>
      </Shell>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    inFlight.current = true
    setIsLoading(true)
    setError(null)

    try {
      const result = await resetPassword({ id, token, password, confirmPassword })
      setDone(result.message || "Your password has been updated.")
    } catch (err: unknown) {
      if (err instanceof PasswordRecoveryError && err.status === 429) {
        setError("Too many requests. Please try again later.")
      } else if (err instanceof PasswordRecoveryError && err.status === 400) {
        // Passwords were checked client-side, so any 400 means the link itself was rejected.
        setInvalidLink(true)
      } else {
        setError(err instanceof Error ? err.message : "An error occurred")
      }
    } finally {
      inFlight.current = false
      setIsLoading(false)
    }
  }

  const editField = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value)
    if (error) setError(null)
  }

  return (
    <Shell title="Choose a new password" description="Enter a new password for your admin account.">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="password">New password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={editField(setPassword)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={editField(setConfirmPassword)}
            />
          </div>
          {error && (
            <div role="alert" className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <AlertBanner variant="error" message={error} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isLoading} aria-busy={isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isLoading ? "Updating..." : "Reset password"}
          </Button>
        </div>
      </form>
    </Shell>
  )
}

