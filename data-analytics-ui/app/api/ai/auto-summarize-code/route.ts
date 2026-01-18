import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { promises as fs } from "fs"
import { getDatasetFilePath } from "@/lib/dataset-path-resolver"
import { resolveApiKey, callGroq, isDecommissionError } from "@/lib/ai/getAiClient"

/**
 * ISOLATED Auto Summarize Code Generation (V2)
 * 
 * V2 FEATURES:
 * - More intelligent, insight-oriented Python EDA script
 * - Smart reasoning without automation
 * - Dynamic column detection (no hardcoding)
 * - Safe visualization limits
 * - Insight guidance and AutoViz preparation
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
    const { workspaceId, datasetId, provider, model, apiKey: bodyKey, dataExposurePercentage } = body as {
      workspaceId?: string
      datasetId?: string
      provider?: string
      model?: string
      apiKey?: string
      dataExposurePercentage?: number
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

    // Build dataset context JSON for AI (without calling other tools)
    const datasetContextJson = JSON.stringify({
      dataset_name: datasetId,
      workspace_id: workspaceId, // User/project context
      rows: totalRows,
      columns: columns.map(col => ({ name: col.name, type: col.type })),
      sample_rows: sampleRows, // Up to 10 sample rows (max 10 per requirements)
    }, null, 2)

    // Get data exposure percentage (default: 100% for code generation)
    const exposurePercent = dataExposurePercentage !== undefined && dataExposurePercentage !== null
      ? Math.max(1, Math.min(100, Math.floor(dataExposurePercentage)))
      : 100

    // Build AI prompt (V4 - STRICT rules: must load from file, never recreate)
    const systemPrompt = `You are an AI agent that generates Python code inside Data4Viz.

The dataset is persisted by the system and must be accessed via file loading.
You are NOT allowed to recreate, mock, or inline dataset values.

--------------------------------------------------
ABSOLUTE DATA ACCESS RULES (HARD ENFORCEMENT)
--------------------------------------------------

1. You MUST load the dataset using pandas file I/O.
   ✅ Allowed:
      - pd.read_csv(<dataset_path>)
      - pd.read_parquet(<dataset_path>)
      - pd.read_excel(<dataset_path>)

2. You MUST NOT define datasets manually.
   ❌ Forbidden patterns:
      - pd.DataFrame({...})
      - lists of dictionaries
      - arrays of values
      - hardcoded rows or columns
      - "sample data" or "example data"

3. You MUST assume the system provides:
   - dataset_path (string)
   - data_exposure_percentage (integer)

Return ONLY valid Python code.
Do NOT include explanations.
Do NOT include markdown.
Do NOT wrap output in code fences.`

    // Determine dataset path (use datasetId as filename)
    // The actual path will be resolved at runtime, but we provide a variable name
    const datasetPathVar = datasetId.endsWith('.csv') ? datasetId : `${datasetId}.csv`

    const userPrompt = `Generate a SAFE, GENERIC, and INSIGHT-ORIENTED Python script for exploratory data analysis.

--------------------------------------------------
SYSTEM VARIABLES (INJECTED BY BACKEND)
--------------------------------------------------

# These variables are provided by the system - use them directly:
dataset_path = "${datasetPathVar}"
data_exposure_percentage = ${exposurePercent}

# Your code MUST start with:
# import pandas as pd
# df = pd.read_csv(dataset_path)

--------------------------------------------------
DATA EXPOSURE POLICY
--------------------------------------------------

- data_exposure_percentage controls HOW MUCH DATA IS AVAILABLE,
  not HOW DATA IS LOADED.

Rules:
- Always load the dataset from dataset_path.
- If data_exposure_percentage < 100:
  → Assume the file is already pre-filtered by the backend.
- NEVER apply your own sampling or slicing unless explicitly asked.

--------------------------------------------------
PYTHON CODE GENERATION RULES
--------------------------------------------------

✔ Generate executable Python code only  
✔ Start by loading data via pandas I/O  
✔ Operate on the loaded DataFrame  
✔ Perform analysis, EDA, or visualization as requested  

❌ Do NOT:
- Recreate the dataset
- Guess values
- Inline arrays
- Explain in natural language

MANDATORY RULES:
- DO NOT assume or invent column names
- DO NOT hardcode any column list
- ALL column usage MUST be derived dynamically from df.columns
- ALWAYS check column existence before using
- NEVER assume a target variable
- NEVER assume an ID column
- NEVER encode categorical variables
- NEVER mutate the dataset aggressively

SCRIPT STRUCTURE:

1. Imports:
   - pandas
   - matplotlib
   - seaborn (optional)

2. Load dataset (REQUIRED):
   - Use: df = pd.read_csv(dataset_path)
   - The dataset_path variable is provided by the system
   - DO NOT define or recreate the dataset manually

3. Initial inspection:
   - df.head()
   - df.info()
   - df.describe(include="all")

4. Column categorization:
   - Identify categorical columns dynamically
   - Identify numeric columns dynamically
   - Identify datetime-like columns if possible

5. Visual exploration (SAFE LIMITS):
   - For up to 3 categorical columns:
       * bar plots of value counts
   - For numeric columns:
       * histogram distributions
       * scatter plot between first two numeric columns (only if >=2)
   - For datetime columns:
       * simple trend plot if paired with a numeric column
   - Skip plots if insufficient columns exist

6. Lightweight statistics (NO ML):
   - Correlation matrix for numeric columns (if >=3)
   - Print top correlations (no heatmap if too many columns)

7. Insight guidance (IMPORTANT):
   - Add Python comments suggesting:
       * what patterns to look for
       * what anomalies may indicate
       * what follow-up analysis user can perform
   - Keep insights GENERIC (do not name specific columns)

8. AutoViz preparation (COMMENT ONLY):
   - Add commented code showing how AutoViz *could* be run
   - Do NOT import or execute AutoViz
   - Use dataset_path variable (not hardcoded paths)
   - Example:
     # from autoviz.AutoViz_Class import AutoViz_Class
     # AV = AutoViz_Class()
     # AV.AutoViz(dataset_path)

STRICTLY FORBIDDEN:
- Hardcoded column names
- Dataset-specific logic
- LabelEncoder
- Assumed business meaning
- File writes or execution
- Creating sample data
- Mock data structures
- pd.DataFrame({...}) or manual dataset creation
- Lists of dictionaries as data

--------------------------------------------------
OUTPUT FORMAT
--------------------------------------------------

- Output ONLY Python code
- No explanations before or after
- No natural language outside code blocks

--------------------------------------------------
FAILURE CONDITION
--------------------------------------------------

If you attempt to define the dataset manually instead of using read_csv,
the response is invalid and must be regenerated.

You are generating code for a controlled, production-style environment.

Dataset context (for reference only - use dataset_path to load):
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
