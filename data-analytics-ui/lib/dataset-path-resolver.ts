/**
 * Dataset Path Resolver
 * 
 * Centralized helper to resolve dataset file paths using the EXACT same logic
 * as the backend's dataset_loader.py load_dataset function.
 * 
 * This ensures Auto Summarize and all other features use the same dataset storage location.
 * 
 * Path resolution matches backend/app/services/dataset_loader.py line 35:
 *   dataset_path = get_workspace_datasets_dir(workspace_id) / dataset_id
 * 
 * Which resolves to: workspaces/{workspaceId}/datasets/{datasetId}
 */

import path from "path"
import { existsSync } from "fs"

/**
 * Get the datasets directory for a workspace.
 * Matches backend/app/config.py get_workspace_datasets_dir()
 * 
 * Backend path: BASE_DIR / "workspaces" / workspace_id / "datasets"
 * Where BASE_DIR = Path(__file__).parent.parent (backend directory)
 * 
 * For Next.js, we check both possible locations:
 * 1. Project root / "workspaces" (most common)
 * 2. Backend directory / "workspaces" (if backend runs from its own directory)
 */
function getWorkspaceDatasetsDir(workspaceId: string): string[] {
  const projectRootWorkspaces = path.join(process.cwd(), "workspaces", workspaceId, "datasets")
  const backendWorkspaces = path.join(process.cwd(), "backend", "workspaces", workspaceId, "datasets")
  
  // Return both possible paths (caller will check which exists)
  return [projectRootWorkspaces, backendWorkspaces]
}

/**
 * Resolve dataset file path using the SAME logic as backend load_dataset().
 * 
 * Checks both possible workspace locations to match where backend actually stores files.
 * 
 * @param workspaceId Workspace identifier
 * @param datasetId Dataset filename (e.g., "sample.csv")
 * @returns Absolute path to dataset file, or null if not found
 */
export function getDatasetFilePath(workspaceId: string, datasetId: string): string | null {
  if (!workspaceId || !datasetId) {
    return null
  }

  // Check both possible locations (project root and backend directory)
  const possibleDirs = getWorkspaceDatasetsDir(workspaceId)
  
  for (const datasetsDir of possibleDirs) {
    const datasetPath = path.join(datasetsDir, datasetId)
    
    // Use the EXACT same path resolution as backend/app/services/dataset_loader.py line 35
    if (existsSync(datasetPath)) {
      return datasetPath
    }
  }

  // File not found in any expected location
  return null
}

/**
 * Check if dataset file exists.
 * Uses the same path resolution as getDatasetFilePath.
 */
export function datasetFileExists(workspaceId: string, datasetId: string): boolean {
  return getDatasetFilePath(workspaceId, datasetId) !== null
}
