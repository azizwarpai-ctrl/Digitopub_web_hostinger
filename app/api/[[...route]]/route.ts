import { handle } from "hono/vercel"
import { app } from "@/src/server/app"

// Export standard HTTP method handlers for Next.js App Router
// Every method a Hono route uses must be exported here, or Next.js answers
// 405 before Hono runs. PUT was missing: About page, help content and
// notification rules/settings/discipline saves all failed with 405.
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)

// Export type for RPC client
export type { AppType } from "@/src/server/app"
