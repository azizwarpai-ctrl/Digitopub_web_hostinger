import { useMutation } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { PasswordRecoveryError } from "./use-forgot-password"

export interface ResetPasswordInput {
    id: string
    token: string
    password: string
    confirmPassword: string
}

/** Plain async call so pages can use it without a QueryClientProvider. */
export async function resetPassword(input: ResetPasswordInput): Promise<{ message?: string }> {
    const response = await client.auth["reset-password"].$post({ json: input })
    const data = (await response.json().catch(() => ({}))) as { message?: string; error?: unknown }
    if (!response.ok) {
        throw new PasswordRecoveryError(typeof data.error === "string" ? data.error : "Request failed", response.status)
    }
    return { message: data.message }
}

export function useResetPassword() {
    return useMutation({ mutationFn: resetPassword })
}
