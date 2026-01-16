"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, AlertCircle, CheckCircle2, Eye, Play, Filter, Copy, AlertTriangle, Database } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/workspace-context"

const availableDatasets = [
  { id: "1", name: "sales_data.csv", rows: 1950, columns: 12 },
  { id: "2", name: "customer_info.csv", rows: 5420, columns: 8 },
  { id: "3", name: "product_inventory.csv", rows: 890, columns: 15 },
  { id: "4", name: "employee_records.csv", rows: 234, columns: 10 },
]

// Placeholder data
const missingValueColumns = [
  { name: "Age", missing: 234, percent: 12, total: 1950 },
  { name: "Salary", missing: 156, percent: 8, total: 1950 },
  { name: "Department", missing: 89, percent: 4.5, total: 1950 },
  { name: "Hire_Date", missing: 45, percent: 2.3, total: 1950 },
  { name: "Location", missing: 67, percent: 3.4, total: 1950 },
  { name: "Manager_ID", missing: 34, percent: 1.7, total: 1950 },
  { name: "Performance_Score", missing: 112, percent: 5.7, total: 1950 },
  { name: "Last_Review_Date", missing: 78, percent: 4.0, total: 1950 },
]

const duplicateInfo = { count: 12, percent: 0.6 }

const invalidFormatColumns = [
  { name: "Email", invalid: 56, examples: ["john@", "invalid", "test@.com"] },
  { name: "Phone", invalid: 23, examples: ["123", "abc-def", "12345"] },
  { name: "Date_Joined", invalid: 18, examples: ["2024/13/45", "not-a-date"] },
]

const outlierColumns = [
  { name: "Age", outliers: 45, min: -5, max: 150, method: "IQR" },
  { name: "Salary", outliers: 32, min: -1000, max: 999999, method: "IQR" },
  { name: "Experience", outliers: 12, min: -2, max: 50, method: "Z-score" },
]

const navItems = [
  { id: "missing", label: "Missing Values", icon: AlertCircle },
  { id: "duplicates", label: "Duplicate Rows", icon: Copy },
  { id: "invalid", label: "Invalid Formats", icon: AlertTriangle },
  { id: "outliers", label: "Outliers", icon: Filter },
]

type CleaningAction = {
  columnName: string
  actionType: string
  value?: string
}

interface DataCleaningPageProps {
  onApplyCleaningAction?: (action: CleaningAction) => void
}

export function DataCleaningPage({ onApplyCleaningAction }: DataCleaningPageProps) {
  const { currentWorkspace, setCleaningStarted, addCleaningStep } = useWorkspace()
  const [activeSection, setActiveSection] = useState("missing")
  const [selectedDataset, setSelectedDataset] = useState<string>("")

  // Missing values state
  const [missingFilterMode, setMissingFilterMode] = useState<"all" | "manual">("all")
  const [selectedMissingColumns, setSelectedMissingColumns] = useState<string[]>([])
  const [missingActions, setMissingActions] = useState<Record<string, { action: string; customValue: string }>>({})

  // Duplicates state
  const [duplicateAction, setDuplicateAction] = useState("keep-first")

  // Invalid formats state
  const [invalidFilterMode, setInvalidFilterMode] = useState<"all" | "manual">("all")
  const [selectedInvalidColumns, setSelectedInvalidColumns] = useState<string[]>([])
  const [targetTypes, setTargetTypes] = useState<Record<string, string>>({})

  // Outliers state
  const [outlierFilterMode, setOutlierFilterMode] = useState<"all" | "manual">("all")
  const [selectedOutlierColumns, setSelectedOutlierColumns] = useState<string[]>([])
  const [outlierMethods, setOutlierMethods] = useState<Record<string, string>>({})
  const [outlierActions, setOutlierActions] = useState<Record<string, string>>({})

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Scroll sync
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      let currentSection = "missing"

      for (const item of navItems) {
        const section = sectionRefs.current[item.id]
        if (section && section.offsetTop - 100 <= scrollTop) {
          currentSection = item.id
        }
      }
      setActiveSection(currentSection)
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [selectedDataset]) // Added selectedDataset dependency to re-attach listener after dataset selection

  const scrollToSection = (sectionId: string) => {
    const section = sectionRefs.current[sectionId]
    const container = scrollContainerRef.current
    if (section && container) {
      const containerRect = container.getBoundingClientRect()
      const sectionRect = section.getBoundingClientRect()
      const scrollTop = container.scrollTop + (sectionRect.top - containerRect.top) - 24

      container.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      })
    }
    setActiveSection(sectionId)
  }

  const handleApplyAction = (columnName: string, actionType: string, value?: string) => {
    onApplyCleaningAction?.({ columnName, actionType, value })
    
    // Update workspace state
    if (currentWorkspace) {
      if (!currentWorkspace.state.cleaningStarted) {
        setCleaningStarted(true)
      }
      addCleaningStep({
        type: actionType,
        name: `${actionType} on ${columnName}`,
        description: value ? `Applied ${actionType} with value: ${value}` : undefined,
        config: { columnName, value },
      })
    }
  }

  const handlePreview = (columnName: string, actionType: string) => {
    // Preview logic - UI only
  }

  const filteredMissingColumns =
    missingFilterMode === "all"
      ? missingValueColumns
      : missingValueColumns.filter((c) => selectedMissingColumns.includes(c.name))

  const filteredInvalidColumns =
    invalidFilterMode === "all"
      ? invalidFormatColumns
      : invalidFormatColumns.filter((c) => selectedInvalidColumns.includes(c.name))

  const filteredOutlierColumns =
    outlierFilterMode === "all" ? outlierColumns : outlierColumns.filter((c) => selectedOutlierColumns.includes(c.name))

  const currentDataset = availableDatasets.find((d) => d.id === selectedDataset)

  if (!selectedDataset) {
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
            <Select value={selectedDataset} onValueChange={setSelectedDataset}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a dataset..." />
              </SelectTrigger>
              <SelectContent>
                {availableDatasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="font-medium">{dataset.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {dataset.rows} rows • {dataset.columns} columns
                        </span>
                      </div>
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
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Data Cleaning</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
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
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-4">
            <Select value={selectedDataset} onValueChange={setSelectedDataset}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent>
                {availableDatasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentDataset && (
              <span className="text-xs text-muted-foreground">
                {currentDataset.rows} rows • {currentDataset.columns} columns
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Data Quality Score</span>
            <div className="flex items-center gap-2">
              <Progress value={78} className="w-32 h-2" />
              <span className="text-sm font-semibold text-primary">78%</span>
            </div>
          </div>
          <Button 
            className="gap-2" 
            disabled={!currentWorkspace || !currentWorkspace.state.datasetAttached}
            title={!currentWorkspace || !currentWorkspace.state.datasetAttached ? "Attach a dataset to your workspace first" : ""}
          >
            <CheckCircle2 className="w-4 h-4" />
            Auto-Clean All
          </Button>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* Missing Values Section */}
            <section
              id="missing"
              ref={(el) => {
                sectionRefs.current["missing"] = el
              }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Missing Values</h2>
                  <p className="text-sm text-muted-foreground">Handle missing data in your columns</p>
                </div>
                <Badge variant="secondary">
                  {missingValueColumns.reduce((a, c) => a + c.missing, 0)} total missing
                </Badge>
              </div>

              {/* Column Filter */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-6">
                    <Label className="text-sm font-medium">Columns:</Label>
                    <RadioGroup
                      value={missingFilterMode}
                      onValueChange={(v) => setMissingFilterMode(v as "all" | "manual")}
                      className="flex items-center gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="missing-all" />
                        <Label htmlFor="missing-all" className="text-sm cursor-pointer">
                          Show all affected columns
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="manual" id="missing-manual" />
                        <Label htmlFor="missing-manual" className="text-sm cursor-pointer">
                          Manually select columns
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  {missingFilterMode === "manual" && (
                    <div className="mt-4 max-h-40 pr-4 overflow-auto">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {missingValueColumns.map((col) => (
                          <div key={col.name} className="flex items-center gap-2">
                            <Checkbox
                              id={`missing-${col.name}`}
                              checked={selectedMissingColumns.includes(col.name)}
                              onCheckedChange={(checked) => {
                                setSelectedMissingColumns(
                                  checked
                                    ? [...selectedMissingColumns, col.name]
                                    : selectedMissingColumns.filter((c) => c !== col.name),
                                )
                              }}
                            />
                            <Label htmlFor={`missing-${col.name}`} className="text-sm cursor-pointer">
                              {col.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Column Cards */}
              <div className="space-y-4">
                {filteredMissingColumns.map((col) => {
                  const colAction = missingActions[col.name] || { action: "drop", customValue: "" }
                  return (
                    <Card key={col.name}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{col.name}</CardTitle>
                          <Badge variant="outline" className="font-normal">
                            Missing: {col.percent}% | {col.missing} rows
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <RadioGroup
                          value={colAction.action}
                          onValueChange={(v) =>
                            setMissingActions({ ...missingActions, [col.name]: { ...colAction, action: v } })
                          }
                          className="grid grid-cols-2 gap-3"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="drop" id={`${col.name}-drop`} />
                            <Label htmlFor={`${col.name}-drop`} className="text-sm cursor-pointer">
                              Drop rows with missing values
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="median" id={`${col.name}-median`} />
                            <Label htmlFor={`${col.name}-median`} className="text-sm cursor-pointer">
                              Fill with median
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="mean" id={`${col.name}-mean`} />
                            <Label htmlFor={`${col.name}-mean`} className="text-sm cursor-pointer">
                              Fill with mean
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="mode" id={`${col.name}-mode`} />
                            <Label htmlFor={`${col.name}-mode`} className="text-sm cursor-pointer">
                              Fill with mode
                            </Label>
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            <RadioGroupItem value="custom" id={`${col.name}-custom`} />
                            <Label htmlFor={`${col.name}-custom`} className="text-sm cursor-pointer">
                              Fill with custom value
                            </Label>
                            {colAction.action === "custom" && (
                              <Input
                                placeholder="Enter value..."
                                className="w-40 h-8 ml-2"
                                value={colAction.customValue}
                                onChange={(e) =>
                                  setMissingActions({
                                    ...missingActions,
                                    [col.name]: { ...colAction, customValue: e.target.value },
                                  })
                                }
                              />
                            )}
                          </div>
                        </RadioGroup>
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 bg-transparent"
                            onClick={() => handlePreview(col.name, "Missing Value Preview")}
                          >
                            <Eye className="w-4 h-4" />
                            Preview Changes
                          </Button>
                          <Button
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                              handleApplyAction(
                                col.name,
                                "Missing Value Fix",
                                colAction.action === "custom" ? colAction.customValue : colAction.action,
                              )
                            }
                          >
                            <Play className="w-4 h-4" />
                            Apply Fix
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>

            {/* Duplicate Rows Section */}
            <section
              id="duplicates"
              ref={(el) => {
                sectionRefs.current["duplicates"] = el
              }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Duplicate Rows</h2>
                  <p className="text-sm text-muted-foreground">Remove duplicate entries from your dataset</p>
                </div>
                <Badge variant="secondary">
                  {duplicateInfo.count} duplicates ({duplicateInfo.percent}%)
                </Badge>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Duplicate Handling</CardTitle>
                  <CardDescription>Found {duplicateInfo.count} duplicate rows in your dataset</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup value={duplicateAction} onValueChange={setDuplicateAction} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="keep-first" id="dup-first" />
                      <Label htmlFor="dup-first" className="text-sm cursor-pointer">
                        Remove duplicates (keep first occurrence)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="keep-last" id="dup-last" />
                      <Label htmlFor="dup-last" className="text-sm cursor-pointer">
                        Remove duplicates (keep last occurrence)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="remove-all" id="dup-all" />
                      <Label htmlFor="dup-all" className="text-sm cursor-pointer">
                        Remove all duplicate rows
                      </Label>
                    </div>
                  </RadioGroup>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() => handlePreview("All", "Duplicate Preview")}
                    >
                      <Eye className="w-4 h-4" />
                      Preview Changes
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => handleApplyAction("All", "Duplicate Removal", duplicateAction)}
                    >
                      <Play className="w-4 h-4" />
                      Remove Duplicates
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Invalid Formats Section */}
            <section
              id="invalid"
              ref={(el) => {
                sectionRefs.current["invalid"] = el
              }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Invalid Formats</h2>
                  <p className="text-sm text-muted-foreground">Fix incorrectly formatted data</p>
                </div>
                <Badge variant="secondary">
                  {invalidFormatColumns.reduce((a, c) => a + c.invalid, 0)} invalid entries
                </Badge>
              </div>

              {/* Column Filter */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-6">
                    <Label className="text-sm font-medium">Columns:</Label>
                    <RadioGroup
                      value={invalidFilterMode}
                      onValueChange={(v) => setInvalidFilterMode(v as "all" | "manual")}
                      className="flex items-center gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="invalid-all" />
                        <Label htmlFor="invalid-all" className="text-sm cursor-pointer">
                          Show all affected columns
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="manual" id="invalid-manual" />
                        <Label htmlFor="invalid-manual" className="text-sm cursor-pointer">
                          Manually select columns
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  {invalidFilterMode === "manual" && (
                    <div className="mt-4 max-h-40 pr-4 overflow-auto">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {invalidFormatColumns.map((col) => (
                          <div key={col.name} className="flex items-center gap-2">
                            <Checkbox
                              id={`invalid-${col.name}`}
                              checked={selectedInvalidColumns.includes(col.name)}
                              onCheckedChange={(checked) => {
                                setSelectedInvalidColumns(
                                  checked
                                    ? [...selectedInvalidColumns, col.name]
                                    : selectedInvalidColumns.filter((c) => c !== col.name),
                                )
                              }}
                            />
                            <Label htmlFor={`invalid-${col.name}`} className="text-sm cursor-pointer">
                              {col.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Invalid Format Cards */}
              <div className="space-y-4">
                {filteredInvalidColumns.map((col) => (
                  <Card key={col.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{col.name}</CardTitle>
                        <Badge variant="outline" className="font-normal">
                          {col.invalid} invalid entries
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Examples of invalid values:</Label>
                        <div className="flex flex-wrap gap-2">
                          {col.examples.map((ex, i) => (
                            <Badge key={i} variant="secondary" className="font-mono text-xs">
                              {ex}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Label className="text-sm font-medium">Convert to:</Label>
                        <Select
                          value={targetTypes[col.name] || ""}
                          onValueChange={(v) => setTargetTypes({ ...targetTypes, [col.name]: v })}
                        >
                          <SelectTrigger className="w-40 h-9">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">String</SelectItem>
                            <SelectItem value="email">Valid Email</SelectItem>
                            <SelectItem value="phone">Phone Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="drop">Drop Invalid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 bg-transparent"
                          onClick={() => handlePreview(col.name, "Format Preview")}
                        >
                          <Eye className="w-4 h-4" />
                          Preview Changes
                        </Button>
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => handleApplyAction(col.name, "Format Fix", targetTypes[col.name])}
                        >
                          <Play className="w-4 h-4" />
                          Apply Fix
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Outliers Section */}
            <section
              id="outliers"
              ref={(el) => {
                sectionRefs.current["outliers"] = el
              }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Outliers</h2>
                  <p className="text-sm text-muted-foreground">Detect and handle outlier values</p>
                </div>
                <Badge variant="secondary">
                  {outlierColumns.reduce((a, c) => a + c.outliers, 0)} outliers detected
                </Badge>
              </div>

              {/* Column Filter */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-6">
                    <Label className="text-sm font-medium">Columns:</Label>
                    <RadioGroup
                      value={outlierFilterMode}
                      onValueChange={(v) => setOutlierFilterMode(v as "all" | "manual")}
                      className="flex items-center gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="outlier-all" />
                        <Label htmlFor="outlier-all" className="text-sm cursor-pointer">
                          Show all affected columns
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="manual" id="outlier-manual" />
                        <Label htmlFor="outlier-manual" className="text-sm cursor-pointer">
                          Manually select columns
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  {outlierFilterMode === "manual" && (
                    <div className="mt-4 max-h-40 pr-4 overflow-auto">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {outlierColumns.map((col) => (
                          <div key={col.name} className="flex items-center gap-2">
                            <Checkbox
                              id={`outlier-${col.name}`}
                              checked={selectedOutlierColumns.includes(col.name)}
                              onCheckedChange={(checked) => {
                                setSelectedOutlierColumns(
                                  checked
                                    ? [...selectedOutlierColumns, col.name]
                                    : selectedOutlierColumns.filter((c) => c !== col.name),
                                )
                              }}
                            />
                            <Label htmlFor={`outlier-${col.name}`} className="text-sm cursor-pointer">
                              {col.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Outlier Cards */}
              <div className="space-y-4">
                {filteredOutlierColumns.map((col) => (
                  <Card key={col.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{col.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {col.outliers} outliers
                          </Badge>
                          <Badge variant="secondary" className="font-normal">
                            {col.method}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-muted-foreground">
                          Min: <span className="text-destructive font-mono">{col.min}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Max: <span className="text-destructive font-mono">{col.max}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Detection Method</Label>
                          <Select
                            value={outlierMethods[col.name] || col.method}
                            onValueChange={(v) => setOutlierMethods({ ...outlierMethods, [col.name]: v })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="IQR">IQR (Interquartile Range)</SelectItem>
                              <SelectItem value="Z-score">Z-score</SelectItem>
                              <SelectItem value="MAD">MAD (Median Absolute Deviation)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Action</Label>
                          <Select
                            value={outlierActions[col.name] || "clip"}
                            onValueChange={(v) => setOutlierActions({ ...outlierActions, [col.name]: v })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="clip">Clip to bounds</SelectItem>
                              <SelectItem value="remove">Remove outlier rows</SelectItem>
                              <SelectItem value="median">Replace with median</SelectItem>
                              <SelectItem value="mean">Replace with mean</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 bg-transparent"
                          onClick={() => handlePreview(col.name, "Outlier Preview")}
                        >
                          <Eye className="w-4 h-4" />
                          Preview Changes
                        </Button>
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => handleApplyAction(col.name, "Outlier Fix", outlierActions[col.name] || "clip")}
                        >
                          <Play className="w-4 h-4" />
                          Apply Fix
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
