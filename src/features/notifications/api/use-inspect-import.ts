"use client"

import { useMutation } from "@tanstack/react-query"
import { parseRpcResponse } from "@/src/lib/rpc-utils"

export interface ColumnMap {
  email: number
  name?: number
  first_name?: number
  last_name?: number
  interests?: number
}

export interface InspectResult {
  file_type: string
  headers: string[]
  has_header_row: boolean
  detected_column_map: ColumnMap | null
  row_count: number
  sample_rows: string[][]
}

/** Stateless: the server parses the file and returns headers and a sample without storing anything. */
export function useInspectImport() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/notifications/imports/inspect", { method: "POST", body: form })
      const body = await parseRpcResponse<{ data: InspectResult }>(res, "Failed to read the file")
      return body.data
    },
  })
}
