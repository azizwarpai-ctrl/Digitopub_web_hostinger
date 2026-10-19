import type { Metadata } from "next"
import { Suspense } from "react"
import { ResetPasswordForm } from "@/src/features/auth/components/reset-password-form"

// The URL carries a reset secret: never send it on as a Referer.
export const metadata: Metadata = { referrer: "no-referrer" }

// useSearchParams() needs a Suspense boundary or the static prerender fails.
export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
