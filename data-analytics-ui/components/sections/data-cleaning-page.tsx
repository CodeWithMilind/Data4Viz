"use client"

import { useState, useRef, useEffect } from "react"
import { Wrench, Database, CheckCircle2, AlertCircle, Copy, AlertTriangle, Filter, History } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MissingValuesCard } from "./data-cleaning/missing-values-card"
import { DuplicatesCard } from "./data-cleaning/duplicates-card"
import { ColumnQualitySummary } from "./data-cleaning/column-quality-summary"
import { InvalidFormatsCard } from "./data-cleaning/invalid-formats-card"
import { OutliersCard } from "./data-cleaning/outliers-card"
import { CleaningHistoryPanel } from "./data-cleaning/cleaning-history-panel"

const availableDatasets = [
  { id: "1", name: "sales_data.csv", rows: 1950, columns: 12 },
  { id: "2", name: "customer_info.csv", rows: 5420, columns: 8 },
  { id: "3", name: "product_inventory.csv", rows: 890, columns: 15 },
  { id: "4", name: "employee_records.csv", rows: 234, columns: 10 },
]

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
  const [selectedDataset, setSelectedDataset] = useState<string>("1")
  const [activeSection, setActiveSection] = useState("quality")
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Scroll sync
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      let currentSection = "quality"

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
  }, [selectedDataset])

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

  const handleColumnClick = (columnName: string, issueType: string) => {
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

  const handleAction = (columnName: string, actionType: string, value?: string) => {
    onApplyCleaningAction?.({ columnName, actionType, value })
  }

  const handleDuplicateAction = (actionType: string, columns?: string[]) => {
    onApplyCleaningAction?.({
      columnName: columns ? columns.join(", ") : "All",
      actionType: `duplicate_${actionType}`,
    })
  }

  const handleOutlierAction = (columnName: string, method: string, action: string) => {
    onApplyCleaningAction?.({
      columnName,
      actionType: `outlier_${action}`,
      value: method,
    })
  }

  const handleInvalidFormatAction = (columnName: string, actionType: string) => {
    onApplyCleaningAction?.({
      columnName,
      actionType: `format_${actionType}`,
    })
  }

  const handleUndo = (actionId: string) => {
    // Placeholder undo handler
    console.log("Undo action", actionId)
  }

  const handleReset = () => {
    // Placeholder reset handler
    console.log("Reset dataset")
  }

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
                {currentDataset.rows.toLocaleString()} rows • {currentDataset.columns} columns
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
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* Column Quality Summary - KEY SECTION */}
            <section
              id="quality"
              ref={(el) => {
                sectionRefs.current["quality"] = el
              }}
              className="space-y-4"
            >
              <ColumnQualitySummary onColumnClick={handleColumnClick} />
            </section>

            {/* Missing Values Section */}
            <section
              id="missing"
              ref={(el) => {
                sectionRefs.current["missing"] = el
              }}
              className="space-y-4"
            >
              <MissingValuesCard onAction={handleAction} />
            </section>

            {/* Duplicates Section */}
            <section
              id="duplicates"
              ref={(el) => {
                sectionRefs.current["duplicates"] = el
              }}
              className="space-y-4"
            >
              <DuplicatesCard
                totalRows={currentDataset?.rows || 1950}
                duplicateCount={12}
                duplicatePercentage={0.6}
                availableColumns={["Name", "Email", "Age", "Department", "Salary", "Location"]}
                onAction={handleDuplicateAction}
              />
            </section>

            {/* Invalid Formats Section */}
            <section
              id="invalid"
              ref={(el) => {
                sectionRefs.current["invalid"] = el
              }}
              className="space-y-4"
            >
              <InvalidFormatsCard onAction={handleInvalidFormatAction} />
            </section>

            {/* Outliers Section */}
            <section
              id="outliers"
              ref={(el) => {
                sectionRefs.current["outliers"] = el
              }}
              className="space-y-4"
            >
              <OutliersCard onAction={handleOutlierAction} />
            </section>

            {/* Cleaning History Section */}
            <section
              id="history"
              ref={(el) => {
                sectionRefs.current["history"] = el
              }}
              className="space-y-4"
            >
              <CleaningHistoryPanel onUndo={handleUndo} onReset={handleReset} />
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
