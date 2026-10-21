import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { journalRouter } from "@/src/features/journals/server"
import { solutionRouter } from "@/src/features/solutions/server/route"
import { helpRouter, helpCategoriesRouter, helpTopicsRouter } from "@/src/features/help/server"
import { ojsRouter } from "@/src/features/ojs/server"
import { authRouter } from "@/src/features/auth/server"
import { messageRouter } from "@/src/features/messages/server"
import { metricsRouter } from "@/src/features/metrics/server"
import { reviewsRouter } from "@/src/features/reviews/server"
import { aboutRouter } from "@/src/features/about/server"
import { statisticsRouter } from "@/src/features/statistics/server"
import { emailTemplateRouter } from "@/src/features/email-templates/server"
import { billingRouter } from "@/src/features/billing/server"
import { searchRouter } from "@/src/features/search/server"
import { authOrcidRouter } from "@/src/server/routes/auth-orcid"
import { accountRouter } from "@/src/server/routes/account"
import { adminAnalyticsRouter } from "@/src/features/admin-analytics/server"
import { articleAudioRouter } from "@/src/features/article-audio/server"
import { notificationsRouter } from "@/src/features/notifications/server"
import { notificationsPublicRouter } from "@/src/server/routes/notifications-public"

const apiApp = new Hono()
    .route("/journals", journalRouter)
    .route("/solutions", solutionRouter)
    .route("/help", helpRouter)
    .route("/help-categories", helpCategoriesRouter)
    .route("/help-topics", helpTopicsRouter)
    // UIET-P1: ORCID public-user identity router. Mounted BEFORE admin auth
    // so /auth/orcid/* never accidentally routes through admin auth handlers.
    .route("/auth/orcid", authOrcidRouter)
    .route("/auth", authRouter)
    .route("/account", accountRouter)
    .route("/messages", messageRouter)
    .route("/ojs", ojsRouter)
    .route("/metrics", metricsRouter)
    .route("/reviews", reviewsRouter)
    .route("/about", aboutRouter)
    .route("/statistics", statisticsRouter)
    .route("/email-templates", emailTemplateRouter)
    .route("/billing", billingRouter)
    .route("/search", searchRouter)
    .route("/admin-analytics", adminAnalyticsRouter)
    .route("/article-audio", articleAudioRouter)
    // Public alert endpoints first: the admin router's use("*", requireAdmin)
    // must never see /notifications/subscribe, /confirm, /preferences, /unsubscribe.
    .route("/notifications", notificationsPublicRouter)
    .route("/notifications", notificationsRouter)


const app = new Hono().basePath("/api")

// Global middleware
app.use(
    "/*",
    cors({
        origin: (origin) => {
            const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || []

            // If no allowed origins configured, reject all
            if (allowedOrigins.length === 0) return null

            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return allowedOrigins[0] || null

            // Allow if origin is in the allowlist
            if (allowedOrigins.includes(origin)) {
                return origin
            }

            // Reject non-matching origins
            return null
        },
        credentials: true,
    })
)
app.use("/*", logger())

// Prevent all browsers and CDNs from caching API responses
// This is critical on Hostinger where hcdn can cache stale 403s
app.use("/*", async (c, next) => {
    await next()
    c.res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate")
    c.res.headers.set("Pragma", "no-cache")
})

// Mount API routes
app.route("/", apiApp)

// Error handling
app.onError((err, c) => {
    console.error(`[API Error]: ${err}`)
    return c.json(
        {
            success: false,
            error: {
                message: "Internal server error",
                details: process.env.NODE_ENV === "development" ? err.message : undefined,
            },
        },
        500
    )
})

// 404 handler
app.notFound((c) => {
    return c.json(
        {
            success: false,
            error: "Resource not found",
        },
        404
    )
})

export type AppType = typeof apiApp
export { app }
