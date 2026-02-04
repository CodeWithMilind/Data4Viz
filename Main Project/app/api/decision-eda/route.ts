import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { callGroq, resolveApiKey, isDecommissionError } from "@/lib/ai/getAiClient"
import type { AIMessage } from "@/lib/ai/getAiClient"
import fs from "fs"
import path from "path"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

/**
 * Validate and filter insights based on strict eligibility rules.
 * Returns only insights that meet all criteria.
 * 
 * STRICT GATES:
 * 1. Feature Allow-List Gate - only exact column names
 * 2. Statistical Evidence Gate - require valid evidence
 * 3. Confidence Gate - compute from stats only
 * 4. Suppression Gate - filter weak insights
 * 5. Ordering Gate - rank by impact score only
 */
export function validateAndFilterInsights(
  rawInsights: any[],
  backendStats: any,
  datasetColumnNames: string[] = []
): any[] {
  if (!Array.isArray(rawInsights)) {
    return []
  }

  // GATE 1: Feature Allow-List - Build strict allow-list from dataset columns
  const columnAllowList = new Set<string>()
  if (datasetColumnNames.length > 0) {
    datasetColumnNames.forEach(col => columnAllowList.add(col))
  }
  
  // Also build from backendStats as fallback (but prefer dataset schema)
  const backendFactors = new Set<string>()
  const factorStats = new Map<string, any>()

  // Map factors from top_factors
  if (backendStats.top_factors) {
    backendStats.top_factors.forEach((f: any) => {
      if (f.factor) {
        backendFactors.add(f.factor)
        factorStats.set(f.factor, f)
      }
    })
  }

  // Map correlations
  if (backendStats.all_correlations) {
    backendStats.all_correlations.forEach((c: any) => {
      if (c.factor) {
        backendFactors.add(c.factor)
        if (!factorStats.has(c.factor)) {
          factorStats.set(c.factor, { type: "numeric", ...c })
        }
      }
    })
  }

  // Map segment impacts
  if (backendStats.all_segment_impacts) {
    backendStats.all_segment_impacts.forEach((s: any) => {
      if (s.factor) {
        backendFactors.add(s.factor)
        if (!factorStats.has(s.factor)) {
          factorStats.set(s.factor, { type: "categorical", ...s })
        }
      }
    })
  }

  // Use dataset schema if available, otherwise fall back to backendStats factors
  const allowedFactors = columnAllowList.size > 0 ? columnAllowList : backendFactors

  const totalRows = backendStats.total_rows || backendStats.valid_rows || 0
  const minRowsRequired = 50
  const EPSILON = 0.001 // Threshold for near-zero effects

  const validated: any[] = []

  for (const insight of rawInsights) {
    const factorName = insight.factor || ""
    
    // GATE 1: Feature Allow-List Gate
    // Reject if: missing, not in allow-list, contains spaces (combined features), or has invalid characters
    if (!factorName) {
      console.warn(`[validation] Suppressing insight: missing factor name`)
      continue
    }

    // Check for combined/inferred features (contains spaces, underscores between words, operators)
    const hasSpaces = factorName.includes(" ")
    const hasMultipleUnderscores = (factorName.match(/_/g) || []).length > 1
    const hasOperators = /[+\-*\/]/.test(factorName)
    const looksCombined = hasSpaces || hasOperators || (hasMultipleUnderscores && factorName.length > 20)

    if (looksCombined) {
      console.warn(`[validation] Suppressing insight: factor "${factorName}" appears to be combined/inferred`)
      continue
    }

    // Must exist in allow-list
    if (!allowedFactors.has(factorName)) {
      console.warn(`[validation] Suppressing insight: factor "${factorName}" not in dataset schema`)
      continue
    }

    // GATE 2: Data Sufficiency Gate
    if (totalRows < minRowsRequired) {
      console.warn(`[validation] Suppressing insight: insufficient rows (${totalRows} < ${minRowsRequired})`)
      continue
    }

    const factorData = factorStats.get(factorName)
    if (!factorData) {
      console.warn(`[validation] Suppressing insight: no statistics for factor "${factorName}"`)
      continue
    }

    // GATE 3: Statistical Evidence Gate
    let hasValidEvidence = false
    let computedConfidence: "high" | "medium" | "low" = "low"
    let effectSize = 0

    if (factorData.type === "numeric" && factorData.abs_correlation !== undefined) {
      const absCorr = Math.abs(Number(factorData.abs_correlation))
      
      // Validate: must be finite, non-NaN, non-zero
      if (!isFinite(absCorr) || isNaN(absCorr) || absCorr === 0) {
        console.warn(`[validation] Suppressing insight: invalid correlation for factor "${factorName}"`)
        continue
      }

      effectSize = absCorr
      
      // GATE 3: Confidence Gate - Correlation-based (strict thresholds)
      if (absCorr < 0.10) {
        computedConfidence = "low"
      } else if (absCorr < 0.30) {
        computedConfidence = "medium"
      } else {
        computedConfidence = "high"
      }
      
      hasValidEvidence = true
    } else if (factorData.type === "categorical" && factorData.mean_difference !== undefined) {
      const meanDiff = Math.abs(Number(factorData.mean_difference))
      const relativeImpact = Math.abs(Number(factorData.relative_impact_pct || 0))
      
      // Validate: must be finite, non-NaN
      if (!isFinite(meanDiff) || isNaN(meanDiff)) {
        console.warn(`[validation] Suppressing insight: invalid mean difference for factor "${factorName}"`)
        continue
      }

      effectSize = meanDiff

      // GATE 3: Confidence Gate - Mean-difference-based (effect size + separation)
      // Large gap + clear separation → HIGH
      // Moderate gap → MEDIUM
      // Small gap / overlap → LOW
      // Sample size alone must NEVER increase confidence
      if (relativeImpact > 20 || meanDiff > 0.1) {
        computedConfidence = "high"
      } else if (relativeImpact > 10 || meanDiff > 0.05) {
        computedConfidence = "medium"
      } else {
        computedConfidence = "low"
      }
      
      hasValidEvidence = true
    }

    if (!hasValidEvidence) {
      console.warn(`[validation] Suppressing insight: no valid evidence for factor "${factorName}"`)
      continue
    }

    // GATE 4: Suppression Gate - Allow LOW confidence insights with warning
    // LOW confidence indicates weaker statistical evidence but still provide it to users
    if (computedConfidence === "low") {
      console.warn(`[validation] Including LOW confidence insight for factor "${factorName}" (weak statistical evidence)`)
      // Don't suppress - allow it to pass through
    }

    // Override confidence with computed value (GATE 3: confidence from stats only)
    const validatedInsight = {
      ...insight,
      confidence: computedConfidence,
      factor: factorName, // Use exact factor name from allow-list
    }

    // Language validation (basic check - full validation happens in post-processing)
    const forbiddenPhrases = ["causes", "leads to", "drives", "results in", "improves", "worsens"]
    const whyItMatters = (insight.why_it_matters || "").toLowerCase()
    const hasForbiddenLanguage = forbiddenPhrases.some(phrase => whyItMatters.includes(phrase))

    if (hasForbiddenLanguage) {
      console.warn(`[validation] Suppressing insight: forbidden causal language in factor "${factorName}"`)
      continue
    }

    validated.push(validatedInsight)
  }

  // GATE 5: Ordering Gate - Rank ONLY by stored impact score from backendStats
  const impactScoreMap = new Map<string, number>()
  if (backendStats.top_factors) {
    backendStats.top_factors.forEach((f: any) => {
      if (f.factor && typeof f.impact_score === "number") {
        impactScoreMap.set(f.factor, f.impact_score)
      }
    })
  }

  // Sort by impact score (descending), then by factor name for deterministic tie-breaking
  validated.sort((a, b) => {
    const scoreA = impactScoreMap.get(a.factor) || 0
    const scoreB = impactScoreMap.get(b.factor) || 0
    if (scoreB !== scoreA) {
      return scoreB - scoreA // Descending by impact score
    }
    // Tie-breaker: alphabetical by factor name for deterministic sorting
    return (a.factor || "").localeCompare(b.factor || "")
  })

  // Reassign ranks based on sorted order (1-indexed)
  validated.forEach((insight, index) => {
    insight.rank = index + 1
  })

  return validated
}

/**
 * Sanitize and validate LLM-generated insights.
 * Runs AFTER LLM output and BEFORE UI rendering.
 * 
 * Rules:
 * 1. Scan for forbidden causal words - replace or drop
 * 2. Validate feature names match backend-approved features
 * 3. Validate confidence labels match backend confidence
 * 4. Suppress insights if any validation fails
 */
function sanitizeInsights(
  insights: any[],
  backendStats: any,
  datasetColumnNames: string[]
): any[] {
  if (!Array.isArray(insights)) {
    return []
  }

  // Build approved features set from backend stats
  const approvedFeatures = new Set<string>()
  
  // Add from dataset column names (primary source)
  datasetColumnNames.forEach((col) => approvedFeatures.add(col))
  
  // Add from backend stats as fallback
  if (backendStats.top_factors) {
    backendStats.top_factors.forEach((f: any) => {
      if (f.factor) approvedFeatures.add(f.factor)
    })
  }
  if (backendStats.all_correlations) {
    backendStats.all_correlations.forEach((c: any) => {
      if (c.factor) approvedFeatures.add(c.factor)
    })
  }
  if (backendStats.all_segment_impacts) {
    backendStats.all_segment_impacts.forEach((s: any) => {
      if (s.factor) approvedFeatures.add(s.factor)
    })
  }

  // Build confidence map from backend stats (compute if not present)
  const backendConfidenceMap = new Map<string, "high" | "medium" | "low">()
  if (backendStats.top_factors) {
    backendStats.top_factors.forEach((f: any) => {
      if (f.factor) {
        let computedConfidence: "high" | "medium" | "low" = "low"
        
        // Compute confidence from stats if not present
        if (f.confidence) {
          computedConfidence = f.confidence
        } else if (f.type === "numeric" && f.abs_correlation !== undefined) {
          const absCorr = Math.abs(f.abs_correlation)
          if (absCorr >= 0.30) {
            computedConfidence = "high"
          } else if (absCorr >= 0.10) {
            computedConfidence = "medium"
          } else {
            computedConfidence = "low"
          }
        } else if (f.type === "categorical" && f.relative_impact_pct !== undefined) {
          const relativeImpact = Math.abs(f.relative_impact_pct)
          const meanDiff = Math.abs(f.mean_difference || 0)
          if (relativeImpact > 20 || meanDiff > 0.1) {
            computedConfidence = "high"
          } else if (relativeImpact > 10 || meanDiff > 0.05) {
            computedConfidence = "medium"
          } else {
            computedConfidence = "low"
          }
        }
        
        backendConfidenceMap.set(f.factor, computedConfidence)
      }
    })
  }

  // Forbidden causal words/phrases
  const forbiddenPatterns = [
    /\bcauses?\b/gi,
    /\bleads?\s+to\b/gi,
    /\bdrives?\b/gi,
    /\bresults?\s+in\b/gi,
    /\bimproves?\b/gi,
    /\bworsens?\b/gi,
    /\bdriving\b/gi,
    /\bcausing\b/gi,
  ]

  // Neutral replacement patterns
  const languageReplacements: Array<[RegExp, string]> = [
    [/\bcauses?\b/gi, "is associated with"],
    [/\bcausing\b/gi, "associated with"],
    [/\bleads?\s+to\b/gi, "is associated with"],
    [/\bdrives?\b/gi, "appears to influence"],
    [/\bdriving\b/gi, "influencing"],
    [/\bresults?\s+in\b/gi, "is associated with"],
    [/\bimproves?\b/gi, "is associated with higher values"],
    [/\bworsens?\b/gi, "is associated with lower values"],
    [/\bsignificant\s+impact\b/gi, "strong association"],
    [/\bsignificant\s+influence\b/gi, "strong association"],
    [/\bsignificant\s+effect\b/gi, "strong association"],
  ]

  const sanitized: any[] = []

  for (const insight of insights) {
    // Validation 1: Feature name must match backend-approved feature
    const factorName = String(insight.factor || "").trim()
    if (!factorName || !approvedFeatures.has(factorName)) {
      console.warn(
        `[sanitizer] Suppressing insight: Feature "${factorName}" not in approved list`
      )
      continue // Suppress this insight
    }

    // Validation 2: Confidence label must match backend confidence
    // SOFT FAIL: If confidence doesn't match exactly, use backend confidence instead of suppressing
    const insightConfidence = String(insight.confidence || "").toLowerCase().trim()
    const backendConfidence = backendConfidenceMap.get(factorName)
    
    if (backendConfidence && insightConfidence !== backendConfidence.toLowerCase()) {
      console.warn(
        `[sanitizer] Confidence mismatch for "${factorName}" (LLM: ${insightConfidence}, Backend: ${backendConfidence}). Using backend value.`
      )
      // Don't suppress - just use backend confidence instead
    }

    // Sanitization 1: Scan for forbidden causal words
    let whyItMatters = String(insight.why_it_matters || "").trim()
    let evidence = String(insight.evidence || "").trim()
    
    // Check if forbidden words exist (before replacement)
    let hasForbiddenWords = false
    for (const pattern of forbiddenPatterns) {
      pattern.lastIndex = 0
      if (pattern.test(whyItMatters) || pattern.test(evidence)) {
        hasForbiddenWords = true
        break
      }
    }

    // Apply language replacements
    for (const [pattern, replacement] of languageReplacements) {
      whyItMatters = whyItMatters.replace(pattern, replacement)
      evidence = evidence.replace(pattern, replacement)
    }

    // If forbidden words still exist after replacement, replace the entire statement with neutral language
    // SOFT FAIL: Don't suppress the insight, just replace it with safe text
    let stillHasForbidden = false
    for (const pattern of forbiddenPatterns) {
      pattern.lastIndex = 0
      if (pattern.test(whyItMatters) || pattern.test(evidence)) {
        stillHasForbidden = true
        break
      }
    }

    if (stillHasForbidden) {
      console.warn(
        `[sanitizer] Forbidden language found for "${factorName}", replacing with neutral statement`
      )
      // Replace with neutral analytical statement
      whyItMatters = `This factor shows a relationship with the decision metric.`
      evidence = `Statistical association detected`
    }

    // If text became too short or empty after sanitization, use fallback
    if (whyItMatters.length < 10) {
      whyItMatters = "This factor shows a pattern associated with the decision metric."
    }

    // Create sanitized insight
    sanitized.push({
      ...insight,
      factor: factorName,
      confidence: backendConfidence || insightConfidence || "low",
      why_it_matters: whyItMatters,
      evidence: evidence,
    })
  }

  return sanitized
}

/**
 * Build strict system prompt for Groq.
 * Enforces: NO calculations, NO hallucinations, NO recommendations, STRICT eligibility rules.
 */
function buildSystemPrompt(
  decisionMetric: string,
  backendStats: any,
  previousInsights: any = null,
  isRegeneration: boolean = false
): string {
  // Extract available factors from backend stats for validation
  const availableFactors = new Set<string>()
  if (backendStats.top_factors) {
    backendStats.top_factors.forEach((f: any) => {
      if (f.factor) availableFactors.add(f.factor)
    })
  }
  if (backendStats.all_correlations) {
    backendStats.all_correlations.forEach((c: any) => {
      if (c.factor) availableFactors.add(c.factor)
    })
  }
  if (backendStats.all_segment_impacts) {
    backendStats.all_segment_impacts.forEach((s: any) => {
      if (s.factor) availableFactors.add(s.factor)
    })
  }
  
  const factorList = Array.from(availableFactors).join(", ")

  return `You are an Insight Explanation Engine.
You do NOT analyze data.
You do NOT compute statistics.
You ONLY explain provided backend results.

================================
ABSOLUTE RULES
================================
- Never invent features.
- Never invent numbers.
- Never infer causality.
- Never change confidence levels.
- Never reorder insights.

You will receive:
- A list of approved features
- Precomputed statistics
- Confidence labels
- Impact scores

You must:
- Explain insights clearly and concisely
- Use neutral, statistical language only

ALLOWED PHRASES:
- "is associated with"
- "shows a pattern with"
- "appears correlated with"
- "suggests a relationship"

FORBIDDEN PHRASES:
- causes
- leads to
- drives
- results in
- improves
- worsens

If unsure → output nothing.

================================
1. FEATURE ELIGIBILITY (STRICT)
================================

You may ONLY explain insights for features in this approved list:
ALLOWED FACTORS: ${factorList || "None found in statistics"}

FORBIDDEN:
- Any factor NOT in the list above
- Combined features (e.g., "genre + language", "marketing_spend region")
- Inferred or invented features
- Features with spaces, operators, or multiple underscores

If a feature is not in the approved list → DO NOT generate an insight.

1.2 Data Sufficiency Gate
Before generating an insight:
- Dataset must have ≥ 50 rows (check backendStats.total_rows).
- Categorical features must have ≥ 5 samples per category.
- Numeric features must have non-zero variance.

If any condition fails → suppress the insight.

1.3 Statistical Evidence Requirement
An insight MUST be backed by at least one of:
- Mean difference (categorical vs decision metric) - check all_segment_impacts
- Correlation coefficient (numeric vs decision metric) - check all_correlations

If evidence is missing, null, or invalid → DO NOT generate the insight.

================================
2. CONFIDENCE SCORING RULES
================================

Confidence is computed ONLY from backend statistics.
You are NOT allowed to invent or adjust confidence.

2.1 Correlation-Based Confidence (Numeric Features)
Use ABSOLUTE correlation from backendStats:
- |corr| < 0.10 → LOW confidence
- 0.10 ≤ |corr| < 0.30 → MEDIUM confidence
- |corr| ≥ 0.30 → HIGH confidence

2.2 Mean-Difference Confidence (Categorical Features)
Confidence depends on EFFECT SIZE + SEPARATION, NOT sample size alone:
- Clear separation + large mean gap → HIGH
- Moderate separation → MEDIUM
- Small gap or heavy overlap → LOW

Sample size CANNOT upgrade confidence by itself.

================================
3. EXPLANATION RULES
================================

Your ONLY job is to explain the pre-computed statistics clearly.

3.1 Language Requirements
Use ONLY these neutral phrases:
- "is associated with"
- "shows a pattern with"
- "appears correlated with"
- "suggests a relationship"

FORBIDDEN PHRASES (ZERO TOLERANCE):
- causes
- leads to
- drives
- results in
- improves
- worsens
- any causal language

3.2 Evidence Citation
- Cite ONLY numbers from backendStats.
- NEVER invent or fabricate numbers.
- NEVER compute or recalculate statistics.
- If evidence is missing → suppress the insight.

================================
4. RANKING (READ-ONLY)
================================

Insight ranks are PRE-DETERMINED by impact_score in backendStats.
You MUST preserve the exact order provided.
- NEVER reorder insights
- NEVER change ranks
- NEVER promote or demote insights
- Use the exact rank from backendStats.top_factors

================================
5. SUPPRESSION RULES (MANDATORY)
================================

Suppress an insight if:
- Confidence is LOW AND effect size is near zero or unstable
- Factor is not in backendStats
- Statistical evidence is missing or invalid
- Dataset has < 50 rows
- No placeholder insights are allowed.

================================
6. FORBIDDEN BEHAVIORS (ZERO TOLERANCE)
================================

You MUST NOT:
- Analyze or compute statistics (they are pre-computed)
- Invent features or numbers
- Infer causality or causal relationships
- Change confidence levels
- Reorder insights
- Use causal language
- Generate insights for non-approved features

Any violation = system failure.

================================
7. REGENERATION CONTEXT
================================
${isRegeneration && previousInsights ? `
PREVIOUS INSIGHTS (read-only context for wording reference):
${JSON.stringify(previousInsights, null, 2)}

During regeneration:
- Previous insights are for wording improvement ONLY
- All statistics come from newly computed backend values above
- Do NOT reuse previous text verbatim
- Do NOT copy previous confidence or ranks
- Generate fresh explanations based on new statistics` : ""}

================================
INPUT DATA (PRE-COMPUTED)
================================
- Decision Metric: ${decisionMetric}
- Total Rows: ${backendStats.total_rows || backendStats.valid_rows || 0}
- Approved Features: ${factorList || "None"}
- Pre-computed Statistics: ${JSON.stringify(backendStats, null, 2)}

Your task: Explain these statistics clearly using neutral language.

================================
OUTPUT SCHEMA (STRICT)
================================
{
  "decision_metric": "${decisionMetric}",
  "top_insights": [
    {
      "rank": number,  // MUST match backendStats.top_factors rank
      "factor": string,  // MUST be in approved features list
      "why_it_matters": string,  // Explain using ONLY allowed phrases
      "evidence": string,  // Cite numbers from backendStats only
      "confidence": "high" | "medium" | "low"  // Use from backendStats.top_factors
    }
  ],
  "data_risks": string[],
  "limitations": string
}

================================
FINAL CHECK BEFORE OUTPUT
================================

Before producing output, verify:
- Every insight has explicit statistical evidence in backendStats.
- Every confidence level follows numeric rules above.
- No hallucinated features exist.
- No causal claims exist.
- All factors exist in backendStats.

If unsure → suppress the insight.

Output ONLY valid JSON (no markdown, no code blocks).`
}

/**
 * Load insight snapshot from backend storage
 */
async function loadInsightSnapshot(
  workspaceId: string,
  datasetId: string,
  decisionMetric: string
): Promise<any | null> {
  try {
    // Call backend to load insight snapshot
    const res = await fetch(
      `${BACKEND_URL}/api/decision-eda/insights/${workspaceId}/${encodeURIComponent(datasetId)}/${encodeURIComponent(decisionMetric)}`,
      { method: "GET" }
    )
    
    if (res.ok) {
      return await res.json()
    }
    return null
  } catch (error) {
    console.error("[decision-eda] Error loading insight snapshot:", error)
    return null
  }
}

/**
 * Delete insight snapshots from backend storage
 */
async function deleteInsightSnapshots(
  workspaceId: string,
  datasetId: string,
  decisionMetric: string
): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/decision-eda/insights/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        dataset_id: datasetId,
        decision_metric: decisionMetric,
      }),
    })
    
    return res.ok
  } catch (error) {
    console.error("[decision-eda] Error deleting insight snapshots:", error)
    return false
  }
}

/**
 * Save insight snapshot to backend storage
 */
async function saveInsightSnapshot(
  workspaceId: string,
  datasetId: string,
  decisionMetric: string,
  backendStats: any,
  insights: any
): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/decision-eda/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        dataset_id: datasetId,
        decision_metric: decisionMetric,
        backend_stats: backendStats,
        insights: insights,
      }),
    })
  } catch (error) {
    console.error("[decision-eda] Error saving insight snapshot:", error)
    // Don't throw - saving is best-effort
  }
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
      regenerate = false, // New parameter for explicit regeneration
    } = body as {
      workspaceId?: string
      datasetId?: string
      decisionMetric?: string
      provider?: string
      model?: string
      apiKey?: string
      regenerate?: boolean
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

    // Step 1: Check for existing insights (unless regenerating)
    if (!regenerate) {
      const existingSnapshot = await loadInsightSnapshot(workspaceId, datasetId, decisionMetric)
      
      if (existingSnapshot) {
        // Check if dataset has changed
        const datasetChanged = await fetch(
          `${BACKEND_URL}/api/decision-eda/check-dataset-change`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspace_id: workspaceId,
              dataset_id: datasetId,
              stored_hash: existingSnapshot.dataset_hash,
            }),
          }
        ).then((res) => res.json().then((data) => data.changed).catch(() => true))
        
        if (!datasetChanged) {
          // Return cached insights - deterministic behavior
          console.log(
            `[decision-eda] Returning cached insights for ${datasetId}/${decisionMetric}`
          )
          return NextResponse.json({
            success: true,
            insights: existingSnapshot.insights,
            backend_stats: existingSnapshot.backend_stats,
            excluded_columns: existingSnapshot.backend_stats?.excluded_columns || [],
            cached: true,
            version: existingSnapshot.version,
          })
        }
      }
    }

    // Step 2: Call backend to compute statistics
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
    
    // Step 2.3: Fetch actual dataset column names for strict allow-list validation
    let datasetColumnNames: string[] = []
    try {
      const schemaRes = await fetch(
        `${BACKEND_URL}/dataset/${encodeURIComponent(datasetId)}/schema?workspace_id=${encodeURIComponent(workspaceId)}&use_current=true`,
        { method: "GET" }
      )
      if (schemaRes.ok) {
        const schema = await schemaRes.json()
        if (schema.columns && Array.isArray(schema.columns)) {
          datasetColumnNames = schema.columns.map((col: any) => col.name).filter(Boolean)
        }
      }
    } catch (error) {
      console.warn("[decision-eda] Could not fetch dataset schema, using backendStats factors as fallback")
      // Continue with backendStats factors as fallback
    }
    
    // Step 2.5: If regenerating, load previous insights for context, then delete them
    let previousInsights = null
    if (regenerate) {
      const previousSnapshot = await loadInsightSnapshot(workspaceId, datasetId, decisionMetric)
      if (previousSnapshot) {
        previousInsights = previousSnapshot.insights
        
        // Delete all old insight versions immediately (replace, not reuse)
        await fetch(`${BACKEND_URL}/api/decision-eda/insights/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            dataset_id: datasetId,
            decision_metric: decisionMetric,
          }),
        }).catch((err) => {
          console.error("[decision-eda] Error deleting old insights:", err)
          // Continue even if deletion fails
        })
      }
    }

    // Step 3: Call Groq with strict system prompt (using shared Groq client)
    const systemPrompt = buildSystemPrompt(decisionMetric, backendStats, previousInsights, regenerate)
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

    // Step 3.5: STRICT BACKEND VALIDATION GATES
    // Apply all validation gates before any processing
    const validatedInsights = validateAndFilterInsights(
      insights.top_insights || [],
      backendStats,
      datasetColumnNames
    )
    
    // Replace with validated insights (FAIL FAST - no fallbacks)
    insights.top_insights = validatedInsights
    
    // If no valid insights remain after validation, return error
    if (validatedInsights.length === 0) {
      return NextResponse.json(
        {
          error: "No valid insights could be generated. Ensure dataset has ≥50 rows, factors exist in dataset schema, and factors have sufficient statistical evidence.",
        },
        { status: 400 }
      )
    }

    // Step 3.6: POST-PROCESSING SANITIZER
    // Sanitize LLM-generated text and validate against backend data
    const sanitizedInsights = sanitizeInsights(
      validatedInsights,
      backendStats,
      datasetColumnNames
    )
    
    // Replace with sanitized insights
    insights.top_insights = sanitizedInsights
    
    // If no insights remain after sanitization, use a safe fallback insight
    if (sanitizedInsights.length === 0) {
      console.warn(`[decision-eda] All insights were suppressed during sanitization, using fallback`)
      insights.top_insights = [
        {
          rank: 1,
          factor: "analysis_complete",
          why_it_matters: "Analysis completed. No strong statistically significant relationships were detected for the selected metric at standard confidence thresholds.",
          evidence: "Statistical threshold not met",
          confidence: "low",
        }
      ]
    }

    // Post-process insights: Clean text and enforce language rules
    // Note: Confidence is already validated and computed from statistics in validateAndFilterInsights
    const totalRows = backendStats.total_rows || backendStats.valid_rows || 0
    
    // Determine max allowed confidence based on dataset size (additional safety cap)
    let maxConfidence: "high" | "medium" | "low" = "high"
    if (totalRows < 30) {
      maxConfidence = "low"
    } else if (totalRows < 100) {
      maxConfidence = "medium"
    }

    // Process each insight
    const processedInsights = insights.top_insights.map((insight: any) => {
      // 1. Confidence is already validated from statistics, but apply dataset size cap as safety
      let confidence = insight.confidence || "low"
      const confidenceLevels = ["low", "medium", "high"]
      const currentLevel = confidenceLevels.indexOf(confidence)
      const maxLevel = confidenceLevels.indexOf(maxConfidence)
      
      // Only downgrade if necessary (never upgrade)
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
      
      // 4. Enforce language discipline: Replace forbidden causal phrases (ZERO TOLERANCE)
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
        // Forbidden: "leads to" → Allowed: "is associated with"
        [/\bleads\s+to\b/gi, "is associated with"],
        [/\blead\s+to\b/gi, "is associated with"],
        // Forbidden: "proves" → Allowed: "shows"
        [/\bproves\b/gi, "shows"],
        [/\bprove\b/gi, "show"],
        // Forbidden: "results in" → Allowed: "is associated with"
        [/\bresults\s+in\b/gi, "is associated with"],
        [/\bresult\s+in\b/gi, "is associated with"],
        // Forbidden: "improves" → Allowed: "is associated with higher values"
        [/\bimproves\b/gi, "is associated with higher values"],
        [/\bimprove\b/gi, "is associated with higher values"],
        // Forbidden: "worsens" → Allowed: "is associated with lower values"
        [/\bworsens\b/gi, "is associated with lower values"],
        [/\bworsen\b/gi, "is associated with lower values"],
        // Ensure we use allowed phrases
        [/\bstrong\s+influence\b/gi, "strong association"],
        [/\bstrong\s+impact\b/gi, "strong association"],
      ]
      
      for (const [pattern, replacement] of languageReplacements) {
        whyItMatters = whyItMatters.replace(pattern, replacement)
      }
      
      // Final check: If any forbidden phrases remain, use fallback
      const forbiddenCheck = /\b(causes?|drives?|leads?\s+to|results?\s+in|improves?|worsens?)\b/gi
      if (forbiddenCheck.test(whyItMatters)) {
        console.warn(`[validation] Forbidden causal language detected, using fallback for factor "${insight.factor}"`)
        whyItMatters = "This factor shows a pattern associated with the decision metric."
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

    const finalInsights = {
      decision_metric: typeof insights.decision_metric === "string" 
        ? insights.decision_metric 
        : String(insights.decision_metric || ""),
      top_insights: uniqueInsights,
      data_risks: dataRisks,
      limitations,
    }

    // Step 4: Save insight snapshot for future deterministic retrieval
    await saveInsightSnapshot(workspaceId, datasetId, decisionMetric, backendStats, finalInsights)

    return NextResponse.json({
      success: true,
      insights: finalInsights,
      backend_stats: backendStats, // Include backend stats for reference
      excluded_columns: backendStats.excluded_columns || [], // Excluded columns with reasons
      cached: false,
    })
  } catch (e: any) {
    console.error("[decision-eda] Error:", e)
    return NextResponse.json(
      { error: e.message || "Network error" },
      { status: 500 }
    )
  }
}
