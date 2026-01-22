import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { callGroq, isDecommissionError } from "@/lib/ai/getAiClient"
import type { AIMessage } from "@/lib/ai/getAiClient"

interface OutlierColumnSummary {
  column_name: string
  type: string
  outlier_count: number
  min_outlier: number
  max_outlier: number
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
  recommended_action: "Remove" | "Cap" | "Transform" | "Ignore"
  short_reason: string
  is_ai_recommendation: boolean
}

interface OutlierRecommendationResponse {
  recommendations: OutlierRecommendation[]
  success: boolean
  error?: string
}

/**
 * Build prompt for AI to recommend outlier handling actions
 */
function buildRecommendationPrompt(columns: OutlierColumnSummary[]): string {
  const columnsInfo = columns.map(col => {
    let info = `Column: ${col.column_name}\n`
    info += `- Type: ${col.type}\n`
    info += `- Outlier count: ${col.outlier_count}\n`
    info += `- Outlier range: ${col.min_outlier} to ${col.max_outlier}\n`
    if (col.mean !== undefined) {
      info += `- Mean: ${col.mean}\n`
    }
    if (col.median !== undefined) {
      info += `- Median: ${col.median}\n`
    }
    return info
  }).join("\n\n")

  return `You are a data quality expert. Analyze the following outlier information and recommend the BEST action for each column.

For each column, recommend ONE of these actions:
- "Remove": If outliers are clearly errors or will significantly harm analysis
- "Cap": If outliers are valid but extreme, cap them to reasonable bounds
- "Transform": If outliers indicate a need for log/box-cox transformation
- "Ignore": If outliers are valid and should be kept

Provide your response as a JSON array with this exact structure:
[
  {
    "column_name": "column_name",
    "recommended_action": "Remove|Cap|Transform|Ignore",
    "short_reason": "1-2 sentence explanation in simple human language"
  }
]

Outlier Information:
${columnsInfo}

Respond ONLY with valid JSON, no markdown, no code blocks.`
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
      const action = item.recommended_action || "Ignore"
      const validAction = validActions.includes(action) ? action : "Ignore"
      
      return {
        column_name: item.column_name || "",
        recommended_action: validAction,
        short_reason: item.short_reason || "No reason provided",
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
    // Rule-based logic: simple heuristics
    let action: "Remove" | "Cap" | "Transform" | "Ignore" = "Ignore"
    let reason = ""

    if (col.outlier_count > 50) {
      action = "Remove"
      reason = `High number of outliers (${col.outlier_count}) suggests data quality issues. Consider removing extreme values.`
    } else if (col.outlier_count > 10) {
      action = "Cap"
      reason = `Moderate outliers detected. Capping values to reasonable bounds may preserve data while reducing impact.`
    } else {
      action = "Ignore"
      reason = `Few outliers detected. These may be valid extreme values worth keeping.`
    }

    return {
      column_name: col.column_name,
      recommended_action: action,
      short_reason: reason,
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
