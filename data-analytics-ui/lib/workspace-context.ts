import type { Workspace } from "@/types/workspace"

export interface WorkspaceContext {
  workspaceId: string
  hasDataset: boolean
  isDataCleaned: boolean
  isOutlierHandled: boolean
  datasetSummaryAvailable: boolean
  datasetCount: number
  cleaningStepsCount: number
  lastActivity?: number
}

export function computeWorkspaceContext(workspace: Workspace | null): WorkspaceContext | null {
  if (!workspace) {
    return null
  }

  return {
    workspaceId: workspace.id,
    hasDataset: workspace.state.datasetAttached && workspace.datasets.length > 0,
    isDataCleaned: workspace.state.cleaningStarted,
    isOutlierHandled: false,
    datasetSummaryAvailable: workspace.state.overviewReady,
    datasetCount: workspace.datasets.length,
    cleaningStepsCount: workspace.steps.cleaningSteps.length,
    lastActivity: workspace.updatedAt,
  }
}

export function getRecommendation(context: WorkspaceContext): {
  action: string
  page: string
  message: string
} | null {
  if (!context.hasDataset) {
    return {
      action: "Upload Dataset",
      page: "dataset",
      message: "Upload a dataset to get started",
    }
  }

  if (!context.datasetSummaryAvailable) {
    return {
      action: "Review Overview",
      page: "overview",
      message: "Review your dataset overview",
    }
  }

  if (!context.isDataCleaned) {
    return {
      action: "Data Cleaning Recommended",
      page: "cleaning",
      message: "Start data cleaning to prepare your dataset",
    }
  }

  if (context.isDataCleaned && !context.isOutlierHandled) {
    return {
      action: "Handle Outliers",
      page: "outlier",
      message: "Review and handle outliers in your data",
    }
  }

  if (context.isDataCleaned) {
    return {
      action: "Visualize Data",
      page: "visualization",
      message: "Your data is ready for visualization",
    }
  }

  return null
}
