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

import { safeFetch, safeFetchJson, FetchError } from "./safe-fetch";

// Get base URL with validation (lazy evaluation to avoid errors during module load)
function getBaseUrlSafe(): string {
  // Only access process.env in browser/client context
  if (typeof window === 'undefined') {
    // SSR - return default, will be validated on first use
    return "http://localhost:8000";
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  // Validate it's not file:// and is a valid HTTP(S) URL
  if (baseUrl.startsWith('file://')) {
    console.error('Cannot use file:// protocol for API calls. Please use http://localhost:8000');
    return "http://localhost:8000"; // Fallback to default
  }
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    console.error(`Invalid API base URL: ${baseUrl}. Must start with http:// or https://`);
    return "http://localhost:8000"; // Fallback to default
  }
  return baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
}

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

export interface DetectedOutlier {
  column_name: string;
  detected_value: number | null;
  outlier_score: number;
  row_index: number;
  suggested_action: "Review" | "Cap" | "Remove";
  outlier_type: "lower" | "upper"; // Indicates if below lower bound or above upper bound
}

export interface OutlierDetectionResponse {
  workspace_id: string;
  dataset_id: string;
  method: string;
  outliers: DetectedOutlier[];
  total_outliers: number;
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
    const data: WorkspaceDatasetsResponse = await safeFetchJson<WorkspaceDatasetsResponse>(
      `/workspaces/${workspaceId}/datasets`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
      getBaseUrlSafe()
    );
    return data.datasets;
  } catch (error) {
    console.error("Error fetching workspace datasets:", error);
    if (error instanceof FetchError) {
      throw new Error(`Failed to fetch workspace datasets: ${error.message}`);
    }
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

    const data = await safeFetchJson<DatasetInfo>(
      `/workspaces/${workspaceId}/datasets/upload`,
      {
        method: "POST",
        body: formData,
        timeout: 60000, // Longer timeout for file uploads
      },
      getBaseUrlSafe()
    );
    return data;
  } catch (error) {
    console.error("Error uploading dataset to workspace:", error);
    if (error instanceof FetchError) {
      throw new Error(`Failed to upload dataset: ${error.message}`);
    }
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
    const data = await safeFetchJson<CleaningResponse>(
      `/cleaning/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          preview: true,
        }),
        timeout: 30000,
      },
      getBaseUrlSafe()
    );
    return data;
  } catch (error) {
    console.error("Error previewing cleaning operation:", error);
    if (error instanceof FetchError) {
      throw new Error(`Failed to preview cleaning operation: ${error.message}`);
    }
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
    const data = await safeFetchJson<CleaningResponse>(
      `/cleaning/apply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          preview: false,
        }),
        timeout: 60000, // Longer timeout for apply operations
      },
      getBaseUrlSafe()
    );
    return data;
  } catch (error) {
    console.error("Error applying cleaning operation:", error);
    if (error instanceof FetchError) {
      throw new Error(`Failed to apply cleaning operation: ${error.message}`);
    }
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
  const requestUrl = `${getBaseUrlSafe()}/workspaces/${workspaceId}/cleaning/summary`;
  const requestBody = { dataset: datasetName };
  
  console.log(`[getCleaningSummary] Request URL: ${requestUrl}`);
  console.log(`[getCleaningSummary] Request body:`, requestBody);
  console.log(`[getCleaningSummary] Called with workspaceId=${workspaceId}, datasetName=${datasetName}`);
  
  try {
    const response = await safeFetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      timeout: 30000,
    }, getBaseUrlSafe());

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

    const data: CleaningSummaryResponse = await response.json();
    console.log(`[getCleaningSummary] Parsed JSON data:`, data);
    console.log(`[getCleaningSummary] Success - rows=${data.rows}, columns=${data.columns.length}, overall_score=${data.overall_score}`);
    return data;
  } catch (error) {
    // Network errors or other exceptions - return safe fallback instead of throwing
    console.warn("[getCleaningSummary] Network error, using fallback:", error);
    if (error instanceof FetchError) {
      console.warn(`[getCleaningSummary] FetchError: ${error.message} (code: ${error.code})`);
    }
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
    `${getBaseUrlSafe()}/api/overview/file?workspace_id=${workspaceId}&dataset_id=${datasetId}`;

  console.log(`[getDatasetOverviewFromFile] Request URL: ${requestUrl}`);

  try {
    const response = await safeFetch(requestUrl, {
      method: "GET",
      timeout: 30000,
    }, getBaseUrlSafe());

    if (response.status === 404) {
      return null;
    }

    const data: OverviewResponse = await response.json();
    console.log(
      `[getDatasetOverviewFromFile] Success – rows=${data.total_rows}, columns=${data.total_columns}`
    );

    return data;
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null;
    }
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    console.error(`[getDatasetOverviewFromFile] Error: ${errorMessage}`);
    throw new Error(`Failed to fetch dataset overview: ${errorMessage}`);
  }
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
    `${getBaseUrlSafe()}/api/overview?workspace_id=${workspaceId}&dataset_id=${datasetId}&refresh=${refresh}`;

  console.log(`[getDatasetOverview] Request URL: ${requestUrl}, refresh=${refresh}`);

  try {
    const response = await safeFetch(requestUrl, {
      method: "GET",
      timeout: 30000,
    }, getBaseUrlSafe());

    if (response.status === 404) {
      return null;
    }

    const data: OverviewResponse = await response.json();
    console.log(
      `[getDatasetOverview] Success – rows=${data.total_rows}, columns=${data.total_columns}`
    );

    return data;
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null;
    }
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    console.error(`[getDatasetOverview] Error: ${errorMessage}`);
    throw new Error(`Failed to fetch dataset overview: ${errorMessage}`);
  }
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
    `${getBaseUrlSafe()}/api/overview/refresh?workspace_id=${workspaceId}&dataset_id=${datasetId}`;

  console.log(`[refreshDatasetOverview] Request URL: ${requestUrl}`);

  try {
    const data = await safeFetchJson<OverviewResponse>(
      requestUrl,
      {
        method: "POST",
        timeout: 60000, // Longer timeout for refresh operations
      },
      getBaseUrlSafe()
    );
    console.log(
      `[refreshDatasetOverview] Success – rows=${data.total_rows}, columns=${data.total_columns}`
    );
    return data;
  } catch (error) {
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    console.error(`[refreshDatasetOverview] Error: ${errorMessage}`);
    throw new Error(`Failed to refresh dataset overview: ${errorMessage}`);
  }
}

/**
 * Generate dataset intelligence snapshot from overview.
 * 
 * This creates a compact JSON snapshot that AI uses for analysis.
 * 
 * CLIENT-ONLY: This function must be called from client-side code only.
 * It uses fetch() which is not available in server environments.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @returns Success status
 * @throws Error if API call fails or if called in server environment
 */
export async function generateDatasetIntelligenceSnapshot(
  workspaceId: string,
  datasetId: string
): Promise<void> {
  // Guard: Only execute in browser environment
  if (typeof window === 'undefined') {
    console.warn('[generateDatasetIntelligenceSnapshot] Skipped: Called in server environment. This function must be called client-side only.');
    return; // Silently skip on server - not an error, just not applicable
  }

  const requestUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/workspaces/${workspaceId}/dataset-intelligence`;

  console.log(`[generateDatasetIntelligenceSnapshot] Request URL: ${requestUrl}`);

  try {
    await safeFetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ datasetId }),
      timeout: 60000, // Longer timeout for AI operations
    }, process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");
    console.log(`[generateDatasetIntelligenceSnapshot] Success`);
  } catch (error) {
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    console.error(`[generateDatasetIntelligenceSnapshot] Error: ${errorMessage}`);
    throw new Error(`Failed to generate dataset intelligence: ${errorMessage}`);
  }
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
 * CLIENT-ONLY: This function must be called from client-side code only.
 * It uses fetch() which is not available in server environments.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (required)
 * @param regenerate If true, regenerate using previous intelligence as context
 * @returns Column intelligence with explanations
 * @throws Error if API call fails or if called in server environment
 */
export async function generateColumnIntelligence(
  workspaceId: string,
  datasetId: string,
  regenerate: boolean = false
): Promise<ColumnIntelligence> {
  // Guard: Only execute in browser environment
  if (typeof window === 'undefined') {
    console.warn('[generateColumnIntelligence] Skipped: Called in server environment. This function must be called client-side only.');
    throw new Error('generateColumnIntelligence must be called client-side only');
  }

  const requestUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/workspaces/${workspaceId}/column-intelligence`;

  console.log(`[generateColumnIntelligence] Request URL: ${requestUrl}`);

  try {
    const data = await safeFetchJson<{ intelligence: ColumnIntelligence }>(
      requestUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ datasetId, regenerate }),
        timeout: 60000, // Longer timeout for AI operations
      },
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    );
    console.log(`[generateColumnIntelligence] Success`);
    return data.intelligence;
  } catch (error) {
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    console.error(`[generateColumnIntelligence] Error: ${errorMessage}`);
    throw new Error(`Failed to generate column intelligence: ${errorMessage}`);
  }
}

/**
 * Get column intelligence from workspace
 * 
 * CLIENT-ONLY: This function must be called from client-side code only.
 * It uses fetch() which is not available in server environments.
 * 
 * @param workspaceId Workspace identifier (required)
 * @returns Column intelligence with explanations, or null if not found
 * @throws Error if API call fails or if called in server environment
 */
export async function getColumnIntelligence(
  workspaceId: string
): Promise<ColumnIntelligence | null> {
  // Guard: Only execute in browser environment
  if (typeof window === 'undefined') {
    console.warn('[getColumnIntelligence] Skipped: Called in server environment. This function must be called client-side only.');
    return null; // Return null on server - not an error, just no data available
  }

  const requestUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/workspaces/${workspaceId}/column-intelligence`;

  try {
    const response = await safeFetch(requestUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }, process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");

    if (response.status === 404) {
      return null;
    }

    const data = await response.json();
    return data.intelligence;
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null;
    }
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    console.error(`[getColumnIntelligence] Error: ${errorMessage}`);
    throw new Error(`Failed to fetch column intelligence: ${errorMessage}`);
  }
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
    const response = await safeFetch(
      `/dataset/${encodeURIComponent(datasetId)}/schema?workspace_id=${encodeURIComponent(workspaceId)}&use_current=${useCurrent}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
      getBaseUrlSafe()
    );

    if (response.status === 404) {
      return null;
    }

    const data: SchemaResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching dataset schema:", error);
    if (error instanceof FetchError && error.status === 404) {
      return null;
    }
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    throw new Error(`Failed to fetch dataset schema: ${errorMessage}`);
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
    const data = await safeFetchJson<MissingValueCleanResponse>(
      `/dataset/${encodeURIComponent(datasetId)}/clean/missing?workspace_id=${encodeURIComponent(workspaceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        timeout: 60000, // Longer timeout for cleaning operations
      },
      getBaseUrlSafe()
    );
    return data;
  } catch (error) {
    console.error("Error cleaning missing values:", error);
    if (error instanceof FetchError) {
      throw new Error(`Failed to clean missing values: ${error.message}`);
    }
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
  const requestUrl = `${getBaseUrlSafe()}/workspaces/${workspaceId}`;

  console.log(`[deleteWorkspace] Request URL: ${requestUrl}`);

  try {
    const data = await safeFetchJson<{ message: string; workspace_id: string }>(
      requestUrl,
      {
        method: "DELETE",
        timeout: 30000,
      },
      getBaseUrlSafe()
    );
    console.log(`[deleteWorkspace] Success – workspace_id=${data.workspace_id}`);
    return data;
  } catch (error) {
    console.error("Error deleting workspace:", error);
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    throw new Error(`Failed to delete workspace: ${errorMessage}`);
  }
}

/**
 * Get cached outlier analysis if available.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (e.g., "sample.csv")
 * @returns Outlier detection response if cached and valid, null if not found
 * @throws Error if API call fails (other than 404)
 */
export async function getCachedOutlierAnalysis(
  workspaceId: string,
  datasetId: string
): Promise<OutlierDetectionResponse | null> {
  const requestUrl = `${getBaseUrlSafe()}/workspaces/${encodeURIComponent(workspaceId)}/datasets/${encodeURIComponent(datasetId)}/outliers/cached`;

  console.log(`[getCachedOutlierAnalysis] Request URL: ${requestUrl}`);

  try {
    const response = await safeFetch(requestUrl, {
      method: "GET",
      timeout: 30000,
    }, getBaseUrlSafe());

    if (response.status === 404) {
      // No cached analysis found - this is expected
      return null;
    }

    const data = await response.json();
    console.log(`[getCachedOutlierAnalysis] Success – loaded cached analysis with ${data.total_outliers} outliers`);
    return data;
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null;
    }
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    console.error("Error getting cached outlier analysis:", error);
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    throw new Error(`Failed to get cached outlier analysis: ${errorMessage}`);
  }
}

/**
 * Detect outliers in numeric columns of a dataset.
 * 
 * This function only detects outliers - it does NOT modify the dataset.
 * Purpose is understanding + local handling (no auto-clean).
 * Results are automatically cached for future use.
 * 
 * @param workspaceId Workspace identifier (required)
 * @param datasetId Dataset filename (e.g., "sample.csv")
 * @param method Detection method ("zscore" or "iqr", default: "zscore")
 * @param threshold Z-score threshold (only used for zscore method, default: 3.0)
 * @param forceRecompute If true, forces recomputation even if cached results exist
 * @returns Outlier detection response with list of detected outliers
 * @throws Error if API call fails
 */
export async function detectOutliers(
  workspaceId: string,
  datasetId: string,
  method: string = "zscore",
  threshold: number = 3.0,
  forceRecompute: boolean = false
): Promise<OutlierDetectionResponse> {
  const requestUrl = `${getBaseUrlSafe()}/workspaces/${encodeURIComponent(workspaceId)}/datasets/${encodeURIComponent(datasetId)}/outliers?method=${encodeURIComponent(method)}&threshold=${threshold}&force_recompute=${forceRecompute}`;

  console.log(`[detectOutliers] Request URL: ${requestUrl}`);

  try {
    const data = await safeFetchJson<OutlierDetectionResponse>(
      requestUrl,
      {
        method: "GET",
        timeout: 60000, // Longer timeout for outlier detection
      },
      getBaseUrlSafe()
    );
    console.log(`[detectOutliers] Success – detected ${data.total_outliers} outliers`);
    return data;
  } catch (error) {
    console.error("Error detecting outliers:", error);
    const errorMessage = error instanceof FetchError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : String(error);
    throw new Error(`Failed to detect outliers: ${errorMessage}`);
  }
}
