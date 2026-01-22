"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { AlertTriangle, Eye, Trash2, Loader2, Database } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useWorkspace } from "@/contexts/workspace-context"
import { getDatasetSchema, type SchemaResponse, detectOutliers, getCachedOutlierAnalysis, type DetectedOutlier } from "@/lib/api/dataCleaningClient"
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
  const [aiRecommendations, setAiRecommendations] = useState<Record<string, { lower_action?: string; lower_reason?: string; upper_action?: string; upper_reason?: string; is_ai_recommendation: boolean }>>({})
  
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

  // Fetch AI recommendations for outlier columns (defined early for use in useEffect)
  const fetchAIRecommendations = useCallback(async (detectedOutliers: DetectedOutlier[]) => {
    // Skip if no outliers
    if (!detectedOutliers || detectedOutliers.length === 0) {
      return
    }
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      return
    }

    // Group outliers by column and type (lower/upper)
    const grouped = detectedOutliers.reduce((acc, outlier) => {
      if (outlier.detected_value === null) return acc
      
      if (!acc[outlier.column_name]) {
        acc[outlier.column_name] = { lower: [], upper: [] }
      }
      
      if (outlier.outlier_type === "lower") {
        acc[outlier.column_name].lower.push(outlier)
      } else if (outlier.outlier_type === "upper") {
        acc[outlier.column_name].upper.push(outlier)
      }
      
      return acc
    }, {} as Record<string, { lower: DetectedOutlier[]; upper: DetectedOutlier[] }>)

    const columnSummaries = Object.entries(grouped).map(([columnName, { lower, upper }]) => {
      const column = schema?.columns.find((col) => col.name === columnName)
      const numericStats = column?.numeric_stats

      const summary: any = {
        column_name: columnName,
        type: column?.canonical_type || "numeric",
        mean: numericStats?.mean,
        median: numericStats?.median,
      }

      // Add lower outlier info if exists
      if (lower.length > 0) {
        const lowerValues = lower
          .map(o => o.detected_value)
          .filter((v): v is number => v !== null)
        summary.lower_outlier_count = lower.length
        summary.lower_outlier_min = Math.min(...lowerValues)
        summary.lower_outlier_max = Math.max(...lowerValues)
      }

      // Add upper outlier info if exists
      if (upper.length > 0) {
        const upperValues = upper
          .map(o => o.detected_value)
          .filter((v): v is number => v !== null)
        summary.upper_outlier_count = upper.length
        summary.upper_outlier_min = Math.min(...upperValues)
        summary.upper_outlier_max = Math.max(...upperValues)
      }

      return summary
    }).filter(col => (col.lower_outlier_count && col.lower_outlier_count > 0) || (col.upper_outlier_count && col.upper_outlier_count > 0))

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
        const recommendationsMap: Record<string, { lower_action?: string; lower_reason?: string; upper_action?: string; upper_reason?: string; is_ai_recommendation: boolean }> = {}
        data.recommendations.forEach((rec: any) => {
          recommendationsMap[rec.column_name] = {
            lower_action: rec.lower_action,
            lower_reason: rec.lower_reason,
            upper_action: rec.upper_action,
            upper_reason: rec.upper_reason,
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
  }, [activeWorkspaceId, selectedDataset?.fileName, schema, provider, model, apiKey])

  // Load cached outlier analysis on page load
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      setOutliers([])
      return
    }

    let cancelled = false

    // Try to load cached outlier analysis
    getCachedOutlierAnalysis(activeWorkspaceId, selectedDataset.fileName)
      .then((cachedData) => {
        if (cancelled) return
        if (cachedData) {
          console.log(`[OutlierHandlingPage] Loaded cached outlier analysis with ${cachedData.total_outliers} outliers`)
          setOutliers(cachedData.outliers)
          // Fetch AI recommendations for cached data
          fetchAIRecommendations(cachedData.outliers).catch((err) => {
            console.warn("Failed to fetch AI recommendations for cached data:", err)
          })
        } else {
          console.log(`[OutlierHandlingPage] No cached outlier analysis found`)
          setOutliers([])
        }
      })
      .catch((error) => {
        if (cancelled) return
        console.warn("Failed to load cached outlier analysis:", error)
        setOutliers([])
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, selectedDataset?.fileName, fetchAIRecommendations])

  // Get numeric columns from schema (outliers only apply to numeric columns)
  const numericColumns = useMemo(() => {
    if (!schema) return []
    return schema.columns.filter((col) => col.canonical_type === "numeric")
  }, [schema])

  // Group outliers by column and create column-level summary with lower/upper separation
  interface LowerUpperOutlierInfo {
    count: number
    min: number
    max: number
    recommendation: string
  }

  interface ColumnOutlierSummary {
    column_name: string
    type: string
    lower_outliers: LowerUpperOutlierInfo | null
    upper_outliers: LowerUpperOutlierInfo | null
    ai_recommendation?: {
      lower_action?: string
      upper_action?: string
      lower_reason?: string
      upper_reason?: string
      is_ai_recommendation: boolean
    }
  }

  const columnSummaries = useMemo<ColumnOutlierSummary[]>(() => {
    if (outliers.length === 0) return []

    // Group outliers by column name and type (lower/upper)
    const grouped = outliers.reduce((acc, outlier) => {
      if (outlier.detected_value === null) return acc
      
      if (!acc[outlier.column_name]) {
        acc[outlier.column_name] = { lower: [], upper: [] }
      }
      
      if (outlier.outlier_type === "lower") {
        acc[outlier.column_name].lower.push(outlier)
      } else if (outlier.outlier_type === "upper") {
        acc[outlier.column_name].upper.push(outlier)
      }
      
      return acc
    }, {} as Record<string, { lower: DetectedOutlier[]; upper: DetectedOutlier[] }>)

    // Create summary for each column
    const summaries: ColumnOutlierSummary[] = []
    
    for (const [columnName, { lower, upper }] of Object.entries(grouped)) {
      // Skip columns with no outliers
      if (lower.length === 0 && upper.length === 0) continue

      const column = schema?.columns.find((col) => col.name === columnName)
      
      // Process lower outliers
      let lowerInfo: LowerUpperOutlierInfo | null = null
      if (lower.length > 0) {
        const lowerValues = lower
          .map(o => o.detected_value)
          .filter((v): v is number => v !== null)
        
        const lowerMin = Math.min(...lowerValues)
        const lowerMax = Math.max(...lowerValues)
        
        // Determine recommendation based on most common action
        const lowerActionCounts = lower.reduce((acc, o) => {
          acc[o.suggested_action] = (acc[o.suggested_action] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        // Priority: Remove > Cap > Ignore
        let lowerRecommendation = "Ignore"
        if (lowerActionCounts["Remove"] && lowerActionCounts["Remove"] > 0) {
          lowerRecommendation = "Remove"
        } else if (lowerActionCounts["Cap"] && lowerActionCounts["Cap"] > 0) {
          lowerRecommendation = "Cap"
        }
        
        lowerInfo = {
          count: lower.length,
          min: lowerMin,
          max: lowerMax,
          recommendation: lowerRecommendation,
        }
      }
      
      // Process upper outliers
      let upperInfo: LowerUpperOutlierInfo | null = null
      if (upper.length > 0) {
        const upperValues = upper
          .map(o => o.detected_value)
          .filter((v): v is number => v !== null)
        
        const upperMin = Math.min(...upperValues)
        const upperMax = Math.max(...upperValues)
        
        // Determine recommendation based on most common action
        const upperActionCounts = upper.reduce((acc, o) => {
          acc[o.suggested_action] = (acc[o.suggested_action] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        // Priority: Remove > Cap > Ignore
        let upperRecommendation = "Ignore"
        if (upperActionCounts["Remove"] && upperActionCounts["Remove"] > 0) {
          upperRecommendation = "Remove"
        } else if (upperActionCounts["Cap"] && upperActionCounts["Cap"] > 0) {
          upperRecommendation = "Cap"
        }
        
        upperInfo = {
          count: upper.length,
          min: upperMin,
          max: upperMax,
          recommendation: upperRecommendation,
        }
      }
      
      // Get AI recommendation if available
      const aiRec = aiRecommendations[columnName]
      
      // Apply AI recommendations if available
      if (aiRec) {
        if (lowerInfo && aiRec.lower_action) {
          lowerInfo.recommendation = aiRec.lower_action
        }
        if (upperInfo && aiRec.upper_action) {
          upperInfo.recommendation = aiRec.upper_action
        }
      }
      
      // Store AI recommendation for explanation text
      const aiRecommendation = aiRec ? {
        lower_action: lowerInfo && aiRec.lower_action ? aiRec.lower_action : undefined,
        lower_reason: lowerInfo && aiRec.lower_reason ? aiRec.lower_reason : undefined,
        upper_action: upperInfo && aiRec.upper_action ? aiRec.upper_action : undefined,
        upper_reason: upperInfo && aiRec.upper_reason ? aiRec.upper_reason : undefined,
        is_ai_recommendation: aiRec.is_ai_recommendation,
      } : undefined

      summaries.push({
        column_name: columnName,
        type: column?.canonical_type || "numeric",
        lower_outliers: lowerInfo,
        upper_outliers: upperInfo,
        ai_recommendation: aiRecommendation,
      })
    }
    
    return summaries
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
        3.0, // Standard threshold
        true // Force recompute when user explicitly clicks
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
                  {isLoadingRecommendations && (
                    <Badge variant="outline" className="gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Getting AI recommendations...
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
                        <TableHead>Lower Outliers</TableHead>
                        <TableHead>Upper Outliers</TableHead>
                        <TableHead>Recommendations</TableHead>
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
                            {summary.lower_outliers ? (
                              <div className="flex flex-col gap-1">
                                <div className="font-mono text-sm">
                                  <span className="text-destructive">
                                    {summary.lower_outliers.min.toLocaleString()}
                                  </span>
                                  <span className="text-muted-foreground mx-1">→</span>
                                  <span className="text-destructive">
                                    {summary.lower_outliers.max.toLocaleString()}
                                  </span>
                                  <span className="text-muted-foreground ml-2">
                                    ({summary.lower_outliers.count} values)
                                  </span>
                                </div>
                                <Badge 
                                  variant={
                                    summary.lower_outliers.recommendation === "Remove" ? "destructive" :
                                    summary.lower_outliers.recommendation === "Cap" ? "default" :
                                    summary.lower_outliers.recommendation === "Ignore" ? "outline" :
                                    "secondary"
                                  }
                                  className="text-xs w-fit"
                                >
                                  {summary.lower_outliers.recommendation === "Ignore" ? "Keep" : summary.lower_outliers.recommendation}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {summary.upper_outliers ? (
                              <div className="flex flex-col gap-1">
                                <div className="font-mono text-sm">
                                  <span className="text-destructive">
                                    {summary.upper_outliers.min.toLocaleString()}
                                  </span>
                                  <span className="text-muted-foreground mx-1">→</span>
                                  <span className="text-destructive">
                                    {summary.upper_outliers.max.toLocaleString()}
                                  </span>
                                  <span className="text-muted-foreground ml-2">
                                    ({summary.upper_outliers.count} values)
                                  </span>
                                </div>
                                <Badge 
                                  variant={
                                    summary.upper_outliers.recommendation === "Remove" ? "destructive" :
                                    summary.upper_outliers.recommendation === "Cap" ? "default" :
                                    summary.upper_outliers.recommendation === "Ignore" ? "outline" :
                                    "secondary"
                                  }
                                  className="text-xs w-fit"
                                >
                                  {summary.upper_outliers.recommendation === "Ignore" ? "Keep" : summary.upper_outliers.recommendation}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {summary.ai_recommendation && (
                                <Badge variant="outline" className="text-xs w-fit">
                                  {summary.ai_recommendation.is_ai_recommendation ? "AI" : "Rule-based"}
                                </Badge>
                              )}
                              {isLoadingRecommendations && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Loading...
                                </span>
                              )}
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
                    {columnSummaries.map((summary) => {
                      // Build explanation text in the required format
                      const parts: string[] = []
                      
                      if (summary.lower_outliers) {
                        const lowerAction = summary.lower_outliers.recommendation === "Ignore" ? "kept" :
                                          summary.lower_outliers.recommendation === "Remove" ? "removed" :
                                          summary.lower_outliers.recommendation === "Cap" ? "capped" :
                                          summary.lower_outliers.recommendation === "Transform" ? "transformed" :
                                          "reviewed"
                        // Format: "lower-bound outliers from <min> to <max> should be <action>"
                        let lowerText = `lower-bound outliers from ${summary.lower_outliers.min.toLocaleString()} to ${summary.lower_outliers.max.toLocaleString()} should be ${lowerAction}`
                        // Append AI reason if available
                        if (summary.ai_recommendation?.lower_reason) {
                          lowerText += `. ${summary.ai_recommendation.lower_reason}`
                        }
                        parts.push(lowerText)
                      }
                      
                      if (summary.upper_outliers) {
                        const upperAction = summary.upper_outliers.recommendation === "Ignore" ? "kept" :
                                          summary.upper_outliers.recommendation === "Remove" ? "removed" :
                                          summary.upper_outliers.recommendation === "Cap" ? "capped" :
                                          summary.upper_outliers.recommendation === "Transform" ? "transformed" :
                                          "reviewed"
                        // Format: "upper-bound outliers from <min> to <max> should be <action>"
                        let upperText = `upper-bound outliers from ${summary.upper_outliers.min.toLocaleString()} to ${summary.upper_outliers.max.toLocaleString()} should be ${upperAction}`
                        // Append AI reason if available
                        if (summary.ai_recommendation?.upper_reason) {
                          upperText += `. ${summary.ai_recommendation.upper_reason}`
                        }
                        parts.push(upperText)
                      }
                      
                      const explanation = parts.length > 0 
                        ? `In ${summary.column_name}:\n- ${parts.join("\n- ")}`
                        : `In ${summary.column_name}: No outliers detected.`
                      
                      return (
                        <div key={`explanation-${summary.column_name}`} className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-start justify-between mb-1">
                            <p className="text-sm font-medium text-foreground">{summary.column_name}</p>
                            {summary.ai_recommendation && (
                              <Badge variant="outline" className="text-xs">
                                {summary.ai_recommendation.is_ai_recommendation ? "AI" : "Rule-based"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-line">{explanation}</p>
                        </div>
                      )
                    })}
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
