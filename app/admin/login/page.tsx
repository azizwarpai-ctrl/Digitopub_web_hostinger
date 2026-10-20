"use client"

import type React from "react"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { AlertBanner } from "@/components/ui/alert-banner"
import { AuthShell } from "@/src/features/auth/components/auth-shell"
import { PasswordInput } from "@/src/features/auth/components/password-input"

import { client } from "@/src/lib/rpc"

interface LoginResponse {
  requiresVerification?: boolean
  error?: string
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  // A ref, not state: a fast double-submit fires before React re-renders the
  // disabled button, so state alone would let a second request through.
  const inFlight = useRef(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    setError(null)

    try {
      const response = await client.auth.login.$post({
        json: { email, password },
      })

      const data: LoginResponse = await response.json()

      if (!response.ok) {
        throw new Error((data as any).error || "Authentication failed")
      }

      if (data.requiresVerification) {
        router.push(`/admin/verify-code?email=${encodeURIComponent(email)}`)
        return
      }

      router.push("/admin/dashboard")
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      inFlight.current = false
      setIsLoading(false)
    }
  }

  // Editing either field means the user is acting on the error; clear it.
  const editField = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value)
    if (error) setError(null)
  }

  const updateCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState("CapsLock"))
  }

  return (
    <AuthShell
      title="Sign in"
      description="DigitoPub admin portal"
      footer={
        <Link href="/" className="underline-offset-4 hover:underline hover:text-foreground">
          Back to main site
        </Link>
      }
    >
      <form onSubmit={handleLogin}>
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
              onChange={editField(setEmail)}
            />
          </div>
          {/* The forgot link follows the input in the DOM (tab order: toggle, then link) but sits in the label row. */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Label htmlFor="password" className="col-start-1 row-start-1">
              Password
            </Label>
            <div className="col-span-2 row-start-2">
              <PasswordInput
                id="password"
                autoComplete="current-password"
                aria-describedby="password-capslock"
                required
                value={password}
                onChange={editField(setPassword)}
                onKeyDown={updateCapsLock}
                onKeyUp={updateCapsLock}
                onBlur={() => setCapsLock(false)}
              />
            </div>
            <p
              id="password-capslock"
              aria-live="polite"
              className="col-span-2 row-start-3 text-xs text-amber-700 dark:text-amber-400"
            >
              {capsLock ? "Caps Lock is on" : ""}
            </p>
            <Link
              href="/admin/forgot-password"
              className="col-start-2 row-start-1 justify-self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
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
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </AuthShell>
  )
}
