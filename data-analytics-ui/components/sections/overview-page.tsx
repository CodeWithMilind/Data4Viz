"use client"

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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDataset, type Dataset } from "@/contexts/dataset-context"

/**
 * Infer column type from data values
 * Analyzes sample values to determine if column is numeric, datetime, boolean, or categorical
 */
function inferColumnType(values: any[], columnName: string): "numeric" | "datetime" | "boolean" | "categorical" {
  if (values.length === 0) return "categorical"

  // Check for boolean type
  const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== "")
  if (nonNullValues.length > 0) {
    const allBooleans = nonNullValues.every(
      (v) => typeof v === "boolean" || v === "true" || v === "false" || v === "True" || v === "False"
    )
    if (allBooleans) return "boolean"
  }

  // Check for datetime patterns
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
    /^\d{4}\/\d{2}\/\d{2}/, // YYYY/MM/DD
    /^\d{2}-\d{2}-\d{4}/, // MM-DD-YYYY
  ]
  const dateMatches = nonNullValues.filter((v) => {
    const str = String(v)
    return datePatterns.some((pattern) => pattern.test(str)) || !isNaN(Date.parse(str))
  })
  if (dateMatches.length > nonNullValues.length * 0.8) return "datetime"

  // Check for numeric type
  const numericMatches = nonNullValues.filter((v) => {
    if (typeof v === "number") return true
    const str = String(v).trim()
    return str !== "" && !isNaN(Number(str)) && isFinite(Number(str))
  })
  if (numericMatches.length > nonNullValues.length * 0.8) return "numeric"

  // Default to categorical
  return "categorical"
}

/**
 * Compute comprehensive dataset statistics
 * Single source of truth for all derived metrics
 */
function computeDatasetStats(dataset: Dataset | null) {
  if (!dataset || !dataset.data || dataset.data.length === 0) {
    return {
      totalRows: 0,
      totalColumns: 0,
      numericColumns: 0,
      categoricalColumns: 0,
      datetimeColumns: 0,
      booleanColumns: 0,
      columnMetadata: [] as Array<{ name: string; type: string; nullable: boolean }>,
      missingValues: [] as Array<{ column: string; missing: number; percentage: number; type: string }>,
      totalMissingColumns: 0,
      duplicateRows: 0,
      columnInsights: {} as Record<string, { unique: number; topValues: { value: string; count: number }[] }>,
    }
  }

  const headers = dataset.headers
  const data = dataset.data
  const rowCount = data.length

  // Analyze each column
  const columnMetadata: Array<{ name: string; type: string; nullable: boolean }> = []
  const missingValues: Array<{ column: string; missing: number; percentage: number; type: string }> = []
  const columnInsights: Record<string, { unique: number; topValues: { value: string; count: number }[] }> = {}

  // Count duplicates (compare stringified rows)
  const rowStrings = data.map((row) => JSON.stringify(row))
  const uniqueRows = new Set(rowStrings)
  const duplicateRows = rowCount - uniqueRows.size

  headers.forEach((header) => {
    // Extract column values
    const columnValues = data.map((row) => row[header])

    // Count missing values
    const missingCount = columnValues.filter((v) => v === null || v === undefined || v === "").length
    const missingPercentage = rowCount > 0 ? (missingCount / rowCount) * 100 : 0

    // Infer column type
    const columnType = inferColumnType(columnValues, header)

    // Store column metadata
    columnMetadata.push({
      name: header,
      type: columnType,
      nullable: missingCount > 0,
    })

    // Store missing value info
    if (missingCount > 0) {
      missingValues.push({
        column: header,
        missing: missingCount,
        percentage: missingPercentage,
        type: columnType,
      })
    }

    // Compute column insights (unique values and top frequencies)
    const nonNullValues = columnValues.filter((v) => v !== null && v !== undefined && v !== "")
    const valueCounts = new Map<string, number>()
    nonNullValues.forEach((v) => {
      const key = String(v)
      valueCounts.set(key, (valueCounts.get(key) || 0) + 1)
    })

    const unique = valueCounts.size
    // Compute top 50 values to allow UI to slice dynamically
    const topValues = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([value, count]) => ({ value, count }))

    columnInsights[header] = {
      unique,
      topValues,
    }
  })

  // Count columns by type
  const numericColumns = columnMetadata.filter((c) => c.type === "numeric").length
  const categoricalColumns = columnMetadata.filter((c) => c.type === "categorical").length
  const datetimeColumns = columnMetadata.filter((c) => c.type === "datetime").length
  const booleanColumns = columnMetadata.filter((c) => c.type === "boolean").length

  // Sort missing values by percentage (descending)
  missingValues.sort((a, b) => b.percentage - a.percentage)

  return {
    totalRows: rowCount,
    totalColumns: headers.length,
    numericColumns,
    categoricalColumns,
    datetimeColumns,
    booleanColumns,
    columnMetadata,
    missingValues,
    totalMissingColumns: missingValues.length,
    duplicateRows,
    columnInsights,
  }
}

/**
 * Format summary stats for display cards
 */
const getSummaryStats = (dataset: Dataset | null, stats: ReturnType<typeof computeDatasetStats>) => {
  if (!dataset) {
    return []
  }

  return [
    { label: "Total Rows", value: stats.totalRows.toLocaleString(), icon: Rows3, subtext: "records loaded" },
    { label: "Total Columns", value: stats.totalColumns.toString(), icon: Columns3, subtext: "features" },
    {
      label: "Numeric Columns",
      value: stats.numericColumns.toString(),
      icon: Hash,
      subtext: stats.numericColumns > 0 ? `${stats.numericColumns} numeric columns` : "no numeric columns",
    },
    {
      label: "Categorical Columns",
      value: stats.categoricalColumns.toString(),
      icon: Type,
      subtext: stats.categoricalColumns > 0 ? `${stats.categoricalColumns} categorical columns` : "no categorical columns",
    },
    {
      label: "Datetime Columns",
      value: stats.datetimeColumns.toString(),
      icon: Calendar,
      subtext: stats.datetimeColumns > 0 ? `${stats.datetimeColumns} datetime columns` : "no datetime columns",
    },
    {
      label: "Missing Columns",
      value: stats.totalMissingColumns.toString(),
      icon: AlertCircle,
      subtext: stats.totalMissingColumns > 0 ? "columns with nulls" : "no missing values",
    },
    {
      label: "Duplicated Rows",
      value: stats.duplicateRows.toString(),
      icon: Copy,
      subtext: stats.duplicateRows > 0 ? "duplicate rows found" : "no duplicates found",
    },
  ]
}

export function OverviewPage() {
  const { datasets, currentDataset, setCurrentDataset } = useDataset()
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("")
  const [previewExpanded, setPreviewExpanded] = useState(true)
  const [rowsShown, setRowsShown] = useState("20")
  const [customRowCount, setCustomRowCount] = useState("")
  const [structureExpanded, setStructureExpanded] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState("city")
  const [filterType, setFilterType] = useState("all")
  const [valueCountLimit, setValueCountLimit] = useState("5")
  const [customValueCount, setCustomValueCount] = useState("")
  const [showPreview, setShowPreview] = useState(true)
  const [showSummary, setShowSummary] = useState(true)
  const [showMissing, setShowMissing] = useState(true)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Get selected dataset or use current dataset
  const selectedDataset = useMemo(() => {
    if (selectedDatasetId) {
      return datasets.find((d) => d.id === selectedDatasetId) || currentDataset
    }
    return currentDataset
  }, [selectedDatasetId, datasets, currentDataset])

  // Update current dataset when selection changes
  const handleDatasetChange = (datasetId: string) => {
    setSelectedDatasetId(datasetId)
    const dataset = datasets.find((d) => d.id === datasetId)
    if (dataset) {
      setCurrentDataset(dataset)
      // Reset selected column to first column if current selection doesn't exist
      if (dataset.headers.length > 0 && !dataset.headers.includes(selectedColumn)) {
        setSelectedColumn(dataset.headers[0])
      }
    }
  }

  // Initialize selected column when dataset loads
  useEffect(() => {
    if (selectedDataset && selectedDataset.headers.length > 0) {
      if (!selectedDataset.headers.includes(selectedColumn)) {
        setSelectedColumn(selectedDataset.headers[0])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset])

  // Compute comprehensive dataset stats (single source of truth)
  const datasetStats = useMemo(() => computeDatasetStats(selectedDataset), [selectedDataset])

  // Calculate actual value count limit
  const actualValueCountLimit = useMemo(() => {
    if (valueCountLimit === "custom") {
      const custom = Number.parseInt(customValueCount) || 5
      return Math.min(Math.max(1, custom), 50) // Cap at 50
    }
    return Number.parseInt(valueCountLimit) || 5
  }, [valueCountLimit, customValueCount])

  // Get limited top values for display
  const displayedTopValues = useMemo(() => {
    if (!selectedDataset || !datasetStats?.columnInsights?.[selectedColumn]) {
      return []
    }
    return datasetStats.columnInsights[selectedColumn].topValues.slice(0, actualValueCountLimit)
  }, [selectedDataset, datasetStats, selectedColumn, actualValueCountLimit])

  // Calculate preview row count (cap at 200)
  const previewRowCount = useMemo(() => {
    if (rowsShown === "custom") {
      const custom = Number.parseInt(customRowCount) || 0
      return Math.min(Math.max(1, custom), 200)
    }
    return Math.min(Number.parseInt(rowsShown) || 20, 200)
  }, [rowsShown, customRowCount])

  // Get preview rows from dataset (read-only, capped at 200)
  const previewRows = useMemo(() => {
    if (!selectedDataset || !selectedDataset.data || selectedDataset.data.length === 0) {
      return []
    }
    return selectedDataset.data.slice(0, previewRowCount)
  }, [selectedDataset, previewRowCount])

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
  }, [selectedDataset, previewRowCount])

  // Get headers from dataset
  const datasetHeaders = useMemo(() => {
    if (!selectedDataset || !selectedDataset.headers) {
      return []
    }
    return selectedDataset.headers
  }, [selectedDataset])

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

  // Show dataset selector if no dataset selected
  if (!selectedDataset) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Select a Dataset</CardTitle>
            <CardDescription>Choose which dataset you want to view</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {datasets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">
                No datasets available. Please upload a dataset first.
              </p>
            ) : (
              <>
                <Select value={selectedDatasetId} onValueChange={handleDatasetChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a dataset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        <div className="flex items-center gap-3">
                          <Database className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <span className="font-medium">{dataset.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">
                              {dataset.rowCount.toLocaleString()} rows • {dataset.columnCount} columns
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground text-center">
                  You can change the dataset later from the selector
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    )
  }

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

  // Filter columns based on type filter
  const filteredColumns = useMemo(() => {
    if (!selectedDataset) return []
    return datasetStats.columnMetadata.filter((col) => {
      if (filterType === "all") return true
      return col.type === filterType
    })
  }, [datasetStats.columnMetadata, filterType])

  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Dataset Overview</span>
        </div>
        {/* Dataset Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Dataset:</span>
          <Select value={selectedDataset.id} onValueChange={handleDatasetChange}>
            <SelectTrigger className="w-64 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{dataset.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {dataset.rowCount.toLocaleString()} rows • {dataset.columnCount} columns
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                      Dataset Preview (First {previewRowCount} of {selectedDataset.rowCount.toLocaleString()} Rows)
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
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
                                    {idx + 1}
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
            {getSummaryStats(selectedDataset, datasetStats).map((stat) => {
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
                    {selectedDataset
                      ? `<class 'pandas.core.frame.DataFrame'>
RangeIndex: ${datasetStats.totalRows} entries, 0 to ${datasetStats.totalRows - 1}
Data columns (total ${datasetStats.totalColumns} columns):
${datasetStats.columnMetadata
  .map((col, idx) => {
    const missingCount = datasetStats.missingValues.find((m) => m.column === col.name)?.missing || 0
    const nonNullCount = datasetStats.totalRows - missingCount
    const dtype = col.type === "numeric" ? "float64" : col.type === "datetime" ? "datetime64[ns]" : col.type === "boolean" ? "bool" : "object"
    return ` #   ${col.name.padEnd(12)} ${nonNullCount} non-null    ${dtype.padEnd(12)}`
  })
  .join("\n")}
dtypes: ${[
  datasetStats.booleanColumns > 0 && `bool(${datasetStats.booleanColumns})`,
  datasetStats.datetimeColumns > 0 && `datetime64[ns](${datasetStats.datetimeColumns})`,
  datasetStats.numericColumns > 0 && `float64(${datasetStats.numericColumns})`,
  datasetStats.categoricalColumns > 0 && `object(${datasetStats.categoricalColumns})`,
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
                          <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(col.type)}`}>
                            {col.type}
                          </Badge>
                          {col.nullable && (
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
                    {datasetStats.missingValues.slice(0, 10).map((item) => (
                      <div key={item.column} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.column}</span>
                            <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(item.type)}`}>
                              {item.type}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground">
                            {item.missing} ({item.percentage}%)
                          </span>
                        </div>
                        <Progress value={item.percentage} className="h-2" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Categorical Missing */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Categorical Columns with Missing Values</h4>
                  <div className="space-y-3">
                    {datasetStats.missingValues
                      .filter((item) => item.type === "categorical")
                      .slice(0, 10)
                      .map((item) => (
                        <div key={item.column} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.column}</span>
                            <span className="text-muted-foreground">
                              {item.missing} ({item.percentage}%)
                            </span>
                          </div>
                          <Progress value={item.percentage} className="h-2" />
                        </div>
                      ))}
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
                {insightsExpanded && selectedDataset && (
                  <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedDataset.headers.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {selectedDataset && datasetStats.columnInsights[selectedColumn] && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Unique Values</h4>
                      <div className="text-3xl font-bold">{datasetStats.columnInsights[selectedColumn].unique}</div>
                      <p className="text-sm text-muted-foreground">distinct values in column</p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Top Value Counts</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Show:</span>
                          <Select value={valueCountLimit} onValueChange={setValueCountLimit}>
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
                      <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
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
                            <p className="text-sm text-muted-foreground">No data available</p>
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
