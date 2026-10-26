import { describe, it, expect, vi } from "vitest"
import { Hono } from "hono"

vi.mock("@/src/server/app", () => ({ app: new Hono() }))

import * as routeModule from "@/app/api/[[...route]]/route"

// Next.js only forwards a method to Hono if app/api/[[...route]]/route.ts
// exports it; anything else gets a 405 before Hono runs. PUT was missing
// for months (About page, help content, notification settings, #234).
describe("API catch-all route exports", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])("exports %s", (method) => {
    expect(typeof (routeModule as Record<string, unknown>)[method]).toBe("function")
  })
})
