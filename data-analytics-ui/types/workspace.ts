/**
 * Workspace Data Model
 * 
 * A Workspace is an Analysis Container that encapsulates:
 * - Dataset reference and metadata
 * - Analysis state (progress flags)
 * - User notes
 * - Applied steps (cleaning, features)
 * 
 * All workspace data is stored locally (IndexedDB/localStorage)
 * and can be exported/imported as .d4v files.
 */

export interface ColumnMeta {
  name: string
  type: "numeric" | "datetime" | "boolean" | "categorical"
  nullable: boolean
}

export interface Step {
  id: string
  type: string
  name: string
  description?: string
  appliedAt: number
  config?: Record<string, any>
}

export interface WorkspaceState {
  datasetAttached: boolean
  overviewReady: boolean
  cleaningStarted: boolean
  featuresCreated: boolean
}

/**
 * Workspace Dataset
 * 
 * Full dataset stored within workspace.
 * This is the single source of truth for dataset data.
 */
export interface WorkspaceDataset {
  id: string
  name: string
  fileName: string
  rowCount: number
  columnCount: number
  schema: ColumnMeta[]
  // Full dataset data
  data: Record<string, any>[]
  headers: string[]
  source: "file" | "url"
  sourceUrl?: string
  uploadedAt: number
}

export interface Workspace {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  datasets: WorkspaceDataset[]
  state: WorkspaceState
  notes: string
  steps: {
    cleaningSteps: Step[]
    featureSteps: Step[]
  }
  version: "1.0"
}

/**
 * Workspace Status
 * Derived from workspace state to guide user actions
 */
export interface WorkspaceStatus {
  statusLabel: string
  statusColor: "default" | "blue" | "green" | "yellow" | "orange" | "red"
  recommendedNextAction: string
}
