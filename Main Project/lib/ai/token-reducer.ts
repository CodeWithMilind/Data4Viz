/**
 * Token Reduction Utilities for LLM Requests
 * 
 * Reduces LLM input size by:
 * - Truncating large arrays
 * - Sending only essential fields
 * - Sampling data instead of full datasets
 * - Limiting context to ~3000 tokens
 */

/**
 * Truncate array to maximum length
 */
export function truncateArray<T>(arr: T[], maxLength: number = 5): T[] {
  if (arr.length <= maxLength) return arr;
  return arr.slice(0, maxLength);
}

/**
 * Truncate string to maximum tokens (rough estimate: 1 token ≈ 4 chars)
 */
export function truncateString(str: string, maxTokens: number = 500): string {
  const maxChars = maxTokens * 4;
  if (str.length <= maxChars) return str;
  return str.substring(0, maxChars) + "...(truncated)";
}

/**
 * Sample rows from dataset (e.g., first 3 rows for LLM)
 */
export function sampleRows(rows: Record<string, any>[], maxRows: number = 3): Record<string, any>[] {
  if (rows.length <= maxRows) return rows;
  return rows.slice(0, maxRows);
}

/**
 * Create compact column info (name + type only)
 */
export function compactColumnInfo(columnNames: string[], dtypes?: Record<string, string>): string {
  const maxCols = 20; // Limit columns shown
  const displayCols = columnNames.slice(0, maxCols);
  
  if (!dtypes) {
    return displayCols.join(", ");
  }
  
  return displayCols
    .map(name => `${name} (${dtypes[name] || "unknown"})`)
    .join(", ");
}

/**
 * Estimate JSON stringified size in tokens (rough: 1 token ≈ 4 chars)
 */
export function estimateTokenSize(obj: any): number {
  const str = JSON.stringify(obj);
  return Math.ceil(str.length / 4);
}

/**
 * Check if total prompt size is within token limit
 */
export function isWithinTokenLimit(promptContent: string, maxTokens: number = 3000): boolean {
  const estimatedTokens = Math.ceil(promptContent.length / 4);
  return estimatedTokens <= maxTokens;
}

/**
 * Compact outlier column summary (remove ranges, keep counts)
 */
export function compactOutlierInfo(columns: any[]): any[] {
  return columns.map(col => ({
    column_name: col.column_name,
    type: col.type,
    lower_outlier_count: col.lower_outlier_count,
    upper_outlier_count: col.upper_outlier_count,
    mean: col.mean ? parseFloat(col.mean.toFixed(2)) : undefined,
    median: col.median ? parseFloat(col.median.toFixed(2)) : undefined,
    // Drop min/max values to save tokens
  }));
}

/**
 * Generate fallback response if token limit exceeded
 */
export function generateFallbackResponse(type: "outlier" | "notebook"): string {
  if (type === "outlier") {
    return JSON.stringify({
      recommendations: [],
      success: false,
      error: "Dataset too large for AI analysis. Please use data cleaning to reduce dataset size or select fewer columns.",
    });
  }
  return JSON.stringify({
    success: false,
    error: "Dataset too large for notebook generation. Please upload a smaller dataset.",
  });
}
