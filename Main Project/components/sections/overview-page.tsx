"use client"

/**
 * Overview Page
 * 
 * IMPORTANT: Backend is the single source of truth for all statistics.
 * Frontend only renders API response - no calculations or inferences.
 */

import { useState, useMemo, useEffect } from "react"
import {
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Rows3,
  Columns3,
  Hash,
  Type,
  Calendar,
  AlertCircle,
  Copy,
  Filter,
  Eye,
  EyeOff,
  Info,
  BarChart3,
  Database,
  Loader2,
  Sparkles,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkspace } from "@/contexts/workspace-context"
import { getDatasetOverviewFromFile, getDatasetOverview, refreshDatasetOverview, getWorkspaceDatasets, type OverviewResponse, getDatasetSchema, type SchemaResponse, generateDatasetIntelligenceSnapshot, generateColumnIntelligence, getColumnIntelligence, type ColumnIntelligence } from "@/lib/api/dataCleaningClient"
import { getOverview, setOverview } from "@/lib/overview-cache"
import type { WorkspaceDataset } from "@/types/workspace"

/**
 * Format summary stats for display cards
 * Uses backend-provided data only
 */
const getSummaryStats = (overview: OverviewResponse | null) => {
  if (!overview) {
    return []
  }

  const missingColumnsCount = overview.columns.filter((col) => col.missing_count > 0).length

  return [
    { label: "Total Rows", value: overview.total_rows.toLocaleString(), icon: Rows3, subtext: "records loaded" },
    { label: "Total Columns", value: overview.total_columns.toString(), icon: Columns3, subtext: "features" },
    {
      label: "Numeric Columns",
      value: overview.numeric_column_count.toString(),
      icon: Hash,
      subtext: overview.numeric_column_count > 0 ? `${overview.numeric_column_count} numeric columns` : "no numeric columns",
    },
    {
      label: "Categorical Columns",
      value: overview.categorical_column_count.toString(),
      icon: Type,
      subtext: overview.categorical_column_count > 0 ? `${overview.categorical_column_count} categorical columns` : "no categorical columns",
    },
    {
      label: "Datetime Columns",
      value: overview.datetime_column_count.toString(),
      icon: Calendar,
      subtext: overview.datetime_column_count > 0 ? `${overview.datetime_column_count} datetime columns` : "no datetime columns",
    },
    {
      label: "Missing Columns",
      value: missingColumnsCount.toString(),
      icon: AlertCircle,
      subtext: missingColumnsCount > 0 ? "columns with nulls" : "no missing values",
    },
    {
      label: "Duplicated Rows",
      value: overview.duplicate_row_count.toString(),
      icon: Copy,
      subtext: overview.duplicate_row_count > 0 ? "duplicate rows found" : "no duplicates found",
    },
  ]
}

export function OverviewPage() {
  const { currentWorkspace, activeWorkspaceId, getDatasets, setOverviewReady } = useWorkspace()
  const [previewExpanded, setPreviewExpanded] = useState(true)
  const [rowsShown, setRowsShown] = useState("20")
  const [customRowCount, setCustomRowCount] = useState("")
  const [useRange, setUseRange] = useState(false)
  const [fromRow, setFromRow] = useState("1")
  const [toRow, setToRow] = useState("20")
  const [structureExpanded, setStructureExpanded] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [intelligenceExpanded, setIntelligenceExpanded] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [valueCountLimit, setValueCountLimit] = useState("5")
  const [customValueCount, setCustomValueCount] = useState("")

  const [showPreview, setShowPreview] = useState(true)
  const [showSummary, setShowSummary] = useState(true)
  const [showMissing, setShowMissing] = useState(true)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Backend overview data state (read-only snapshot from workspace file)
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null)
  // true only during first-time auto-fetch when overview file does not exist
  const [isFetchingOverview, setIsFetchingOverview] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewFileExists, setOverviewFileExists] = useState(false)
  
  // Schema state - single source of truth for column types
  const [schema, setSchema] = useState<SchemaResponse | null>(null)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  // Column Intelligence state
  const [columnIntelligence, setColumnIntelligence] = useState<ColumnIntelligence | null>(null)
  const [isLoadingIntelligence, setIsLoadingIntelligence] = useState(false)
  const [isGeneratingIntelligence, setIsGeneratingIntelligence] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)

  // Get dataset from workspace (must be declared before useEffects that use it)
  const selectedDataset = useMemo(() => {
    const datasets = getDatasets()
    return datasets.length > 0 ? datasets[0] : null // Use first dataset for overview
  }, [getDatasets])

  // Fetch schema from backend when dataset is available
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      setSchema(null)
      setSchemaError(null)
      setIsLoadingSchema(false)
      return
    }

    let cancelled = false
    setIsLoadingSchema(true)
    setSchemaError(null)

    getDatasetSchema(activeWorkspaceId, selectedDataset.fileName, true)
      .then((schemaData) => {
        if (cancelled) return
        setSchema(schemaData ?? null)
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
  }, [activeWorkspaceId, selectedDataset?.fileName])

  // Handle manual refresh (user-initiated)
  // STRICT RULE: After refreshing, use the API response directly (it's already saved)
  const handleRefreshOverview = async () => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      console.warn("[handleRefreshOverview] Missing workspace or dataset")
      return
    }

    console.log(`[handleRefreshOverview] Starting refresh for ${selectedDataset.fileName}`)
    setIsRefreshing(true)
    setOverviewError(null)

    try {
      // Refresh overview (forces recomputation)
      console.log("[handleRefreshOverview] Calling refreshDatasetOverview...")
      const refreshedOverview = await refreshDatasetOverview(activeWorkspaceId, selectedDataset.fileName)
      
      console.log(`[handleRefreshOverview] Refresh succeeded - rows=${refreshedOverview.total_rows}, columns=${refreshedOverview.total_columns}`)
      
      // Use the refreshed overview directly (it was already saved by backend)
      setOverview(activeWorkspaceId, selectedDataset.fileName, refreshedOverview)
      setOverviewData(refreshedOverview)
      setOverviewError(null)
      setOverviewFileExists(true)
      
      if (!selectedColumn && refreshedOverview.columns.length > 0) {
        setSelectedColumn(refreshedOverview.columns[0].name)
      }
      
      // Verify file was saved (non-blocking)
      getDatasetOverviewFromFile(activeWorkspaceId, selectedDataset.fileName)
        .then((fileData) => {
          if (fileData) {
            console.log("[handleRefreshOverview] Verified overview file was saved")
            // Update cache with file data (in case it's more recent)
            setOverview(activeWorkspaceId, selectedDataset.fileName, fileData)
            setOverviewData(fileData)
          } else {
            console.warn("[handleRefreshOverview] WARNING: Overview refreshed but file not found - using computed data")
          }
        })
        .catch((e) => {
          console.warn("[handleRefreshOverview] Could not verify overview file (non-critical):", e)
        })
      
      // Generate dataset intelligence snapshot for AI (non-blocking)
      generateDatasetIntelligenceSnapshot(activeWorkspaceId, selectedDataset.fileName).catch((e) => {
        console.error("Failed to generate dataset intelligence snapshot:", e)
        // Non-blocking: continue even if snapshot generation fails
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to refresh overview"
      console.error(`[handleRefreshOverview] Error: ${errorMessage}`, error)
      setOverviewError(errorMessage)
      // Don't clear overviewData - keep showing old data if refresh fails
    } finally {
      setIsRefreshing(false)
    }
  }

  // Load overview: global cache first (instant), else file, else auto-fetch ONCE.
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      setOverviewData(null)
      setOverviewError(null)
      setOverviewFileExists(false)
      setIsFetchingOverview(false)
      return
    }

    const cached = getOverview(activeWorkspaceId, selectedDataset.fileName)
    if (cached) {
      setOverviewData(cached)
      setOverviewError(null)
      setOverviewFileExists(true)
      setIsFetchingOverview(false)
      return
    }

    setOverviewError(null)
    setIsFetchingOverview(false) // Reset loading state
    let cancelled = false
    let fetchStarted = false

    console.log(`[OverviewPage] Loading overview for dataset: ${selectedDataset.fileName}, workspace: ${activeWorkspaceId}`)

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (!cancelled && fetchStarted) {
        console.warn("[OverviewPage] Overview fetch timeout after 30 seconds")
        setIsFetchingOverview(false)
        setOverviewError("Request timed out. Please try again.")
      }
    }, 30000) // 30 second timeout

    getDatasetOverviewFromFile(activeWorkspaceId, selectedDataset.fileName)
      .then((data) => {
        if (cancelled) {
          console.log("[OverviewPage] Request cancelled (from file)")
          return
        }
        clearTimeout(timeoutId)
        console.log(`[OverviewPage] getDatasetOverviewFromFile result:`, data ? "found" : "not found")
        if (data) {
          setOverview(activeWorkspaceId, selectedDataset.fileName, data)
          setOverviewData(data)
          setOverviewError(null)
          setOverviewFileExists(true)
          setIsFetchingOverview(false)
          if (!selectedColumn && data.columns.length > 0) {
            setSelectedColumn(data.columns[0].name)
          }
          return
        }
        
        // No cached file, need to fetch
        console.log("[OverviewPage] No cached file, fetching overview...")
        setOverviewData(null)
        setOverviewError(null)
        setOverviewFileExists(false)
        setIsFetchingOverview(true)
        fetchStarted = true

        getWorkspaceDatasets(activeWorkspaceId)
          .then((datasets) => {
            if (cancelled) {
              clearTimeout(timeoutId)
              setIsFetchingOverview(false)
              return
            }
            console.log(`[OverviewPage] getWorkspaceDatasets result: ${datasets.length} datasets`)
            const exists = datasets.some((d) => d.id === selectedDataset.fileName)
            if (!exists) {
              clearTimeout(timeoutId)
              setIsFetchingOverview(false)
              setOverviewError("Dataset not found in workspace")
              console.warn(`[OverviewPage] Dataset ${selectedDataset.fileName} not found in workspace`)
              return
            }
            console.log("[OverviewPage] Calling getDatasetOverview...")
            return getDatasetOverview(activeWorkspaceId, selectedDataset.fileName, false)
          })
          .then((overviewOrNull) => {
            if (cancelled) {
              clearTimeout(timeoutId)
              setIsFetchingOverview(false)
              return
            }
            // DEBUG: Log the actual response
            console.log(`[OverviewPage] getDatasetOverview result:`, {
              hasData: !!overviewOrNull,
              isNull: overviewOrNull === null,
              isUndefined: overviewOrNull === undefined,
              type: typeof overviewOrNull,
              value: overviewOrNull ? `rows=${overviewOrNull.total_rows}, cols=${overviewOrNull.total_columns}` : 'no data'
            })
            
            // Handle undefined (promise chain broken)
            if (overviewOrNull === undefined) {
              clearTimeout(timeoutId)
              setIsFetchingOverview(false)
              setOverviewError("Failed to fetch overview - request returned undefined")
              console.error("[OverviewPage] ERROR: getDatasetOverview returned undefined")
              return
            }
            
            // Handle null response - this means 404 (file not found), but computation should have created it
            // If we get null after calling getDatasetOverview (which computes), something went wrong
            if (overviewOrNull === null) {
              console.warn("[OverviewPage] WARNING: getDatasetOverview returned null - computation may have failed or file not saved")
              console.warn("[OverviewPage] Attempting to read file directly as fallback...")
              
              // FALLBACK: Try to read file directly (maybe it was saved but API returned null)
              return getDatasetOverviewFromFile(activeWorkspaceId, selectedDataset.fileName)
                .then((fileData) => {
                  if (cancelled) {
                    clearTimeout(timeoutId)
                    setIsFetchingOverview(false)
                    return
                  }
                  
                  if (fileData) {
                    // File exists! Use it
                    console.log("[OverviewPage] FALLBACK SUCCESS: Found overview file on disk")
                    clearTimeout(timeoutId)
                    setIsFetchingOverview(false)
                    setOverview(activeWorkspaceId, selectedDataset.fileName, fileData)
                    setOverviewData(fileData)
                    setOverviewError(null)
                    setOverviewFileExists(true)
                    if (!selectedColumn && fileData.columns.length > 0) {
                      setSelectedColumn(fileData.columns[0].name)
                    }
                  } else {
                    // File doesn't exist - trigger recomputation with refresh flag
                    console.warn("[OverviewPage] File not found, triggering recomputation with refresh=true...")
                    return getDatasetOverview(activeWorkspaceId, selectedDataset.fileName, true)
                      .then((refreshedOverview) => {
                        if (cancelled) {
                          clearTimeout(timeoutId)
                          setIsFetchingOverview(false)
                          return
                        }
                        
                        if (refreshedOverview) {
                          console.log("[OverviewPage] RECOMPUTATION SUCCESS: Got overview after refresh")
                          clearTimeout(timeoutId)
                          setIsFetchingOverview(false)
                          setOverview(activeWorkspaceId, selectedDataset.fileName, refreshedOverview)
                          setOverviewData(refreshedOverview)
                          setOverviewError(null)
                          setOverviewFileExists(true)
                          if (!selectedColumn && refreshedOverview.columns.length > 0) {
                            setSelectedColumn(refreshedOverview.columns[0].name)
                          }
                        } else {
                          // Still null after refresh - real error
                          clearTimeout(timeoutId)
                          setIsFetchingOverview(false)
                          setOverviewError("Failed to compute overview - please try again")
                          console.error("[OverviewPage] ERROR: Still null after refresh recomputation")
                        }
                      })
                      .catch((refreshErr) => {
                        if (cancelled) return
                        clearTimeout(timeoutId)
                        setIsFetchingOverview(false)
                        setOverviewError(`Failed to compute overview: ${refreshErr instanceof Error ? refreshErr.message : 'Unknown error'}`)
                        console.error("[OverviewPage] ERROR: Refresh recomputation failed:", refreshErr)
                      })
                  }
                })
                .catch((fileErr) => {
                  if (cancelled) return
                  clearTimeout(timeoutId)
                  setIsFetchingOverview(false)
                  setOverviewError(`Failed to load overview: ${fileErr instanceof Error ? fileErr.message : 'Unknown error'}`)
                  console.error("[OverviewPage] ERROR: File read fallback failed:", fileErr)
                })
            }
            
            // SUCCESS: We have overview data
            console.log("[OverviewPage] SUCCESS: Using computed overview data directly")
            console.log(`[OverviewPage] Overview data: rows=${overviewOrNull.total_rows}, columns=${overviewOrNull.total_columns}, columnCount=${overviewOrNull.columns.length}`)
            
            // Use the computed overview directly - backend already saved it
            clearTimeout(timeoutId)
            setIsFetchingOverview(false)
            
            // Cache the computed overview
            setOverview(activeWorkspaceId, selectedDataset.fileName, overviewOrNull)
            setOverviewData(overviewOrNull)
            setOverviewError(null)
            setOverviewFileExists(true) // Assume file exists since backend saved it
            
            console.log(`[OverviewPage] State updated - overviewData set:`, !!overviewOrNull)
            
            if (!selectedColumn && overviewOrNull.columns.length > 0) {
              setSelectedColumn(overviewOrNull.columns[0].name)
            }
            
            // Verify file was saved (non-blocking, just for logging)
            getDatasetOverviewFromFile(activeWorkspaceId, selectedDataset.fileName)
              .then((fileData) => {
                if (cancelled) return
                if (fileData) {
                  console.log("[OverviewPage] Verified overview file was saved successfully")
                  // Update cache with file data (in case it's more recent)
                  setOverview(activeWorkspaceId, selectedDataset.fileName, fileData)
                  setOverviewData(fileData)
                } else {
                  console.warn("[OverviewPage] WARNING: Overview computed but file not found - using computed data")
                  // Keep using computed data, but log warning
                }
              })
              .catch((err) => {
                // Non-critical - we already have the computed data
                console.warn("[OverviewPage] Could not verify overview file (non-critical):", err)
              })
            
            // Generate dataset intelligence snapshot for AI (non-blocking)
            generateDatasetIntelligenceSnapshot(activeWorkspaceId, selectedDataset.fileName).catch((e) => {
              console.error("Failed to generate dataset intelligence snapshot:", e)
            })
          })
          .catch((err) => {
            if (cancelled) return
            clearTimeout(timeoutId)
            console.error("[OverviewPage] Error in fetch chain:", err)
            setOverviewError(err instanceof Error ? err.message : "Failed to fetch overview")
            setOverviewData(null)
            setOverviewFileExists(false)
            setIsFetchingOverview(false)
          })
      })
      .catch((error) => {
        if (cancelled) return
        clearTimeout(timeoutId)
        console.error("[OverviewPage] Error loading overview from file:", error)
        const msg = error instanceof Error ? error.message : "Failed to load dataset overview"
        setOverviewError(msg)
        setOverviewData(null)
        setOverviewFileExists(false)
        setIsFetchingOverview(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      setIsFetchingOverview(false)
    }
  }, [activeWorkspaceId, selectedDataset?.fileName])

  // Initialize selected column when schema or overview data loads
  useEffect(() => {
    if (!selectedColumn) {
      if (schema && schema.columns.length > 0) {
        setSelectedColumn(schema.columns[0].name)
      } else if (overviewData && overviewData.columns.length > 0) {
        setSelectedColumn(overviewData.columns[0].name)
      }
    }
  }, [schema, overviewData, selectedColumn])

  // Load column intelligence ONLY when user explicitly requests it (not automatically)
  // Removed automatic fetch to prevent 500 errors and ensure it only runs on user action
  // Column intelligence will be loaded when user clicks "Generate Intelligence" button

  // Handle generate/regenerate column intelligence
  // This is the ONLY place column intelligence should be fetched - on explicit user action
  // CLIENT-SIDE ONLY: This function must only be called from user interactions (button clicks)
  const handleGenerateIntelligence = async (regenerate: boolean = false) => {
    // Client-side readiness check - ensure we're in browser environment
    if (typeof window === "undefined") {
      console.warn('[handleGenerateIntelligence] Skipped: Called in server environment')
      return
    }

    if (!activeWorkspaceId || !selectedDataset?.fileName) return

    setIsGeneratingIntelligence(true)
    setIsLoadingIntelligence(true)
    setIntelligenceError(null)

    try {
      // First try to get existing intelligence if not regenerating
      if (!regenerate) {
        try {
          const existing = await getColumnIntelligence(activeWorkspaceId)
          if (existing) {
            setColumnIntelligence(existing)
            setIntelligenceError(null)
            setIsLoadingIntelligence(false)
            setIsGeneratingIntelligence(false)
            return
          }
        } catch (e) {
          // If fetch fails (including client-only guard), continue to generate new one
          // Silently handle server-side execution attempts
          if (e instanceof Error && e.message.includes('client-side only')) {
            console.log("Client-side guard triggered, will generate new intelligence on client")
          } else {
            console.log("No existing intelligence found, will generate new")
          }
        }
      }

      // Generate new intelligence (only runs in browser)
      const intelligence = await generateColumnIntelligence(
        activeWorkspaceId,
        selectedDataset.fileName,
        regenerate
      )
      setColumnIntelligence(intelligence)
      setIntelligenceError(null)
    } catch (error) {
      // Handle client-only errors silently (no-op behavior)
      if (error instanceof Error && error.message.includes('client-side only')) {
        console.warn('[handleGenerateIntelligence] Client-side guard triggered, skipping execution')
        setIntelligenceError(null) // Don't show error for server-side execution attempts
      } else {
        const errorMessage = error instanceof Error ? error.message : "Failed to generate column intelligence"
        setIntelligenceError(errorMessage)
        console.error("Error generating column intelligence:", error)
      }
    } finally {
      setIsGeneratingIntelligence(false)
      setIsLoadingIntelligence(false)
    }
  }

  // Mark overview as ready when data is loaded
  useEffect(() => {
    if (overviewData && currentWorkspace && !currentWorkspace.state.overviewReady) {
      setOverviewReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewData, currentWorkspace])

  // Calculate actual value count limit (supports custom)
  const actualValueCountLimit = useMemo(() => {
    if (valueCountLimit === "custom") {
      return Math.min(Math.max(Number(customValueCount) || 5, 1), 50)
    }
    return Number(valueCountLimit) || 5
  }, [valueCountLimit, customValueCount])

  // Get top values from backend data, limited by actualValueCountLimit
  const displayedTopValues = useMemo(() => {
    if (!overviewData || !selectedColumn) return []

    const insights = overviewData.column_insights?.[selectedColumn]
    if (!insights || !insights.top_values) return []

    // Convert to array, sort by count (descending), then slice
    const entries = Object.entries(insights.top_values)
      .map(([value, count]) => ({
        value,
        count: Number(count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, actualValueCountLimit)

    return entries
  }, [overviewData, selectedColumn, actualValueCountLimit])


  // Calculate preview row count (cap at 200) - used when not in range mode
  const previewRowCount = useMemo(() => {
    if (rowsShown === "custom") {
      const custom = Number.parseInt(customRowCount) || 0
      return Math.min(Math.max(1, custom), 200)
    }
    return Math.min(Number.parseInt(rowsShown) || 20, 200)
  }, [rowsShown, customRowCount])

  // Calculate row range for preview
  const rowRange = useMemo(() => {
    if (!selectedDataset) return { start: 0, end: 0, count: 0 }
    
    const totalRows = selectedDataset.rowCount || selectedDataset.data?.length || 0
    
    if (useRange) {
      const from = Math.max(1, Number.parseInt(fromRow) || 1)
      const to = Math.min(totalRows, Number.parseInt(toRow) || totalRows)
      const start = Math.min(from, to) - 1 // Convert to 0-based index
      const end = Math.max(from, to)
      const count = end - start
      return { start, end, count: Math.min(count, 200) } // Cap at 200 rows
    } else {
      return { start: 0, end: previewRowCount, count: previewRowCount }
    }
  }, [useRange, fromRow, toRow, previewRowCount, selectedDataset])

  // Get preview rows from dataset (read-only, capped at 200)
  const previewRows = useMemo(() => {
    if (!selectedDataset || !selectedDataset.data || selectedDataset.data.length === 0) {
      return []
    }
    return selectedDataset.data.slice(rowRange.start, rowRange.end)
  }, [selectedDataset, rowRange])

  // Handle loading state for large datasets (performance safety)
  useEffect(() => {
    if (selectedDataset && selectedDataset.rowCount > 1000) {
      setIsLoadingPreview(true)
      // Small delay to show loading state for large datasets
      const timer = setTimeout(() => {
        setIsLoadingPreview(false)
      }, 150)
      return () => clearTimeout(timer)
    } else {
      setIsLoadingPreview(false)
    }
  }, [selectedDataset, rowRange])

  // Get headers from backend overview data (or fallback to dataset)
  const datasetHeaders = useMemo(() => {
    if (overviewData) {
      return overviewData.columns.map((col) => col.name)
    }
    if (selectedDataset?.headers) {
      return selectedDataset.headers
    }
    return []
  }, [overviewData, selectedDataset])

  // Handle row count change
  const handleRowCountChange = (value: string) => {
    setRowsShown(value)
    if (value !== "custom") {
      setCustomRowCount("")
    }
  }

  // Handle custom row count input
  const handleCustomRowCountChange = (value: string) => {
    const num = Number.parseInt(value)
    if (!isNaN(num) && num > 0) {
      setCustomRowCount(value)
    } else if (value === "") {
      setCustomRowCount("")
    }
  }

  // Filter columns based on type filter (uses schema as source of truth)
  const filteredColumns = useMemo(() => {
    if (!schema) return []
    return schema.columns.filter((col) => {
      if (filterType === "all") return true
      return col.canonical_type === filterType
    })
  }, [schema, filterType])

  // Helper function for type badge color (uses canonical_type from schema)
  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "numeric":
        return "bg-blue-100 text-blue-700 border-blue-200"
      case "categorical":
        return "bg-green-100 text-green-700 border-green-200"
      case "datetime":
        return "bg-purple-100 text-purple-700 border-purple-200"
      case "boolean":
        return "bg-orange-100 text-orange-700 border-orange-200"
      default:
        return "bg-muted text-muted-foreground"
    }
  }
  
  // Get column type from schema (single source of truth)
  const getColumnType = (columnName: string): string => {
    if (!schema) return "unknown"
    const column = schema.columns.find((col) => col.name === columnName)
    return column?.canonical_type || "unknown"
  }

  // Get summary stats from backend data
  const summaryStats = useMemo(() => getSummaryStats(overviewData), [overviewData])

  // Early returns after all hooks
  if (!currentWorkspace) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>No Active Workspace</CardTitle>
            <CardDescription>Please create or select a workspace to view dataset overview</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (!selectedDataset) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>No Dataset Attached</CardTitle>
            <CardDescription>Please upload a dataset to your workspace to view overview</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  // Spinner only during first-time auto-fetch (when overview file does not exist)
  if (isFetchingOverview) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Computing overview...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Error state: auto-fetch or file read failed (no Fetch button)
  // Only show error if we're NOT fetching and have NO data
  if (overviewError && !overviewData && !isFetchingOverview) {
    console.log(`[OverviewPage] Showing error state: ${overviewError}`)
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Failed to Load Overview</CardTitle>
            <CardDescription>{overviewError}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Button 
              onClick={handleRefreshOverview}
              variant="outline"
              className="w-full"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  // No data yet: file read in progress (no spinner, no button)
  // DEBUG: Log state before render guard
  console.log(`[OverviewPage] Render guard check:`, {
    hasOverviewData: !!overviewData,
    isFetchingOverview,
    overviewError,
    overviewFileExists,
    selectedDataset: selectedDataset?.fileName
  })
  
  if (!overviewData) {
    // Show loading state if we're actively fetching
    if (isFetchingOverview) {
      return (
        <main className="flex-1 flex items-center justify-center h-screen bg-background">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
              <p className="text-muted-foreground">Computing overview...</p>
            </CardContent>
          </Card>
        </main>
      )
    }
    
    // Not fetching and no data - show loading message
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Loading overview...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Dataset Overview</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Workspace Info */}
          {currentWorkspace && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Workspace:</span>
              <span className="text-sm font-medium">{currentWorkspace.name}</span>
              {overviewData && (
                <span className="text-xs text-muted-foreground">
                  • {overviewData.total_rows.toLocaleString()} rows • {overviewData.total_columns} columns
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Sticky Filter Bar */}
      <div className="h-12 flex items-center gap-4 px-6 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter by type:</span>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="numeric">Numeric</SelectItem>
              <SelectItem value="categorical">Categorical</SelectItem>
              <SelectItem value="datetime">Datetime</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sm gap-1.5"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sm gap-1.5"
            onClick={() => setShowSummary(!showSummary)}
          >
            {showSummary ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Summary
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sm gap-1.5"
            onClick={() => setShowMissing(!showMissing)}
          >
            {showMissing ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Missing
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* 1. Dataset Preview Panel */}
        {showPreview && (
          <Collapsible open={previewExpanded} onOpenChange={setPreviewExpanded}>
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {previewExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CardTitle className="text-base">
                      Dataset Preview{" "}
                      {useRange
                        ? `(Rows ${rowRange.start + 1}-${rowRange.end} of ${overviewData?.total_rows.toLocaleString() || selectedDataset.rowCount.toLocaleString()})`
                        : `(First ${rowRange.count} of ${overviewData?.total_rows.toLocaleString() || selectedDataset.rowCount.toLocaleString()} Rows)`}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleRefreshOverview}
                      disabled={isRefreshing || !selectedDataset}
                    >
                      {isRefreshing ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        "Refresh Overview"
                      )}
                    </Button>
                    <Button
                      variant={useRange ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setUseRange(!useRange)}
                    >
                      {useRange ? "Range" : "First N"}
                    </Button>
                    {useRange ? (
                      <>
                        <span className="text-sm text-muted-foreground">From:</span>
                        <Input
                          type="number"
                          min="1"
                          max={selectedDataset.rowCount}
                          value={fromRow}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === "" || (!isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= selectedDataset.rowCount)) {
                              setFromRow(val)
                            }
                          }}
                          placeholder="1"
                          className="w-20 h-8 text-sm"
                        />
                        <span className="text-sm text-muted-foreground">To:</span>
                        <Input
                          type="number"
                          min="1"
                          max={selectedDataset.rowCount}
                          value={toRow}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === "" || (!isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= selectedDataset.rowCount)) {
                              setToRow(val)
                            }
                          }}
                          placeholder={selectedDataset.rowCount.toString()}
                          className="w-20 h-8 text-sm"
                        />
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-muted-foreground">Rows shown:</span>
                        <Select value={rowsShown} onValueChange={handleRowCountChange}>
                          <SelectTrigger className="w-24 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="40">40</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        {rowsShown === "custom" && (
                          <Input
                            type="number"
                            min="1"
                            max="200"
                            value={customRowCount}
                            onChange={(e) => handleCustomRowCountChange(e.target.value)}
                            placeholder="1-200"
                            className="w-20 h-8 text-sm"
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading preview...</span>
                    </div>
                  ) : previewRows.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      No data to display
                    </div>
                  ) : (
                    <div className="border border-border rounded-lg overflow-hidden">
                      {/* Table container with both horizontal and vertical scrolling */}
                      <div className="max-h-[600px] overflow-auto">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            {/* Sticky header row - remains visible during vertical scroll */}
                            <thead className="bg-muted/50 sticky top-0 z-20">
                              <tr>
                                {/* Row number column - sticky on left during horizontal scroll */}
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground border-r border-border bg-muted/70 sticky left-0 z-30 min-w-[60px]">
                                  #
                                </th>
                                {/* Data columns - scroll horizontally */}
                                {datasetHeaders.map((col) => (
                                  <th
                                    key={col}
                                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border last:border-r-0 bg-muted/70 min-w-[120px]"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((row, idx) => (
                                <tr key={idx} className="border-t border-border hover:bg-muted/30 transition-colors">
                                  {/* Row number cell - sticky on left during horizontal scroll */}
                                  <td className="px-3 py-2 text-muted-foreground border-r border-border bg-background sticky left-0 z-10 min-w-[60px]">
                                    {rowRange.start + idx + 1}
                                  </td>
                                  {/* Data cells - scroll horizontally */}
                                  {datasetHeaders.map((header) => (
                                    <td
                                      key={header}
                                      className="px-3 py-2 whitespace-nowrap border-r border-border last:border-r-0 min-w-[120px]"
                                    >
                                      {row[header] !== null && row[header] !== undefined
                                        ? String(row[header])
                                        : ""}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* 2. Dataset Overview Summary */}
        {showSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {summaryStats.map((stat: { label: string; value: string; icon: any; subtext: string }) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} className="bg-card">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{stat.subtext}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* 3. Dataset Structure & Info */}
        <Collapsible open={structureExpanded} onOpenChange={setStructureExpanded}>
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {structureExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Dataset Structure & Info</CardTitle>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* df.info() style summary */}
                <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-auto max-h-48">
                  <pre className="text-muted-foreground">
                    {overviewData
                      ? `<class 'pandas.core.frame.DataFrame'>
RangeIndex: ${overviewData.total_rows} entries, 0 to ${overviewData.total_rows - 1}
Data columns (total ${overviewData.total_columns} columns):
${overviewData.columns
                        .map((col) => {
                          const nonNullCount = overviewData.total_rows - col.missing_count
                          const dtype = col.inferred_type === "numeric" ? "float64" : col.inferred_type === "datetime" ? "datetime64[ns]" : "object"
                          return ` #   ${col.name.padEnd(12)} ${nonNullCount} non-null    ${dtype.padEnd(12)}`
                        })
                        .join("\n")}
dtypes: ${[
                        overviewData.datetime_column_count > 0 && `datetime64[ns](${overviewData.datetime_column_count})`,
                        overviewData.numeric_column_count > 0 && `float64(${overviewData.numeric_column_count})`,
                        overviewData.categorical_column_count > 0 && `object(${overviewData.categorical_column_count})`,
                      ]
                        .filter(Boolean)
                        .join(", ")}`
                      : "No dataset loaded"}
                  </pre>
                </div>

                {/* Column list with badges */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Column Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto">
                    {filteredColumns.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border"
                      >
                        <span className="text-sm font-medium">{col.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(col.canonical_type)}`}>
                            {col.canonical_type}
                          </Badge>
                          {col.missing_count > 0 && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              nullable
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* 4. Missing Values Analysis */}
        {showMissing && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Missing Data Overview</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* All Missing Columns */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Top Columns with Missing Values</h4>
                  <div className="space-y-3">
                    {overviewData?.columns
                      .filter((col) => col.missing_count > 0)
                      .sort((a, b) => b.missing_percentage - a.missing_percentage)
                      .slice(0, 10)
                      .map((col) => (
                        <div key={col.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{col.name}</span>
                              <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(col.inferred_type)}`}>
                                {col.inferred_type}
                              </Badge>
                            </div>
                            <span className="text-muted-foreground">
                              {col.missing_count} ({col.missing_percentage}%)
                            </span>
                          </div>
                          <Progress value={col.missing_percentage} className="h-2" />
                        </div>
                      )) || []}
                  </div>
                </div>

                {/* Categorical Missing */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Categorical Columns with Missing Values</h4>
                  <div className="space-y-3">
                    {schema?.columns
                      .filter((col) => col.canonical_type === "categorical" && col.missing_count > 0)
                      .sort((a, b) => b.missing_percentage - a.missing_percentage)
                      .slice(0, 10)
                      .map((col) => (
                        <div key={col.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{col.name}</span>
                            <span className="text-muted-foreground">
                              {col.missing_count} ({col.missing_percentage}%)
                            </span>
                          </div>
                          <Progress value={col.missing_percentage} className="h-2" />
                        </div>
                      )) || []}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. Column Insights (Toggle Section) */}
        <Collapsible open={insightsExpanded} onOpenChange={setInsightsExpanded}>
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      {insightsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-base">Column Insights</CardTitle>
                </div>
                {insightsExpanded && overviewData && (
                  <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {overviewData.columns.map((col) => (
                        <SelectItem key={col.name} value={col.name}>
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {selectedColumn && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Column Information</h4>
                      {schema && (() => {
                        const column = schema.columns.find((col) => col.name === selectedColumn)
                        const insights = overviewData?.column_insights?.[selectedColumn]
                        return column ? (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(column.canonical_type)}`}>
                                {column.canonical_type}
                              </Badge>
                            </div>
                            <div className="text-3xl font-bold">
                              {insights?.unique ?? column.unique_count}
                            </div>
                            <p className="text-sm text-muted-foreground">Unique values</p>
                            <div className="text-sm text-muted-foreground">
                              Missing: {column.missing_count} ({column.missing_percentage}%)
                            </div>
                          </>
                        ) : null
                      })()}

                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Top Value Counts</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Show:</span>
                          <Select
                            value={valueCountLimit}
                            onValueChange={(val) => {
                              setValueCountLimit(val)
                              if (val !== "custom") {
                                setCustomValueCount("")
                              }
                            }}
                          >
                            <SelectTrigger className="w-20 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                          {valueCountLimit === "custom" && (
                            <Input
                              type="number"
                              min="1"
                              max="50"
                              value={customValueCount}
                              onChange={(e) => {
                                const val = e.target.value
                                if (val === "" || (!isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 50)) {
                                  setCustomValueCount(val)
                                }
                              }}
                              placeholder="1-50"
                              className="w-16 h-7 text-xs"
                            />
                          )}
                        </div>
                      </div>
                      {/* Scrollable value counts container */}
                      <div className="max-h-[400px] overflow-y-auto overflow-x-auto" key={`values-container-${actualValueCountLimit}`}>
                        <div className="min-w-full space-y-2 pr-2">
                          {displayedTopValues.length > 0 ? (
                            displayedTopValues.map((item) => {
                              const maxCount = Math.max(...displayedTopValues.map((v) => v.count))
                              const isLongValue = String(item.value).length > 30
                              const displayValue = isLongValue
                                ? `${String(item.value).substring(0, 30)}...`
                                : String(item.value)

                              return (
                                <div
                                  key={item.value}
                                  className="flex items-center justify-between gap-2 min-w-[300px]"
                                >
                                  {/* Value with truncation and tooltip */}
                                  <div className="flex-1 min-w-0">
                                    {isLongValue ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            className="text-sm font-medium truncate block cursor-help"
                                            title={String(item.value)}
                                          >
                                            {displayValue}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-md break-words">
                                          <p>{String(item.value)}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <span className="text-sm font-medium">{displayValue}</span>
                                    )}
                                  </div>
                                  {/* Bar and count - fixed width to maintain alignment */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="w-24 bg-muted rounded-full h-2 shrink-0">
                                      <div
                                        className="bg-primary h-2 rounded-full transition-all"
                                        style={{
                                          width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-sm text-muted-foreground w-12 text-right shrink-0">
                                      {item.count}
                                    </span>
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No value counts available
                            </p>
                          )}

                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* 6. Column Intelligence (New Section) */}
        <Collapsible open={intelligenceExpanded} onOpenChange={setIntelligenceExpanded}>
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {intelligenceExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <CardTitle className="text-base">Column Intelligence</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    AI-powered explanation of what each column means and why it is used
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {isLoadingIntelligence ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading intelligence...</span>
                  </div>
                ) : !columnIntelligence ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Column meanings are not available yet. Generate AI-powered explanations to understand each column in simple English.
                      </p>
                    </div>
                    <Button
                      onClick={() => handleGenerateIntelligence(false)}
                      disabled={isGeneratingIntelligence || !selectedDataset}
                    >
                      {isGeneratingIntelligence ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Column Intelligence"
                      )}
                    </Button>
                    {intelligenceError && (
                      <p className="text-sm text-destructive">{intelligenceError}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          AI Generated • Stored
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateIntelligence(true)}
                        disabled={isGeneratingIntelligence || !selectedDataset}
                      >
                        {isGeneratingIntelligence ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Regenerating...
                          </>
                        ) : (
                          "Regenerate Intelligence"
                        )}
                      </Button>
                    </div>
                    {intelligenceError && (
                      <p className="text-sm text-destructive">{intelligenceError}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {columnIntelligence.columns.map((col) => {
                        const columnType = getColumnType(col.name)
                        return (
                          <Card key={col.name} className="bg-card">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold">{col.name}</h4>
                                <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(columnType)}`}>
                                  {col.data_type}
                                </Badge>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Meaning</p>
                                  <p className="text-sm text-foreground">{col.meaning}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Why this column is used</p>
                                  <p className="text-sm text-foreground">{col.why_used}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Column Intelligence is read-only. It does not modify, clean, or delete your data or unique values.
                  </p>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </main>
  )
}
