import { describe, it, expect, vi } from "vitest"

import { TEMPLATE_SET } from "@/src/features/notifications/server/template-set"
import { seedNotificationTemplates } from "@/src/features/notifications/server/templates"
import { sampleVariables } from "@/src/features/notifications/server/sample-data"
import { RAW_BLOCK_VARIABLES, buildEditorNote } from "@/src/features/notifications/server/render-blocks"
import { extractAllVariables, renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"

const entries = Object.entries(TEMPLATE_SET)

describe("academic template set (#203)", () => {
    it("ships all seven templates", () => {
        expect(Object.keys(TEMPLATE_SET).sort()).toEqual([
            "notify_daily_digest", "notify_import_invitation", "notify_new_issue", "notify_preferences_updated",
            "notify_subscription_confirm", "notify_weekly_digest", "notify_welcome",
        ])
    })

    it.each(entries)("%s declares every variable it uses and renders cleanly", (name, t) => {
        const used = extractAllVariables(t.html_content, t.subject, t.text_content)
        for (const v of used) expect(t.variables).toContain(v)
        const vars = sampleVariables(name)
        const html = renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES)
        const text = renderTemplate(t.text_content, vars)
        expect(html).not.toMatch(/\{\{/)
        expect(text).not.toMatch(/\{\{/)
    })

    it.each(entries)("%s has the compliant footer, a text part and accessibility basics", (name, t) => {
        expect(t.html_content).toContain('<html lang="en"')
        expect(t.html_content).toContain("{{preheader}}")
        expect(t.html_content).toContain("prefers-color-scheme: dark")
        expect(t.html_content).toContain("{{privacy_url}}")
        expect(t.html_content).toContain("{{publisher_address}}")
        expect(t.html_content).toMatch(/You are receiving this/)
        expect(t.text_content).toMatch(/You are receiving this/)
        // Before consent there is nothing to manage; every other email offers manage + unsubscribe.
        if (name !== "notify_subscription_confirm") {
            expect(t.html_content).toContain("{{manage_url}}")
            expect(t.html_content).toContain("{{unsubscribe_url}}")
            expect(t.text_content).toContain("{{unsubscribe_url}}")
        }
    })

    it.each(entries)("%s keeps an academic register (no exclamation marks)", (_name, t) => {
        // Copy only: drop the doctype and the <style> block (CSS uses !important).
        const html = t.html_content.replace(/<!DOCTYPE[^>]*>/i, "").replace(/<style[\s\S]*?<\/style>/i, "")
        const visible = html.replace(/<[^>]+>/g, " ") + t.text_content + t.subject
        expect(visible).not.toContain("!")
    })

    it("only uses raw insertion for the allow-listed blocks", () => {
        for (const [, t] of entries) {
            for (const m of t.html_content.matchAll(/\{\{\{(\w+)\}\}\}/g)) {
                expect(RAW_BLOCK_VARIABLES as readonly string[]).toContain(m[1])
            }
        }
    })

    it("renders the editor's note only when there is one, escaped", () => {
        expect(buildEditorNote("")).toBe("")
        expect(buildEditorNote(null)).toBe("")
        expect(buildEditorNote("A <b>note</b>\nline two")).toContain("A &lt;b&gt;note&lt;/b&gt;<br>line two")
    })
})

describe("seedNotificationTemplates", () => {
    function fakeDb(existing: string[] = []) {
        const rows = new Map(existing.map((n) => [n, { id: 1n, name: n, subject: "edited" } as Record<string, unknown>]))
        return {
            rows,
            db: {
                emailTemplate: {
                    findUnique: vi.fn(async ({ where }: any) => rows.get(where.name) ?? null),
                    create: vi.fn(async ({ data }: any) => { rows.set(data.name, data); return data }),
                    update: vi.fn(async ({ where, data }: any) => { rows.set(where.name, { ...rows.get(where.name), ...data }); return data }),
                },
            },
        }
    }

    it("creates missing templates and keeps edited ones unless forced", async () => {
        const { db, rows } = fakeDb(["notify_new_issue"])
        const first = await seedNotificationTemplates(db as any)
        expect(first.created).toHaveLength(6)
        expect(first.kept).toEqual(["notify_new_issue"])
        expect(rows.get("notify_new_issue")!.subject).toBe("edited")

        const again = await seedNotificationTemplates(db as any)
        expect(again.created).toHaveLength(0)
        expect(rows.size).toBe(7)

        const forced = await seedNotificationTemplates(db as any, { force: true })
        expect(forced.restored).toHaveLength(7)
        expect(rows.get("notify_new_issue")!.subject).toBe(TEMPLATE_SET.notify_new_issue.subject)
    })
})
