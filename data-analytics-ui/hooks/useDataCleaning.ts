/**
 * React hook for Data Cleaning operations
 *
 * This hook manages:
 * - Workspace dataset list fetching
 * - Cleaning operation preview/apply
 * - Loading and error states
 *
 * IMPORTANT: Workspace is the single source of truth.
 * - No mock data or fake defaults
 * - Initial state is EMPTY - data comes only from backend
 * - All operations require workspace_id
 */

import { useState, useEffect, useCallback } from "react"
import { getWorkspaceDatasets, previewCleaning, applyCleaning } from "@/lib/api/dataCleaningClient"
import type { CleaningRequest, CleaningResponse } from "@/types/dataCleaning"
import type { DatasetInfo } from "@/lib/api/dataCleaningClient"

interface UseDataCleaningReturn {
  datasets: DatasetInfo[]
  loading: boolean
  error: string | null
  previewCleaning: (payload: CleaningRequest) => Promise<CleaningResponse>
  applyCleaning: (payload: CleaningRequest) => Promise<CleaningResponse>
  refreshDatasets: (workspaceId: string) => Promise<void>
}

export function useDataCleaning(workspaceId: string | null): UseDataCleaningReturn {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch: only fetch after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * Fetch datasets from workspace
   * Called on mount and when explicitly refreshed
   * IMPORTANT: Only called client-side to prevent hydration mismatches
   * IMPORTANT: Requires workspace_id - workspace is the single source of truth
   */
  const fetchDatasets = useCallback(async (wsId: string) => {
    if (!mounted || !wsId) {
      setDatasets([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await getWorkspaceDatasets(wsId)
      setDatasets(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch workspace datasets"
      setError(errorMessage)
      setDatasets([]) // Clear datasets on error - no fallback fake data
      console.error("Error fetching workspace datasets:", err)
    } finally {
      setLoading(false)
    }
  }, [mounted])

  // Fetch datasets only after mount and when workspace changes (client-side only)
  useEffect(() => {
    if (mounted && workspaceId) {
      fetchDatasets(workspaceId)
    } else if (mounted && !workspaceId) {
      // No workspace selected - clear datasets
      setDatasets([])
      setLoading(false)
      setError(null)
    }
  }, [mounted, workspaceId, fetchDatasets])

  /**
   * Preview a cleaning operation
   * IMPORTANT: payload must include workspace_id
   */
  const handlePreviewCleaning = useCallback(async (payload: CleaningRequest): Promise<CleaningResponse> => {
    if (!payload.workspace_id) {
      throw new Error("workspace_id is required for cleaning operations")
    }
    try {
      setError(null)
      const response = await previewCleaning(payload)
      return response
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to preview cleaning operation"
      setError(errorMessage)
      throw err
    }
  }, [])

  /**
   * Apply a cleaning operation
   * IMPORTANT: payload must include workspace_id
   * After successful apply, refreshes workspace datasets to show new cleaned file
   */
  const handleApplyCleaning = useCallback(async (payload: CleaningRequest): Promise<CleaningResponse> => {
    if (!payload.workspace_id) {
      throw new Error("workspace_id is required for cleaning operations")
    }
    try {
      setError(null)
      const response = await applyCleaning(payload)
      // Refresh datasets after successful apply (new cleaned file should appear)
      if (payload.workspace_id) {
        await fetchDatasets(payload.workspace_id)
      }
      return response
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to apply cleaning operation"
      setError(errorMessage)
      throw err
    }
  }, [fetchDatasets])

  return {
    datasets,
    loading,
    error,
    previewCleaning: handlePreviewCleaning,
    applyCleaning: handleApplyCleaning,
    refreshDatasets: (wsId: string) => fetchDatasets(wsId),
  }
}
