"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Check, Circle, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { AlertBanner } from "@/components/ui/alert-banner"
import { AuthShell } from "@/src/features/auth/components/auth-shell"
import { PasswordInput } from "@/src/features/auth/components/password-input"
import { PasswordRecoveryError } from "@/src/features/auth/api/use-forgot-password"
import { resetPassword } from "@/src/features/auth/api/use-reset-password"

const INVALID_LINK_MESSAGE = "This reset link is invalid or has expired."
const MIN_PASSWORD_LENGTH = 6
// bcrypt ignores everything past 72 bytes; the server rejects longer passwords.
const MAX_PASSWORD_BYTES = 72

const BACK_TO_LOGIN = (
  <Link href="/admin/login" className="underline underline-offset-4 hover:text-primary">
    Back to log in
  </Link>
)

function Rule({ met, violated = false, children }: { met: boolean; violated?: boolean; children: React.ReactNode }) {
  const Icon = met ? Check : violated ? X : Circle
  const tone = met
    ? "text-emerald-700 dark:text-emerald-400"
    : violated
      ? "text-destructive"
      : "text-muted-foreground"
  return (
    <li className={`flex items-center gap-2 ${tone}`}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {children}
        <span className="sr-only">{met ? " (met)" : " (not met)"}</span>
      </span>
    </li>
  )
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams()
  // Captured once: the address bar is cleaned below, which also updates useSearchParams.
  const [{ id, token }] = useState(() => ({ id: searchParams.get("id"), token: searchParams.get("token") }))

  // Keep the secret out of browser history and later same-origin Referers.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname)
  }, [])

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [invalidLink, setInvalidLink] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const inFlight = useRef(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const showingNotice = !id || !token || invalidLink || !!done

  useEffect(() => {
    if (showingNotice) noticeRef.current?.focus()
  }, [showingNotice])

  if (!id || !token || invalidLink) {
    return (
      <AuthShell title="Link expired or invalid">
        <div className="flex flex-col gap-6">
          <div role="alert" tabIndex={-1} ref={noticeRef} className="outline-none">
            <AlertBanner variant="error" message={INVALID_LINK_MESSAGE} />
          </div>
          <Button asChild className="w-full">
            <Link href="/admin/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <div className="flex flex-col gap-6">
          <div role="status" tabIndex={-1} ref={noticeRef} className="outline-none">
            <AlertBanner variant="success" message={done} />
          </div>
          <Button asChild className="w-full">
            <Link href="/admin/login">Log in</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
      setError("Password is too long")
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

  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const matches = confirmPassword.length > 0 && password === confirmPassword
  const tooLong = new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES

  return (
    <AuthShell
      title="Choose a new password"
      description="Enter a new password for your admin account."
      footer={BACK_TO_LOGIN}
    >
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
          <ul aria-live="polite" className="grid gap-1.5 text-sm">
            <Rule met={longEnough}>At least 6 characters</Rule>
            <Rule met={matches}>Passwords match</Rule>
            {tooLong && (
              <Rule met={false} violated>
                72 bytes or fewer
              </Rule>
            )}
          </ul>
          <p className="-mt-3 text-sm text-muted-foreground">This link expires 15 minutes after it was sent.</p>
          {error && (
            <div role="alert" className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <AlertBanner variant="error" message={error} />
            </div>
          )}
          <Button
            type="submit"
            className="w-full active:scale-[0.99] transition-transform motion-reduce:transition-none"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isLoading ? "Updating..." : "Reset password"}
          </Button>
        </div>
      </form>
    </AuthShell>
  )
}

