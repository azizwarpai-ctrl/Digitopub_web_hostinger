"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import { AlertBanner } from "@/components/ui/alert-banner"
import { PasswordRecoveryError, requestPasswordReset } from "@/src/features/auth/api/use-forgot-password"

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // A ref, not state: guards against a double submit before re-render.
  const inFlight = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    setError(null)

    try {
      const result = await requestPasswordReset({ email })
      setSuccessMessage(result.message)
    } catch (err: unknown) {
      if (err instanceof PasswordRecoveryError && err.status === 429) {
        setError("Too many requests. Please try again later.")
      } else {
        setError(err instanceof Error ? err.message : "An error occurred")
      }
    } finally {
      inFlight.current = false
      setIsLoading(false)
    }
  }

  const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (error) setError(null)
  }

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
            <CardTitle className="text-2xl">Reset your password</CardTitle>
            <CardDescription>Enter your admin email and we&apos;ll send you a reset link.</CardDescription>
          </CardHeader>
          <CardContent>
            {successMessage ? (
              <div className="flex flex-col gap-6">
                <div role="status">
                  <AlertBanner variant="success" message={successMessage} />
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  <Link href="/admin/login" className="underline underline-offset-4 hover:text-primary">
                    Back to log in
                  </Link>
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
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  <Link href="/admin/login" className="underline underline-offset-4 hover:text-primary">
                    Back to log in
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
