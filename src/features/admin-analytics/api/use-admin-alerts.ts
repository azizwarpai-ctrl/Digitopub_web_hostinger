"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"
import { useSyncHealth } from "./use-sync-health"

function useUnreadMessagesCount() {
    return useQuery({
        queryKey: ["messages", "unread-count"],
        queryFn: async () => {
            const res = await client.messages.$get({ query: { countOnly: "true" } })
            const body = await parseRpcResponse<{ success: boolean; data: { unread: number; total: number } }>(
                res,
                "Failed to load message counts"
            )
            return body.data
        },
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
    })
}

export interface AdminAlerts {
    syncFailureStreak: number
    /** Journal covers the latest OJS sync found not loading (#239). */
    brokenCovers: number
    unreadMessages: number
    total: number
    isLoading: boolean
}

/**
 * Real data behind the header bell (which previously showed a hardcoded
 * "3"): consecutive recurring-job failures from the sync_runs ledger plus
 * unread contact messages.
 */
export function useAdminAlerts(): AdminAlerts {
    const syncHealth = useSyncHealth()
    const messages = useUnreadMessagesCount()

    const syncFailureStreak = syncHealth.data?.totalFailureStreak ?? 0
    const brokenCovers = syncHealth.data?.covers?.broken.length ?? 0
    const unreadMessages = messages.data?.unread ?? 0
    return {
        syncFailureStreak,
        brokenCovers,
        unreadMessages,
        total: syncFailureStreak + brokenCovers + unreadMessages,
        isLoading: syncHealth.isLoading || messages.isLoading,
    }
}
