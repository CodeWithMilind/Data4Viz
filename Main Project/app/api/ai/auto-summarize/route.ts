import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import { getDatasetIntelligence, type DatasetIntelligenceSnapshot } from "@/lib/workspace-files"
import type { WorkspaceContext } from "@/lib/workspace-context"
import { compactColumnInfo, isWithinTokenLimit } from "@/lib/ai/token-reducer"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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

function buildCodeGenerationPrompt(
  datasetPath: string,
  schema: DatasetIntelligenceSnapshot,
): string {
  // Limit columns to 25 for token efficiency (auto-summarize is less critical than recommendations)
  const columnNames = Object.keys(schema.schema || {}).slice(0, 25)
  const columnDtypes = columnNames.reduce(
    (acc, col) => {
      acc[col] = schema.schema[col]?.type || "unknown"
      return acc
    },
    {} as Record<string, string>,
  )
  const compactSchema = compactColumnInfo(columnNames, columnDtypes)

  return `You are Data4Viz AI acting as a DATA ANALYSIS PLANNER.

STRICT RULES:
- DO NOT analyze data yourself.
- DO NOT read or infer dataset values.
- ONLY generate Python code.
- Code must:
  - load dataset from provided path
  - compute summaries, stats, insights
  - NOT print or dump full data
  - return compact results only
- NEVER generate explanations in this step.
- Output ONLY valid Python code.

Dataset Path: ${datasetPath}

Dataset Schema:
- Rows: ${schema.rows}
- Columns: ${schema.columns}${columnNames.length < schema.columns ? ` (showing first ${columnNames.length})` : ""}
- Column Details: ${compactSchema}

Generate Python code that:
1. Loads the dataset using pandas: df = pd.read_csv(dataset_path)
2. Computes basic statistics (shape, missing values, data types)
3. Computes numeric column statistics (mean, median, std, min, max) for numeric columns
4. Computes categorical value counts for categorical columns (top 5 values)
5. Identifies key findings (missing values, outliers patterns, data quality issues)
6. Creates a result dictionary with all findings

IMPORTANT: The code MUST create a variable called 'result' that is a dictionary containing:
- 'df_shape': df.shape
- 'missing_values': df.isna().sum().to_dict()
- 'numeric_stats': dictionary with numeric column statistics
- 'categorical_stats': dictionary with top values for categorical columns
- 'key_findings': list of strings describing key findings

Example structure:
result = {
    'df_shape': df.shape,
    'missing_values': df.isna().sum().to_dict(),
    'numeric_stats': {...},
    'categorical_stats': {...},
    'key_findings': [...]
}

Output ONLY the Python code, no markdown, no explanations.`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, provider, model, apiKey: bodyKey } = body as {
      workspaceId?: string
      provider?: string
      model?: string
      apiKey?: string
    }

    if (provider !== "groq") {
      return NextResponse.json({ error: "Only Groq is supported" }, { status: 400 })
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    const key = process.env.GROQ_API_KEY || bodyKey
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "API key required" }, { status: 400 })
    }

    if (!model || !isGroqModelSupported(model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 })
    }

    // Get dataset intelligence
    const datasetIntelligence = await getDatasetIntelligence(workspaceId)
    if (!datasetIntelligence || !datasetIntelligence.rows || !datasetIntelligence.columns) {
      return NextResponse.json(
        { error: "Dataset not found or not ready. Please upload a dataset first." },
        { status: 400 }
      )
    }

    // Get dataset file path from backend
    const datasetsRes = await fetch(`${BACKEND_URL}/workspaces/${workspaceId}/datasets`)
    if (!datasetsRes.ok) {
      return NextResponse.json({ error: "Failed to get dataset info" }, { status: 500 })
    }
    const datasetsData = await datasetsRes.json()
    if (!datasetsData.datasets || datasetsData.datasets.length === 0) {
      return NextResponse.json({ error: "No datasets found" }, { status: 400 })
    }
    const datasetFileName = datasetsData.datasets[0].id

    // Generate Python code using LLM
    const codePrompt = buildCodeGenerationPrompt(
      datasetFileName,
      datasetIntelligence,
    )

    const messages = [
      { role: "system" as const, content: codePrompt },
      { role: "user" as const, content: "Generate the Python analysis code." },
    ]

    // Check if prompt is within token limits
    const fullPrompt = codePrompt + " Generate the Python analysis code."
    if (!isWithinTokenLimit(fullPrompt, 3000)) {
      console.warn("[auto-summarize] Prompt token limit exceeded, proceeding with caution")
    }

    let codeResult = await callGroq(key, model, messages)

    if (codeResult.error && isDecommissionError(codeResult.error)) {
      codeResult = await callGroq(key, GROQ_DEFAULT_MODEL, messages)
      if (codeResult.error) {
        return NextResponse.json({ error: "Model was updated. Please try again." }, { status: 500 })
      }
    }

    if (codeResult.error) {
      return NextResponse.json({ error: codeResult.error }, { status: 500 })
    }

    let pythonCode = codeResult.content || ""
    
    // Extract code from markdown code blocks if present
    const codeBlockMatch = pythonCode.match(/```(?:python)?\n([\s\S]*?)\n```/)
    if (codeBlockMatch) {
      pythonCode = codeBlockMatch[1]
    }

    // Execute Python code in backend
    const executeRes = await fetch(`${BACKEND_URL}/workspaces/${workspaceId}/execute-python`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: pythonCode,
        dataset_path: datasetFileName,
      }),
    })

    if (!executeRes.ok) {
      const errorData = await executeRes.json().catch(() => ({ detail: "Execution failed" }))
      return NextResponse.json(
        { error: errorData.detail || "Python execution failed" },
        { status: 500 }
      )
    }

    const executionResult = await executeRes.json()

    return NextResponse.json({
      success: true,
      notebook_path: executionResult.notebook_path,
      insights_path: executionResult.insights_path,
    })
  } catch (e: any) {
    console.error("Auto summarize error:", e)
    return NextResponse.json({ error: e.message || "Network error" }, { status: 500 })
  }
}
