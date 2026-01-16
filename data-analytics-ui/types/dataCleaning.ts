/**
 * TypeScript types for Data Cleaning operations
 *
 * These types mirror the backend API request/response models.
 * Backend is the single source of truth - these types must stay in sync.
 */

/**
 * Response from GET /datasets
 */
export interface DatasetListResponse {
  datasets: string[];
}

/**
 * Request payload for cleaning operations
 * 
 * IMPORTANT: workspace_id is required.
 * Workspace is the single source of truth - all datasets belong to a workspace.
 */
export interface CleaningRequest {
  workspace_id: string; // REQUIRED: Workspace identifier
  dataset_id: string;
  operation: "missing_values" | "duplicates" | "invalid_format" | "outliers";
  column?: string;
  columns?: string[];
  action: string;
  parameters?: Record<string, any>;
  preview: boolean;
}

/**
 * Response from cleaning operations (preview/apply)
 */
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
 * Column information for filtering
 */
export interface ColumnInfo {
  name: string;
  dataType: string;
}

/**
 * Missing value column statistics
 */
export interface MissingValueColumn {
  name: string;
  dataType: string;
  missingCount: number;
  missingPercentage: number;
}

/**
 * Duplicate information
 */
export interface DuplicateInfo {
  count: number;
  percentage: number;
}

/**
 * Invalid format issue
 */
export interface InvalidFormatIssue {
  columnName: string;
  expectedType: string;
  invalidCount: number;
  sampleInvalidValues: string[];
  issueType: "numeric_text" | "invalid_date" | "inconsistent_casing" | "invalid_format";
}

/**
 * Outlier column information
 */
export interface OutlierColumn {
  name: string;
  outlierCount: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
}

/**
 * Column quality metrics
 */
export interface ColumnQuality {
  name: string;
  dataType: string;
  missingPercentage: number;
  duplicateContribution: number;
  typeConsistency: "consistent" | "warning" | "inconsistent";
  outlierCount: number;
  healthScore: number;
}
