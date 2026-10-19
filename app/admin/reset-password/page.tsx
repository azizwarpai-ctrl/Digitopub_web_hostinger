import { Suspense } from "react"
import { ResetPasswordForm } from "@/src/features/auth/components/reset-password-form"

// useSearchParams() needs a Suspense boundary or the static prerender fails.
export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
