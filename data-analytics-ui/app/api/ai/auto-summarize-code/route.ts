import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { promises as fs } from "fs"
import { getDatasetFilePath } from "@/lib/dataset-path-resolver"
import { resolveApiKey, callGroq, isDecommissionError } from "@/lib/ai/getAiClient"

/**
 * ISOLATED Auto Summarize Code Generation
 * 
 * STRICT ISOLATION:
 * - NO file writes
 * - NO JSON parsing of AI response
 * - NO execution
 * - Read-only dataset access
 * - Returns ONLY Python code as plain text
 * 
 * USES SAME AI CLIENT AS CHAT:
 * - Same API key resolution (bodyKey || process.env.GROQ_API_KEY)
 * - Same Groq client implementation
 * - Same error handling
 */

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

    if (!model || !isGroqModelSupported(model)) {
      return NextResponse.json({ success: false, error: "Invalid model" }, { status: 400 })
    }

    // Use SAME API key resolution as Chat (SINGLE SOURCE OF TRUTH)
    // Priority: bodyKey (user settings) > process.env.GROQ_API_KEY (server default)
    const apiKey = resolveApiKey(bodyKey)
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        error: "Please configure AI API key in Settings" 
      }, { status: 400 })
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
      dataset_file_path: datasetPath, // Read-only path reference
    }, null, 2)

    // Build AI prompt (MANDATORY format from requirements)
    const systemPrompt = `You are a senior data scientist.
Return ONLY valid Python code.
Do NOT include explanations.
Do NOT include markdown.
Do NOT wrap in code fences.`

    const userPrompt = `Generate a complete Python script for exploratory data analysis.

Rules:
- Start with imports
- Load dataset using pandas
- Show basic inspection (head, info, describe)
- Handle common data types correctly
- Include meaningful visualizations
- Add comments explaining each step
- End with suggested insights to look for as Python comments

Dataset context:
${datasetContextJson}`

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ]

    // Call AI using shared client (SAME as Chat)
    let result = await callGroq(apiKey, model, messages)

    // Handle model decommission
    if (result.error && isDecommissionError(result.error)) {
      result = await callGroq(apiKey, GROQ_DEFAULT_MODEL, messages)
      if (result.error) {
        return NextResponse.json({ 
          success: false, 
          error: result.error 
        }, { status: 500 })
      }
    }

    if (result.error) {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 })
    }

    // Treat response as plain text (DO NOT parse JSON)
    let pythonCode = result.content || ""

    // Remove markdown code fences if AI added them (safety cleanup)
    const codeBlockMatch = pythonCode.match(/```(?:python)?\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) {
      pythonCode = codeBlockMatch[1].trim()
    } else {
      pythonCode = pythonCode.trim()
    }

    // Return code as-is (no validation, no parsing, no file writes)
    return NextResponse.json({
      success: true,
      code: pythonCode,
    })
  } catch (e: any) {
    console.error("[auto-summarize-code] Unexpected error:", e)
    return NextResponse.json({ 
      success: false, 
      error: e.message || "Network error" 
    }, { status: 500 })
  }
}
