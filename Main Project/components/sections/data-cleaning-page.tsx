"use client"

/**
 * Data Cleaning Page
 *
 * IMPORTANT: Workspace is the single source of truth.
 * - All datasets belong to a workspace and are stored in WorkspaceContext
 * - Data Cleaning reads datasets ONLY from workspace (not from backend directly)
 * - No mock data or fake defaults - empty state shown when workspace has no datasets
 * - Client-only rendering to prevent hydration mismatches
 *
 * REF TYPE EXPLANATION:
 * - Using HTMLElement (not HTMLDivElement) for refs because:
 *   - Refs are attached to <section> elements which are HTMLElement, not HTMLDivElement
 *   - HTMLElement is the correct base type for all HTML elements
 *   - Prevents TypeScript 'align' property mismatch errors
 *
 * HYDRATION SAFETY:
 * - All dataset-dependent UI renders only after mount
 * - Server and client render same initial HTML (empty state)
 * - Conditional rendering based on workspace state only
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { AlertCircle, Database, Loader2, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspace } from "@/contexts/workspace-context"
import { getCleaningSummary, type CleaningSummaryResponse, getDatasetSchema, type SchemaResponse } from "@/lib/api/dataCleaningClient"
import { ColumnQualitySummary } from "./data-cleaning/column-quality-summary"
import { InvalidFormatsCard } from "./data-cleaning/invalid-formats-card"
import { MissingValuesCard } from "./data-cleaning/missing-values-card"

interface DataCleaningPageProps {
  onApplyCleaningAction?: (action: { columnName: string; actionType: string; value?: string }) => void
}

export function DataCleaningPage({ onApplyCleaningAction }: DataCleaningPageProps) {
  /**
   * Workspace is the single source of truth for datasets.
   * Data Cleaning only consumes workspace state - it does not manage datasets.
   * All datasets come from currentWorkspace.datasets array.
   */
  const { activeWorkspaceId, currentWorkspace } = useWorkspace()
  
  // Get datasets directly from workspace - no backend fetch, no fake data
  // Use stable dependencies to prevent infinite re-renders
  const datasets = useMemo(() => {
    if (!currentWorkspace?.datasets) return []
    return currentWorkspace.datasets
  }, [currentWorkspace?.id, currentWorkspace?.datasets?.length])
  
  // State management - SINGLE source of truth for dataset selection
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  
  /**
   * Cleaning summary state
   * Workspace provides datasets, backend provides analysis.
   * Data Cleaning combines both to show quality metrics.
   */
  const [cleaningSummary, setCleaningSummary] = useState<CleaningSummaryResponse | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [hasAttemptedSync, setHasAttemptedSync] = useState(false)
  
  /**
   * Schema state - single source of truth for column metadata
   * Fetched from backend API, no frontend inference
   */
  const [schema, setSchema] = useState<SchemaResponse | null>(null)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  
  
  const didInitRef = useRef<string | null>(null) // Track which workspace was initialized
  const prevWorkspaceIdRef = useRef<string | null>(null)
  const prevDatasetIdRef = useRef<string | null>(null) // Track previous dataset

  // Reset selected dataset when workspace changes (ONLY when workspace actually changes)
  useEffect(() => {
    if (activeWorkspaceId !== prevWorkspaceIdRef.current) {
      prevWorkspaceIdRef.current = activeWorkspaceId
      didInitRef.current = null // Reset init flag for new workspace
      setSelectedDatasetId(null)
      setCleaningSummary(null)
      setSummaryError(null)
      setHasAttemptedSync(false)
      setSchema(null)
      setSchemaError(null)
    }
  }, [activeWorkspaceId])

  // Safe initialization: Auto-select first dataset ONLY ONCE per workspace
  useEffect(() => {
    if (!activeWorkspaceId || datasets.length === 0) return
    
    // Only initialize if we haven't initialized for this workspace yet
    if (didInitRef.current !== activeWorkspaceId && !selectedDatasetId) {
      const firstDataset = datasets[0]?.fileName
      if (firstDataset) {
        didInitRef.current = activeWorkspaceId
        setSelectedDatasetId(firstDataset)
      }
    }
  }, [activeWorkspaceId, datasets.length, selectedDatasetId])

  // Find workspace dataset - memoized with stable dependencies
  const workspaceDataset = useMemo(() => {
    if (!selectedDatasetId || !currentWorkspace?.datasets || datasets.length === 0) return null
    return datasets.find((ds) => ds.fileName === selectedDatasetId) || null
  }, [selectedDatasetId, currentWorkspace?.id, datasets.length])

  // Sync dataset to backend and fetch summary
  const syncAndFetchSummary = useCallback(async (datasetId: string, workspaceId: string, dataset: typeof workspaceDataset) => {
    if (!datasetId || !workspaceId || !dataset) return

    try {
      const csvContent = [
        dataset.headers.join(","),
        ...dataset.data.map((row) =>
          dataset.headers.map((header) => {
            const value = row[header]
            if (value === null || value === undefined) return ""
            const str = String(value)
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          }).join(",")
        ),
      ].join("\n")

      const csvBlob = new Blob([csvContent], { type: "text/csv" })
      const csvFile = new File([csvBlob], dataset.fileName, { type: "text/csv" })

      const { uploadDatasetToWorkspace } = await import("@/lib/api/dataCleaningClient")
      await uploadDatasetToWorkspace(workspaceId, csvFile)
      
      const summary = await getCleaningSummary(workspaceId, datasetId)
      if (summary.rows > 0 || summary.columns.length > 0) {
        setCleaningSummary((prev) => prev?.rows === summary.rows && prev?.columns.length === summary.columns.length ? prev : summary)
        setSummaryError(null)
      }
      setIsLoadingSummary(false)
    } catch (error) {
      console.error("[syncAndFetchSummary] Error:", error)
      try {
        const summary = await getCleaningSummary(workspaceId, datasetId)
        setCleaningSummary(summary)
        setSummaryError(null)
        setIsLoadingSummary(false)
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : "Failed to load cleaning summary"
        setSummaryError(errorMessage)
        setIsLoadingSummary(false)
      }
    }
  }, [])

  // Fetch cleaning summary when dataset is selected
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDatasetId) {
      setIsLoadingSummary(false)
      return
    }

    // Reset sync attempt flag when dataset changes
    if (prevDatasetIdRef.current !== selectedDatasetId) {
      prevDatasetIdRef.current = selectedDatasetId
      setHasAttemptedSync(false)
    }

    let cancelled = false
    setIsLoadingSummary(true)
    setSummaryError(null)

    getCleaningSummary(activeWorkspaceId, selectedDatasetId)
      .then((summary) => {
        if (cancelled) return
        
        if (summary.columns.length === 0 && summary.rows === 0 && !hasAttemptedSync && workspaceDataset) {
          setHasAttemptedSync(true)
          syncAndFetchSummary(selectedDatasetId, activeWorkspaceId, workspaceDataset)
        } else {
          setCleaningSummary(summary)
          setSummaryError(null)
        }
      })
      .catch((error) => {
        if (cancelled) return
        if (!hasAttemptedSync && workspaceDataset) {
          setHasAttemptedSync(true)
          syncAndFetchSummary(selectedDatasetId, activeWorkspaceId, workspaceDataset)
        } else {
          const errorMessage = error instanceof Error ? error.message : "Failed to load cleaning summary"
          setSummaryError(errorMessage)
        }
      })
      .finally(() => {
        // Only clear loading if we're not attempting sync
        if (!cancelled && !hasAttemptedSync) {
          setIsLoadingSummary(false)
        }
      })

    return () => {
      cancelled = true
      setIsLoadingSummary(false)
    }
  }, [activeWorkspaceId, selectedDatasetId, workspaceDataset, syncAndFetchSummary])
  
  // Fetch schema when dataset is selected (single source of truth for column types)
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDatasetId) {
      setSchema(null)
      setSchemaError(null)
      setIsLoadingSchema(false)
      return
    }

    let cancelled = false
    setIsLoadingSchema(true)
    setSchemaError(null)

    getDatasetSchema(activeWorkspaceId, selectedDatasetId, true)
      .then((schemaData) => {
        if (cancelled) return
        setSchema(schemaData)
        setSchemaError(null)
      })
      .catch((error) => {
        if (cancelled) return
        const errorMessage = error instanceof Error ? error.message : "Failed to load schema"
        setSchemaError(errorMessage)
        console.error("Error fetching schema:", error)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSchema(false)
        }
      })

    return () => {
      cancelled = true
      setIsLoadingSchema(false)
    }
  }, [activeWorkspaceId, selectedDatasetId])

  const handleColumnClick = (columnName: string, issueType: string) => {
    // Read-only mode: no navigation, just log for debugging
    console.log(`Column clicked: ${columnName}, issue type: ${issueType}`)
  }

  // Stable dataset change handler - direct setState, no conditions
  const handleDatasetChange = useCallback((value: string) => {
    setSelectedDatasetId(value)
  }, [])



  // Empty state when no workspace selected
  if (!activeWorkspaceId || !currentWorkspace) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Empty state when no workspace selected
  // Workspace is the single source of truth - no workspace means no datasets
  if (!currentWorkspace) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Workspace Selected</CardTitle>
            <CardDescription>
              Please create or select a workspace to begin data cleaning
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  // Empty state when workspace has no datasets
  // No fake data - empty state is shown when workspace.datasets is empty
  if (datasets.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Datasets in This Workspace</CardTitle>
            <CardDescription>
              This workspace has no datasets. Upload a dataset to begin data cleaning.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  // Dataset selection screen (only shown if datasets exist but none selected)
  if (selectedDatasetId === null) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Select a Dataset</CardTitle>
            <CardDescription>Choose which dataset you want to clean and process</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={selectedDatasetId ?? undefined}
              onValueChange={handleDatasetChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a dataset..." />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset: typeof datasets[0]) => (
                  <SelectItem key={dataset.id} value={dataset.fileName}>
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{dataset.name || dataset.fileName}</span>
                      <span className="text-xs text-muted-foreground">({dataset.rowCount} rows, {dataset.columnCount} cols)</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground text-center">
              You can change the dataset later from the header
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex-1 flex h-screen bg-background overflow-hidden">
      {/* Main Content - Single scrollable page, no navigation */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Data Cleaning</span>
              <Badge variant="outline" className="text-xs">Read-only Analysis</Badge>
            </div>
            {datasets.length > 0 ? (
              <Select
                value={selectedDatasetId ?? undefined}
                onValueChange={handleDatasetChange}
              >
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((dataset: typeof datasets[0]) => (
                    <SelectItem key={dataset.id} value={dataset.fileName}>
                      {dataset.name || dataset.fileName} ({dataset.rowCount} rows)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select disabled value="">
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="No datasets available" />
                </SelectTrigger>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Data Quality Score</span>
            <div className="flex items-center gap-2">
              <Progress 
                value={cleaningSummary?.overall_score ?? 0} 
                className="w-32 h-2" 
              />
              <span className="text-sm font-semibold text-muted-foreground">
                {cleaningSummary ? `${cleaningSummary.overall_score}%` : "—"}
              </span>
            </div>
          </div>
        </header>

        {/* Single scrollable page - no navigation */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* Loading state: Show skeleton while fetching summary */}
            {isLoadingSummary && selectedDatasetId && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading cleaning summary...</p>
              </div>
            )}

            {/* Error state: Show error message if summary fetch failed */}
            {summaryError && selectedDatasetId && !isLoadingSummary && (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-4 text-destructive" />
                  <CardTitle className="mb-2">Failed to Load Summary</CardTitle>
                  <CardDescription>{summaryError}</CardDescription>
                </CardContent>
              </Card>
            )}

            {/* Summary content: Render when summary is available and has columns */}
            {/* Workspace provides datasets, backend provides analysis. Data Cleaning combines both. */}
            {cleaningSummary && 
             cleaningSummary.columns.length > 0 && 
             selectedDatasetId && 
             !isLoadingSummary && (
              <>
                {/* Column Quality Summary - READ-ONLY */}
                <section className="space-y-4">
                  <ColumnQualitySummary
                    datasetId={selectedDatasetId}
                    columns={schema?.columns.map((col) => {
                      // Find corresponding cleaning summary column for health metrics
                      const summaryCol = cleaningSummary?.columns.find((sc) => sc.name === col.name)
                      return {
                        name: col.name,
                        dataType: col.canonical_type, // Use canonical_type from schema
                        missingPercentage: col.missing_percentage,
                        duplicateContribution: summaryCol?.duplicates_pct || 0,
                        typeConsistency: summaryCol?.health_score ? (summaryCol.health_score >= 80 ? "consistent" : summaryCol.health_score >= 60 ? "warning" : "inconsistent") : "consistent",
                        outlierCount: summaryCol?.outliers ?? 0,
                        healthScore: summaryCol?.health_score ?? 100,
                      }
                    }) || []}
                  />
                </section>

                {/* Missing Values Section - READ-ONLY */}
                <section className="space-y-4">
                  <MissingValuesCard
                    datasetId={selectedDatasetId || ""}
                    workspaceId={activeWorkspaceId || ""}
                    schema={schema}
                    isLoadingSchema={isLoadingSchema}
                    schemaError={schemaError}
                  />
                </section>

                {/* Invalid Formats Section - READ-ONLY */}
                <section className="space-y-4">
                  <InvalidFormatsCard
                    datasetId={selectedDatasetId}
                    issues={
                      cleaningSummary?.columns
                        .filter((col) => col.health_score < 80)
                        .map((col) => ({
                          columnName: col.name,
                          expectedType: col.type === "numeric" ? "numeric" : col.type === "datetime" ? "datetime" : "categorical",
                          invalidCount: Math.round((cleaningSummary.rows * (100 - col.health_score)) / 100),
                          sampleInvalidValues: [],
                        })) || []
                    }
                  />
                </section>
              </>
            )}

            {/* Empty state: Show when no dataset selected OR no summary available */}
            {!selectedDatasetId && (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No dataset selected. Please select a dataset to view cleaning summary.</p>
              </div>
            )}

            {/* Show empty state only if summary is truly empty (no columns) or doesn't exist */}
            {selectedDatasetId && 
             !isLoadingSummary && 
             !summaryError && 
             (!cleaningSummary || cleaningSummary.columns.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No cleaning summary available for this dataset.</p>
                <p className="text-xs mt-2">Make sure the dataset file exists in workspace storage.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
