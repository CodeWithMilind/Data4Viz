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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useDataset, type Dataset } from "@/contexts/dataset-context"

// Summary stats helper - will be computed from dataset
const getSummaryStats = (dataset: Dataset | null) => {
  if (!dataset) {
    return []
  }
  
  // Basic stats from dataset
  const totalRows = dataset.rowCount.toLocaleString()
  const totalColumns = dataset.columnCount.toString()
  
  // For now, we'll use placeholder values for column type analysis
  // In a real implementation, you'd analyze the data types
  return [
    { label: "Total Rows", value: totalRows, icon: Rows3, subtext: "records loaded" },
    { label: "Total Columns", value: totalColumns, icon: Columns3, subtext: "features" },
    { label: "Numeric Columns", value: "-", icon: Hash, subtext: "analyze data types" },
    { label: "Categorical Columns", value: "-", icon: Type, subtext: "analyze data types" },
    { label: "Datetime Columns", value: "-", icon: Calendar, subtext: "analyze data types" },
    { label: "Missing Columns", value: "-", icon: AlertCircle, subtext: "analyze nulls" },
    { label: "Duplicated Rows", value: "-", icon: Copy, subtext: "analyze duplicates" },
  ]
}

// Dummy data for dataset preview
const columns = [
  "id",
  "name",
  "age",
  "email",
  "city",
  "country",
  "salary",
  "department",
  "hire_date",
  "is_active",
  "score",
  "category",
]

const generateRows = (count: number) => {
  const rows = []
  for (let i = 1; i <= count; i++) {
    rows.push({
      id: i,
      name: `User ${i}`,
      age: 20 + (i % 40),
      email: `user${i}@example.com`,
      city: ["New York", "London", "Tokyo", "Paris", "Berlin"][i % 5],
      country: ["USA", "UK", "Japan", "France", "Germany"][i % 5],
      salary: 40000 + i * 1000,
      department: ["Engineering", "Sales", "Marketing", "HR", "Finance"][i % 5],
      hire_date: `2023-0${(i % 9) + 1}-${(i % 28) + 1}`,
      is_active: i % 3 !== 0,
      score: (i * 7) % 100,
      category: ["A", "B", "C"][i % 3],
    })
  }
  return rows
}

// Column metadata
const columnMeta = [
  { name: "id", type: "numeric", nullable: false },
  { name: "name", type: "categorical", nullable: false },
  { name: "age", type: "numeric", nullable: true },
  { name: "email", type: "categorical", nullable: false },
  { name: "city", type: "categorical", nullable: true },
  { name: "country", type: "categorical", nullable: true },
  { name: "salary", type: "numeric", nullable: true },
  { name: "department", type: "categorical", nullable: false },
  { name: "hire_date", type: "datetime", nullable: true },
  { name: "is_active", type: "categorical", nullable: false },
  { name: "score", type: "numeric", nullable: true },
  { name: "category", type: "categorical", nullable: false },
]

// Missing data info
const missingData = [
  { column: "age", missing: 142, percentage: 14.2, type: "numeric" },
  { column: "city", missing: 89, percentage: 8.9, type: "categorical" },
  { column: "salary", missing: 67, percentage: 6.7, type: "numeric" },
  { column: "hire_date", missing: 45, percentage: 4.5, type: "datetime" },
  { column: "country", missing: 23, percentage: 2.3, type: "categorical" },
]

// Column insights data
const columnInsights: Record<string, { unique: number; topValues: { value: string; count: number }[] }> = {
  city: {
    unique: 5,
    topValues: [
      { value: "New York", count: 210 },
      { value: "London", count: 198 },
      { value: "Tokyo", count: 205 },
      { value: "Paris", count: 192 },
      { value: "Berlin", count: 195 },
    ],
  },
  department: {
    unique: 5,
    topValues: [
      { value: "Engineering", count: 215 },
      { value: "Sales", count: 198 },
      { value: "Marketing", count: 202 },
      { value: "HR", count: 188 },
      { value: "Finance", count: 197 },
    ],
  },
  category: {
    unique: 3,
    topValues: [
      { value: "A", count: 340 },
      { value: "B", count: 332 },
      { value: "C", count: 328 },
    ],
  },
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
    }
  }

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
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const filteredColumns = columnMeta.filter((col) => {
    if (filterType === "all") return true
    return col.type === filterType
  })

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
            {getSummaryStats(selectedDataset).map((stat) => {
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
                    {`<class 'pandas.core.frame.DataFrame'>
RangeIndex: 1000 entries, 0 to 999
Data columns (total 12 columns):
 #   Column      Non-Null Count  Dtype  
---  ------      --------------  -----  
 0   id          1000 non-null   int64  
 1   name        1000 non-null   object 
 2   age         858 non-null    float64
 3   email       1000 non-null   object 
 4   city        911 non-null    object 
 5   country     977 non-null    object 
 6   salary      933 non-null    float64
 7   department  1000 non-null   object 
 8   hire_date   955 non-null    datetime64[ns]
 9   is_active   1000 non-null   bool   
 10  score       1000 non-null   int64  
 11  category    1000 non-null   object 
dtypes: bool(1), datetime64[ns](1), float64(2), int64(2), object(6)
memory usage: 87.9 KB`}
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
                    {missingData.map((item) => (
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
                    {missingData
                      .filter((item) => item.type === "categorical")
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
                {insightsExpanded && (
                  <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(columnInsights).map((col) => (
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
                {columnInsights[selectedColumn] && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Unique Values</h4>
                      <div className="text-3xl font-bold">{columnInsights[selectedColumn].unique}</div>
                      <p className="text-sm text-muted-foreground">distinct values in column</p>
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Top 5 Value Counts</h4>
                      <div className="space-y-2">
                        {columnInsights[selectedColumn].topValues.map((item) => (
                          <div key={item.value} className="flex items-center justify-between">
                            <span className="text-sm font-medium">{item.value}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full"
                                  style={{
                                    width: `${(item.count / 340) * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground w-12 text-right">{item.count}</span>
                            </div>
                          </div>
                        ))}
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
