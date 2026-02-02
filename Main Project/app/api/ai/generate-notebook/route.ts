import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { promises as fs } from "fs"
import path from "path"
import { existsSync, mkdirSync } from "fs"
import { getDatasetFilePath } from "@/lib/dataset-path-resolver"
import { truncateArray, sampleRows, compactColumnInfo, isWithinTokenLimit } from "@/lib/ai/token-reducer"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const WORKSPACES_DIR = path.join(process.cwd(), "workspaces")

function isDecommissionError(err: string): boolean {
  const s = String(err).toLowerCase()
  return /decommission|deprecated|not found|invalid model|does not exist|unknown model|model .* (is )?not (available|supported)/i.test(s)
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

function buildNotebookGenerationPrompt(
  datasetName: string,
  metadata: {
    rows: number
    columns: number
    columnNames: string[]
    dtypes: Record<string, string>
  },
  sampleRows: Record<string, any>[],
): string {
  // Token optimization: limit columns and sample rows
  const maxColumns = 20;
  const displayColumns = metadata.columnNames.slice(0, maxColumns);
  const displayDtypes = Object.fromEntries(
    displayColumns.map(col => [col, metadata.dtypes[col] || "unknown"])
  );
  const displaySample = sampleRows.slice(0, 2); // Only 2 sample rows
  
  const columnInfo = compactColumnInfo(displayColumns, displayDtypes);
  
  const prompt = `Generate a Jupyter notebook (.ipynb) for dataset: ${datasetName}

DATASET:
- Rows: ${metadata.rows}, Columns: ${metadata.columns}
- Key columns: ${columnInfo}

Sample (${displaySample.length} rows):
${JSON.stringify(displaySample)}

Create .ipynb with:
1. Title markdown cell
2. Data loading code: df = pd.read_csv('${datasetName}')
3. Basic exploration: df.info(), df.describe()
4. Column analysis examples for first 3 columns

nbformat: 4, valid JSON only. No markdown code blocks.`;

  // Log if exceeding token limit
  if (!isWithinTokenLimit(prompt, 2000)) {
    console.warn(`[generate-notebook] Prompt exceeds token limit (${prompt.length} chars)`);
  }

  return prompt;
}

export async function POST(req: NextRequest) {
  console.log("[generate-notebook] Request received")
  try {
    const body = await req.json()
    const { workspaceId, datasetId, provider, model, apiKey: bodyKey } = body as {
      workspaceId?: string
      datasetId?: string
      provider?: string
      model?: string
      apiKey?: string
    }

    console.log("[generate-notebook] Request body:", { workspaceId, datasetId, provider, model, hasApiKey: !!bodyKey })

    if (provider !== "groq") {
      console.error("[generate-notebook] Invalid provider:", provider)
      return NextResponse.json({ success: false, error: "Only Groq is supported" }, { status: 400 })
    }

    if (!workspaceId) {
      console.error("[generate-notebook] Missing workspaceId")
      return NextResponse.json({ success: false, error: "workspaceId required" }, { status: 400 })
    }

    // Resolve datasetId - use provided datasetId or get first from backend
    let datasetFileName: string
    if (datasetId) {
      datasetFileName = datasetId
      console.log("[generate-notebook] Using provided datasetId:", datasetFileName)
    } else {
      // Fallback: get first dataset from backend
      console.log("[generate-notebook] Fetching datasets from backend to get datasetId...")
      const datasetsRes = await fetch(`${BACKEND_URL}/workspaces/${workspaceId}/datasets`)
      if (!datasetsRes.ok) {
        console.error("[generate-notebook] Failed to get datasets, status:", datasetsRes.status)
        return NextResponse.json({ success: false, error: "Failed to get dataset info" }, { status: 500 })
      }
      const datasetsData = await datasetsRes.json()
      if (!datasetsData.datasets || datasetsData.datasets.length === 0) {
        console.error("[generate-notebook] No datasets found")
        return NextResponse.json({ success: false, error: "No datasets found" }, { status: 400 })
      }
      datasetFileName = datasetsData.datasets[0].id
      console.log("[generate-notebook] Using first dataset from backend:", datasetFileName)
    }

    const key = process.env.GROQ_API_KEY || bodyKey
    if (!key || typeof key !== "string") {
      console.error("[generate-notebook] Missing API key")
      return NextResponse.json({ success: false, error: "API key required" }, { status: 400 })
    }

    if (!model || !isGroqModelSupported(model)) {
      console.error("[generate-notebook] Invalid model:", model)
      return NextResponse.json({ success: false, error: "Invalid model" }, { status: 400 })
    }

    // Resolve dataset file path using the SAME mechanism as existing features
    // Uses centralized helper that matches backend load_dataset() logic
    const datasetPath = getDatasetFilePath(workspaceId, datasetFileName)

    console.log("[generate-notebook] Resolved dataset path:", datasetPath)
    console.log("[generate-notebook] Workspace ID:", workspaceId)
    console.log("[generate-notebook] Dataset ID:", datasetFileName)

    // Verify file exists (non-blocking)
    if (!datasetPath) {
      console.error("[generate-notebook] Dataset file not found")
      console.error("[generate-notebook] Workspace ID:", workspaceId)
      console.error("[generate-notebook] Dataset ID:", datasetFileName)
      
      // Log directory contents for debugging
      const datasetsDir = path.join(WORKSPACES_DIR, workspaceId, "datasets")
      const dirExists = existsSync(datasetsDir)
      console.error("[generate-notebook] Datasets directory exists:", dirExists)
      if (dirExists) {
        const files = await fs.readdir(datasetsDir).catch(() => [])
        console.error("[generate-notebook] Files in datasets directory:", files)
      }
      
      return NextResponse.json({ 
        success: false, 
        error: "Dataset file not found" 
      }, { status: 404 })
    }

    // Read CSV file to get metadata and sample rows (read-only)
    let csvContent: string
    try {
      csvContent = await fs.readFile(datasetPath, "utf-8")
    } catch (readError: any) {
      console.error("[generate-notebook] Failed to read dataset file:", readError.message)
      return NextResponse.json({ 
        success: false, 
        error: `Failed to read dataset file: ${readError.message}` 
      }, { status: 500 })
    }

    const lines = csvContent.trim().split(/\r?\n/)
    if (lines.length === 0) {
      console.error("[generate-notebook] Dataset file is empty")
      return NextResponse.json({ 
        success: false, 
        error: "Dataset file is empty" 
      }, { status: 400 })
    }

    // Simple CSV line parser (handles quoted fields)
    const parseCSVLine = (line: string): string[] => {
      const values: string[] = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            current += '"'
            i++ // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes
          }
        } else if (char === "," && !inQuotes) {
          // Field separator
          values.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }

      // Add last field
      values.push(current.trim())
      return values
    }

    // Parse header
    const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""))
    const totalRows = lines.length - 1

    // Get sample rows (first 5, safe subset)
    const sampleRows: Record<string, any>[] = []
    const sampleCount = Math.min(5, totalRows)
    for (let i = 1; i <= sampleCount; i++) {
      const values = parseCSVLine(lines[i]).map((v) => v.replace(/^"|"$/g, ""))
      const row: Record<string, any> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx] || ""
      })
      sampleRows.push(row)
    }

    // Infer basic dtypes from sample (simple heuristic)
    const dtypes: Record<string, string> = {}
    headers.forEach((header) => {
      const sampleValues = sampleRows.map((r) => r[header]).filter((v) => v !== "")
      if (sampleValues.length === 0) {
        dtypes[header] = "object"
        return
      }
      const firstValue = sampleValues[0]
      if (!isNaN(Number(firstValue)) && firstValue !== "") {
        dtypes[header] = "float64"
      } else if (firstValue.match(/^\d{4}-\d{2}-\d{2}/)) {
        dtypes[header] = "datetime64[ns]"
      } else {
        dtypes[header] = "object"
      }
    })

    // Build metadata object
    const metadata = {
      rows: totalRows,
      columns: headers.length,
      columnNames: headers,
      dtypes,
    }

    console.log("[generate-notebook] Metadata extracted:", {
      rows: totalRows,
      columns: headers.length,
      sampleRowsCount: sampleRows.length,
    })

    // Generate notebook using AI
    console.log("[generate-notebook] Calling AI to generate notebook...")
    const prompt = buildNotebookGenerationPrompt(datasetFileName, metadata, sampleRows)
    const messages = [
      { role: "system" as const, content: prompt },
      { role: "user" as const, content: "Generate the Jupyter notebook JSON." },
    ]

    let result = await callGroq(key, model, messages)
    console.log("[generate-notebook] AI call completed, hasError:", !!result.error, "hasContent:", !!result.content)

    if (result.error && isDecommissionError(result.error)) {
      console.log("[generate-notebook] Model decommissioned, retrying with default model...")
      result = await callGroq(key, GROQ_DEFAULT_MODEL, messages)
      if (result.error) {
        console.error("[generate-notebook] Default model also failed:", result.error)
        return NextResponse.json({ success: false, error: "Model was updated. Please try again." }, { status: 500 })
      }
    }

    if (result.error) {
      console.error("[generate-notebook] AI call failed:", result.error)
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    let notebookJson = result.content || ""

    // Extract JSON from markdown code blocks if present
    const jsonBlockMatch = notebookJson.match(/```(?:json)?\n([\s\S]*?)\n```/)
    if (jsonBlockMatch) {
      notebookJson = jsonBlockMatch[1]
    }

    // Parse and validate notebook JSON
    console.log("[generate-notebook] Parsing notebook JSON, length:", notebookJson.length)
    let notebookData: any
    try {
      notebookData = JSON.parse(notebookJson)
      console.log("[generate-notebook] Notebook JSON parsed successfully, cells count:", notebookData.cells?.length || 0)
    } catch (parseError: any) {
      console.error("[generate-notebook] JSON parse error:", parseError.message)
      console.error("[generate-notebook] JSON snippet (first 500 chars):", notebookJson.substring(0, 500))
      return NextResponse.json(
        { success: false, error: "Failed to parse AI-generated notebook JSON. Please try again." },
        { status: 500 }
      )
    }

    // Validate notebook structure
    if (!notebookData.cells || !Array.isArray(notebookData.cells)) {
      console.error("[generate-notebook] Invalid notebook structure: missing cells array")
      return NextResponse.json(
        { success: false, error: "Invalid notebook structure: missing cells array" },
        { status: 500 }
      )
    }

    // Ensure required fields
    if (!notebookData.nbformat) notebookData.nbformat = 4
    if (!notebookData.nbformat_minor) notebookData.nbformat_minor = 4
    if (!notebookData.metadata) {
      notebookData.metadata = {
        kernelspec: { display_name: "Python 3", name: "python3" },
        language_info: { name: "python", version: "3.8" },
      }
    }

    // Save notebook to workspace
    console.log("[generate-notebook] Writing notebook file...")
    const notebookPath = path.join(getNotebooksDir(workspaceId), "auto_summarize.ipynb")
    await writeNotebookFile(workspaceId, notebookData)
    console.log("[generate-notebook] Notebook file written successfully to:", notebookPath)
    
    // Verify file was written
    if (!existsSync(notebookPath)) {
      console.error("[generate-notebook] File write verification failed - file does not exist")
      return NextResponse.json({ error: "Failed to verify notebook file was written" }, { status: 500 })
    }

    console.log("[generate-notebook] Success! Returning response")
    return NextResponse.json({
      success: true,
      notebook_path: "notebooks/auto_summarize.ipynb",
    })
  } catch (e: any) {
    console.error("[generate-notebook] Unexpected error:", e)
    console.error("[generate-notebook] Error stack:", e.stack)
    return NextResponse.json({ success: false, error: e.message || "Network error" }, { status: 500 })
  }
}
