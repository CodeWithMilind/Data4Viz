"use client"

import { useState, useEffect, useMemo } from "react"
import { BarChart3, TrendingUp, BarChart } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspace } from "@/contexts/workspace-context"
import { getDatasetSchema, type ColumnSchema, type ChartIntent } from "@/lib/api/dataCleaningClient"
import { runVizion } from "@/lib/vizionClient"
import { ChartCanvas } from "./chart-canvas"

const intents = [
  { id: "compare" as ChartIntent, name: "Compare", icon: BarChart3, description: "Compare values across categories" },
  { id: "trend" as ChartIntent, name: "Trend", icon: TrendingUp, description: "Show trends over time" },
  { id: "distribution" as ChartIntent, name: "Distribution", icon: BarChart, description: "Display data distribution" },
]

export function DataVisualizationPage() {
  const { currentWorkspace, activeWorkspaceId, getDatasets } = useWorkspace()
  const [selectedIntent, setSelectedIntent] = useState<ChartIntent | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("")
  const [chartData, setChartData] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [schema, setSchema] = useState<ColumnSchema[]>([])
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Vizion parameters
  const [vizParams, setVizParams] = useState<any>({
    chart_type: "bar",
    x_column: "",
    y_column: "",
    aggregation: "count",
    bins: 30,
  })

  const datasets = getDatasets()

  // Memoize prepared Vega-Lite spec to avoid unnecessary re-renders
  const preparedVegaSpec = useMemo(() => {
    if (!chartData) return null
    return chartData.vega_lite_spec || null
  }, [chartData, selectedDatasetId, datasets])

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

  // Run Vizion with current parameters and dataset rows
  const runVizionWithParams = async (params: any) => {
    if (!selectedDatasetId || !activeWorkspaceId) {
      setError("Please select a dataset first")
      return
    }

    const dataset = datasets.find((ds) => ds.id === selectedDatasetId)
    if (!dataset) {
      setError("Dataset not found")
      return
    }

    if (!dataset.data || dataset.data.length === 0) {
      setError("Dataset has no rows to visualize")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const vizOutput = await runVizion(params, dataset.data)
      if (!vizOutput || !vizOutput.vega_lite_spec) {
        setError("Vizion did not return a valid visualization")
        setChartData(null)
      } else {
        setChartData({
          insight_text: vizOutput.insight_text || null,
          vega_lite_spec: vizOutput.vega_lite_spec,
          ai_defaults: params,
        })
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
      setChartData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleIntentSelect = (intent: ChartIntent) => {
    setSelectedIntent(intent)
    setVizParams((p: any) => ({ ...p, chart_type: intent }))
  }

  // When schema loads, set reasonable defaults for x/y
  useEffect(() => {
    if (schema.length === 0) return
    setVizParams((p: any) => ({
      ...p,
      x_column: p.x_column || schema[0].name,
      y_column: p.y_column || (schema.find((c) => c.canonical_type === "numeric")?.name || schema[0].name),
    }))
  }, [schema])

  // Force aggregation to "count" for histogram charts
  useEffect(() => {
    if (vizParams.chart_type === "histogram" && vizParams.aggregation !== "count") {
      setVizParams((p: any) => ({ ...p, aggregation: "count" }))
    }
  }, [vizParams.chart_type])

  // apply params change immediately
  useEffect(() => {
    if (selectedDatasetId && mounted) {
      runVizionWithParams(vizParams)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizParams, selectedDatasetId, mounted])

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
                  {chartData ? "Vizion-generated visualization" : "Select an intent and dataset to generate a chart"}
                </CardDescription>
              </div>
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
              vegaLiteSpec={preparedVegaSpec}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>

        {/* Vizion Parameter Panel */}
        {selectedDatasetId && selectedIntent && (
          <Card>
            <CardHeader>
              <CardTitle>Vizion Parameters</CardTitle>
              <CardDescription>Adjust parameters to control Vizion's output. Changes run immediately.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Chart Type</label>
                  <Select value={vizParams.chart_type} onValueChange={(v) => setVizParams((p: any) => ({ ...p, chart_type: v }))}>
                    <SelectTrigger className="w-full max-w-xs mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="line">Line</SelectItem>
                      <SelectItem value="histogram">Histogram</SelectItem>
                      <SelectItem value="scatter">Scatter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">X Column</label>
                  <Select value={vizParams.x_column} onValueChange={(v) => setVizParams((p: any) => ({ ...p, x_column: v }))}>
                    <SelectTrigger className="w-full max-w-xs mt-2">
                      <SelectValue placeholder="Select X column" />
                    </SelectTrigger>
                    <SelectContent>
                      {schema.map((c) => (
                        <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Y Column</label>
                  <Select value={vizParams.y_column} onValueChange={(v) => setVizParams((p: any) => ({ ...p, y_column: v }))}>
                    <SelectTrigger className="w-full max-w-xs mt-2">
                      <SelectValue placeholder="Select Y column" />
                    </SelectTrigger>
                    <SelectContent>
                      {schema.map((c) => (
                        <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="text-sm font-medium">Aggregation</label>
                  {vizParams.chart_type === "histogram" ? (
                    <div className="mt-2 text-sm">Count (forced for histogram)</div>
                  ) : (
                    <Select value={vizParams.aggregation} onValueChange={(v) => setVizParams((p: any) => ({ ...p, aggregation: v }))}>
                      <SelectTrigger className="w-full max-w-xs mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="mean">Mean</SelectItem>
                        <SelectItem value="median">Median</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Bins</label>
                  <input
                    className="mt-2 p-2 border rounded w-24"
                    type="number"
                    min={1}
                    value={vizParams.bins}
                    onChange={(e) => setVizParams((p: any) => ({ ...p, bins: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
