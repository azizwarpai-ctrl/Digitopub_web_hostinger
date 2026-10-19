import { useMutation } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"

export interface ForgotPasswordInput {
    email: string
}

export class PasswordRecoveryError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.name = "PasswordRecoveryError"
        this.status = status
    }
}

/** Plain async call so pages can use it without a QueryClientProvider. */
export async function requestPasswordReset(input: ForgotPasswordInput): Promise<{ message: string }> {
    const response = await client.auth["forgot-password"].$post({ json: input })
    const data = (await response.json().catch(() => ({}))) as { message?: string; error?: unknown }
    if (!response.ok) {
        throw new PasswordRecoveryError(typeof data.error === "string" ? data.error : "Request failed", response.status)
    }
    return { message: data.message || "If an account exists for this email, a reset link has been sent." }
}

export function useForgotPassword() {
    return useMutation({ mutationFn: requestPasswordReset })
}
