import { NextRequest, NextResponse } from "next/server"
import type { OverviewResponse } from "@/lib/api/dataCleaningClient"
import {
  saveColumnIntelligence,
  getColumnIntelligence,
  deleteColumnIntelligence,
  loadDatasetOverviewFromFile,
} from "@/lib/workspace-files"
import type { ColumnIntelligence } from "@/lib/workspace-files"

/**
 * Infer improved column type from name, inferred type, and sample values
 * STRICT RULES: Never mark categorical/boolean as numeric
 */
function inferImprovedType(
  colName: string,
  inferredType: string,
  uniqueCount: number,
  totalRows: number,
  topValues: Record<string, number> | undefined
): string {
  const nameLower = colName.toLowerCase().trim()
  
  // RULE 1: Check for index/identifier columns FIRST (highest priority)
  if (nameLower === "unnamed: 0" || nameLower.startsWith("unnamed:") || 
      nameLower === "index" || nameLower === "id" || nameLower === "row_id") {
    return "identifier"
  }
  
  // Check for identifier patterns in name
  if (nameLower.endsWith("_id") || (nameLower === "id" && uniqueCount === totalRows)) {
    if (uniqueCount === totalRows || uniqueCount > totalRows * 0.95) {
      return "identifier"
    }
  }
  
  // RULE 2: Check for boolean columns by name patterns (loan, housing, default)
  const booleanNamePatterns = ["loan", "housing", "default", "approved", "active", "enabled", "success"]
  if (booleanNamePatterns.some(pattern => nameLower.includes(pattern))) {
    // Verify with values if available
    if (topValues) {
      const valueSet = new Set(Object.keys(topValues).map(v => String(v).toLowerCase().trim()))
      const boolPatterns = [
        ["yes", "no"], ["true", "false"], ["1", "0"], ["y", "n"],
        ["approved", "rejected"], ["active", "inactive"], ["success", "failure"]
      ]
      for (const [a, b] of boolPatterns) {
        if ((valueSet.has(a) && valueSet.has(b)) || 
            (valueSet.has(a) && valueSet.size <= 3) ||
            (valueSet.has(b) && valueSet.size <= 3)) {
          return "boolean"
        }
      }
      // If only 2-3 unique values and name suggests boolean, treat as boolean
      if (uniqueCount <= 3 && booleanNamePatterns.some(p => nameLower.includes(p))) {
        return "boolean"
      }
    } else if (uniqueCount <= 3) {
      // If limited unique values and name suggests boolean
      return "boolean"
    }
  }
  
  // RULE 3: Check for boolean by value patterns (even if inferred as numeric)
  if (topValues) {
    const valueSet = new Set(Object.keys(topValues).map(v => String(v).toLowerCase().trim()))
    const boolPatterns = [
      ["yes", "no"], ["true", "false"], ["1", "0"], ["y", "n"],
      ["approved", "rejected"], ["active", "inactive"]
    ]
    for (const [a, b] of boolPatterns) {
      if (valueSet.has(a) && valueSet.has(b) && valueSet.size === 2) {
        return "boolean"
      }
    }
    // If only 2 unique values and they're boolean-like
    if (uniqueCount === 2 && (valueSet.has("yes") || valueSet.has("no") || 
        valueSet.has("true") || valueSet.has("false") || valueSet.has("1") || valueSet.has("0"))) {
      return "boolean"
    }
  }
  
  // RULE 4: Check for categorical columns by name patterns
  const categoricalNamePatterns = ["job", "marital", "education", "contact", "month", "day_of_week", 
                                    "day", "category", "type", "status", "class", "label"]
  if (categoricalNamePatterns.some(pattern => nameLower.includes(pattern))) {
    // If inferred as numeric but name suggests categorical, override to categorical
    if (inferredType === "numeric") {
      return "categorical"
    }
    return "categorical"
  }
  
  // RULE 5: If inferred as categorical, keep it categorical (never change to numeric)
  if (inferredType === "categorical") {
    return "categorical"
  }
  
  // RULE 6: If inferred as datetime, keep it datetime
  if (inferredType === "datetime") {
    return "datetime"
  }
  
  // RULE 7: Numeric ONLY if values represent measurable quantities
  // If unique count is very low relative to total rows, might be categorical
  if (inferredType === "numeric") {
    // If unique count is very low (< 5% of rows), might be categorical
    if (uniqueCount > 0 && uniqueCount < totalRows * 0.05 && uniqueCount < 20) {
      // Check if values look like categories
      if (topValues) {
        const valueKeys = Object.keys(topValues)
        // If top values are small integers (0, 1, 2, 3...) and limited, might be categorical
        const areSmallIntegers = valueKeys.every(v => {
          const num = Number(v)
          return !isNaN(num) && num >= 0 && num < 10 && Number.isInteger(num)
        })
        if (areSmallIntegers && uniqueCount <= 10) {
          return "categorical"
        }
      }
    }
    return "numeric"
  }
  
  // Fallback to inferred type
  return inferredType
}

/**
 * Generate column-specific meaning based on name, type, and sample values
 */
function generateColumnMeaning(
  colName: string,
  colType: string,
  uniqueCount: number,
  totalRows: number,
  topValues: Record<string, number> | undefined,
  hasMissing: boolean,
  missingPct: number
): string {
  const nameLower = colName.toLowerCase().trim()
  const topValueKeys = topValues ? Object.keys(topValues).slice(0, 5) : []
  
  // Special case: Index/Identifier columns
  if (colType === "identifier" || nameLower === "unnamed: 0" || nameLower.startsWith("unnamed:")) {
    return "Row identifier or index column used to uniquely identify each record in the dataset."
  }
  
  // Boolean columns - specific handling for loan, housing, default
  if (colType === "boolean") {
    if (nameLower.includes("loan")) {
      return "Boolean indicator showing whether a loan was approved or not (yes/no)."
    }
    if (nameLower.includes("housing")) {
      return "Boolean indicator showing housing loan status (yes/no)."
    }
    if (nameLower.includes("default")) {
      return "Boolean indicator showing whether the customer defaulted on payment (yes/no)."
    }
    const examples = topValueKeys.length > 0 ? ` (e.g., ${topValueKeys.slice(0, 2).join(", ")})` : ""
    return `Boolean flag indicating true/false or yes/no values${examples}.`
  }
  
  // Categorical columns - use name patterns and sample values
  if (colType === "categorical") {
    // Job-related
    if (nameLower.includes("job") || nameLower.includes("occupation") || nameLower.includes("position")) {
      const examples = topValueKeys.length > 0 ? ` Common values: ${topValueKeys.slice(0, 3).join(", ")}.` : ""
      return `Job title or occupation category${examples}`
    }
    // Marital status
    if (nameLower.includes("marital")) {
      return "Marital status of individuals (e.g., single, married, divorced)."
    }
    // Education
    if (nameLower.includes("education") || nameLower.includes("edu")) {
      const examples = topValueKeys.length > 0 ? ` Examples: ${topValueKeys.slice(0, 3).join(", ")}.` : ""
      return `Education level or qualification${examples}`
    }
    // Contact method
    if (nameLower.includes("contact")) {
      return "Method of contact (e.g., cellular, telephone)."
    }
    // Month/Day - temporal categorical
    if (nameLower.includes("month")) {
      const examples = topValueKeys.length > 0 ? ` Examples: ${topValueKeys.slice(0, 3).join(", ")}.` : ""
      return `Month of the year${examples}`
    }
    if (nameLower.includes("day_of_week") || nameLower.includes("dayofweek")) {
      const examples = topValueKeys.length > 0 ? ` Examples: ${topValueKeys.slice(0, 3).join(", ")}.` : ""
      return `Day of the week${examples}`
    }
    if (nameLower.includes("day") && !nameLower.includes("duration") && !nameLower.includes("delay")) {
      return "Day-related categorical feature."
    }
    // Default categorical with examples - be specific, not generic
    if (topValueKeys.length > 0) {
      return `Categorical feature with ${uniqueCount} distinct values. Common values: ${topValueKeys.slice(0, 3).join(", ")}.`
    }
    return `Categorical feature representing ${uniqueCount} distinct categories or labels.`
  }
  
  // Datetime columns
  if (colType === "datetime") {
    if (nameLower.includes("date")) {
      return "Date information for temporal analysis and time-based filtering."
    }
    if (nameLower.includes("time")) {
      return "Time information for scheduling or temporal analysis."
    }
    return "Date and time information for time-series analysis."
  }
  
  // Numeric columns - ONLY measurable quantities
  if (colType === "numeric") {
    // Age
    if (nameLower.includes("age")) {
      return "Age in years, representing the age of individuals in the dataset."
    }
    // Balance
    if (nameLower.includes("balance")) {
      return "Account balance or financial balance amount in currency units."
    }
    // Duration
    if (nameLower.includes("duration")) {
      return "Duration measurement, typically in seconds, minutes, or days."
    }
    // Campaign
    if (nameLower.includes("campaign")) {
      return "Number of contacts performed during the current campaign."
    }
    // Salary/Income
    if (nameLower.includes("salary") || nameLower.includes("income") || nameLower.includes("wage") || nameLower.includes("pay")) {
      return "Monetary compensation amount in currency units."
    }
    // Weight
    if (nameLower.includes("weight")) {
      return "Weight measurement in kilograms or pounds."
    }
    // Height
    if (nameLower.includes("height")) {
      return "Height measurement in centimeters or inches."
    }
    // Count/Number
    if (nameLower.includes("count") || (nameLower.includes("number") && !nameLower.includes("phone"))) {
      return "Count or quantity representing the number of occurrences."
    }
    // Score/Rating
    if (nameLower.includes("score") || nameLower.includes("rating") || nameLower.includes("rate")) {
      return "Numerical score or rating value for evaluation."
    }
    // Percentage
    if (nameLower.includes("percent") || nameLower.includes("pct") || nameLower.includes("%")) {
      return "Percentage value (0-100) representing a proportion."
    }
    // Amount/Value
    if (nameLower.includes("amount") || nameLower.includes("value") || nameLower.includes("price") || nameLower.includes("cost")) {
      return "Monetary or quantitative amount in currency or unit terms."
    }
    // Default numeric - be specific, not generic
    return "Numeric measurement representing a quantifiable value."
  }
  
  // Fallback
  return `Column containing ${colType} data${hasMissing ? ` (${missingPct}% missing)` : ""}.`
}

/**
 * Generate "why used" explanation based on column type and name
 */
function generateWhyUsed(
  colName: string,
  colType: string,
  uniqueCount: number,
  totalRows: number
): string {
  const nameLower = colName.toLowerCase().trim()
  
  // Identifier columns
  if (colType === "identifier") {
    return "Used as a unique identifier to reference specific rows and maintain data integrity."
  }
  
  // Boolean columns - contextual business purpose
  if (colType === "boolean") {
    if (nameLower.includes("loan")) {
      return "Used to filter and segment customers based on loan approval status for risk analysis and targeting."
    }
    if (nameLower.includes("housing")) {
      return "Used to identify customers with housing loans for financial product segmentation and risk assessment."
    }
    if (nameLower.includes("default")) {
      return "Used as a target variable for default prediction models and credit risk analysis."
    }
    return "Used for binary classification, filtering, and conditional segmentation in predictive modeling."
  }
  
  // Categorical columns
  if (colType === "categorical") {
    if (nameLower.includes("job") || nameLower.includes("occupation")) {
      return "Used for job-based segmentation, career analysis, and occupational grouping."
    }
    if (nameLower.includes("marital")) {
      return "Used for demographic analysis, customer segmentation, and lifestyle profiling."
    }
    if (nameLower.includes("education")) {
      return "Used for educational background analysis and qualification-based segmentation."
    }
    if (nameLower.includes("contact")) {
      return "Used to understand communication preferences and contact channel effectiveness."
    }
    return "Used for grouping, filtering, and categorical analysis to identify patterns across different categories."
  }
  
  // Datetime columns
  if (colType === "datetime") {
    return "Used for time-series analysis, temporal filtering, date-based aggregations, and trend identification."
  }
  
  // Numeric columns - contextual business/analytical purpose
  if (colType === "numeric") {
    if (nameLower.includes("age")) {
      return "Used for demographic segmentation, age-based customer profiling, and age-related trend analysis."
    }
    if (nameLower.includes("balance")) {
      return "Used for financial analysis, account segmentation, and balance-based customer classification."
    }
    if (nameLower.includes("duration")) {
      return "Used for time-based analysis, duration trends, and temporal pattern identification."
    }
    if (nameLower.includes("campaign")) {
      return "Used to measure campaign effectiveness, contact frequency analysis, and marketing optimization."
    }
    if (nameLower.includes("salary") || nameLower.includes("income") || nameLower.includes("wage")) {
      return "Used for income-based segmentation, financial capacity analysis, and economic profiling."
    }
    if (nameLower.includes("weight") || nameLower.includes("height")) {
      return "Used for physical attribute analysis, health metrics, and anthropometric studies."
    }
    if (nameLower.includes("score") || nameLower.includes("rating")) {
      return "Used for performance evaluation, quality assessment, and comparative ranking analysis."
    }
    return "Used for quantitative analysis, statistical modeling, and measurable attribute evaluation."
  }
  
  return "Used for data analysis and processing."
}

/**
 * Generate column intelligence explanations
 * Uses column name patterns, data types, and sample values to generate meaningful explanations
 */
function generateColumnIntelligence(
  overview: OverviewResponse,
  previousIntelligence: ColumnIntelligence | null,
  isRegenerating: boolean = false
): ColumnIntelligence {
  const columns = overview.columns.map((col) => {
    // Use previous intelligence as context if available
    const previous = previousIntelligence?.columns.find((c) => c.name === col.name)
    
    // Get column insights (top values, unique count)
    const insights = overview.column_insights?.[col.name]
    const uniqueCount = insights?.unique ?? 0
    const topValues = insights?.top_values
    
    // Infer improved type
    const improvedType = inferImprovedType(
      col.name,
      col.inferred_type,
      uniqueCount,
      overview.total_rows,
      topValues
    )
    
    // Generate new explanations
    // During regeneration, refine and correct previous mistakes
    const hasMissing = col.missing_count > 0
    const missingPct = col.missing_percentage
    
    // Check if previous type was incorrect (e.g., categorical marked as numeric)
    const previousType = previous?.data_type
    const typeWasIncorrect = previousType && previousType !== improvedType && 
                            (previousType === "numeric" && (improvedType === "categorical" || improvedType === "boolean"))
    
    // Generate new meaning - always generate fresh to correct mistakes
    let meaning = generateColumnMeaning(
      col.name,
      improvedType,
      uniqueCount,
      overview.total_rows,
      topValues,
      hasMissing,
      missingPct
    )
    
    // If regenerating and previous was generic, ensure new one is specific
    if (isRegenerating && previous?.meaning) {
      const wasGeneric = previous.meaning.includes("numeric column") || 
                        previous.meaning.includes("categorical column") ||
                        previous.meaning.includes("Column containing") ||
                        previous.meaning.includes("used for calculations")
      if (wasGeneric || typeWasIncorrect) {
        // Force regeneration with improved type
        meaning = generateColumnMeaning(
          col.name,
          improvedType,
          uniqueCount,
          overview.total_rows,
          topValues,
          hasMissing,
          missingPct
        )
      }
    }
    
    // Generate why used - always contextual
    const whyUsed = generateWhyUsed(
      col.name,
      improvedType,
      uniqueCount,
      overview.total_rows
    )
    
    return {
      name: col.name,
      data_type: improvedType,
      meaning,
      why_used: whyUsed,
    }
  })

  return {
    columns,
    generated_at: Date.now(),
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  const params = await Promise.resolve(context.params)
  const { workspaceId } = params
  
  console.log(`[Column Intelligence API HIT] POST /api/workspaces/${workspaceId}/column-intelligence`)
  
  try {
    const body = await req.json()
    const { datasetId, regenerate } = body as { datasetId?: string; regenerate?: boolean }

    console.log(`[Column Intelligence API] Request body: datasetId=${datasetId}, regenerate=${regenerate}`)

    if (!datasetId) {
      console.error(`[Column Intelligence API] Missing datasetId`)
      return NextResponse.json({ error: "datasetId required" }, { status: 400 })
    }

    // Get overview from file (SERVER-SIDE: reads from filesystem, not fetch)
    console.log(`[Column Intelligence API] Loading overview for dataset: ${datasetId}`)
    const overview = await loadDatasetOverviewFromFile(workspaceId, datasetId)
    if (!overview) {
      console.error(`[Column Intelligence API] Overview not found for dataset: ${datasetId}`)
      return NextResponse.json({ error: "Dataset overview not found. Please generate overview first." }, { status: 404 })
    }

    console.log(`[Column Intelligence API] Overview loaded - rows=${overview.total_rows}, columns=${overview.total_columns}`)

    // Get previous intelligence if regenerating
    let previousIntelligence: ColumnIntelligence | null = null
    if (regenerate) {
      console.log(`[Column Intelligence API] Regenerating - fetching previous intelligence`)
      previousIntelligence = await getColumnIntelligence(workspaceId)
      // Delete old intelligence file
      if (previousIntelligence) {
        console.log(`[Column Intelligence API] Deleting previous intelligence`)
        await deleteColumnIntelligence(workspaceId)
      }
    }

    // Generate new intelligence
    console.log(`[Column Intelligence API] Generating column intelligence...`)
    const intelligence = generateColumnIntelligence(overview, previousIntelligence, regenerate)
    
    console.log(`[Column Intelligence API] Generated intelligence for ${intelligence.columns.length} columns`)
    
    // Save to workspace
    await saveColumnIntelligence(workspaceId, intelligence)
    console.log(`[Column Intelligence API] Saved intelligence to workspace`)

    // Return response matching frontend expectations: { intelligence: ColumnIntelligence }
    return NextResponse.json({ intelligence })
  } catch (e: any) {
    console.error(`[Column Intelligence API] Error generating column intelligence:`, e)
    console.error(`[Column Intelligence API] Error stack:`, e?.stack)
    return NextResponse.json({ error: e?.message || "Failed to generate column intelligence" }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  const params = await Promise.resolve(context.params)
  const { workspaceId } = params

  console.log(`[Column Intelligence API HIT] GET /api/workspaces/${workspaceId}/column-intelligence`)

  try {
    const intelligence = await getColumnIntelligence(workspaceId)
    if (!intelligence) {
      console.log(`[Column Intelligence API] Intelligence not found for workspace: ${workspaceId}`)
      return NextResponse.json({ error: "Column intelligence not found" }, { status: 404 })
    }

    console.log(`[Column Intelligence API] Returning intelligence for ${intelligence.columns.length} columns`)
    return NextResponse.json({ intelligence })
  } catch (e: any) {
    console.error(`[Column Intelligence API] Error fetching column intelligence:`, e)
    console.error(`[Column Intelligence API] Error stack:`, e?.stack)
    return NextResponse.json({ error: e?.message || "Failed to fetch column intelligence" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    const { workspaceId } = params

    await deleteColumnIntelligence(workspaceId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Error deleting column intelligence:", e)
    return NextResponse.json({ error: e?.message || "Failed to delete column intelligence" }, { status: 500 })
  }
}
