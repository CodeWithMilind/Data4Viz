import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { callGroq, resolveApiKey, isDecommissionError } from "@/lib/ai/getAiClient"
import type { AIMessage } from "@/lib/ai/getAiClient"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

/**
 * Build strict system prompt for Groq.
 * Enforces: NO calculations, NO hallucinations, NO recommendations.
 */
function buildSystemPrompt(
  decisionMetric: string,
  backendStats: any
): string {
  return `You are a Decision-Driven EDA explanation agent.

CRITICAL RULES (NON-NEGOTIABLE):
1. You MUST NOT perform any calculations or statistical computations.
2. You MUST NOT hallucinate or invent data that is not provided.
3. You MUST NOT provide recommendations or action items.
4. You MUST output ONLY valid JSON following the exact schema provided.

YOUR ROLE:
- Explain the pre-computed statistics in human-readable language
- Prioritize factors based on the provided impact scores
- Describe why factors matter based on the evidence provided
- Assess confidence based on data quality signals

INPUT DATA:
- Decision Metric: ${decisionMetric}
- Pre-computed Statistics: ${JSON.stringify(backendStats, null, 2)}

OUTPUT SCHEMA (STRICT):
{
  "decision_metric": "${decisionMetric}",
  "top_insights": [
    {
      "rank": number,
      "factor": string,
      "why_it_matters": string,
      "evidence": string,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "data_risks": string[],
  "limitations": string
}

INSTRUCTIONS:
1. Extract top 5 factors from backendStats.top_factors
2. For each factor, write:
   - why_it_matters: Explain why this factor influences the decision metric (based on correlation/segment data)
   - evidence: Cite specific numbers from the statistics (e.g., "correlation: 0.75", "mean difference: 15.2")
   - confidence: Assess based on data quality (missing values, outlier percentage, sample size)
3. List data_risks: Missing values, outliers, small sample sizes, etc.
4. Write limitations: What the analysis cannot tell us (no causal inference, no predictions, etc.)

REMEMBER:
- Use ONLY the statistics provided
- Do NOT calculate anything
- Do NOT recommend actions
- Output ONLY valid JSON (no markdown, no code blocks)`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      datasetId,
      decisionMetric,
      provider,
      model,
      apiKey: bodyKey,
    } = body as {
      workspaceId?: string
      datasetId?: string
      decisionMetric?: string
      provider?: string
      model?: string
      apiKey?: string
    }

    if (provider !== "groq") {
      return NextResponse.json({ error: "Only Groq is supported" }, { status: 400 })
    }

    if (!workspaceId || !datasetId || !decisionMetric) {
      return NextResponse.json(
        { error: "workspaceId, datasetId, and decisionMetric are required" },
        { status: 400 }
      )
    }

    // Use the SAME API key resolution as AI Agent (shared helper)
    const key = resolveApiKey(bodyKey)
    if (!key) {
      return NextResponse.json({ error: "API key required" }, { status: 400 })
    }

    if (!model || !isGroqModelSupported(model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 })
    }

    // Step 1: Call backend to compute statistics
    const backendRes = await fetch(`${BACKEND_URL}/api/decision-eda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        dataset_id: datasetId,
        decision_metric: decisionMetric,
      }),
    })

    if (!backendRes.ok) {
      const errorData = await backendRes.json().catch(() => ({ detail: "Backend error" }))
      return NextResponse.json(
        { error: errorData.detail || "Failed to compute statistics" },
        { status: backendRes.status }
      )
    }

    const backendStats = await backendRes.json()

    // Step 2: Call Groq with strict system prompt (using shared Groq client)
    const systemPrompt = buildSystemPrompt(decisionMetric, backendStats)
    const messages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: "Generate insights based on the pre-computed statistics. Output ONLY valid JSON.",
      },
    ]

    let groqResult = await callGroq(key, model, messages)

    if (groqResult.error && isDecommissionError(groqResult.error)) {
      groqResult = await callGroq(key, GROQ_DEFAULT_MODEL, messages)
      if (groqResult.error) {
        return NextResponse.json(
          { error: "Model was updated. Please try again." },
          { status: 500 }
        )
      }
    }

    if (groqResult.error) {
      return NextResponse.json({ error: groqResult.error }, { status: 500 })
    }

    // Parse Groq JSON response
    let groqContent = groqResult.content || ""
    
    // Remove markdown code blocks if present
    const jsonMatch = groqContent.match(/```(?:json)?\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      groqContent = jsonMatch[1]
    }

    let insights
    try {
      insights = JSON.parse(groqContent)
    } catch (parseError) {
      // If JSON parsing fails, return error
      return NextResponse.json(
        {
          error: "Failed to parse Groq response as JSON",
          raw_response: groqContent.substring(0, 500),
        },
        { status: 500 }
      )
    }

    // Validate response structure
    if (!insights.decision_metric || !insights.top_insights) {
      return NextResponse.json(
        {
          error: "Invalid response structure from Groq",
          received: Object.keys(insights),
        },
        { status: 500 }
      )
    }

    // Post-process insights: Apply confidence cap and clean text
    const totalRows = backendStats.total_rows || backendStats.valid_rows || 0
    
    // Determine max allowed confidence based on dataset size
    let maxConfidence: "high" | "medium" | "low" = "high"
    if (totalRows < 30) {
      maxConfidence = "low"
    } else if (totalRows < 100) {
      maxConfidence = "medium"
    }

    // Process each insight
    const processedInsights = insights.top_insights.map((insight: any) => {
      // 1. Apply confidence cap
      let confidence = insight.confidence || "low"
      const confidenceLevels = ["low", "medium", "high"]
      const currentLevel = confidenceLevels.indexOf(confidence)
      const maxLevel = confidenceLevels.indexOf(maxConfidence)
      
      if (currentLevel > maxLevel) {
        confidence = maxConfidence
      }

      // 2. Ensure all text fields are strings (defensive conversion)
      // Convert objects/arrays to strings to prevent React rendering errors
      const ensureString = (value: any, fallback: string = ""): string => {
        if (typeof value === "string") return value
        if (typeof value === "number") return String(value)
        if (value === null || value === undefined) return fallback
        // If it's an object or array, convert to JSON string (shouldn't happen, but defensive)
        try {
          return JSON.stringify(value)
        } catch {
          return fallback
        }
      }

      // 3. Remove raw numbers from why_it_matters (keep qualitative language only)
      let whyItMatters = ensureString(insight.why_it_matters, "")
      // Replace numeric patterns with qualitative descriptions
      whyItMatters = whyItMatters
        .replace(/\bcorrelation[:\s]+([\d.-]+)/gi, (match, numStr) => {
          // Convert correlation value to qualitative term
          const num = Math.abs(parseFloat(numStr))
          if (num > 0.7) return "strong correlation"
          if (num > 0.4) return "moderate correlation"
          return "weak correlation"
        })
        .replace(/\bmean\s+difference[:\s]+[\d.-]+/gi, "substantial mean difference")
        .replace(/\b[\d.-]+\s*%/g, "") // Remove percentages (e.g., "23%")
        .replace(/\b[\d.-]+\b/g, "") // Remove standalone numbers
        .replace(/\s+/g, " ") // Normalize whitespace
        .replace(/\s*,\s*,/g, ",") // Remove double commas
        .replace(/^[,\s]+|[,\s]+$/g, "") // Remove leading/trailing commas/spaces
        .trim()
      
      // 4. Enforce language discipline: Replace forbidden phrases with allowed ones
      const languageReplacements: Array<[RegExp, string]> = [
        // Forbidden: "significant impact" → Allowed: "strong association"
        [/\bsignificant\s+impact\b/gi, "strong association"],
        [/\bsignificant\s+influence\b/gi, "strong association"],
        [/\bsignificant\s+effect\b/gi, "strong association"],
        // Forbidden: "causes" → Allowed: "is associated with"
        [/\bcauses\b/gi, "is associated with"],
        [/\bcause\b/gi, "is associated with"],
        // Forbidden: "drives" → Allowed: "appears to influence"
        [/\bdrives\b/gi, "appears to influence"],
        [/\bdriving\b/gi, "influencing"],
        // Forbidden: "leads to" → Allowed: "is associated with higher or lower values"
        [/\bleads\s+to\b/gi, "is associated with"],
        // Forbidden: "proves" → Allowed: "shows"
        [/\bproves\b/gi, "shows"],
        [/\bprove\b/gi, "show"],
        // Ensure we use allowed phrases
        [/\bstrong\s+influence\b/gi, "strong association"],
        [/\bstrong\s+impact\b/gi, "strong association"],
      ]
      
      for (const [pattern, replacement] of languageReplacements) {
        whyItMatters = whyItMatters.replace(pattern, replacement)
      }
      
      // If text became too short or broken, use a fallback
      if (whyItMatters.length < 10) {
        whyItMatters = "This factor shows a strong association with the decision metric."
      }

      // 5. Generate confidence explanation based on confidence level and data characteristics
      const factorStr = ensureString(insight.factor, "Unknown factor")
      const factorData = backendStats.top_factors.find((f: any) => f.factor === factorStr)
      let confidenceExplanation = ""
      
      if (confidence === "high") {
        if (totalRows >= 100) {
          confidenceExplanation = "High confidence — based on large sample size"
          if (factorData?.type === "categorical" && factorData?.top_segments) {
            const segmentCount = Object.keys(factorData.top_segments).length
            if (segmentCount >= 3) {
              confidenceExplanation += " and consistent differences across segments"
            }
          }
          confidenceExplanation += "."
        } else {
          // Shouldn't happen due to cap, but defensive
          confidenceExplanation = "High confidence — based on observed patterns."
        }
      } else if (confidence === "medium") {
        if (totalRows < 100) {
          confidenceExplanation = "Medium confidence — based on moderate sample size"
        } else {
          confidenceExplanation = "Medium confidence — based on moderate separation between segments"
        }
        if (factorData?.type === "categorical" && factorData?.top_segments) {
          const segmentCount = Object.keys(factorData.top_segments).length
          if (segmentCount < 3) {
            confidenceExplanation += " and uneven segment distribution"
          }
        }
        confidenceExplanation += "."
      } else {
        // Low confidence
        if (totalRows < 30) {
          confidenceExplanation = "Low confidence — based on small sample size"
        } else if (factorData?.type === "numeric" && factorData?.abs_correlation) {
          const absCorr = factorData.abs_correlation
          if (absCorr < 0.3) {
            confidenceExplanation = "Low confidence — based on weak association"
          } else {
            confidenceExplanation = "Low confidence — based on high variance in the data"
          }
        } else {
          confidenceExplanation = "Low confidence — based on limited separation or high variance"
        }
        confidenceExplanation += "."
      }

      // 6. Ensure evidence is a string (raw numbers allowed in evidence)
      const evidence = ensureString(insight.evidence, "Evidence not available.")

      return {
        rank: typeof insight.rank === "number" ? insight.rank : 0,
        factor: factorStr,
        why_it_matters: whyItMatters,
        evidence,
        confidence,
        confidence_explanation: confidenceExplanation,
      }
    })

    // 4. Deduplicate factors (in case Groq returned duplicates)
    const seenFactors = new Set<string>()
    const uniqueInsights = processedInsights.filter((insight: any) => {
      const factor = insight.factor || ""
      if (seenFactors.has(factor)) {
        return false // Skip duplicate
      }
      seenFactors.add(factor)
      return true
    })

    // Ensure data_risks and limitations are properly formatted
    const dataRisks = Array.isArray(insights.data_risks)
      ? insights.data_risks.map((risk: any) => {
          if (typeof risk === "string") return risk
          if (typeof risk === "object") return JSON.stringify(risk)
          return String(risk)
        })
      : []

    const limitations = typeof insights.limitations === "string"
      ? insights.limitations
      : insights.limitations
      ? String(insights.limitations)
      : "Analysis limitations not specified."

    return NextResponse.json({
      success: true,
      insights: {
        decision_metric: typeof insights.decision_metric === "string" 
          ? insights.decision_metric 
          : String(insights.decision_metric || ""),
        top_insights: uniqueInsights,
        data_risks: dataRisks,
        limitations,
      },
      backend_stats: backendStats, // Include backend stats for reference
      excluded_columns: backendStats.excluded_columns || [], // Excluded columns with reasons
    })
  } catch (e: any) {
    console.error("[decision-eda] Error:", e)
    return NextResponse.json(
      { error: e.message || "Network error" },
      { status: 500 }
    )
  }
}
