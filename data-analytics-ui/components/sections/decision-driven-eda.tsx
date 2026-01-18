"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, TrendingUp, AlertTriangle, Info, ChevronDown, ChevronUp } from "lucide-react"
import { useWorkspace, workspaceStore } from "@/lib/workspace-store"
import { getDatasetSchema } from "@/lib/api/dataCleaningClient"
import { useToast } from "@/hooks/use-toast"
import { useAIConfigStore } from "@/lib/ai-config-store"
import type { WorkspaceDataset } from "@/types/workspace"

interface DecisionEDAInsight {
  rank: number
  factor: string
  why_it_matters: string
  evidence: string
  confidence: "high" | "medium" | "low"
  confidence_explanation?: string
}

interface ExcludedColumn {
  column: string
  reason: string
}

interface DecisionEDAResponse {
  success: boolean
  insights: {
    decision_metric: string
    top_insights: DecisionEDAInsight[]
    data_risks: string[]
    limitations: string
  }
  backend_stats: any
  excluded_columns?: ExcludedColumn[]
}

export function DecisionDrivenEDA() {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspace()
  const { toast } = useToast()
  const { provider, model, apiKey } = useAIConfigStore()
  
  const [selectedDataset, setSelectedDataset] = useState<string>("")
  const [numericColumns, setNumericColumns] = useState<string[]>([])
  const [selectedMetric, setSelectedMetric] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<DecisionEDAResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedInsights, setExpandedInsights] = useState<Set<number>>(new Set())
  const [showEvidence, setShowEvidence] = useState(false)

  // Sync Zustand store with workspaceStore on mount
  useEffect(() => {
    async function syncWorkspace() {
      await workspaceStore.init()
      const activeId = workspaceStore.getActiveWorkspace()
      if (activeId) {
        const workspace = await workspaceStore.loadWorkspace(activeId)
        if (workspace) {
          setCurrentWorkspace(workspace)
        }
      }
    }
    syncWorkspace()
  }, [setCurrentWorkspace])

  // Get datasets from workspace (single source of truth)
  const datasets = currentWorkspace?.datasets || []

  // Auto-select dataset when there's exactly one and none is selected
  useEffect(() => {
    if (!selectedDataset && datasets.length === 1) {
      setSelectedDataset(datasets[0].fileName)
    }
  }, [selectedDataset, datasets])

  // Load numeric columns when dataset changes
  useEffect(() => {
    if (selectedDataset && currentWorkspace?.id) {
      loadNumericColumns()
    }
  }, [selectedDataset, currentWorkspace?.id])

  async function loadNumericColumns() {
    if (!currentWorkspace?.id || !selectedDataset) return
    
    try {
      // Get dataset schema to find numeric columns
      const schema = await getDatasetSchema(currentWorkspace.id, selectedDataset, true)
      
      if (schema) {
        const numericCols = schema.columns
          .filter((col) => col.canonical_type === "numeric")
          .map((col) => col.name)
        setNumericColumns(numericCols)
        if (numericCols.length > 0 && !selectedMetric) {
          setSelectedMetric(numericCols[0])
        }
      }
    } catch (err) {
      console.error("Failed to load numeric columns:", err)
    }
  }

  async function generateInsights() {
    if (!currentWorkspace?.id || !selectedDataset || !selectedMetric) {
      setError("Please select a dataset and decision metric")
      return
    }

    setLoading(true)
    setError(null)
    setInsights(null)

    try {
      // Use the SAME AI config as AI Agent (shared store)
      // Backend will prioritize process.env.GROQ_API_KEY over apiKey from request
      const response = await fetch("/api/decision-eda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          datasetId: selectedDataset,
          decisionMetric: selectedMetric,
          provider: provider || "groq",
          model: model || "llama-3.1-70b-versatile",
          apiKey: apiKey, // Optional - backend prioritizes env var
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }))
        throw new Error(errorData.error || "Failed to generate insights")
      }

      const data: DecisionEDAResponse = await response.json()
      setInsights(data)
      
      toast({
        title: "Success",
        description: "Insights generated successfully",
      })
    } catch (err: any) {
      setError(err.message || "Failed to generate insights")
      toast({
        title: "Error",
        description: err.message || "Failed to generate insights",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  function toggleInsight(index: number) {
    const newExpanded = new Set(expandedInsights)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedInsights(newExpanded)
  }

  function getConfidenceColor(confidence: string) {
    switch (confidence) {
      case "high":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case "low":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
    }
  }

  return (
    <div className="space-y-6">
      {/* Scope Definition - Always Visible */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <div className="font-semibold mb-2">What this analysis does and does not do</div>
          <p className="text-sm">
            This analysis identifies factors associated with changes in the selected metric.
            It does not establish causality or make predictions.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Decision-Driven EDA</CardTitle>
          <CardDescription>
            Analyze which factors influence your decision metric. Statistics are computed in the backend,
            then explained by AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dataset Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Dataset</label>
            <Select value={selectedDataset} onValueChange={setSelectedDataset}>
              <SelectTrigger>
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((ds) => (
                  <SelectItem key={ds.id} value={ds.fileName}>
                    {ds.fileName} ({ds.rowCount} rows, {ds.columnCount} cols)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Decision Metric Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Decision Metric (Numeric Column)</label>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger>
                <SelectValue placeholder="Select a numeric column" />
              </SelectTrigger>
              <SelectContent>
                {numericColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button
            onClick={generateInsights}
            disabled={loading || !selectedDataset || !selectedMetric}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Insights...
              </>
            ) : (
              "Generate Insights"
            )}
          </Button>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Insights Display */}
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle>Top Insights for {insights.insights.decision_metric}</CardTitle>
            <CardDescription>
              Ranked by impact score. Click on insights to expand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Top Insights */}
            {insights.insights.top_insights.map((insight, index) => {
              const isExpanded = expandedInsights.has(index)
              return (
                <div
                  key={index}
                  className="border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => toggleInsight(index)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">
                        #{insight.rank}
                      </Badge>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">{insight.factor}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {insight.why_it_matters}
                        </p>
                        {/* Confidence Explanation */}
                        {insight.confidence_explanation && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            {insight.confidence_explanation}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getConfidenceColor(insight.confidence)}>
                        {insight.confidence} confidence
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-2 border-t space-y-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Evidence:</p>
                        <p className="text-sm">{insight.evidence}</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Data Risks */}
            {insights.insights.data_risks && insights.insights.data_risks.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Data Quality Risks:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {insights.insights.data_risks.map((risk, idx) => (
                      <li key={idx} className="text-sm">{risk}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Excluded Columns */}
            {insights.excluded_columns && insights.excluded_columns.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Excluded from analysis:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {insights.excluded_columns.map((exc, idx) => (
                      <li key={idx} className="text-sm">
                        <span className="font-mono">{exc.column}</span> — {exc.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Limitations */}
            {insights.insights.limitations && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Limitations:</div>
                  <p className="text-sm">{insights.insights.limitations}</p>
                </AlertDescription>
              </Alert>
            )}

            {/* Show Evidence Toggle */}
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEvidence(!showEvidence)}
                className="w-full"
              >
                {showEvidence ? "Hide" : "Show"} Evidence (Backend Statistics)
              </Button>
              
              {showEvidence && insights.backend_stats && (
                <div className="mt-4 p-4 bg-secondary rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(insights.backend_stats, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
