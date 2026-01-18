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
  readWorkspaceFile,
  type ChatMessage,
  type DatasetIntelligenceSnapshot,
} from "@/lib/workspace-files"
import type { WorkspaceContext } from "@/lib/workspace-context"
import { getDatasetOverviewFromFile, type OverviewResponse } from "@/lib/api/dataCleaningClient"
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
  chatTitle: string | null,
  chatDescription: string | null,
  chatSummary: string | null,
  recentChat: any[],
): string {
  let prompt = `You are Data4Viz AI.

STRICT DATA GROUNDING RULES (MANDATORY):
- You have access ONLY to the following insights (if available):
${insights ? JSON.stringify(insights, null, 2) : "No insights available yet. Use 'Auto Summarize Dataset' to generate insights."}

CRITICAL RULES:
- Do NOT read raw dataset.
- Do NOT guess values.
- Reason strictly from insights provided above.
- If information is not in insights, say it is not available.
- Explain WHAT, WHY, and WHAT TO DO NEXT.
- NEVER invent columns or counts.
- NEVER output empty lists.

STRICT RESPONSE RULES (CRITICAL):
- NEVER output empty lists like [].
- NEVER repeat "information not available" or similar messages.
- NEVER show sections with no data.
- Only show sections that contain real data.
- If user asks column count → answer using \`columns\`
- If user asks column names → list from \`schema[].name\`
- NEVER output numbered placeholders (1., 2., 3.) when data is missing
- NEVER ask clarification if snapshot exists

ACTION RULE:
- If dataset context is valid:
  - NEVER ask clarifying questions
  - ALWAYS produce results immediately
  - Be confident and direct

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
  - Dataset overview
  - Column types
  - Missing values
  - Basic statistics
- If the user says "explore", immediately perform:
  - EDA-style summary
  - Patterns and potential insights
- Do NOT wait for further confirmation.

BEHAVIOR RULES:
- Be decisive.
- Assume the goal is always to analyze the dataset.
- Recommend next concrete steps (cleaning, visualization, modeling).
- Explain WHAT to do and WHY, briefly.

FORBIDDEN:
- "What would you like to focus on?"
- "Can you clarify?"
- Any question unless absolutely required due to missing data.

CAPABILITY RULES:
- Do NOT say analysis was "performed"
- Say: "Based on the current dataset information…"
- Do NOT claim to open, read, compute, or inspect files

OUTPUT STYLE:
- Confident
- Direct
- No defensive language
- No repeated disclaimers
- Structured
- Factual
- Clear WHAT and WHY

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

  // MEMORY INJECTION ORDER: SYSTEM → INSIGHTS → CHAT MEMORY → USER MESSAGE
  // Insights take priority over raw dataset intelligence
  // Only include dataset context if no insights are available
  if (!insights) {
    const datasetContext = buildDatasetContext(datasetIntelligence)
    if (datasetContext) {
      prompt += `\n\nDataset Context (fallback - use insights if available):\n${datasetContext}`
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
    const { workspaceId, chatId, userMessage, workspaceContext, provider, model, apiKey: bodyKey } = body as {
      workspaceId?: string
      chatId?: string
      userMessage?: string
      workspaceContext?: WorkspaceContext
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
    }

    // SINGLE HARD GATE: Block AI call if dataset exists but no insights/intelligence available
    const lowerMessage = userMessage.toLowerCase()
    const isAnalysisIntent = lowerMessage.includes("summarize") || lowerMessage.includes("analyze") || lowerMessage.includes("explore") || lowerMessage.includes("overview") || lowerMessage.includes("dataset")
    
    if (hasDataset && isAnalysisIntent && !insights && !isValidDatasetIntelligence(datasetIntelligence)) {
      return NextResponse.json({
        error: "Dataset is still processing or no analysis available. Use 'Auto Summarize Dataset' to generate insights.",
      }, { status: 200 })
    }

    const systemPrompt = buildSystemPrompt(
      workspaceContext || null,
      datasetIntelligence,
      insights,
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
