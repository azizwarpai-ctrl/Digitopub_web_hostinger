"use client"

import type React from "react"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import { AlertBanner } from "@/components/ui/alert-banner"
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
          <p className="text-sm text-muted-foreground mt-2">Sign in to manage your scientific journals</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>Enter your admin credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
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
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={editField(setPassword)}
                  />
                </div>
                {error && (
                  <div role="alert" className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                    <AlertBanner variant="error" message={error} />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading} aria-busy={isLoading}>
                  {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                <Link href="/" className="underline underline-offset-4 hover:text-primary">
                  Back to main site
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
