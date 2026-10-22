"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"
import { parseRpcResponse } from "@/src/lib/rpc-utils"
import type { SampleVariablesResponse } from "../types/email-template-type"

export function useGetSampleVariables(id: string) {
  return useQuery({
    queryKey: ["email-template-sample-variables", id],
    queryFn: async () => {
      const res = await client["email-templates"][":id"]["sample-variables"].$get({ param: { id } })
      const body = await parseRpcResponse<{ success: boolean; data: SampleVariablesResponse }>(
        res,
        "Failed to load sample variables"
      )
      return body.data
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}
