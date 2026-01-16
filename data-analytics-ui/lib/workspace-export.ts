/**
 * Workspace Export/Import Utilities
 * 
 * Handles .d4v file format (ZIP containing workspace.json and dataset.csv)
 * 
 * Export Format:
 * - workspace.json: Full workspace metadata, state, notes, steps
 * - dataset.csv: Optional dataset data (if dataset is attached)
 * 
 * Version: 1.0
 */

import JSZip from "jszip"
import type { Workspace, WorkspaceDataset } from "@/types/workspace"

/**
 * Export workspace to .d4v file
 */
export async function exportWorkspace(workspace: Workspace, dataset: WorkspaceDataset | null): Promise<Blob> {
  const zip = new JSZip()

  // Create workspace export without full dataset data (to reduce size)
  const exportWorkspace = {
    ...workspace,
    dataset: dataset
      ? {
          id: dataset.id,
          name: dataset.name,
          fileName: dataset.fileName,
          rowCount: dataset.rowCount,
          columnCount: dataset.columnCount,
          schema: dataset.schema,
          // Don't export full data in JSON - it's in CSV
        }
      : null,
  }

  // Add workspace.json
  const workspaceJson = JSON.stringify(exportWorkspace, null, 2)
  zip.file("workspace.json", workspaceJson)

  // Add dataset.csv if dataset is attached
  if (dataset) {
    const csvContent = convertDatasetToCSV(dataset)
    zip.file("dataset.csv", csvContent)
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: "blob" })
  return blob
}

/**
 * Import workspace from .d4v file
 */
export async function importWorkspace(file: File): Promise<{
  workspace: Workspace
  datasetCsv: string | null
}> {
  const zip = new JSZip()
  const zipData = await zip.loadAsync(file)

  // Read workspace.json
  const workspaceFile = zipData.file("workspace.json")
  if (!workspaceFile) {
    throw new Error("Invalid .d4v file: workspace.json not found")
  }

  const workspaceJson = await workspaceFile.async("string")
  let workspace: Workspace

  try {
    workspace = JSON.parse(workspaceJson) as Workspace
  } catch (error) {
    throw new Error("Invalid .d4v file: workspace.json is malformed")
  }

  // Validate version
  if (workspace.version !== "1.0") {
    throw new Error(`Unsupported workspace version: ${workspace.version}. Expected 1.0`)
  }

  // Read dataset.csv if present
  const datasetFile = zipData.file("dataset.csv")
  let datasetCsv: string | null = null

  if (datasetFile) {
    datasetCsv = await datasetFile.async("string")
  }

  return { workspace, datasetCsv }
}

/**
 * Convert WorkspaceDataset to CSV string
 */
function convertDatasetToCSV(dataset: WorkspaceDataset): string {
  const { headers, data } = dataset

  // Create CSV header row
  const csvRows: string[] = [headers.map(escapeCSVField).join(",")]

  // Create CSV data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header]
      if (value === null || value === undefined) {
        return ""
      }
      return escapeCSVField(String(value))
    })
    csvRows.push(values.join(","))
  }

  return csvRows.join("\n")
}

/**
 * Escape CSV field (handle quotes and commas)
 */
function escapeCSVField(field: string): string {
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
