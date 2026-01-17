"use client"

/**
 * Overview Page
 * 
 * IMPORTANT: Backend is the single source of truth for all statistics.
 * Frontend only renders API response - no calculations or inferences.
 */

import { useState, useMemo, useEffect, useRef } from "react"
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
import { getDatasetOverviewFromFile, getDatasetOverview, refreshDatasetOverview, type OverviewResponse, getDatasetSchema, type SchemaResponse } from "@/lib/api/dataCleaningClient"
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
  const [isLoadingOverview, setIsLoadingOverview] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  
  // Schema state - single source of truth for column types
  const [schema, setSchema] = useState<SchemaResponse | null>(null)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  // Fetch schema from backend when dataset is available
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

  // Handle manual refresh (user-initiated)
  const handleRefreshOverview = async () => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) return

    setIsRefreshing(true)
    setOverviewError(null)

    try {
      const data = await refreshDatasetOverview(activeWorkspaceId, selectedDataset.fileName)
      setOverviewData(data)
      setOverviewError(null)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to refresh overview"
      setOverviewError(errorMessage)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Get dataset from workspace
  const selectedDataset = useMemo(() => {
    const datasets = getDatasets()
    return datasets.length > 0 ? datasets[0] : null // Use first dataset for overview
  }, [getDatasets])

  // Fetch overview data from backend when dataset is available
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      setOverviewData(null)
      setOverviewError(null)
      return
    }

    let cancelled = false
    setIsLoadingOverview(true)
    setOverviewError(null)

    getDatasetOverview(activeWorkspaceId, selectedDataset.fileName)
      .then((data) => {
        if (cancelled) return
        setOverviewData(data)
        setOverviewError(null)

        // Initialize selected column if not set
        if (!selectedColumn && data.columns.length > 0) {
          setSelectedColumn(data.columns[0].name)
        }
      })
      .catch((error) => {
        if (cancelled) return
        const errorMessage = error instanceof Error ? error.message : "Failed to load dataset overview"
        setOverviewError(errorMessage)
        setOverviewData(null)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOverview(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, selectedDataset?.fileName, selectedColumn])

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

  // Show loading state while fetching overview data
  if (isLoadingOverview) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading dataset overview...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Show error state if overview fetch failed
  if (overviewError) {
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
        </Card>
      </main>
    )
  }

  // Show empty state if no overview data
  if (!overviewData) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Overview Data</CardTitle>
            <CardDescription>Unable to load dataset overview. Please try again.</CardDescription>
          </CardHeader>
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
      </div>
    </main>
  )
}
