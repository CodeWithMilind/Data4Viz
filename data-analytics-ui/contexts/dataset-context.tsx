"use client"

/**
 * Dataset Context (Legacy Compatibility Layer)
 * 
 * NOTE: This is a compatibility wrapper around Workspace.
 * Workspace is the single source of truth for datasets.
 * 
 * This context provides a Dataset-like interface for components
 * that haven't been migrated to use workspace directly.
 */

import React, { createContext, useContext, ReactNode, useMemo } from "react"
import { useWorkspace } from "./workspace-context"
import type { WorkspaceDataset } from "@/types/workspace"

export interface Dataset {
  id: string
  name: string
  data: Record<string, any>[]
  headers: string[]
  rowCount: number
  columnCount: number
  source: "file" | "url"
  sourceUrl?: string
  uploadedAt: Date
}

interface DatasetContextType {
  datasets: Dataset[]
  currentDataset: Dataset | null
  setCurrentDataset: (dataset: Dataset | null) => void
  addDataset: (dataset: Omit<Dataset, "id" | "uploadedAt">) => Dataset
  removeDataset: (id: string) => void
  clearDatasets: () => void
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined)

/**
 * Convert WorkspaceDataset to Dataset format
 */
function workspaceDatasetToDataset(wsDataset: WorkspaceDataset): Dataset {
  return {
    id: wsDataset.id,
    name: wsDataset.name,
    data: wsDataset.data,
    headers: wsDataset.headers,
    rowCount: wsDataset.rowCount,
    columnCount: wsDataset.columnCount,
    source: wsDataset.source,
    sourceUrl: wsDataset.sourceUrl,
    uploadedAt: new Date(wsDataset.uploadedAt),
  }
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace, uploadDatasetToWorkspace, getDatasets } = useWorkspace()

  // Convert workspace datasets to Dataset format for compatibility
  const datasets = useMemo(() => {
    const wsDatasets = getDatasets()
    return wsDatasets.map(workspaceDatasetToDataset)
  }, [getDatasets])

  // For compatibility: return first dataset as current
  const currentDataset = useMemo(() => {
    return datasets.length > 0 ? datasets[0] : null
  }, [datasets])

  const addDataset = async (datasetData: Omit<Dataset, "id" | "uploadedAt">): Promise<Dataset> => {
    // Upload to workspace
    await uploadDatasetToWorkspace({
      name: datasetData.name,
      data: datasetData.data,
      headers: datasetData.headers,
      rowCount: datasetData.rowCount,
      columnCount: datasetData.columnCount,
      source: datasetData.source,
      sourceUrl: datasetData.sourceUrl,
    })

    // Return the newly uploaded dataset from workspace
    const wsDatasets = getDatasets()
    const wsDataset = wsDatasets[wsDatasets.length - 1] // Get the last one (newly added)
    if (!wsDataset) {
      throw new Error("Failed to upload dataset to workspace")
    }
    return workspaceDatasetToDataset(wsDataset)
  }

  const setCurrentDataset = (_dataset: Dataset | null) => {
    // No-op: dataset is managed by workspace
    // This is kept for API compatibility
  }

  const removeDataset = (_id: string) => {
    // No-op: dataset removal should be done via workspace
    // This is kept for API compatibility
  }

  const clearDatasets = () => {
    // No-op: dataset clearing should be done via workspace
    // This is kept for API compatibility
  }

  return (
    <DatasetContext.Provider
      value={{
        datasets,
        currentDataset,
        setCurrentDataset,
        addDataset: addDataset as any, // Type assertion for compatibility
        removeDataset,
        clearDatasets,
      }}
    >
      {children}
    </DatasetContext.Provider>
  )
}

export function useDataset() {
  const context = useContext(DatasetContext)
  if (context === undefined) {
    throw new Error("useDataset must be used within a DatasetProvider")
  }
  return context
}
