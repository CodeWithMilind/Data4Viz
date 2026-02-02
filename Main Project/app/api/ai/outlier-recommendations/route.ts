import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { callGroq, isDecommissionError } from "@/lib/ai/getAiClient"
import type { AIMessage } from "@/lib/ai/getAiClient"
import { truncateArray, compactOutlierInfo, isWithinTokenLimit } from "@/lib/ai/token-reducer"

interface OutlierColumnSummary {
  column_name: string
  type: string
  lower_outlier_count?: number
  lower_outlier_min?: number
  lower_outlier_max?: number
  upper_outlier_count?: number
  upper_outlier_min?: number
  upper_outlier_max?: number
  mean?: number
  median?: number
}

interface OutlierRecommendationRequest {
  workspaceId: string
  datasetId: string
  columns: OutlierColumnSummary[]
  provider?: string
  model?: string
  apiKey?: string
}

interface OutlierRecommendation {
  column_name: string
  lower_action?: "Remove" | "Cap" | "Transform" | "Ignore"
  lower_reason?: string
  upper_action?: "Remove" | "Cap" | "Transform" | "Ignore"
  upper_reason?: string
  is_ai_recommendation: boolean
}

interface OutlierRecommendationResponse {
  recommendations: OutlierRecommendation[]
  success: boolean
  error?: string
}

/**
 * Build prompt for AI to recommend outlier handling actions
 * 
 * Token-optimized: Only includes essential fields, truncates large arrays
 */
function buildRecommendationPrompt(columns: OutlierColumnSummary[]): string {
  // Compact outlier info and limit to 15 columns max to reduce token usage
  const compactedColumns = compactOutlierInfo(columns);
  const limitedColumns = truncateArray(compactedColumns, 15);
  
  const columnsInfo = limitedColumns.map(col => {
    let info = `${col.column_name} (${col.type}):`;
    
    if (col.lower_outlier_count !== undefined && col.lower_outlier_count > 0) {
      info += ` ${col.lower_outlier_count} lower outliers`;
    }
    
    if (col.upper_outlier_count !== undefined && col.upper_outlier_count > 0) {
      if (col.lower_outlier_count !== undefined && col.lower_outlier_count > 0) {
        info += `, ${col.upper_outlier_count} upper outliers`;
      } else {
        info += ` ${col.upper_outlier_count} upper outliers`;
      }
    }
    
    if (col.mean !== undefined) {
      info += ` (mean: ${col.mean})`;
    }
    if (col.median !== undefined) {
      info += ` (median: ${col.median})`;
    }
    
    return info;
  }).join("\n");

  const prompt = `You are a data quality expert. Analyze outliers and recommend action: Remove | Cap | Transform | Ignore

For each column with outliers, recommend separate actions for LOWER and UPPER bounds.

COLUMNS WITH OUTLIERS:
${columnsInfo}

RESPOND ONLY with valid JSON array (no markdown):
[
  {
    "column_name": "string",
    "lower_action": "Remove|Cap|Transform|Ignore",
    "lower_reason": "1 sentence max",
    "upper_action": "Remove|Cap|Transform|Ignore",
    "upper_reason": "1 sentence max"
  }
]`;

  // Warn if prompt exceeds token limit
  if (!isWithinTokenLimit(prompt, 2000)) {
    console.warn(`[outlier-recommendations] Prompt exceeds token limit (${prompt.length} chars)`);
  }

  return prompt;
}

/**
 * Parse AI response and extract recommendations
 */
function parseAIRecommendations(
  aiContent: string,
  columns: OutlierColumnSummary[]
): OutlierRecommendation[] {
  try {
    // Try to extract JSON from markdown code blocks if present
    let jsonContent = aiContent.trim()
    const jsonMatch = jsonContent.match(/```(?:json)?\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      jsonContent = jsonMatch[1]
    }

    const parsed = JSON.parse(jsonContent)
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array")
    }

    const validActions: ("Remove" | "Cap" | "Transform" | "Ignore")[] = ["Remove", "Cap", "Transform", "Ignore"]
    
    return parsed.map((item: any) => {
      const lowerAction = item.lower_action || "Ignore"
      const upperAction = item.upper_action || "Ignore"
      const validLowerAction = validActions.includes(lowerAction) ? lowerAction : "Ignore"
      const validUpperAction = validActions.includes(upperAction) ? upperAction : "Ignore"
      
      return {
        column_name: item.column_name || "",
        lower_action: validLowerAction,
        lower_reason: item.lower_reason || "No reason provided",
        upper_action: validUpperAction,
        upper_reason: item.upper_reason || "No reason provided",
        is_ai_recommendation: true,
      }
    }).filter((rec: OutlierRecommendation) => 
      columns.some(col => col.column_name === rec.column_name)
    )
  } catch (error) {
    console.error("Failed to parse AI recommendations:", error)
    throw new Error("Failed to parse AI response")
  }
}

/**
 * Generate rule-based fallback recommendations
 */
function generateRuleBasedRecommendations(
  columns: OutlierColumnSummary[]
): OutlierRecommendation[] {
  return columns.map(col => {
    // Rule-based logic: simple heuristics for lower and upper separately
    let lowerAction: "Remove" | "Cap" | "Transform" | "Ignore" = "Ignore"
    let lowerReason = ""
    let upperAction: "Remove" | "Cap" | "Transform" | "Ignore" = "Ignore"
    let upperReason = ""

    // Lower-bound outliers: often valid minimums, but can be errors
    if (col.lower_outlier_count && col.lower_outlier_count > 50) {
      lowerAction = "Remove"
      lowerReason = `High number of lower-bound outliers (${col.lower_outlier_count}) suggests data quality issues. Consider removing extreme low values.`
    } else if (col.lower_outlier_count && col.lower_outlier_count > 10) {
      lowerAction = "Cap"
      lowerReason = `Moderate lower-bound outliers detected. Capping values to reasonable lower bound may preserve data while reducing impact.`
    } else if (col.lower_outlier_count && col.lower_outlier_count > 0) {
      lowerAction = "Ignore"
      lowerReason = `Few lower-bound outliers detected. These may be valid minimum values worth keeping.`
    }

    // Upper-bound outliers: often extreme spikes, more likely to be problematic
    if (col.upper_outlier_count && col.upper_outlier_count > 50) {
      upperAction = "Remove"
      upperReason = `High number of upper-bound outliers (${col.upper_outlier_count}) suggests data quality issues. Consider removing extreme high values.`
    } else if (col.upper_outlier_count && col.upper_outlier_count > 10) {
      upperAction = "Cap"
      upperReason = `Moderate upper-bound outliers detected. Capping values to reasonable upper bound may preserve data while reducing impact.`
    } else if (col.upper_outlier_count && col.upper_outlier_count > 0) {
      upperAction = "Ignore"
      upperReason = `Few upper-bound outliers detected. These may be valid extreme values worth keeping.`
    }

    return {
      column_name: col.column_name,
      lower_action: col.lower_outlier_count && col.lower_outlier_count > 0 ? lowerAction : undefined,
      lower_reason: col.lower_outlier_count && col.lower_outlier_count > 0 ? lowerReason : undefined,
      upper_action: col.upper_outlier_count && col.upper_outlier_count > 0 ? upperAction : undefined,
      upper_reason: col.upper_outlier_count && col.upper_outlier_count > 0 ? upperReason : undefined,
      is_ai_recommendation: false,
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OutlierRecommendationRequest
    const { workspaceId, datasetId, columns, provider, model, apiKey: bodyKey } = body

    if (!workspaceId || !datasetId || !columns || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { success: false, error: "workspaceId, datasetId, and columns array are required" },
        { status: 400 }
      )
    }

    if (provider !== "groq") {
      return NextResponse.json(
        { success: false, error: "Only Groq is supported" },
        { status: 400 }
      )
    }

    const key = process.env.GROQ_API_KEY || bodyKey
    if (!key || typeof key !== "string") {
      // Fallback to rule-based recommendations
      return NextResponse.json({
        success: true,
        recommendations: generateRuleBasedRecommendations(columns),
      })
    }

    const resolvedModel = model && isGroqModelSupported(model) ? model : GROQ_DEFAULT_MODEL

    // Build prompt
    const prompt = buildRecommendationPrompt(columns)
    const messages: AIMessage[] = [
      { role: "system", content: "You are a data quality expert. Provide concise, actionable recommendations." },
      { role: "user", content: prompt },
    ]

    // Call AI
    let result = await callGroq(key, resolvedModel, messages)

    // Fallback to default model if decommissioned
    if (result.error && isDecommissionError(result.error)) {
      result = await callGroq(key, GROQ_DEFAULT_MODEL, messages)
      if (result.error) {
        // Fallback to rule-based
        return NextResponse.json({
          success: true,
          recommendations: generateRuleBasedRecommendations(columns),
        })
      }
    }

    if (result.error || !result.content) {
      // Fallback to rule-based recommendations
      return NextResponse.json({
        success: true,
        recommendations: generateRuleBasedRecommendations(columns),
      })
    }

    // Parse AI response
    try {
      const aiRecommendations = parseAIRecommendations(result.content, columns)
      
      // Ensure all columns have recommendations (fill missing with rule-based)
      const columnNames = new Set(columns.map(col => col.column_name))
      const aiColumnNames = new Set(aiRecommendations.map(rec => rec.column_name))
      const missingColumns = columns.filter(col => !aiColumnNames.has(col.column_name))
      
      const ruleBasedForMissing = generateRuleBasedRecommendations(missingColumns)
      const allRecommendations = [...aiRecommendations, ...ruleBasedForMissing]

      return NextResponse.json({
        success: true,
        recommendations: allRecommendations,
      })
    } catch (parseError) {
      // Fallback to rule-based if parsing fails
      return NextResponse.json({
        success: true,
        recommendations: generateRuleBasedRecommendations(columns),
      })
    }
  } catch (error: any) {
    console.error("Error in outlier recommendations API:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get recommendations" },
      { status: 500 }
    )
  }
}
