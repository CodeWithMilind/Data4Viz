import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import {
  appendChatMessages,
  getRecentChat,
  getChatSummary,
  getFilesIndex,
  getRelevantFiles,
  getChatIndex,
  getDatasetIntelligence,
  getDatasetAnalysisState,
  setDatasetAnalysisState,
  readWorkspaceFile,
  type ChatMessage,
  type DatasetIntelligenceSnapshot,
} from "@/lib/workspace-files"
import type { WorkspaceContext } from "@/lib/workspace-context"
import type { OverviewResponse } from "@/lib/api/dataCleaningClient"
import { loadDatasetOverviewFromFile } from "@/lib/workspace-files"
import { getDatasetFilePath } from "@/lib/dataset-path-resolver"
import { promises as fs } from "fs"
import path from "path"
import { existsSync } from "fs"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

function isDecommissionError(err: string): boolean {
  const s = String(err).toLowerCase()
  return /decommission|deprecated|not found|invalid model|does not exist|unknown model|model .* (is )?not (available|supported)/i.test(s)
}

function isDatasetRelated(message: string): boolean {
  const datasetKeywords = [
    "dataset", "data", "column", "row", "summary", "overview", "statistics", "stat",
    "missing", "null", "clean", "cleaning", "outlier", "correlation", "pattern",
    "explore", "exploratory", "analysis", "eda", "visualize", "visualization",
    "chart", "graph", "plot", "distribution", "mean", "median", "mode", "variance",
    "standard deviation", "percentile", "quantile", "histogram", "scatter", "box",
    "describe", "info", "head", "tail", "sample", "shape", "size", "count",
    "unique", "duplicate", "quality", "schema", "type", "dtype", "numeric",
    "categorical", "string", "integer", "float", "boolean", "date", "time",
  ]
  
  const lowerMessage = message.toLowerCase()
  return datasetKeywords.some((keyword) => lowerMessage.includes(keyword))
}

async function callGroq(
  key: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<{ content?: string; error?: string }> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = data?.error?.message || data?.error || "Request failed"
    return { error: res.status === 401 ? "Invalid API key" : err }
  }
  const content = data?.choices?.[0]?.message?.content ?? ""
  return { content }
}

function isValidDatasetIntelligence(snapshot: DatasetIntelligenceSnapshot | null): boolean {
  if (!snapshot) return false
  if (!snapshot.rows || snapshot.rows === 0) return false
  if (!snapshot.columns || snapshot.columns === 0) return false
  if (!snapshot.schema || snapshot.schema.length === 0) return false
  if (snapshot.columns !== snapshot.schema.length) return false
  return true
}

function buildDatasetContext(snapshot: DatasetIntelligenceSnapshot | null): string {
  if (!snapshot || !isValidDatasetIntelligence(snapshot)) {
    return ""
  }

  return JSON.stringify(snapshot, null, 2)
}

/**
 * Parse CSV line handling quoted fields (reused from auto-summarize-code)
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

/**
 * Get dataset exposure configuration
 * UI value is authoritative, falls back to env var if not provided
 * Returns effective exposure percentage (1-100)
 */
function getDatasetExposurePercentage(uiValue?: number): number {
  // UI INPUT IS SOURCE OF TRUTH
  if (uiValue !== undefined && uiValue !== null) {
    // Clamp UI value to valid range [1, 100]
    return Math.max(1, Math.min(100, Math.floor(uiValue)))
  }

  // Fallback to environment variable (for backward compatibility)
  // Check for override flag first (demo mode)
  const overrideFullAccess = process.env.OVERRIDE_FULL_DATA_ACCESS === "true"
  if (overrideFullAccess) {
    return 100
  }

  // Get configured exposure percentage from env (default: 20%)
  const exposurePercent = parseFloat(process.env.DATASET_EXPOSURE_PERCENT || "20")
  
  // Clamp to valid range [1, 100]
  return Math.max(1, Math.min(100, exposurePercent))
}

/**
 * Sample dataset rows for chat context based on configured exposure percentage
 * Returns sampled rows with metadata, or null if sampling fails
 * 
 * DATA ACCESS RULES:
 * - If exposure_percentage == 100: Use ALL rows (FULL_DATA_MODE)
 * - If exposure_percentage < 100: Sample only specified percentage (LIMITED_DATA_MODE)
 */
async function sampleDatasetRows(
  workspaceId: string,
  datasetFileName: string,
  totalRows: number,
  exposurePercentage: number,
): Promise<{ metadata: { dataset_name: string; rows: number; columns: Array<{ name: string; type: string }> }; sample_rows: Record<string, any>[]; exposure_percentage: number; mode: "FULL_DATA_MODE" | "LIMITED_DATA_MODE" } | null> {
  try {
    // Resolve dataset file path
    const datasetPath = getDatasetFilePath(workspaceId, datasetFileName)
    if (!datasetPath) {
      return null
    }

    // Read dataset file
    const csvContent = await fs.readFile(datasetPath, "utf-8")
    const lines = csvContent.trim().split(/\r?\n/)
    if (lines.length === 0) {
      return null
    }

    // Parse headers
    const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""))
    
    // Determine mode and sample size based on exposure percentage
    const isFullDataMode = exposurePercentage >= 100
    let sampleSize: number
    let mode: "FULL_DATA_MODE" | "LIMITED_DATA_MODE"

    if (isFullDataMode) {
      // FULL_DATA_MODE: Use ALL rows
      sampleSize = totalRows
      mode = "FULL_DATA_MODE"
    } else {
      // LIMITED_DATA_MODE: Sample only specified percentage
      const samplePercentage = exposurePercentage / 100
      const calculatedSampleSize = Math.floor(totalRows * samplePercentage)
      sampleSize = Math.min(calculatedSampleSize, totalRows)
      mode = "LIMITED_DATA_MODE"
    }
    
    // Generate random indices for sampling (or use sequential if small enough)
    let indicesToSample: number[]
    if (sampleSize >= totalRows) {
      // Sample all rows
      indicesToSample = Array.from({ length: totalRows }, (_, i) => i + 1) // +1 because line 0 is header
    } else {
      // Random sampling
      const allIndices = Array.from({ length: totalRows }, (_, i) => i + 1)
      indicesToSample = []
      const shuffled = [...allIndices].sort(() => Math.random() - 0.5)
      indicesToSample = shuffled.slice(0, sampleSize).sort((a, b) => a - b) // Sort for consistent order
    }

    // Parse sampled rows
    const sampleRows: Record<string, any>[] = []
    for (const idx of indicesToSample) {
      if (idx >= lines.length) continue
      const values = parseCSVLine(lines[idx]).map((v) => v.replace(/^"|"$/g, ""))
      const row: Record<string, any> = {}
      headers.forEach((header, colIdx) => {
        row[header] = values[colIdx] || ""
      })
      sampleRows.push(row)
    }

    // Infer column types from sample
    const columns = headers.map((header) => {
      const sampleValues = sampleRows.map((r) => r[header]).filter((v) => v !== "")
      let type = "string"
      if (sampleValues.length > 0) {
        const firstValue = sampleValues[0]
        if (!isNaN(Number(firstValue)) && firstValue !== "") {
          type = "number"
        } else if (typeof firstValue === "string" && firstValue.match(/^\d{4}-\d{2}-\d{2}/)) {
          type = "date"
        }
      }
      return { name: header, type }
    })

    return {
      metadata: {
        dataset_name: datasetFileName,
        rows: totalRows,
        columns,
      },
      sample_rows: sampleRows,
      exposure_percentage: exposurePercentage,
      mode,
    }
  } catch (error) {
    console.error("[chat] Failed to sample dataset rows:", error)
    return null
  }
}

async function getInsights(workspaceId: string): Promise<any | null> {
  try {
    const insightsPath = path.join(process.cwd(), "workspaces", workspaceId, "insights", "auto_summary.json")
    if (existsSync(insightsPath)) {
      const content = await fs.readFile(insightsPath, "utf-8")
      return JSON.parse(content)
    }
    return null
  } catch {
    return null
  }
}

function buildSystemPrompt(
  context: WorkspaceContext | null,
  datasetIntelligence: DatasetIntelligenceSnapshot | null,
  insights: any | null,
  datasetSample: { metadata: { dataset_name: string; rows: number; columns: Array<{ name: string; type: string }> }; sample_rows: Record<string, any>[]; exposure_percentage: number; mode: "FULL_DATA_MODE" | "LIMITED_DATA_MODE" } | null,
  chatTitle: string | null,
  chatDescription: string | null,
  chatSummary: string | null,
  recentChat: any[],
): string {
  // V2: Dataset-aware system prompt with UI-based exposure level awareness
  const exposurePercent = datasetSample?.exposure_percentage ?? 0
  const isFullDataMode = datasetSample?.mode === "FULL_DATA_MODE"
  
  let prompt = `You are an AI data analyst agent inside Data4Viz.

This agent is controlled by a UI-based configuration panel.

--------------------------------------------------
UI INPUT (SOURCE OF TRUTH)
--------------------------------------------------
- data_exposure_percentage: ${exposurePercent}
  (integer value from 1 to 100, provided by the AI Agent control panel)

--------------------------------------------------
DATA ACCESS POLICY
--------------------------------------------------
1. The value provided via the UI is authoritative.
2. You must strictly limit your analysis to the specified percentage of the dataset.
3. If data_exposure_percentage == 100:
   - Enable FULL_DATA_MODE.
   - Use all rows and all columns.
   - Perform complete statistical and exploratory analysis.

4. If data_exposure_percentage < 100:
   - Enable LIMITED_DATA_MODE.
   - Access only the specified percentage of rows.
   - Sampling must be unbiased and representative.
   - Maintain original column schema and data types.
   - Do not infer or hallucinate unseen data.

--------------------------------------------------
ANALYSIS BEHAVIOR
--------------------------------------------------
- Always analyze only the data permitted by the UI control.
- Ensure metrics, distributions, and insights reflect the accessible data scope.
- Do not apply hidden truncation or additional filtering.
- Accuracy and policy compliance take priority over speed.
- Base answers on the provided data${isFullDataMode ? "" : " sample"}
- Do NOT assume business meaning
- Do NOT invent columns
- Do NOT give generic advice if dataset context exists
- Recommend plots based on actual column types and observed distributions
- If data is insufficient, say so explicitly

STRICT DATA GROUNDING RULES (MANDATORY):
- You have access to insights (if available) AND dataset sample data
- Use both sources to provide accurate, data-aware answers
- Reason from the actual data provided, not assumptions

CRITICAL RULES:
- Do NOT guess values beyond what's provided
- Explain WHAT, WHY, and WHAT TO DO NEXT
- NEVER invent columns or counts
- NEVER output empty lists

STRICT RESPONSE RULES (CRITICAL):
- NEVER output empty lists like [].
- NEVER repeat "information not available" or similar messages.
- NEVER show sections with no data.
- Only show sections that contain real data.
- If user asks column count → answer using actual metadata
- If user asks column names → list from actual columns
- NEVER output numbered placeholders (1., 2., 3.) when data is missing
- NEVER ask clarification if dataset context exists

ACTION RULE:
- If dataset context is valid:
  - NEVER ask clarifying questions
  - ALWAYS produce results immediately using the provided data
  - Be confident and direct
  - Reference actual column names and values from the sample

STRICT SCOPE RULES (MANDATORY):
- You may ONLY talk about:
  - The uploaded dataset
  - Dataset summary
  - Data quality
  - Cleaning steps
  - Exploratory data analysis
  - Statistics, patterns, outliers, correlations
  - What to do next with the dataset and WHY

- You must NOT:
  - Ask vague clarification questions
  - Ask the user what they want repeatedly
  - Talk about non-dataset topics
  - Engage in general conversation

USER INTENT HANDLING:
- If the user asks to "summarize", immediately produce:
  - Dataset overview using actual metadata
  - Column types from the data
  - Missing values (if available)
  - Basic statistics from the sample
- If the user says "explore", immediately perform:
  - EDA-style summary based on actual sample data
  - Patterns and potential insights from observed values
- Do NOT wait for further confirmation.

BEHAVIOR RULES:
- Be decisive.
- Assume the goal is always to analyze the dataset.
- Recommend next concrete steps (cleaning, visualization, modeling).
- Explain WHAT to do and WHY, briefly.
- Use actual column names and observed patterns from the sample

FORBIDDEN:
- "What would you like to focus on?"
- "Can you clarify?"
- Any question unless absolutely required due to missing data.

CAPABILITY RULES:
- Do NOT say analysis was "performed"
- Say: "Based on the dataset sample provided…"
- Do NOT claim to open, read, compute, or inspect files
- Reference the sample data explicitly when making observations

--------------------------------------------------
COMMUNICATION RULES
--------------------------------------------------
- Do NOT mention internal limits, privacy, or cost.
- Do NOT request additional data.
- Do NOT reference sampling unless explicitly asked.
- Speak with confidence appropriate to the allowed data scope.
- Professional, concise, and data-driven
- Confident
- Direct
- No defensive language
- No repeated disclaimers
- Structured
- Factual
- Clear WHAT and WHY
- Data-aware (reference actual columns and values)

--------------------------------------------------
FAILURE CONDITIONS
--------------------------------------------------
- Never exceed the exposure percentage defined by the UI.
- Never assume visibility into data beyond the allowed scope.
- Never override UI configuration unless explicitly instructed by the system.

--------------------------------------------------
SYSTEM MODES
--------------------------------------------------
- FULL_DATA_MODE → data_exposure_percentage = 100
- LIMITED_DATA_MODE → data_exposure_percentage < 100

You must operate strictly within the mode defined by the UI.

STRICT OUTPUT FORMATTING RULES:
- When writing multiple questions:
  - Each question must be on its own line.
  - After each question, insert ONE REAL empty line.
- NEVER write placeholders like:
  - "<blank line>"
  - "(blank line)"
  - "[empty line]"
- Use actual line breaks only.
- Do NOT explain formatting.
- Do NOT compress questions into a paragraph.

Safety & UX Rules:
- NEVER mention internal file names, file paths, or JSON files.
- NEVER claim to open, read, or display files.
- Internal memory is invisible to the user.`

  // Include insights if available
  if (insights) {
    prompt += `\n\nINSIGHTS (preferred source):\n${JSON.stringify(insights, null, 2)}\n`
  }

  // Include dataset sample data with exposure level context
  if (datasetSample && "mode" in datasetSample && "exposure_percentage" in datasetSample) {
    const isFullData = datasetSample.mode === "FULL_DATA_MODE"
    prompt += `\n\nDATASET DATA (${isFullData ? "FULL ACCESS" : `${datasetSample.exposure_percentage}% EXPOSURE`}):\n`
    prompt += `Metadata:\n${JSON.stringify(datasetSample.metadata, null, 2)}\n\n`
    if (isFullData) {
      prompt += `All Rows (${datasetSample.sample_rows.length} total rows, 100% access):\n`
    } else {
      prompt += `Sample Rows (${datasetSample.sample_rows.length} of ${datasetSample.metadata.rows} total rows, ${datasetSample.exposure_percentage}% exposure):\n`
    }
    prompt += `${JSON.stringify(datasetSample.sample_rows, null, 2)}\n`
    if (!isFullData) {
      prompt += `\nNote: This is a representative sample. Analysis is based on ${datasetSample.exposure_percentage}% of the dataset.\n`
    }
  } else if (datasetIntelligence && isValidDatasetIntelligence(datasetIntelligence)) {
    // Fallback to metadata-only if sampling failed
    const datasetContext = buildDatasetContext(datasetIntelligence)
    if (datasetContext) {
      prompt += `\n\nDataset Context (metadata only - sample data unavailable):\n${datasetContext}\n`
      prompt += `\nNote: Only dataset structure is available, not actual data values.\n`
    }
  }

  if (chatSummary) {
    prompt += `\n\nCHAT SUMMARY:\n${chatSummary}\n`
  }

  if (recentChat.length > 0) {
    prompt += `\n\nRECENT CHAT:\n`
    for (const msg of recentChat) {
      prompt += `${msg.role === "user" ? "USER" : "ASSISTANT"}: ${msg.content}\n`
    }
  }

  // Include workspace state
  if (context) {
    prompt += `\n\nWorkspace State:\n`
    prompt += `- Dataset uploaded: ${context.hasDataset ? "yes" : "no"}\n`
    prompt += `- Dataset count: ${context.datasetCount}\n`
    prompt += `- Data cleaned: ${context.isDataCleaned ? "yes" : "no"}\n`
    prompt += `- Cleaning steps applied: ${context.cleaningStepsCount}\n`
    prompt += `- Outliers handled: ${context.isOutlierHandled ? "yes" : "no"}\n`
  }

  return prompt
}

function sanitizeResponse(content: string): string {
  let sanitized = content

  // Remove empty lists and arrays
  sanitized = sanitized.replace(/\[\s*\]/g, "")
  sanitized = sanitized.replace(/\[\s*,\s*\]/g, "")
  sanitized = sanitized.replace(/:\s*\[\s*\]/g, ": none")
  sanitized = sanitized.replace(/:\s*\[\s*,\s*\]/g, ": none")

  // Remove repetitive "not available" messages (keep only first occurrence)
  const notAvailablePatterns = [
    /(?:That|This|The) information is not available[^.]*\./gi,
    /(?:Information|Data) is not available[^.]*\./gi,
    /Dataset information is not available[^.]*\./gi,
    /Metadata is not available[^.]*\./gi,
  ]
  
  let foundNotAvailable = false
  for (const pattern of notAvailablePatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      if (!foundNotAvailable) {
        foundNotAvailable = true
        return match
      }
      return ""
    })
  }

  // Remove empty sections
  sanitized = sanitized.replace(/\*\*[^*]+\*\*:\s*\[\s*\]/gi, "")
  sanitized = sanitized.replace(/\*\*[^*]+\*\*:\s*none/gi, "")
  sanitized = sanitized.replace(/##\s*[^\n]+\n\s*\[\s*\]/gi, "")
  sanitized = sanitized.replace(/###\s*[^\n]+\n\s*\[\s*\]/gi, "")

  // Remove mentions of internal file patterns
  const patterns = [
    /\.json/gi,
    /\/ai_chats\//gi,
    /ai_chats\//gi,
    /_recent_/gi,
    /_summary_/gi,
    /ai_chat_recent/gi,
    /ai_chat_summary/gi,
    /ai_chat_\w+\.json/gi,
    /I opened (?:the |a )?file/gi,
    /I (?:read|viewed|displayed) (?:the |a )?(?:file|JSON)/gi,
    /(?:opening|reading|viewing|displaying) (?:the |a )?(?:file|JSON)/gi,
  ]

  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, "")
  }

  // Replace capability claims
  sanitized = sanitized.replace(
    /I (?:opened|read|viewed|displayed|accessed) (?:the |a )?[^.]*/gi,
    "Based on your workspace information",
  )
  sanitized = sanitized.replace(/I can (?:open|read|view|display|access) (?:the |a )?[^.]*/gi, "I can help you with")

  // Replace formatting placeholders with actual line breaks
  const formattingPlaceholders = [
    /<blank\s*line>/gi,
    /\(blank\s*line\)/gi,
    /\[blank\s*line\]/gi,
    /<empty\s*line>/gi,
    /\(empty\s*line\)/gi,
    /\[empty\s*line\]/gi,
    /blank\s*line/gi,
  ]

  for (const pattern of formattingPlaceholders) {
    sanitized = sanitized.replace(pattern, "\n\n")
  }

  // Clean up multiple spaces (but preserve intentional line breaks)
  sanitized = sanitized.replace(/[ \t]+/g, " ")
  // Normalize multiple consecutive newlines to max 2 (one blank line)
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n")
  sanitized = sanitized.trim()

  return sanitized
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, chatId, userMessage, workspaceContext, provider, model, apiKey: bodyKey, dataExposurePercentage } = body as {
      workspaceId?: string
      chatId?: string
      userMessage?: string
      workspaceContext?: WorkspaceContext
      provider?: string
      model?: string
      apiKey?: string
      dataExposurePercentage?: number
    }

    if (provider !== "groq") {
      return NextResponse.json({ error: "Only Groq is supported" }, { status: 400 })
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    if (!chatId) {
      return NextResponse.json({ error: "chatId required" }, { status: 400 })
    }

    if (!userMessage || typeof userMessage !== "string") {
      return NextResponse.json({ error: "userMessage required" }, { status: 400 })
    }

    // Backend guard: reject non-dataset questions (only if no dataset exists)
    const hasDataset = workspaceContext?.hasDataset || false
    if (!hasDataset && !isDatasetRelated(userMessage)) {
      return NextResponse.json({
        error: "I can help only with analysis of the uploaded dataset. Please ask a dataset-related question.",
      }, { status: 200 })
    }

    const key = process.env.GROQ_API_KEY || bodyKey
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "API key required" }, { status: 400 })
    }

    if (!model || !isGroqModelSupported(model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 })
    }

    const resolvedModel = model

    // Verify chat exists and is not deleted
    const index = await getChatIndex(workspaceId!)
    const chat = index.chats.find((c) => c.chatId === chatId!)
    if (!chat || chat.isDeleted) {
      return NextResponse.json({ error: "Chat not found or deleted" }, { status: 404 })
    }

    let recentChat: { messages: any[] } = { messages: [] }
    let chatSummary: string | null = null
    let filesIndex: any[] = []
    let relevantFiles: any[] = []

    try {
      const recent = await getRecentChat(workspaceId!, chatId!)
      recentChat = recent
    } catch (e) {
      console.error("Failed to load recent chat:", e)
    }

    try {
      const summary = await getChatSummary(workspaceId!, chatId!)
      chatSummary = summary?.summary || null
    } catch (e) {
      console.error("Failed to load chat summary:", e)
    }

    // Get Insights (preferred) or Dataset Intelligence (fallback)
    let insights: any | null = null
    let datasetIntelligence: DatasetIntelligenceSnapshot | null = null
    let datasetSample: { metadata: { dataset_name: string; rows: number; columns: Array<{ name: string; type: string }> }; sample_rows: Record<string, any>[]; exposure_percentage: number; mode: "FULL_DATA_MODE" | "LIMITED_DATA_MODE" } | null = null
    
    if (workspaceContext?.hasDataset && workspaceContext.datasetCount > 0) {
      // Try to load insights first (from auto-summarize)
      try {
        insights = await getInsights(workspaceId!)
      } catch (e) {
        console.error("Failed to load insights:", e)
      }
      
      // Fallback to dataset intelligence if no insights
      if (!insights) {
        try {
          datasetIntelligence = await getDatasetIntelligence(workspaceId!)
        } catch (e) {
          console.error("Failed to load dataset intelligence:", e)
        }
      }
      
      // Sync analysis state with reality (insights/intelligence existence)
      const analysisState = await getDatasetAnalysisState(workspaceId!)
      
      // If insights exist, state should be "ready"
      if (insights && analysisState.state !== "ready") {
        await setDatasetAnalysisState(workspaceId!, "ready", {
          insightsPath: `insights/auto_summary.json`
        })
      }
      
      // If state is "ready" but insights don't exist, verify state matches reality
      if (analysisState.state === "ready" && !insights && !isValidDatasetIntelligence(datasetIntelligence)) {
        // State says ready but data doesn't exist - reset to not_started
        await setDatasetAnalysisState(workspaceId!, "not_started")
      }
      
      // If state is "processing" but insights exist, update to ready
      if (analysisState.state === "processing" && insights) {
        await setDatasetAnalysisState(workspaceId!, "ready", {
          insightsPath: `insights/auto_summary.json`
        })
      }

      // V2: Sample dataset rows for chat context (up to 20%, max 5,000 rows)
      try {
        // Get dataset filename from intelligence snapshot or try to find first dataset file
        let datasetFileName: string | null = null
        if (datasetIntelligence?.file_name) {
          datasetFileName = datasetIntelligence.file_name
        } else {
          // Try to find first CSV file in datasets directory
          const datasetsDir = path.join(process.cwd(), "workspaces", workspaceId!, "datasets")
          if (existsSync(datasetsDir)) {
            const files = await fs.readdir(datasetsDir)
            const csvFile = files.find(f => f.endsWith(".csv"))
            if (csvFile) {
              datasetFileName = csvFile
            }
          }
        }

        if (datasetFileName && datasetIntelligence) {
          // Get configured exposure percentage from UI (authoritative) or env fallback
          const exposurePercentage = getDatasetExposurePercentage(dataExposurePercentage)
          datasetSample = await sampleDatasetRows(
            workspaceId!,
            datasetFileName,
            datasetIntelligence.rows,
            exposurePercentage,
          )
          // If sampling failed, fall back to metadata-only mode
          if (!datasetSample) {
            console.warn("[chat] Dataset sampling failed, using metadata-only mode")
          } else {
            console.log(`[chat] Dataset exposure: ${exposurePercentage}% (${datasetSample.mode}, UI: ${dataExposurePercentage ?? 'not provided'}), sampled ${datasetSample.sample_rows.length} rows`)
          }
        }
      } catch (e) {
        console.error("[chat] Failed to sample dataset rows:", e)
        // Continue with metadata-only mode
      }
    }

    // STATE-BASED GATING: Use explicit analysis state instead of null checks
    const lowerMessage = userMessage.toLowerCase()
    const isAnalysisIntent = lowerMessage.includes("summarize") || lowerMessage.includes("analyze") || lowerMessage.includes("explore") || lowerMessage.includes("overview") || lowerMessage.includes("dataset")
    
    if (hasDataset && isAnalysisIntent) {
      const analysisState = await getDatasetAnalysisState(workspaceId!)
      
      // If state is "processing", show processing message (not an error)
      if (analysisState.state === "processing") {
        return NextResponse.json({
          error: "Dataset analysis is in progress. Please wait for it to complete.",
        }, { status: 200 })
      }
      
      // If state is "not_started", auto-trigger summarize once
      if (analysisState.state === "not_started") {
        // Auto-trigger summarize (non-blocking)
        // Note: This is a fire-and-forget operation - the user will need to retry after it completes
        try {
          // Get first dataset from workspace
          const datasetsDir = path.join(process.cwd(), "workspaces", workspaceId!, "datasets")
          let datasetFileName: string | null = null
          if (existsSync(datasetsDir)) {
            const files = await fs.readdir(datasetsDir)
            const csvFile = files.find(f => f.endsWith(".csv"))
            if (csvFile) {
              datasetFileName = csvFile
            }
          }
          
          if (datasetFileName) {
            // Trigger auto-summarize in background (don't await)
            fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/ai/auto-summarize-code`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                datasetId: datasetFileName,
                provider: "groq",
                model: model || "llama-3.1-70b-versatile",
                apiKey: bodyKey,
                dataExposurePercentage,
              }),
            }).catch(err => {
              console.error("[chat] Failed to auto-trigger summarize:", err)
            })
            
            // Set state to processing immediately
            await setDatasetAnalysisState(workspaceId!, "processing")
            
            return NextResponse.json({
              error: "Starting dataset analysis. Please wait a moment and try again.",
            }, { status: 200 })
          }
        } catch (triggerError) {
          console.error("[chat] Error auto-triggering summarize:", triggerError)
        }
      }
      
      // If state is "failed", show error message
      if (analysisState.state === "failed") {
        return NextResponse.json({
          error: analysisState.error || "Dataset analysis failed. Please try 'Auto Summarize Dataset' again.",
        }, { status: 200 })
      }
      
      // If state is "ready" but no insights/intelligence, allow chat (might be metadata-only)
      // Only block if explicitly no data AND state says ready (shouldn't happen, but handle gracefully)
      if (analysisState.state === "ready" && !insights && !isValidDatasetIntelligence(datasetIntelligence)) {
        // This shouldn't happen, but if it does, allow chat to proceed with limited context
        console.warn("[chat] State is 'ready' but no insights/intelligence found - proceeding with limited context")
      }
    }

    const systemPrompt = buildSystemPrompt(
      workspaceContext || null,
      datasetIntelligence,
      insights,
      datasetSample,
      chat.title,
      chat.description || null,
      chatSummary,
      recentChat.messages,
    )

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userMessage },
    ]

    let out = await callGroq(key, resolvedModel, messages)

    if (out.error && isDecommissionError(out.error)) {
      out = await callGroq(key, GROQ_DEFAULT_MODEL, messages)
      if (out.error) {
        out = { error: "Model was updated. Please try again." }
      }
    }

    if (out.error) {
      return NextResponse.json({ error: out.error }, { status: 200 })
    }

    const rawContent = out.content ?? ""
    const sanitizedContent = sanitizeResponse(rawContent)

    const userMsg: ChatMessage = {
      id: `${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    }

    const assistantMsg: ChatMessage = {
      id: `${Date.now() + 1}`,
      role: "assistant",
      content: sanitizedContent,
      timestamp: Date.now() + 1,
    }

    try {
      await appendChatMessages(workspaceId!, chatId!, [userMsg, assistantMsg])
    } catch (e: any) {
      console.error("Failed to save chat messages to file:", e?.message || e)
      console.error("WorkspaceId:", workspaceId)
      console.error("ChatId:", chatId)
      console.error("Error details:", e)
    }

    // Trigger files refresh event (client-side will listen for this)
    // Note: This is a server-side API, so we can't directly dispatch events
    // The client will refresh when navigating or the Files page will poll/refresh

    return NextResponse.json({ content: sanitizedContent })
  } catch (e) {
    return NextResponse.json({ error: "Network error" }, { status: 200 })
  }
}
