"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export interface AlertJournalOption {
    id: string
    title: string
}

export interface AlertDisciplineOption {
    id: string
    name: string
    parent_id: string | null
}

export interface AlertOptions {
    journals: AlertJournalOption[]
    disciplines: AlertDisciplineOption[]
}

export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "bounced" | "complained"
export type ArticleFrequency = "weekly" | "daily" | "off"

export interface PreferencesSubscriber {
    email: string
    name: string | null
    status: SubscriberStatus
    article_frequency: ArticleFrequency
    issue_alerts: boolean
    journal_ids: string[]
    discipline_ids: string[]
}

export interface PreferencesLookup {
    subscriber: PreferencesSubscriber
    options: AlertOptions
}

/** Returned for a link from an admin test email: the page explains it and changes nothing. */
export interface TestLinkResult {
    test: true
}

export function isTestLinkResult(value: unknown): value is TestLinkResult {
    return typeof value === "object" && value !== null && (value as { test?: unknown }).test === true
}

export interface AccountSubscriberSummary {
    status: SubscriberStatus
    article_frequency: ArticleFrequency
    issue_alerts: boolean
}

export type AccountNotificationsState =
    | { state: "none" }
    | { state: "matchable"; subscriber: AccountSubscriberSummary }
    | { state: "linked"; subscriber: AccountSubscriberSummary; manage_url: string }

export interface SubscribeInput {
    email: string
    name?: string
    journal_ids: string[]
    discipline_ids: string[]
    website?: string
}

/** Error carrying the HTTP status and API error code (never includes tokens). */
export class NotificationApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message?: string) {
        super(message || code)
        this.status = status
        this.code = code
    }
}

interface Envelope<T> {
    success: boolean
    data?: T
    message?: string
    error?: unknown
}

async function request<T>(
    url: string,
    init?: { method: "POST"; body: unknown },
): Promise<{ data: T; message?: string }> {
    const res = await fetch(url, {
        method: init?.method ?? "GET",
        credentials: "same-origin",
        headers: init ? { "Content-Type": "application/json" } : undefined,
        body: init ? JSON.stringify(init.body) : undefined,
    })
    const body = (await res.json().catch(() => ({}))) as Envelope<T>
    if (!res.ok || body.success === false) {
        const code = typeof body.error === "string" ? body.error : `HTTP_${res.status}`
        throw new NotificationApiError(res.status, code, typeof body.error === "string" ? body.error : undefined)
    }
    return { data: body.data as T, message: body.message }
}

export function useNotificationOptions(enabled = true) {
    return useQuery<AlertOptions>({
        queryKey: ["notification-options"],
        queryFn: async () => (await request<AlertOptions>("/api/notifications/options")).data,
        enabled,
        staleTime: 10 * 60 * 1000,
    })
}

export function useSubscribeAlerts() {
    return useMutation({
        mutationFn: async (input: SubscribeInput) => {
            const r = await request<unknown>("/api/notifications/subscribe", {
                method: "POST",
                body: { website: "", ...input },
            })
            return r.message ?? ""
        },
    })
}

export function useConfirmSubscription() {
    return useMutation({
        mutationFn: async (token: string) =>
            (
                await request<
                    { status: "confirmed" | "already_active"; manage_url: string } | { status: "test" }
                >(
                    "/api/notifications/confirm",
                    { method: "POST", body: { token } },
                )
            ).data,
    })
}

export function usePreferencesLookup(token: string | null) {
    return useQuery<PreferencesLookup | TestLinkResult>({
        queryKey: ["notification-preferences", token],
        queryFn: async () =>
            (
                await request<PreferencesLookup | TestLinkResult>("/api/notifications/preferences/lookup", {
                    method: "POST",
                    body: { token },
                })
            ).data,
        enabled: !!token,
        retry: false,
        staleTime: 0,
        gcTime: 0,
    })
}

export interface SavePreferencesInput {
    token: string
    journal_ids: string[]
    discipline_ids: string[]
    article_frequency: ArticleFrequency
    issue_alerts: boolean
    resume?: boolean
}

export function useSavePreferences() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: SavePreferencesInput) =>
            request<unknown>("/api/notifications/preferences", { method: "POST", body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
    })
}

export function useUnsubscribe() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (token: string) =>
            request<{ status: "test" } | undefined>("/api/notifications/unsubscribe", {
                method: "POST",
                body: { token },
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
    })
}

export function useAccountNotifications() {
    return useQuery<AccountNotificationsState | null>({
        queryKey: ["account-notifications"],
        queryFn: async () => {
            try {
                return (await request<AccountNotificationsState>("/api/account/notifications")).data
            } catch (err) {
                if (err instanceof NotificationApiError && err.status === 401) return null
                throw err
            }
        },
        retry: false,
    })
}

export function useLinkAccountNotifications() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async () =>
            (
                await request<AccountNotificationsState>("/api/account/notifications/link", {
                    method: "POST",
                    body: {},
                })
            ).data,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["account-notifications"] }),
    })
}

/** Maps a subscribe failure to user-facing copy that never reveals subscription state. */
export function subscribeErrorMessage(err: unknown): string {
    if (err instanceof NotificationApiError) {
        if (err.status === 429) return "Too many requests. Please try again later."
        if (err.status === 400) return "Please check the email address and name."
    }
    return "Something went wrong. Please try again."
}

export function useAccountSubscribe() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: Omit<SubscribeInput, "website">) => {
            const r = await request<unknown>("/api/account/notifications/subscribe", {
                method: "POST",
                body: input,
            })
            return r.message ?? ""
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["account-notifications"] }),
    })
}
