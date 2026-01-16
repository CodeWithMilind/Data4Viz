"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react"
import { workspaceStore } from "@/lib/workspace-store"
import { computeWorkspaceStatus } from "@/lib/workspace-status"
import { exportWorkspace, importWorkspace, downloadBlob } from "@/lib/workspace-export"
import type { Workspace, WorkspaceStatus, WorkspaceDataset } from "@/types/workspace"
import { parseCSV } from "@/lib/csv-parser"

interface WorkspaceContextType {
  // Workspace state
  currentWorkspace: Workspace | null
  workspaces: Workspace[]
  workspaceStatus: WorkspaceStatus
  isLoading: boolean
  activeWorkspaceId: string | null

  // Workspace operations
  createWorkspace: (name: string) => Promise<Workspace>
  loadWorkspace: (id: string) => Promise<void>
  saveWorkspace: () => Promise<void>
  updateWorkspaceName: (id: string, newName: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  listWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: string | null) => Promise<void>

  // Dataset operations (workspace-scoped)
  uploadDatasetToWorkspace: (data: {
    name: string
    data: Record<string, any>[]
    headers: string[]
    rowCount: number
    columnCount: number
    source: "file" | "url"
    sourceUrl?: string
  }) => Promise<void>
  removeDatasetFromWorkspace: (datasetId: string) => Promise<void>
  getDatasets: () => WorkspaceDataset[]
  getDataset: (datasetId: string) => WorkspaceDataset | null

  // Workspace state updates
  setOverviewReady: (ready: boolean) => Promise<void>
  setCleaningStarted: (started: boolean) => Promise<void>
  setFeaturesCreated: (created: boolean) => Promise<void>
  updateNotes: (notes: string) => Promise<void>
  addCleaningStep: (step: { type: string; name: string; description?: string; config?: Record<string, any> }) => Promise<void>
  addFeatureStep: (step: { type: string; name: string; description?: string; config?: Record<string, any> }) => Promise<void>

  // Export/Import
  exportCurrentWorkspace: () => Promise<void>
  importWorkspaceFromFile: (file: File) => Promise<Workspace>
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null)

  // Initialize store and load active workspace
  useEffect(() => {
    async function init() {
      try {
        await workspaceStore.init()
        
        // Load workspaces from storage (NO demo data)
        const storedWorkspaces = await workspaceStore.listWorkspaces()
        setWorkspaces(storedWorkspaces)

        // Load active workspace if exists
        const activeId = workspaceStore.getActiveWorkspace()
        setActiveWorkspaceIdState(activeId)
        
        if (activeId) {
          const workspace = await workspaceStore.loadWorkspace(activeId)
          if (workspace) {
            setCurrentWorkspace(workspace)
          } else {
            // Active workspace ID exists but workspace not found - clear it
            workspaceStore.setActiveWorkspace(null)
            setActiveWorkspaceIdState(null)
          }
        }
      } catch (error) {
        console.error("Failed to initialize workspace store:", error)
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [])

  // Compute workspace status
  const workspaceStatus = computeWorkspaceStatus(currentWorkspace)

  // List all workspaces
  const listWorkspaces = useCallback(async () => {
    try {
      const list = await workspaceStore.listWorkspaces()
      setWorkspaces(list)
    } catch (error) {
      console.error("Failed to list workspaces:", error)
    }
  }, [])

  // Create new workspace
  const createWorkspace = useCallback(async (name: string): Promise<Workspace> => {
    const workspace = await workspaceStore.createWorkspace(name)
    await listWorkspaces()
    setCurrentWorkspace(workspace)
    workspaceStore.setActiveWorkspace(workspace.id)
    setActiveWorkspaceIdState(workspace.id)
    return workspace
  }, [listWorkspaces])

  // Load workspace by ID
  const loadWorkspace = useCallback(async (id: string) => {
    try {
      const workspace = await workspaceStore.loadWorkspace(id)
      if (workspace) {
        setCurrentWorkspace(workspace)
        workspaceStore.setActiveWorkspace(id)
        setActiveWorkspaceIdState(id)
      }
    } catch (error) {
      console.error("Failed to load workspace:", error)
      throw error
    }
  }, [])

  // Save current workspace
  const saveWorkspace = useCallback(async () => {
    if (!currentWorkspace) return

    try {
      await workspaceStore.saveWorkspace(currentWorkspace)
      await listWorkspaces()
    } catch (error) {
      console.error("Failed to save workspace:", error)
      throw error
    }
  }, [currentWorkspace, listWorkspaces])

  // Update workspace name
  const updateWorkspaceName = useCallback(
    async (id: string, newName: string) => {
      try {
        const workspace = await workspaceStore.loadWorkspace(id)
        if (!workspace) {
          throw new Error("Workspace not found")
        }

        const updatedWorkspace: Workspace = {
          ...workspace,
          name: newName,
        }

        await workspaceStore.saveWorkspace(updatedWorkspace)
        await listWorkspaces()

        // Update current workspace if it's the one being renamed
        if (currentWorkspace?.id === id) {
          setCurrentWorkspace(updatedWorkspace)
        }
      } catch (error) {
        console.error("Failed to update workspace name:", error)
        throw error
      }
    },
    [currentWorkspace, listWorkspaces]
  )

  // Delete workspace
  const deleteWorkspace = useCallback(
    async (id: string) => {
      try {
        await workspaceStore.deleteWorkspace(id)
        await listWorkspaces()

        if (currentWorkspace?.id === id) {
          setCurrentWorkspace(null)
          workspaceStore.setActiveWorkspace(null)
        }
      } catch (error) {
        console.error("Failed to delete workspace:", error)
        throw error
      }
    },
    [currentWorkspace, listWorkspaces]
  )

  // Set active workspace
  const setActiveWorkspace = useCallback(async (id: string | null) => {
    workspaceStore.setActiveWorkspace(id)
    setActiveWorkspaceIdState(id)
    if (id) {
      await loadWorkspace(id)
    } else {
      setCurrentWorkspace(null)
    }
  }, [loadWorkspace])

  // Upload dataset directly to active workspace
  const uploadDatasetToWorkspace = useCallback(
    async (datasetData: {
      name: string
      data: Record<string, any>[]
      headers: string[]
      rowCount: number
      columnCount: number
      source: "file" | "url"
      sourceUrl?: string
    }) => {
      if (!currentWorkspace) {
        throw new Error("No active workspace. Please create or select a workspace first.")
      }

      // Infer column schema
      const columnMeta = datasetData.headers.map((header) => {
        const sampleValue = datasetData.data.find((row) => row[header] != null)?.[header]
        let type: "numeric" | "datetime" | "boolean" | "categorical" = "categorical"

        if (typeof sampleValue === "number") {
          type = "numeric"
        } else if (typeof sampleValue === "boolean") {
          type = "boolean"
        } else if (sampleValue && !isNaN(Date.parse(String(sampleValue)))) {
          type = "datetime"
        }

        const nullable = datasetData.data.some((row) => row[header] == null || row[header] === "")

        return {
          name: header,
          type,
          nullable,
        }
      })

      const workspaceDataset: WorkspaceDataset = {
        id: `dataset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: datasetData.name,
        fileName: datasetData.name,
        rowCount: datasetData.rowCount,
        columnCount: datasetData.columnCount,
        schema: columnMeta,
        data: datasetData.data,
        headers: datasetData.headers,
        source: datasetData.source,
        sourceUrl: datasetData.sourceUrl,
        uploadedAt: Date.now(),
      }

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        datasets: [...currentWorkspace.datasets, workspaceDataset],
        state: {
          ...currentWorkspace.state,
          datasetAttached: true,
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  // Remove dataset from workspace
  const removeDatasetFromWorkspace = useCallback(
    async (datasetId: string) => {
      if (!currentWorkspace) return

      const updatedDatasets = currentWorkspace.datasets.filter((ds) => ds.id !== datasetId)
      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        datasets: updatedDatasets,
        state: {
          ...currentWorkspace.state,
          datasetAttached: updatedDatasets.length > 0,
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  // Get all datasets from workspace
  const getDatasets = useCallback((): WorkspaceDataset[] => {
    return currentWorkspace?.datasets || []
  }, [currentWorkspace])

  // Get a specific dataset by ID
  const getDataset = useCallback(
    (datasetId: string): WorkspaceDataset | null => {
      return currentWorkspace?.datasets.find((ds) => ds.id === datasetId) || null
    },
    [currentWorkspace]
  )

  // Update state flags
  const setOverviewReady = useCallback(
    async (ready: boolean) => {
      if (!currentWorkspace) return

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        state: {
          ...currentWorkspace.state,
          overviewReady: ready,
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  const setCleaningStarted = useCallback(
    async (started: boolean) => {
      if (!currentWorkspace) return

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        state: {
          ...currentWorkspace.state,
          cleaningStarted: started,
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  const setFeaturesCreated = useCallback(
    async (created: boolean) => {
      if (!currentWorkspace) return

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        state: {
          ...currentWorkspace.state,
          featuresCreated: created,
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  // Update notes
  const updateNotes = useCallback(
    async (notes: string) => {
      if (!currentWorkspace) return

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        notes,
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  // Add steps
  const addCleaningStep = useCallback(
    async (step: { type: string; name: string; description?: string; config?: Record<string, any> }) => {
      if (!currentWorkspace) return

      const newStep = {
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...step,
        appliedAt: Date.now(),
      }

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        steps: {
          ...currentWorkspace.steps,
          cleaningSteps: [...currentWorkspace.steps.cleaningSteps, newStep],
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  const addFeatureStep = useCallback(
    async (step: { type: string; name: string; description?: string; config?: Record<string, any> }) => {
      if (!currentWorkspace) return

      const newStep = {
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...step,
        appliedAt: Date.now(),
      }

      const updatedWorkspace: Workspace = {
        ...currentWorkspace,
        steps: {
          ...currentWorkspace.steps,
          featureSteps: [...currentWorkspace.steps.featureSteps, newStep],
        },
      }

      setCurrentWorkspace(updatedWorkspace)
      await workspaceStore.saveWorkspace(updatedWorkspace)
      await listWorkspaces()
    },
    [currentWorkspace, listWorkspaces]
  )

  // Export workspace
  const exportCurrentWorkspace = useCallback(async () => {
    if (!currentWorkspace) {
      throw new Error("No workspace to export")
    }

    const blob = await exportWorkspace(currentWorkspace)
    const filename = `${currentWorkspace.name.replace(/[^a-z0-9]/gi, "_")}.d4v`
    downloadBlob(blob, filename)
  }, [currentWorkspace])

  // Import workspace
  const importWorkspaceFromFile = useCallback(
    async (file: File): Promise<Workspace> => {
      const { workspace, datasetCsv, datasetFiles } = await importWorkspace(file)

      // Check if workspace with same ID already exists
      const existing = await workspaceStore.loadWorkspace(workspace.id)
      if (existing) {
        // Generate new ID to avoid conflicts
        workspace.id = `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }

      // Migrate old format (dataset) to new format (datasets)
      if (!workspace.datasets && (workspace as any).dataset) {
        workspace.datasets = [(workspace as any).dataset].filter(Boolean)
      } else if (!workspace.datasets) {
        workspace.datasets = []
      }

      // Import datasets from CSV files
      const importedDatasets: WorkspaceDataset[] = []

      // Import from new format (multiple CSV files)
      for (const datasetFile of datasetFiles) {
        try {
          const parsed = parseCSV(datasetFile.content)
          const datasetMetadata = workspace.datasets.find(
            (ds) => ds.fileName === datasetFile.filename || ds.name === datasetFile.filename
          )

          if (datasetMetadata) {
            importedDatasets.push({
              ...datasetMetadata,
              data: parsed.data,
              headers: parsed.headers,
              rowCount: parsed.rowCount,
              columnCount: parsed.columnCount,
              source: "file" as const,
              uploadedAt: datasetMetadata.uploadedAt || Date.now(),
            })
          }
        } catch (error) {
          console.warn(`Failed to import dataset from ${datasetFile.filename}:`, error)
        }
      }

      // Import from legacy format (single dataset.csv)
      if (datasetCsv && workspace.datasets.length > 0 && importedDatasets.length === 0) {
        try {
          const parsed = parseCSV(datasetCsv)
          const datasetMetadata = workspace.datasets[0]

          importedDatasets.push({
            ...datasetMetadata,
            data: parsed.data,
            headers: parsed.headers,
            rowCount: parsed.rowCount,
            columnCount: parsed.columnCount,
            source: "file" as const,
            uploadedAt: datasetMetadata.uploadedAt || Date.now(),
          })
        } catch (error) {
          console.warn("Failed to import dataset from legacy .d4v file:", error)
        }
      }

      // Update workspace with imported datasets
      workspace.datasets = importedDatasets
      workspace.state.datasetAttached = importedDatasets.length > 0

      // Save imported workspace
      await workspaceStore.saveWorkspace(workspace)
      await listWorkspaces()

      // Set as inactive by default (don't auto-load)
      return workspace
    },
    [listWorkspaces]
  )

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        workspaceStatus,
        isLoading,
        activeWorkspaceId,
        createWorkspace,
        loadWorkspace,
        saveWorkspace,
        updateWorkspaceName,
        deleteWorkspace,
        listWorkspaces,
        setActiveWorkspace,
        uploadDatasetToWorkspace,
        removeDatasetFromWorkspace,
        getDatasets,
        getDataset,
        setOverviewReady,
        setCleaningStarted,
        setFeaturesCreated,
        updateNotes,
        addCleaningStep,
        addFeatureStep,
        exportCurrentWorkspace,
        importWorkspaceFromFile,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider")
  }
  return context
}
