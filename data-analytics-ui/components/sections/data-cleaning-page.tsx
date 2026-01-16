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
import { AlertCircle, CheckCircle2, Copy, Database, Filter, History, Loader2, AlertTriangle, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspace } from "@/contexts/workspace-context"
import { previewCleaning, applyCleaning, getCleaningSummary, type CleaningSummaryResponse } from "@/lib/api/dataCleaningClient"
import { cn } from "@/lib/utils"
import type { CleaningRequest } from "@/types/dataCleaning"
import { CleaningHistoryPanel } from "./data-cleaning/cleaning-history-panel"
import { ColumnFilterPanel, type ColumnInfo } from "./data-cleaning/column-filter-panel"
import { ColumnQualitySummary } from "./data-cleaning/column-quality-summary"
import { DuplicatesCard } from "./data-cleaning/duplicates-card"
import { InvalidFormatsCard } from "./data-cleaning/invalid-formats-card"
import { MissingValuesCard } from "./data-cleaning/missing-values-card"
import { OutliersCard } from "./data-cleaning/outliers-card"

const navItems = [
  { id: "quality", label: "Column Quality", icon: CheckCircle2 },
  { id: "missing", label: "Missing Values", icon: AlertCircle },
  { id: "duplicates", label: "Duplicates", icon: Copy },
  { id: "invalid", label: "Invalid Formats", icon: AlertTriangle },
  { id: "outliers", label: "Outliers", icon: Filter },
  { id: "history", label: "Cleaning History", icon: History },
]

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
  const [activeSection, setActiveSection] = useState("quality")
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  
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
   * REF TYPE: HTMLElement (not HTMLDivElement)
   * - Refs are attached to <section> elements which are HTMLElement
   * - HTMLElement is the correct base type for all HTML elements
   * - Prevents TypeScript 'align' property mismatch errors
   */
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const didInitRef = useRef(false)
  const prevWorkspaceIdRef = useRef<string | null>(null)

  // Reset selected dataset when workspace changes (ONLY when workspace actually changes)
  // useEffect(() => {
  //   if (activeWorkspaceId !== prevWorkspaceIdRef.current) {
  //     prevWorkspaceIdRef.current = activeWorkspaceId
  //     didInitRef.current = false
  //     setSelectedDatasetId(null)
  //     setCleaningSummary(null)
  //     setSummaryError(null)
  //     setHasAttemptedSync(false)
  //   }
  // }, [activeWorkspaceId])

  // Safe initialization: Auto-select first dataset ONLY ONCE per workspace
  // useEffect(() => {
  //   if (!didInitRef.current && datasets.length > 0 && !selectedDatasetId && activeWorkspaceId) {
  //     const firstDataset = datasets[0]?.fileName
  //     if (firstDataset) {
  //       didInitRef.current = true
  //       setSelectedDatasetId(firstDataset)
  //     }
  //   }
  // }, [datasets.length, selectedDatasetId, activeWorkspaceId])

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
      return
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
          setIsLoadingSummary(false)
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
          setIsLoadingSummary(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, selectedDatasetId, hasAttemptedSync, workspaceDataset, syncAndFetchSummary])

  // Scroll sync
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      // Type assertion: container is HTMLElement but we know it's a div with scrollTop
      const scrollTop = (container as HTMLDivElement).scrollTop
      let currentSection = "quality"

      for (const item of navItems) {
        const section = sectionRefs.current[item.id]
        if (section && section.offsetTop - 100 <= scrollTop) {
          currentSection = item.id
        }
      }
      // Only update if section actually changed to prevent unnecessary re-renders
      setActiveSection((prev) => prev !== currentSection ? currentSection : prev)
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = useCallback((sectionId: string) => {
    const section = sectionRefs.current[sectionId]
    const container = scrollContainerRef.current
    if (section && container) {
      const containerDiv = container as HTMLDivElement
      const containerRect = containerDiv.getBoundingClientRect()
      const sectionRect = section.getBoundingClientRect()
      const scrollTop = containerDiv.scrollTop + (sectionRect.top - containerRect.top) - 24

      containerDiv.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      })
    }
    setActiveSection((prev) => prev !== sectionId ? sectionId : prev)
  }, [])

  const handleColumnClick = (columnName: string, issueType: string) => {
    // Auto-select column if not already selected
    if (!selectedColumns.includes(columnName)) {
      setSelectedColumns([...selectedColumns, columnName])
    }

    // Scroll to the relevant section based on issue type
    const sectionMap: Record<string, string> = {
      missing: "missing",
      outliers: "outliers",
      invalid: "invalid",
      duplicates: "duplicates",
      overview: "quality",
    }
    const targetSection = sectionMap[issueType] || "quality"
    scrollToSection(targetSection)
  }

  const handleColumnSelect = useCallback((columnName: string) => {
    setSelectedColumns((prev) => {
      if (!prev.includes(columnName)) {
        return [...prev, columnName]
      }
      return prev
    })
  }, [])

  // Stable dataset change handler - NO dependencies to prevent re-creation
  const handleDatasetChange = useCallback((value: string) => {
    if (value && value !== selectedDatasetId) {
      setSelectedDatasetId(value)
      setHasAttemptedSync(false)
    }
  }, [selectedDatasetId])

  const handlePreview = async (request: Omit<CleaningRequest, "workspace_id">) => {
    if (!activeWorkspaceId) {
      throw new Error("No workspace selected. Please create or select a workspace first.")
    }
    try {
      const fullRequest: CleaningRequest = {
        ...request,
        workspace_id: activeWorkspaceId, // REQUIRED: Workspace is the single source of truth
      }
      const response = await previewCleaning(fullRequest)
      console.log("Preview response:", response)
      return response
    } catch (error) {
      console.error("Preview error:", error)
      throw error
    }
  }

  const handleApply = async (request: Omit<CleaningRequest, "workspace_id">) => {
    if (!activeWorkspaceId) {
      throw new Error("No workspace selected. Please create or select a workspace first.")
    }
    try {
      const fullRequest: CleaningRequest = {
        ...request,
        workspace_id: activeWorkspaceId, // REQUIRED: Workspace is the single source of truth
      }
      const response = await applyCleaning(fullRequest)
      console.log("Apply response:", response)
      onApplyCleaningAction?.({
        columnName: request.column || "All",
        actionType: request.action,
        value: request.parameters ? JSON.stringify(request.parameters) : undefined,
      })
      return response
    } catch (error) {
      console.error("Apply error:", error)
      throw error
    }
  }

  // Determine if column filter should be shown
  const showColumnFilter = activeSection !== "quality" && activeSection !== "history" && activeSection !== "duplicates"

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
      {/* Left Navigation */}
      <aside className="w-56 border-r border-border bg-card shrink-0 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Data Cleaning</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                activeSection === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {  <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
          {/* <div className="flex items-center gap-4">
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
          </div> */}
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
        </header> }

        {/* REF TYPE: HTMLElement - ref is attached to a div which is HTMLElement */}
        <div ref={scrollContainerRef as React.RefObject<HTMLDivElement>} className="flex-1 overflow-y-auto">
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
                {/* Column Quality Summary - KEY SECTION */}
                {/* Transform backend summary to ColumnQuality format expected by component */}
                <section
                  id="quality"
                  ref={(el: HTMLElement | null) => {
                    sectionRefs.current["quality"] = el
                  }}
                  className="space-y-4"
                >
                  <ColumnQualitySummary
                    datasetId={selectedDatasetId}
                    columns={cleaningSummary.columns.map((col) => ({
                      name: col.name,
                      dataType: col.type,
                      missingPercentage: col.missing_pct,
                      duplicateContribution: col.duplicates_pct,
                      typeConsistency: col.health_score >= 80 ? "consistent" : col.health_score >= 60 ? "warning" : "inconsistent",
                      outlierCount: col.outliers ?? 0,
                      healthScore: col.health_score,
                    }))}
                    selectedColumns={selectedColumns}
                    onColumnClick={handleColumnClick}
                    onColumnSelect={handleColumnSelect}
                    onColumnsLoaded={setColumns}
                  />
                </section>

                {showColumnFilter && columns.length > 0 && (
                  <div className="space-y-4">
                    <ColumnFilterPanel
                      columns={columns}
                      selectedColumns={selectedColumns}
                      onSelectionChange={setSelectedColumns}
                    />
                  </div>
                )}

                {/* Missing Values Section */}
                <section
                  id="missing"
                  ref={(el: HTMLElement | null) => {
                    sectionRefs.current["missing"] = el
                  }}
                  className="space-y-4"
                >
                  <MissingValuesCard
                    datasetId={selectedDatasetId}
                    selectedColumns={selectedColumns}
                    onPreview={handlePreview}
                    onApply={handleApply}
                  />
                </section>

                {/* Duplicates Section */}
                <section
                  id="duplicates"
                  ref={(el: HTMLElement | null) => {
                    sectionRefs.current["duplicates"] = el
                  }}
                  className="space-y-4"
                >
                  <DuplicatesCard datasetId={selectedDatasetId} onPreview={handlePreview} onApply={handleApply} />
                </section>

                {/* Invalid Formats Section */}
                <section
                  id="invalid"
                  ref={(el: HTMLElement | null) => {
                    sectionRefs.current["invalid"] = el
                  }}
                  className="space-y-4"
                >
                  <InvalidFormatsCard
                    datasetId={selectedDatasetId}
                    selectedColumns={selectedColumns}
                    onPreview={handlePreview}
                    onApply={handleApply}
                  />
                </section>

                {/* Outliers Section */}
                <section
                  id="outliers"
                  ref={(el: HTMLElement | null) => {
                    sectionRefs.current["outliers"] = el
                  }}
                  className="space-y-4"
                >
                  <OutliersCard
                    datasetId={selectedDatasetId}
                    selectedColumns={selectedColumns}
                    onPreview={handlePreview}
                    onApply={handleApply}
                  />
                </section>

                {/* Cleaning History Section */}
                <section
                  id="history"
                  ref={(el: HTMLElement | null) => {
                    sectionRefs.current["history"] = el
                  }}
                  className="space-y-4"
                >
                  <CleaningHistoryPanel />
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
