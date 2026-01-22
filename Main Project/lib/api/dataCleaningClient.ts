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

// Schema types
export interface ColumnSchema {
  name: string;
  canonical_type: "numeric" | "categorical" | "datetime" | "boolean";
  pandas_dtype: string;
  total_rows: number;
  missing_count: number;
  missing_percentage: number;
  unique_count: number;
  numeric_stats?: {
    min?: number | null;
    max?: number | null;
    mean?: number | null;
    median?: number | null;
    std?: number | null;
    q25?: number | null;
    q75?: number | null;
  };
}

export interface SchemaResponse {
  workspace_id: string;
  dataset_id: string;
  total_rows: number;
  total_columns: number;
  columns: ColumnSchema[];
  computed_at: string;
  using_current: boolean;
}

export interface MissingValueCleanRequest {
  column: string;
  strategy: "drop" | "fill_mean" | "fill_median" | "fill_mode" | "fill_constant";
  constant_value?: any;
  preview: boolean;
}

export interface MissingValueCleanResponse {
  workspace_id: string;
  dataset_id: string;
  column: string;
  strategy: string;
  affected_rows: number;
  preview: boolean;
  schema: SchemaResponse | null;
  preview_rows?: Record<string, any>[] | null;  // Only included when preview=true
  preview_columns?: string[] | null;  // Only included when preview=true
}

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

/**
 * Column metadata from overview endpoint
 */
export interface OverviewColumnMetadata {
  name: string;
  inferred_type: "numeric" | "datetime" | "categorical";
  nullable: boolean;
  missing_count: number;
  missing_percentage: number;
}

/**
 * Overview response from backend
 */
export interface OverviewResponse {
  total_rows: number
  total_columns: number
  duplicate_row_count: number
  numeric_column_count: number
  categorical_column_count: number
  datetime_column_count: number
  columns: {
    name: string
    inferred_type: string
    nullable: boolean
    missing_count: number
    missing_percentage: number
  }[]

  // ✅ ADD THIS
  column_insights: Record<
    string,
    {
      unique: number
      top_values: Record<string, number>
    }
  >
}


/**
 * Fetch dataset overview from workspace file (cached).
 * 
 * WORKSPACE-CENTRIC: Reads from saved JSON file in workspace.
 * No computation - instant response if file exists.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @returns Overview summary with all statistics
 * @throws Error if file doesn't exist or API call fails
 */
export async function getDatasetOverviewFromFile(
  workspaceId: string,
  datasetId: string
): Promise<OverviewResponse | null> {
  const requestUrl =
    `${BASE_URL}/api/overview/file?workspace_id=${workspaceId}&dataset_id=${datasetId}`;

  console.log(`[getDatasetOverviewFromFile] Request URL: ${requestUrl}`);

  const response = await fetch(requestUrl, {
    method: "GET",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorText = await response.text().catch(() => response.statusText);
    console.error(
      `[getDatasetOverviewFromFile] Error ${response.status}: ${errorText}`
    );
    throw new Error(`Failed to fetch dataset overview: ${errorText}`);
  }

  const data: OverviewResponse = await response.json();
  console.log(
    `[getDatasetOverviewFromFile] Success – rows=${data.total_rows}, columns=${data.total_columns}`
  );

  return data;
}

/**
 * Compute and fetch dataset overview (forces recomputation).
 * 
 * WORKSPACE-CENTRIC: Computes overview and saves to workspace file.
 * Use this only when file doesn't exist or user explicitly requests refresh.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @param refresh If true, force recomputation even if file exists
 * @returns Overview summary with all statistics
 * @throws Error if API call fails
 */
export async function getDatasetOverview(
  workspaceId: string,
  datasetId: string,
  refresh: boolean = false
): Promise<OverviewResponse | null> {
  const requestUrl =
    `${BASE_URL}/api/overview?workspace_id=${workspaceId}&dataset_id=${datasetId}&refresh=${refresh}`;

  console.log(`[getDatasetOverview] Request URL: ${requestUrl}, refresh=${refresh}`);

  const response = await fetch(requestUrl, {
    method: "GET",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorText = await response.text().catch(() => response.statusText);
    console.error(
      `[getDatasetOverview] Error ${response.status}: ${errorText}`
    );
    throw new Error(`Failed to fetch dataset overview: ${errorText}`);
  }

  const data: OverviewResponse = await response.json();
  console.log(
    `[getDatasetOverview] Success – rows=${data.total_rows}, columns=${data.total_columns}`
  );

  return data;
}

/**
 * Force refresh/recompute overview and save to workspace file.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @returns Overview summary with all statistics
 * @throws Error if API call fails
 */
export async function refreshDatasetOverview(
  workspaceId: string,
  datasetId: string
): Promise<OverviewResponse> {
  const requestUrl =
    `${BASE_URL}/api/overview/refresh?workspace_id=${workspaceId}&dataset_id=${datasetId}`;

  console.log(`[refreshDatasetOverview] Request URL: ${requestUrl}`);

  const response = await fetch(requestUrl, {
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    console.error(
      `[refreshDatasetOverview] Error ${response.status}: ${errorText}`
    );
    throw new Error(`Failed to refresh dataset overview: ${errorText}`);
  }

  const data: OverviewResponse = await response.json();
  console.log(
    `[refreshDatasetOverview] Success – rows=${data.total_rows}, columns=${data.total_columns}`
  );

  return data;
}

/**
 * Generate dataset intelligence snapshot from overview.
 * 
 * This creates a compact JSON snapshot that AI uses for analysis.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @returns Success status
 * @throws Error if API call fails
 */
export async function generateDatasetIntelligenceSnapshot(
  workspaceId: string,
  datasetId: string
): Promise<void> {
  const requestUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/workspaces/${workspaceId}/dataset-intelligence`;

  console.log(`[generateDatasetIntelligenceSnapshot] Request URL: ${requestUrl}`);

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ datasetId }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    console.error(
      `[generateDatasetIntelligenceSnapshot] Error ${response.status}: ${errorText}`
    );
    throw new Error(`Failed to generate dataset intelligence: ${errorText}`);
  }

  console.log(`[generateDatasetIntelligenceSnapshot] Success`);
}

/**
 * Column Intelligence interfaces
 */
export interface ColumnIntelligence {
  columns: Array<{
    name: string
    data_type: string
    meaning: string
    why_used: string
  }>
  generated_at: number
}

/**
 * Generate column intelligence explanations
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @param regenerate If true, regenerate using previous intelligence as context
 * @returns Column intelligence with explanations
 * @throws Error if API call fails
 */
export async function generateColumnIntelligence(
  workspaceId: string,
  datasetId: string,
  regenerate: boolean = false
): Promise<ColumnIntelligence> {
  const requestUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/workspaces/${workspaceId}/column-intelligence`;

  console.log(`[generateColumnIntelligence] Request URL: ${requestUrl}`);

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ datasetId, regenerate }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    console.error(
      `[generateColumnIntelligence] Error ${response.status}: ${errorText}`
    );
    throw new Error(`Failed to generate column intelligence: ${errorText}`);
  }

  const data = await response.json();
  console.log(`[generateColumnIntelligence] Success`);
  return data.intelligence;
}

/**
 * Get column intelligence from workspace
 * 
 * @param workspaceId Workspace identifier (required)
 * @returns Column intelligence with explanations, or null if not found
 * @throws Error if API call fails
 */
export async function getColumnIntelligence(
  workspaceId: string
): Promise<ColumnIntelligence | null> {
  const requestUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/workspaces/${workspaceId}/column-intelligence`;

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    console.error(
      `[getColumnIntelligence] Error ${response.status}: ${errorText}`
    );
    throw new Error(`Failed to fetch column intelligence: ${errorText}`);
  }

  const data = await response.json();
  return data.intelligence;
}

/**
 * Get dataset schema from backend
 * 
 * Schema is the single source of truth for column metadata.
 * 
 * @param workspaceId Workspace identifier
 * @param datasetId Dataset filename
 * @param useCurrent If true, use current_df (modified); if false, use raw_df (original)
 * @returns Schema with column metadata
 * @throws Error if API call fails
 */
export async function getDatasetSchema(
  workspaceId: string,
  datasetId: string,
  useCurrent: boolean = true
): Promise<SchemaResponse | null> {
  try {
    const response = await fetch(
      `${BASE_URL}/dataset/${encodeURIComponent(datasetId)}/schema?workspace_id=${encodeURIComponent(workspaceId)}&use_current=${useCurrent}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch dataset schema: ${response.statusText}`);
    }

    const data: SchemaResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching dataset schema:", error);
    throw error;
  }
}

/**
 * Clean missing values in a dataset column
 * 
 * @param workspaceId Workspace identifier
 * @param datasetId Dataset filename
 * @param request Cleaning request with column, strategy, and preview flag
 * @returns Full response with schema (when preview=false) or preview data (when preview=true)
 * @throws Error if API call fails or validation fails
 */
export async function cleanMissingValues(
  workspaceId: string,
  datasetId: string,
  request: MissingValueCleanRequest
): Promise<MissingValueCleanResponse> {
  try {
    const response = await fetch(
      `${BASE_URL}/dataset/${encodeURIComponent(datasetId)}/clean/missing?workspace_id=${encodeURIComponent(workspaceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Failed to clean missing values: ${response.statusText}`);
    }

    const data: MissingValueCleanResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error cleaning missing values:", error);
    throw error;
  }
}

/**
 * Delete a workspace and ALL its files (cascade delete).
 * 
 * IMPORTANT: This is a hard delete operation that removes:
 * - Workspace directory and all subdirectories
 * - All uploaded datasets (CSV files)
 * - All overview files (*_overview.json)
 * - All cleaned datasets
 * - All cleaning summary JSONs
 * - All log files
 * - Any other workspace-generated files
 * 
 * @param workspaceId Workspace identifier (required)
 * @returns Success message
 * @throws Error if API call fails
 */
export async function deleteWorkspace(workspaceId: string): Promise<{ message: string; workspace_id: string }> {
  const requestUrl = `${BASE_URL}/workspaces/${workspaceId}`;

  console.log(`[deleteWorkspace] Request URL: ${requestUrl}`);

  try {
    const response = await fetch(requestUrl, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error(`[deleteWorkspace] Error ${response.status}: ${errorText}`);
      throw new Error(`Failed to delete workspace: ${errorText}`);
    }

    const data = await response.json();
    console.log(`[deleteWorkspace] Success – workspace_id=${data.workspace_id}`);
    return data;
  } catch (error) {
    console.error("Error deleting workspace:", error);
    throw error;
  }
}
