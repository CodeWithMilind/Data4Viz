/**
 * API Client for Data Cleaning operations
 *
 * This module handles all HTTP communication with the backend.
 * NO UI code or mock data should exist here.
 *
 * IMPORTANT: Workspace is the single source of truth.
 * All API calls must include workspace_id.
 * Backend is the single source of truth for all data.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface DatasetInfo {
  id: string;
  rows: number;
  columns: number;
}

export interface WorkspaceDatasetsResponse {
  workspace_id: string;
  datasets: DatasetInfo[];
}

export interface CleaningRequest {
  workspace_id: string; // REQUIRED: Workspace is the single source of truth
  dataset_id: string;
  operation: "missing_values" | "duplicates" | "invalid_format" | "outliers";
  column?: string;
  columns?: string[];
  action: string;
  parameters?: Record<string, any>;
  preview: boolean;
}

export interface CleaningResponse {
  affected_rows: number;
  affected_percentage: number;
  before_sample: Record<string, any>[];
  after_sample: Record<string, any>[];
  warning?: string;
  summary: string;
  success: boolean;
}

/**
 * Fetch list of available datasets from workspace
 * 
 * IMPORTANT: Workspace is the single source of truth.
 * Returns ONLY datasets that belong to the specified workspace.
 * No fake or global datasets are returned.
 * 
 * @param workspaceId Workspace identifier (required)
 * @returns List of dataset metadata (id, rows, columns)
 * @throws Error if API call fails
 */
export async function getWorkspaceDatasets(workspaceId: string): Promise<DatasetInfo[]> {
  try {
    const response = await fetch(`${BASE_URL}/workspaces/${workspaceId}/datasets`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch workspace datasets: ${response.statusText}`);
    }

    const data: WorkspaceDatasetsResponse = await response.json();
    return data.datasets;
  } catch (error) {
    console.error("Error fetching workspace datasets:", error);
    throw error;
  }
}

/**
 * Upload a dataset to workspace storage
 * 
 * This syncs a frontend workspace dataset to backend storage
 * so that backend can perform cleaning operations on it.
 * 
 * @param workspaceId Workspace identifier
 * @param file CSV file to upload
 * @returns Dataset metadata
 * @throws Error if API call fails
 */
export async function uploadDatasetToWorkspace(
  workspaceId: string,
  file: File
): Promise<DatasetInfo> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${BASE_URL}/workspaces/${workspaceId}/datasets/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Failed to upload dataset: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error uploading dataset to workspace:", error);
    throw error;
  }
}

/**
 * Preview a cleaning operation without applying changes
 * @param payload Cleaning operation request
 * @returns Preview response with before/after samples
 * @throws Error if API call fails
 */
export async function previewCleaning(payload: CleaningRequest): Promise<CleaningResponse> {
  try {
    const response = await fetch(`${BASE_URL}/cleaning/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        preview: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || errorData.detail || `Failed to preview: ${response.statusText}`);
    }

    const data: CleaningResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error previewing cleaning operation:", error);
    throw error;
  }
}

/**
 * Apply a cleaning operation and save the cleaned dataset
 * @param payload Cleaning operation request
 * @returns Response with operation summary
 * @throws Error if API call fails
 */
export async function applyCleaning(payload: CleaningRequest): Promise<CleaningResponse> {
  try {
    const response = await fetch(`${BASE_URL}/cleaning/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        preview: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || errorData.detail || `Failed to apply: ${response.statusText}`);
    }

    const data: CleaningResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error applying cleaning operation:", error);
    throw error;
  }
}

/**
 * Column summary from cleaning analysis
 */
export interface ColumnSummary {
  name: string;
  type: string;
  missing_pct: number;
  duplicates_pct: number;
  outliers: number | null;
  health_score: number;
}

/**
 * Cleaning summary response
 */
export interface CleaningSummaryResponse {
  rows: number;
  columns: ColumnSummary[];
  overall_score: number;
}

/**
 * Fetch data cleaning summary for a dataset
 * 
 * Workspace provides datasets, backend provides analysis.
 * Data Cleaning combines both to show quality metrics.
 * 
 * IMPORTANT: Gracefully handles 404/Not Found when endpoint is not implemented.
 * Returns safe fallback response instead of throwing error to prevent UI failure.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetName Dataset filename (required)
 * @returns Cleaning summary with column metrics, or safe fallback if endpoint not found
 */
export async function getCleaningSummary(
  workspaceId: string,
  datasetName: string
): Promise<CleaningSummaryResponse> {
  const requestUrl = `${BASE_URL}/workspaces/${workspaceId}/cleaning/summary`;
  const requestBody = { dataset: datasetName };
  
  console.log(`[getCleaningSummary] Request URL: ${requestUrl}`);
  console.log(`[getCleaningSummary] Request body:`, requestBody);
  console.log(`[getCleaningSummary] Called with workspaceId=${workspaceId}, datasetName=${datasetName}`);
  
  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[getCleaningSummary] Response status: ${response.status}`);
    console.log(`[getCleaningSummary] Response ok: ${response.ok}`);

    // Handle 404/Not Found gracefully - endpoint may not be implemented yet
    if (response.status === 404) {
      console.warn(`[getCleaningSummary] 404 - Endpoint not found, returning fallback`);
      return {
        rows: 0,
        columns: [],
        overall_score: 0,
      };
    }

    if (!response.ok) {
      // For other errors, also return safe fallback to prevent UI crash
      const errorText = await response.text().catch(() => response.statusText);
      console.warn(`[getCleaningSummary] Error ${response.status}: ${errorText}`);
      return {
        rows: 0,
        columns: [],
        overall_score: 0,
      };
    }

    const data: CleaningSummaryResponse = await response.json();
    console.log(`[getCleaningSummary] Parsed JSON data:`, data);
    console.log(`[getCleaningSummary] Success - rows=${data.rows}, columns=${data.columns.length}, overall_score=${data.overall_score}`);
    return data;
  } catch (error) {
    // Network errors or other exceptions - return safe fallback instead of throwing
    console.warn("[getCleaningSummary] Network error, using fallback:", error);
    return {
      rows: 0,
      columns: [],
      overall_score: 0,
    };
  }
}
