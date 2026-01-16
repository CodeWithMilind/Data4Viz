/**
 * Workspace Status Helper
 * 
 * Computes current workspace status from state flags.
 * Provides status label, color, and recommended next action.
 * 
 * This is a pure function - deterministic and serializable.
 */

import type { Workspace, WorkspaceStatus } from "@/types/workspace"

/**
 * Compute workspace status from state
 */
export function computeWorkspaceStatus(workspace: Workspace | null): WorkspaceStatus {
  if (!workspace) {
    return {
      statusLabel: "No Workspace",
      statusColor: "default",
      recommendedNextAction: "Create or load a workspace to begin",
    }
  }

  const { state } = workspace

  // No dataset attached
  if (!state.datasetAttached) {
    return {
      statusLabel: "Dataset Required",
      statusColor: "orange",
      recommendedNextAction: "Attach a dataset to your workspace",
    }
  }

  // Dataset attached but overview not ready
  if (state.datasetAttached && !state.overviewReady) {
    return {
      statusLabel: "Overview Pending",
      statusColor: "yellow",
      recommendedNextAction: "Review dataset overview",
    }
  }

  // Overview ready but cleaning not started
  if (state.overviewReady && !state.cleaningStarted) {
    return {
      statusLabel: "Data Cleaning Recommended",
      statusColor: "blue",
      recommendedNextAction: "Start data cleaning to prepare your dataset",
    }
  }

  // Cleaning started but features not created
  if (state.cleaningStarted && !state.featuresCreated) {
    return {
      statusLabel: "Feature Engineering Available",
      statusColor: "green",
      recommendedNextAction: "Create features to enhance your dataset",
    }
  }

  // All steps completed
  if (state.featuresCreated) {
    return {
      statusLabel: "Analysis Complete",
      statusColor: "green",
      recommendedNextAction: "Your workspace is ready for visualization",
    }
  }

  // Fallback
  return {
    statusLabel: "In Progress",
    statusColor: "default",
    recommendedNextAction: "Continue your analysis",
  }
}
