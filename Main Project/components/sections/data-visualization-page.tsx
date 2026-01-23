"use client"

import { useState, useEffect } from "react"
import { BarChart3, TrendingUp, BarChart, Settings } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspace } from "@/contexts/workspace-context"
import { 
  generateChart, 
  getDatasetSchema, 
  type ChartIntent, 
  type ChartOverrides,
  type ChartGenerationResponse,
  type ColumnSchema,
} from "@/lib/api/dataCleaningClient"
import { ChartCanvas } from "./chart-canvas"
import { ChartControls } from "./chart-controls"

const intents = [
  { 
    id: "compare" as ChartIntent, 
    name: "Compare", 
    icon: BarChart3, 
    description: "Compare values across categories" 
  },
  { 
    id: "trend" as ChartIntent, 
    name: "Trend", 
    icon: TrendingUp, 
    description: "Show trends over time" 
  },
  { 
    id: "distribution" as ChartIntent, 
    name: "Distribution", 
    icon: BarChart, 
    description: "Display data distribution" 
  },
]

export function DataVisualizationPage() {
  const { currentWorkspace, activeWorkspaceId, getDatasets } = useWorkspace()
  const [selectedIntent, setSelectedIntent] = useState<ChartIntent | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("")
  const [chartData, setChartData] = useState<ChartGenerationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [schema, setSchema] = useState<ColumnSchema[]>([])
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const datasets = getDatasets()

  // Prevent hydration mismatch: only fetch after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load schema when dataset is selected (only after mount)
  useEffect(() => {
    if (!mounted || !selectedDatasetId || !activeWorkspaceId) {
      setSchema([])
      return
    }

    const loadSchema = async () => {
      setIsLoadingSchema(true)
      try {
        const dataset = datasets.find((ds) => ds.id === selectedDatasetId)
        if (!dataset) {
          setSchema([])
          return
        }

        const schemaResponse = await getDatasetSchema(
          activeWorkspaceId,
          dataset.fileName,
          true
        )
        if (schemaResponse) {
          setSchema(schemaResponse.columns)
        }
      } catch (err) {
        console.error("Error loading schema:", err)
        setSchema([])
      } finally {
        setIsLoadingSchema(false)
      }
    }

    loadSchema()
  }, [mounted, selectedDatasetId, activeWorkspaceId, datasets])

  // Generate chart when intent and dataset are selected
  const handleGenerateChart = async (intent: ChartIntent, overrides?: ChartOverrides) => {
    if (!selectedDatasetId || !activeWorkspaceId) {
      setError("Please select a dataset first")
      return
    }

    const dataset = datasets.find((ds) => ds.id === selectedDatasetId)
    if (!dataset) {
      setError("Dataset not found")
      return
    }

    setIsLoading(true)
    setError(null)
    setShowControls(false)

    try {
      const response = await generateChart(
        activeWorkspaceId,
        dataset.fileName,
        intent,
        overrides
      )
      setChartData(response)
      setSelectedIntent(intent)
    } catch (err) {
      console.error("Error generating chart:", err)
      setError(err instanceof Error ? err.message : "Failed to generate chart")
      setChartData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleIntentSelect = (intent: ChartIntent) => {
    setSelectedIntent(intent)
    if (selectedDatasetId && activeWorkspaceId) {
      handleGenerateChart(intent)
    }
  }

  const handleApplyOverrides = (overrides: ChartOverrides) => {
    if (selectedIntent) {
      handleGenerateChart(selectedIntent, overrides)
    }
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Data Visualization</span>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6">
        {/* Dataset Selection */}
        {currentWorkspace && (
          <Card>
            <CardHeader>
              <CardTitle>Select Dataset</CardTitle>
              <CardDescription>Choose a dataset to visualize</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Select a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.length === 0 ? (
                    <SelectItem value="no-datasets" disabled>
                      No datasets available
                    </SelectItem>
                  ) : (
                    datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name} ({dataset.rowCount.toLocaleString()} rows)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Intent Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {intents.map((intent) => {
            const Icon = intent.icon
            const isSelected = selectedIntent === intent.id
            return (
              <Card
                key={intent.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => handleIntentSelect(intent.id)}
              >
                <CardHeader className="text-center pb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-base">{intent.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center">{intent.description}</CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Error Message */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Chart Canvas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Chart Canvas</CardTitle>
                <CardDescription>
                  {chartData
                    ? "AI-generated visualization"
                    : "Select an intent and dataset to generate a chart"}
                </CardDescription>
              </div>
              {chartData && !showControls && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowControls(true)}
                  className="gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Customize chart
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Insight Text */}
            {chartData?.insight_text && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm text-foreground">{chartData.insight_text}</p>
              </div>
            )}

            {/* Chart */}
            <ChartCanvas
              vegaLiteSpec={chartData?.vega_lite_spec || null}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>

        {/* Chart Controls Panel */}
        {showControls && chartData && schema.length > 0 && (
          <ChartControls
            aiDefaults={chartData.ai_defaults}
            columns={schema}
            chartType={chartData.ai_defaults.chart_type}
            onApply={(overrides) => {
              handleApplyOverrides(overrides)
              setShowControls(false)
            }}
            onCancel={() => setShowControls(false)}
          />
        )}
      </div>
    </main>
  )
}
