"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { AlertBanner } from "@/components/ui/alert-banner"
import { AuthShell } from "@/src/features/auth/components/auth-shell"
import { PasswordRecoveryError, requestPasswordReset } from "@/src/features/auth/api/use-forgot-password"

const RESEND_COOLDOWN_MS = 60_000
const RATE_LIMITED_MESSAGE = "Too many requests. Please try again later."

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [resendAt, setResendAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  // A ref, not state: guards against a double submit before re-render.
  const inFlight = useRef(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sentTo) statusRef.current?.focus()
  }, [sentTo])

  useEffect(() => {
    if (resendAt === null) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) clearInterval(id)
    }
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
  }, [resendAt])

  const send = async (address: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    setError(null)

    try {
      await requestPasswordReset({ email: address })
      setSentTo(address)
      setResendAt(Date.now() + RESEND_COOLDOWN_MS)
    } catch (err: unknown) {
      if (err instanceof PasswordRecoveryError && err.status === 429) {
        setError(RATE_LIMITED_MESSAGE)
      } else {
        setError(err instanceof Error ? err.message : "An error occurred")
      }
    } finally {
      inFlight.current = false
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(email)
  }

  const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (error) setError(null)
  }

  const cooling = resendAt !== null && secondsLeft > 0

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your admin email and we'll send you a reset link."
      footer={
        <Link href="/admin/login" className="underline underline-offset-4 hover:text-primary">
          Back to log in
        </Link>
      }
    >
      {sentTo ? (
        <div className="flex flex-col gap-6">
          <div role="status" tabIndex={-1} ref={statusRef} className="grid gap-2 text-sm outline-none">
            <p className="text-foreground">
              If an account exists for <strong>{sentTo}</strong>, we sent a reset link to it.
            </p>
            <p className="text-muted-foreground">
              The link expires in 15 minutes. Check your spam folder if it doesn&apos;t arrive.
            </p>
          </div>
          <div className="grid gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading || cooling}
              aria-busy={isLoading}
              onClick={() => void send(sentTo)}
            >
              {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {cooling ? `Send another link in ${secondsLeft}s` : "Send another link"}
            </Button>
            {error && (
              <div role="alert" className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                <AlertBanner variant="error" message={error} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={onEmailChange}
              />
            </div>
            {error && (
              <div role="alert" className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                <AlertBanner variant="error" message={error} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading} aria-busy={isLoading}>
              {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
