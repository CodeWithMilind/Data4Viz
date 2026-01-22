"use client"

import { useState, useEffect, useMemo } from "react"
import { AlertTriangle, Eye, Trash2, Loader2, Database } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useWorkspace } from "@/contexts/workspace-context"
import { getDatasetSchema, type SchemaResponse, detectOutliers, type DetectedOutlier } from "@/lib/api/dataCleaningClient"
import { useToast } from "@/hooks/use-toast"
import { useAIConfigStore } from "@/lib/ai-config-store"

export function OutlierHandlingPage() {
  const { activeWorkspaceId, getDatasets } = useWorkspace()
  const { toast } = useToast()
  const [schema, setSchema] = useState<SchemaResponse | null>(null)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [outliers, setOutliers] = useState<DetectedOutlier[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState<string | null>(null)
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false)
  const [aiRecommendations, setAiRecommendations] = useState<Record<string, { recommended_action: string; short_reason: string; is_ai_recommendation: boolean }>>({})
  
  // Get AI config from store
  const { provider, model, apiKey } = useAIConfigStore()

  // Get first dataset from workspace
  const selectedDataset = useMemo(() => {
    const datasets = getDatasets()
    return datasets.length > 0 ? datasets[0] : null
  }, [getDatasets])

  // Fetch schema when dataset is available
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      setSchema(null)
      setSchemaError(null)
      return
    }

    let cancelled = false
    setIsLoadingSchema(true)
    setSchemaError(null)

    getDatasetSchema(activeWorkspaceId, selectedDataset.fileName, true)
      .then((schemaData) => {
        if (cancelled) return
        setSchema(schemaData)
        setSchemaError(null)
        setIsLoadingSchema(false)
      })
      .catch((error) => {
        if (cancelled) return
        const errorMessage = error instanceof Error ? error.message : "Failed to load schema"
        setSchemaError(errorMessage)
        setIsLoadingSchema(false)
        console.error("Error fetching schema:", error)
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, selectedDataset?.fileName])

  // Get numeric columns from schema (outliers only apply to numeric columns)
  const numericColumns = useMemo(() => {
    if (!schema) return []
    return schema.columns.filter((col) => col.canonical_type === "numeric")
  }, [schema])

  // Group outliers by column and create column-level summary
  interface ColumnOutlierSummary {
    column_name: string
    type: string
    outlier_count: number
    min_outlier: number
    max_outlier: number
    recommendation: string
    explanation: string
    ai_recommendation?: {
      recommended_action: string
      short_reason: string
      is_ai_recommendation: boolean
    }
  }

  const columnSummaries = useMemo<ColumnOutlierSummary[]>(() => {
    if (outliers.length === 0) return []

    // Group outliers by column name
    const grouped = outliers.reduce((acc, outlier) => {
      if (outlier.detected_value === null) return acc
      
      if (!acc[outlier.column_name]) {
        acc[outlier.column_name] = []
      }
      acc[outlier.column_name].push(outlier)
      return acc
    }, {} as Record<string, DetectedOutlier[]>)

    // Create summary for each column
    return Object.entries(grouped).map(([columnName, columnOutliers]) => {
      const values = columnOutliers
        .map(o => o.detected_value)
        .filter((v): v is number => v !== null)
      
      const minOutlier = Math.min(...values)
      const maxOutlier = Math.max(...values)
      
      // Determine recommendation based on most common action
      const actionCounts = columnOutliers.reduce((acc, o) => {
        acc[o.suggested_action] = (acc[o.suggested_action] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      // Priority: Remove > Cap > Ignore (rule-based fallback)
      let recommendation = "Ignore"
      if (actionCounts["Remove"] && actionCounts["Remove"] > 0) {
        recommendation = "Remove"
      } else if (actionCounts["Cap"] && actionCounts["Cap"] > 0) {
        recommendation = "Cap"
      }

      const column = schema?.columns.find((col) => col.name === columnName)
      
      // Generate rule-based explanation text (will be replaced by AI if available)
      let actionVerb = "keeping"
      if (recommendation === "Remove") {
        actionVerb = "removing"
      } else if (recommendation === "Cap") {
        actionVerb = "capping"
      } else if (recommendation === "Transform") {
        actionVerb = "transforming"
      }
      
      const explanation = `In ${columnName}, consider ${actionVerb} values from ${minOutlier.toLocaleString()} to ${maxOutlier.toLocaleString()}.`

      // Get AI recommendation if available
      const aiRec = aiRecommendations[columnName]

      return {
        column_name: columnName,
        type: column?.canonical_type || "numeric",
        outlier_count: columnOutliers.length,
        min_outlier: minOutlier,
        max_outlier: maxOutlier,
        recommendation: aiRec?.recommended_action || recommendation,
        explanation: aiRec?.short_reason || explanation,
        ai_recommendation: aiRec,
      }
    })
  }, [outliers, schema, aiRecommendations])

  // Handle outlier detection
  const handleDetectOutliers = async () => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      toast({
        title: "Error",
        description: "Please select a workspace and dataset first",
        variant: "destructive",
      })
      return
    }

    setIsDetecting(true)
    setDetectionError(null)
    setOutliers([])

    try {
      const response = await detectOutliers(
        activeWorkspaceId,
        selectedDataset.fileName,
        "zscore", // Use Z-score method (simple & explainable)
        3.0 // Standard threshold
      )

      setOutliers(response.outliers)
      
      if (response.total_outliers === 0) {
        toast({
          title: "No Outliers Detected",
          description: "No outliers found in numeric columns",
        })
      } else {
        toast({
          title: "Outliers Detected",
          description: `Found ${response.total_outliers} outlier${response.total_outliers === 1 ? "" : "s"} in numeric columns`,
        })
        
        // Fetch AI recommendations after detection
        await fetchAIRecommendations(response.outliers)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to detect outliers"
      setDetectionError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsDetecting(false)
    }
  }

  // Fetch AI recommendations for outlier columns
  const fetchAIRecommendations = async (detectedOutliers: DetectedOutlier[]) => {
    if (!activeWorkspaceId || !selectedDataset?.fileName || detectedOutliers.length === 0) {
      return
    }

    // Group outliers by column to create summaries
    const grouped = detectedOutliers.reduce((acc, outlier) => {
      if (outlier.detected_value === null) return acc
      
      if (!acc[outlier.column_name]) {
        acc[outlier.column_name] = []
      }
      acc[outlier.column_name].push(outlier)
      return acc
    }, {} as Record<string, DetectedOutlier[]>)

    const columnSummaries = Object.entries(grouped).map(([columnName, columnOutliers]) => {
      const values = columnOutliers
        .map(o => o.detected_value)
        .filter((v): v is number => v !== null)
      
      const minOutlier = Math.min(...values)
      const maxOutlier = Math.max(...values)
      
      const column = schema?.columns.find((col) => col.name === columnName)
      const numericStats = column?.numeric_stats

      return {
        column_name: columnName,
        type: column?.canonical_type || "numeric",
        outlier_count: columnOutliers.length,
        min_outlier: minOutlier,
        max_outlier: maxOutlier,
        mean: numericStats?.mean,
        median: numericStats?.median,
      }
    })

    if (columnSummaries.length === 0) return

    setIsLoadingRecommendations(true)

    try {
      const response = await fetch("/api/ai/outlier-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          datasetId: selectedDataset.fileName,
          columns: columnSummaries,
          provider: provider || "groq",
          model: model || "llama-3.1-70b-versatile",
          apiKey: apiKey || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to fetch AI recommendations")
      }

      const data = await response.json()
      if (data.success && data.recommendations) {
        // Convert array to map for easy lookup
        const recommendationsMap: Record<string, { recommended_action: string; short_reason: string; is_ai_recommendation: boolean }> = {}
        data.recommendations.forEach((rec: any) => {
          recommendationsMap[rec.column_name] = {
            recommended_action: rec.recommended_action,
            short_reason: rec.short_reason,
            is_ai_recommendation: rec.is_ai_recommendation || false,
          }
        })
        setAiRecommendations(recommendationsMap)
      }
    } catch (error) {
      console.warn("Failed to fetch AI recommendations, using rule-based:", error)
      // Silently fallback to rule-based (already handled in columnSummaries)
    } finally {
      setIsLoadingRecommendations(false)
    }
  }

  if (isLoadingSchema) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading schema...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (schemaError) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-destructive" />
            <p className="text-destructive">Failed to load schema: {schemaError}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!selectedDataset) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Dataset Selected</CardTitle>
            <CardDescription>Please select a dataset to handle outliers</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Outlier Handling</span>
        </div>
        <Button 
          variant="outline" 
          className="gap-2 bg-transparent"
          onClick={handleDetectOutliers}
          disabled={isDetecting || !selectedDataset || numericColumns.length === 0}
        >
          {isDetecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              Detect Outliers
            </>
          )}
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detected Outliers</CardTitle>
            <CardDescription>
              Values that fall outside expected ranges (only numeric columns shown)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {numericColumns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No numeric columns found in dataset. Outliers can only be detected in numeric columns.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Badge variant="secondary">
                    {numericColumns.length} numeric {numericColumns.length === 1 ? "column" : "columns"} available
                  </Badge>
                  {columnSummaries.length > 0 && (
                    <Badge variant="destructive">
                      {columnSummaries.length} column{columnSummaries.length === 1 ? "" : "s"} with outliers
                    </Badge>
                  )}
                </div>
                
                {detectionError && (
                  <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive">{detectionError}</p>
                  </div>
                )}

                {columnSummaries.length === 0 && !isDetecting && !detectionError ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-medium mb-1">No outliers detected</p>
                    <p className="text-sm">Click "Detect Outliers" to analyze numeric columns</p>
                  </div>
                ) : columnSummaries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Column</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Outliers Count</TableHead>
                        <TableHead>Outlier Range</TableHead>
                        <TableHead>Recommendation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columnSummaries.map((summary) => (
                        <TableRow key={summary.column_name}>
                          <TableCell className="font-medium">{summary.column_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {summary.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {summary.outlier_count}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <span className="text-destructive">
                              {summary.min_outlier.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground mx-1">→</span>
                            <span className="text-destructive">
                              {summary.max_outlier.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge 
                                variant={
                                  summary.recommendation === "Remove" ? "destructive" :
                                  summary.recommendation === "Cap" ? "default" :
                                  summary.recommendation === "Transform" ? "secondary" :
                                  summary.recommendation === "Ignore" ? "outline" :
                                  "secondary"
                                }
                                className="text-xs w-fit"
                              >
                                {summary.recommendation === "Ignore" ? "Keep" : summary.recommendation}
                              </Badge>
                              {isLoadingRecommendations ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Getting AI recommendation...
                                </span>
                              ) : summary.ai_recommendation ? (
                                <span className="text-xs text-muted-foreground">
                                  {summary.ai_recommendation.is_ai_recommendation ? "AI recommendation" : "Rule-based suggestion"}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}

                {/* Explanation text for each column */}
                {columnSummaries.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h4 className="text-sm font-medium text-foreground mb-2">Recommendations</h4>
                    {columnSummaries.map((summary) => (
                      <div key={`explanation-${summary.column_name}`} className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-foreground">{summary.column_name}</p>
                          {summary.ai_recommendation && (
                            <Badge variant="outline" className="text-xs">
                              {summary.ai_recommendation.is_ai_recommendation ? "AI" : "Rule-based"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{summary.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
