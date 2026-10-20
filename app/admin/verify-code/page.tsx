"use client"

import type React from "react"
import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams, redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { RefreshCw, Loader2 } from "lucide-react"
import { client } from "@/src/lib/rpc"
import { AlertBanner } from "@/components/ui/alert-banner"
import { AuthShell } from "@/src/features/auth/components/auth-shell"

function VerifyCodeContent() {
    const [code, setCode] = useState(["", "", "", "", "", ""])
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isResending, setIsResending] = useState(false)
    const [resendCooldown, setResendCooldown] = useState(0)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const email = searchParams.get("email") || ""
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    // Countdown timer for resend cooldown
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [resendCooldown])

    // If no email param, redirect back to login. redirect() during render
    // avoids the wrong-page flash of an effect-based router.push.
    if (!email) {
        redirect("/admin/login")
    }

    const handleChange = (index: number, value: string) => {
        if (value.length > 1) {
            // Handle paste
            const chars = value.replace(/\D/g, "").slice(0, 6).split("")
            const newCode = [...code]
            chars.forEach((char, i) => {
                if (index + i < 6) newCode[index + i] = char
            })
            setCode(newCode)
            const nextIndex = Math.min(index + chars.length, 5)
            inputRefs.current[nextIndex]?.focus()
            return
        }

        if (!/^\d*$/.test(value)) return

        const newCode = [...code]
        newCode[index] = value
        setCode(newCode)

        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        const fullCode = code.join("")

        if (fullCode.length !== 6) {
            setError("Please enter the complete 6-digit code")
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const response = await client.auth["verify-code"].$post({
                json: { email, code: fullCode },
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error((data as any).error || "Verification failed")
            }

            router.push("/admin/dashboard")
            router.refresh()
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : "Verification failed")
            setCode(["", "", "", "", "", ""])
            inputRefs.current[0]?.focus()
        } finally {
            setIsLoading(false)
        }
    }

    const handleResend = async () => {
        if (resendCooldown > 0) return

        setIsResending(true)
        setError(null)
        setSuccessMessage(null)

        try {
            const response = await client.auth["resend-code"].$post({
                json: { email },
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error((data as any).error || "Failed to resend code")
            }

            setSuccessMessage("A new verification code has been sent to your email.")
            setResendCooldown(60) // 60 second cooldown
            setCode(["", "", "", "", "", ""])
            inputRefs.current[0]?.focus()
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : "Failed to resend code")
        } finally {
            setIsResending(false)
        }
    }

    return (
        <AuthShell
            title="Check your email"
            description={
                <>
                    We sent a 6-digit verification code to <span className="font-medium text-foreground">{email}</span>. The code expires in 5 minutes.
                </>
            }
            footer={
                <Link href="/admin/login" className="underline-offset-4 hover:underline hover:text-foreground">
                    Back to log in
                </Link>
            }
        >
                        <form onSubmit={handleVerify}>
                            <div className="flex flex-col gap-6">
                                {/* OTP Input Grid */}
                                <div className="flex justify-center gap-3">
                                    {code.map((digit, index) => (
                                        <Input
                                            key={index}
                                            ref={(el) => { inputRefs.current[index] = el }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={digit}
                                            onChange={(e) => handleChange(index, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(index, e)}
                                            className="w-12 h-14 text-center text-2xl font-bold"
                                            autoFocus={index === 0}
                                        />
                                    ))}
                                </div>

                                {error && (
                                    <div role="alert">
                                        <AlertBanner variant="error" message={error} />
                                    </div>
                                )}

                                {successMessage && (
                                    <div role="status">
                                        <AlertBanner variant="success" message={successMessage} />
                                    </div>
                                )}

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? "Verifying..." : "Verify & Continue"}
                                </Button>

                                <div className="text-center">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleResend}
                                        disabled={isResending || resendCooldown > 0}
                                        className="text-sm"
                                    >
                                        <RefreshCw className={`h-4 w-4 mr-1 ${isResending ? "animate-spin" : ""}`} />
                                        {resendCooldown > 0
                                            ? `Resend code in ${resendCooldown}s`
                                            : isResending
                                                ? "Resending..."
                                                : "Resend verification code"}
                                    </Button>
                                </div>
                            </div>
                        </form>
        </AuthShell>
    )
}

function VerifyCodeFallback() {
    return (
        <AuthShell title="Check your email">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
        </AuthShell>
    )
}

export default function VerifyCodePage() {
    return (
        <Suspense fallback={<VerifyCodeFallback />}>
            <VerifyCodeContent />
        </Suspense>
    )
}
