import { Prisma } from "@prisma/client"
import { prisma } from "./config"

/**
 * Retry a database-only transaction when InnoDB rolls it back with a deadlock.
 * The operation may run more than once and must not perform external side effects.
 */
export async function withDeadlockRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(operation)
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
      if (!retryable || attempt === maxAttempts) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 10))
    }
  }
  throw new Error("Unreachable transaction retry state")
}
