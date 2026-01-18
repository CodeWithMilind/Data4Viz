import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { promises as fs } from "fs"
import path from "path"
import { existsSync, mkdirSync } from "fs"
import { getDatasetFilePath } from "@/lib/dataset-path-resolver"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const WORKSPACES_DIR = path.join(process.cwd(), "workspaces")
const MAX_RETRIES = 3

/**
 * ISOLATED Auto Summarize → AI → Jupyter Notebook Generation
 * 
 * STRICT ISOLATION:
 * - NO imports from Overview, Data Cleaning, Schema, or other tools
 * - NO shared state
 * - NO side effects on other features
 * - Read-only dataset access
 * - Only writes to notebooks/auto_summarize.ipynb
 */

function isDecommissionError(err: string): boolean {
  const s = String(err).toLowerCase()
  return /decommission|deprecated|not found|invalid model|does not exist|unknown model|model .* (is )?not (available|supported)/i.test(s)
}

/**
 * DEDICATED AI call for notebook generation (NO chat reuse)
 * Single request → single response
 * Isolated from chat/streaming logic
 */
async function generateNotebookWithAI(
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<{ content?: string; error?: string }> {
  const systemPrompt = `You are a code generator. Output ONLY valid Jupyter Notebook JSON.
Do NOT include markdown outside JSON.
Do NOT include explanations.
Do NOT wrap in code fences.
Do NOT add commentary.`

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ]

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
  } catch (error: any) {
    return { error: error.message || "AI request failed" }
  }
}

function getNotebooksDir(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId, "notebooks")
}

async function ensureNotebooksDir(workspaceId: string): Promise<void> {
  const dir = getNotebooksDir(workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

async function writeNotebookFile(workspaceId: string, notebookData: any): Promise<void> {
  await ensureNotebooksDir(workspaceId)
  const filePath = path.join(getNotebooksDir(workspaceId), "auto_summarize.ipynb")
  await fs.writeFile(filePath, JSON.stringify(notebookData, null, 2), "utf-8")
}

/**
 * Parse CSV line handling quoted fields
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
 * Infer column type from sample values (simple heuristic)
 */
function inferColumnType(sampleValues: any[]): string {
  if (sampleValues.length === 0) return "string"
  
  const firstValue = sampleValues[0]
  if (firstValue === null || firstValue === undefined || firstValue === "") {
    return "string"
  }
  
  // Check if numeric
  if (!isNaN(Number(firstValue)) && firstValue !== "") {
    return "number"
  }
  
  // Check if date-like
  if (typeof firstValue === "string" && firstValue.match(/^\d{4}-\d{2}-\d{2}/)) {
    return "date"
  }
  
  return "string"
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, datasetId, provider, model, apiKey: bodyKey } = body as {
      workspaceId?: string
      datasetId?: string
      provider?: string
      model?: string
      apiKey?: string
    }

    // Validation
    if (provider !== "groq") {
      return NextResponse.json({ success: false, error: "Only Groq is supported" }, { status: 400 })
    }

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "workspaceId required" }, { status: 400 })
    }

    if (!datasetId) {
      return NextResponse.json({ success: false, error: "datasetId required" }, { status: 400 })
    }

    // HARD GUARANTEE: API key from server env ONLY
    const serverApiKey = process.env.GROQ_API_KEY
    if (!serverApiKey || typeof serverApiKey !== "string") {
      return NextResponse.json({ 
        success: false, 
        error: "AI service not configured" 
      }, { status: 400 })
    }

    // Use server key only (ignore bodyKey for security)
    const apiKey = serverApiKey

    if (!model || !isGroqModelSupported(model)) {
      return NextResponse.json({ success: false, error: "Invalid model" }, { status: 400 })
    }

    // Resolve dataset file path (read-only, isolated)
    const datasetPath = getDatasetFilePath(workspaceId, datasetId)
    if (!datasetPath) {
      return NextResponse.json({ 
        success: false, 
        error: "Dataset file not found" 
      }, { status: 404 })
    }

    // Read dataset file directly (read-only access)
    let csvContent: string
    try {
      csvContent = await fs.readFile(datasetPath, "utf-8")
    } catch (readError: any) {
      return NextResponse.json({ 
        success: false, 
        error: `Failed to read dataset file: ${readError.message}` 
      }, { status: 500 })
    }

    const lines = csvContent.trim().split(/\r?\n/)
    if (lines.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Dataset file is empty" 
      }, { status: 400 })
    }

    // Parse CSV to extract metadata and sample rows
    const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""))
    const totalRows = lines.length - 1

    // Get sample rows (first 10, safe subset)
    const sampleRows: Record<string, any>[] = []
    const sampleCount = Math.min(10, totalRows)
    for (let i = 1; i <= sampleCount; i++) {
      const values = parseCSVLine(lines[i]).map((v) => v.replace(/^"|"$/g, ""))
      const row: Record<string, any> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx] || ""
      })
      sampleRows.push(row)
    }

    // Infer column types from sample
    const columns = headers.map((header) => {
      const sampleValues = sampleRows.map((r) => r[header]).filter((v) => v !== "")
      return {
        name: header,
        type: inferColumnType(sampleValues),
      }
    })

    // Build dataset context JSON for AI
    const datasetContextJson = JSON.stringify({
      dataset_name: datasetId,
      rows: totalRows,
      columns: columns.map(col => ({ name: col.name, type: col.type })),
      sample_rows: sampleRows.slice(0, 5), // First 5 rows only
    }, null, 2)

    // JSON VALIDATION + AUTO-RETRY LOOP (max 3 attempts)
    let notebookData: any = null
    let lastError: string | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Build retry prompt if not first attempt
      let userPrompt = `Generate a valid Jupyter Notebook (.ipynb) in JSON format.

Rules:
- nbformat: 4
- nbformat_minor: 5
- cells must be an array
- markdown and code cells only
- code cells must have:
  execution_count: null
  outputs: []
- NO trailing commas
- NO comments outside strings

Notebook content:
1. Markdown: dataset overview
2. Code: load dataset from provided path
3. Code: basic EDA (head, describe)
4. Markdown: recommended insights to explore

Dataset context:
${datasetContextJson}`

      if (attempt > 1) {
        userPrompt = `Your previous response was invalid JSON. Fix and return ONLY valid JSON.\n\n${userPrompt}`
      }

      // Call AI (dedicated function, no chat reuse)
      const result = await generateNotebookWithAI(apiKey, model, userPrompt)

      if (result.error) {
        // Handle model decommission
        if (isDecommissionError(result.error) && attempt === 1) {
          const fallbackResult = await generateNotebookWithAI(apiKey, GROQ_DEFAULT_MODEL, userPrompt)
          if (fallbackResult.error) {
            lastError = fallbackResult.error
            continue
          }
          result.content = fallbackResult.content
        } else {
          lastError = result.error
          continue
        }
      }

      if (!result.content) {
        lastError = "AI returned empty response"
        continue
      }

      // Extract JSON from response
      let notebookJson = result.content.trim()

      // Remove markdown code fences if present
      const jsonBlockMatch = notebookJson.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
      if (jsonBlockMatch) {
        notebookJson = jsonBlockMatch[1].trim()
      }

      // Remove leading/trailing whitespace and try to parse
      notebookJson = notebookJson.replace(/^[\s\n]*/, "").replace(/[\s\n]*$/, "")

      // Attempt JSON parse
      try {
        notebookData = JSON.parse(notebookJson)
        
        // Validate structure
        if (notebookData && typeof notebookData === "object" && Array.isArray(notebookData.cells)) {
          // Success! Valid JSON with required structure
          break
        } else {
          lastError = "Invalid notebook structure: missing cells array"
        }
      } catch (parseError: any) {
        lastError = `JSON parse error: ${parseError.message}`
        // Continue to retry
      }
    }

    // If all retries failed, return error
    if (!notebookData) {
      return NextResponse.json(
        { 
          success: false, 
          error: `AI failed to generate valid notebook after ${MAX_RETRIES} attempts. ${lastError || "Unknown error"}` 
        },
        { status: 500 }
      )
    }

    // Ensure required fields (safety normalization)
    if (!notebookData.nbformat) notebookData.nbformat = 4
    if (!notebookData.nbformat_minor) notebookData.nbformat_minor = 5
    if (!notebookData.metadata) {
      notebookData.metadata = {
        kernelspec: { display_name: "Python 3", name: "python3" },
        language_info: { name: "python", version: "3.8" },
      }
    }

    // Normalize cells (ensure proper structure)
    if (Array.isArray(notebookData.cells)) {
      notebookData.cells = notebookData.cells.map((cell: any) => {
        if (cell.cell_type === "code") {
          return {
            ...cell,
            execution_count: null,
            outputs: [],
            source: Array.isArray(cell.source) ? cell.source : [String(cell.source || "")],
          }
        } else if (cell.cell_type === "markdown") {
          return {
            ...cell,
            source: Array.isArray(cell.source) ? cell.source : [String(cell.source || "")],
          }
        }
        return cell
      })
    }

    // Save notebook to workspace (ONLY file write allowed)
    const notebookPath = path.join(getNotebooksDir(workspaceId), "auto_summarize.ipynb")
    await writeNotebookFile(workspaceId, notebookData)

    // Verify file was written
    if (!existsSync(notebookPath)) {
      return NextResponse.json({ 
        success: false, 
        error: "Failed to verify notebook file was written" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      notebook_path: "notebooks/auto_summarize.ipynb",
    })
  } catch (e: any) {
    console.error("[auto-summarize-notebook] Unexpected error:", e)
    return NextResponse.json({ 
      success: false, 
      error: e.message || "Network error" 
    }, { status: 500 })
  }
}
