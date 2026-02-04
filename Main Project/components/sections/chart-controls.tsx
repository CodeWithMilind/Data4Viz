"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import type { ChartOverrides } from "@/lib/api/dataCleaningClient"
import type { ColumnSchema } from "@/lib/api/dataCleaningClient"

interface ChartControlsProps {
  aiDefaults: {
    chart_type: string
    x: string
    y: string
    aggregation: "sum" | "avg" | "count"
    params?: Record<string, any>
  }
  columns: ColumnSchema[]
  chartType: string
  onApply: (overrides: ChartOverrides) => void
  onCancel?: () => void
}

/**
 * ChartControls component
 * 
 * Provides manual customization options for AI-generated charts.
 * All options show AI recommendations and only allow valid alternatives.
 */
export function ChartControls({
  aiDefaults,
  columns,
  chartType,
  onApply,
  onCancel,
}: ChartControlsProps) {
  const [selectedChartType, setSelectedChartType] = useState(chartType)
  const [selectedX, setSelectedX] = useState(aiDefaults.x)
  const [selectedY, setSelectedY] = useState(aiDefaults.y)
  const [selectedAggregation, setSelectedAggregation] = useState<"sum" | "avg" | "count">(aiDefaults.aggregation)
  const [params, setParams] = useState(aiDefaults.params || {})

  // Update state when props change (e.g., after applying overrides)
  useEffect(() => {
    setSelectedChartType(chartType)
    setSelectedX(aiDefaults.x)
    setSelectedY(aiDefaults.y)
    setSelectedAggregation(aiDefaults.aggregation)
    setParams(aiDefaults.params || {})
  }, [chartType, aiDefaults])

  // Get valid chart types based on current selection
  const validChartTypes = ["bar", "line", "scatter", "histogram", "pie"]

  // Get valid columns for X axis (based on chart type)
  const getValidXColumns = () => {
    if (selectedChartType === "bar" || selectedChartType === "pie") {
      return columns.filter((col) => col.canonical_type === "categorical" || col.canonical_type === "datetime")
    }
    if (selectedChartType === "line") {
      return columns.filter((col) => col.canonical_type === "datetime" || col.canonical_type === "categorical")
    }
    if (selectedChartType === "histogram") {
      return columns.filter((col) => col.canonical_type === "numeric")
    }
    return columns
  }

  // Get valid columns for Y axis (numeric only)
  const validYColumns = columns.filter((col) => col.canonical_type === "numeric")

  const handleApply = () => {
    const overrides: ChartOverrides = {
      chart_type: selectedChartType !== aiDefaults.chart_type ? selectedChartType : undefined,
      x: selectedX !== aiDefaults.x ? selectedX : undefined,
      y: selectedY !== aiDefaults.y ? selectedY : undefined,
      aggregation: selectedAggregation !== aiDefaults.aggregation ? selectedAggregation : undefined,
      params: Object.keys(params).length > 0 ? params : undefined,
    }

    // Remove undefined values
    Object.keys(overrides).forEach((key) => {
      if (overrides[key as keyof ChartOverrides] === undefined) {
        delete overrides[key as keyof ChartOverrides]
      }
    })

    onApply(overrides)
  }

  const showBarParams = selectedChartType === "bar"
  const showLineParams = selectedChartType === "line"
  const showDistributionParams = selectedChartType === "histogram"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chart Type */}
        <div className="space-y-2">
          <Label htmlFor="chart-type">Chart Type</Label>
          <Select value={selectedChartType} onValueChange={setSelectedChartType}>
            <SelectTrigger id="chart-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {validChartTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            AI recommended: {aiDefaults.chart_type}
          </p>
        </div>

        {/* X-Axis Column */}
        <div className="space-y-2">
          <Label htmlFor="x-axis">X-Axis Column</Label>
          <Select value={selectedX} onValueChange={setSelectedX}>
            <SelectTrigger id="x-axis">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getValidXColumns().map((col) => (
                <SelectItem key={col.name} value={col.name}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            AI recommended: {aiDefaults.x}
          </p>
        </div>

        {/* Y-Axis Column */}
        <div className="space-y-2">
          <Label htmlFor="y-axis">Y-Axis Column</Label>
          <Select value={selectedY} onValueChange={setSelectedY}>
            <SelectTrigger id="y-axis">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {validYColumns.map((col) => (
                <SelectItem key={col.name} value={col.name}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            AI recommended: {aiDefaults.y}
          </p>
        </div>

        {/* Aggregation */}
        <div className="space-y-2">
          <Label htmlFor="aggregation">Aggregation</Label>
          {selectedChartType === "histogram" ? (
            <div className="relative">
              <div className="px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground text-sm">
                Count (forced for histogram)
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Histograms always use count aggregation
              </p>
            </div>
          ) : (
            <Select value={selectedAggregation} onValueChange={(value) => setSelectedAggregation(value as "sum" | "avg" | "count")}>
              <SelectTrigger id="aggregation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="avg">Average</SelectItem>
                <SelectItem value="count">Count</SelectItem>
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            AI recommended: {aiDefaults.aggregation}
          </p>
        </div>

        {/* Bar Chart Parameters */}
        {showBarParams && (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="orientation">Orientation</Label>
              <Select
                value={params.orientation || "vertical"}
                onValueChange={(value) => setParams({ ...params, orientation: value as "vertical" | "horizontal" })}
              >
                <SelectTrigger id="orientation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical">Vertical</SelectItem>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort-order">Sort Order</Label>
              <Select
                value={params.sort || "desc"}
                onValueChange={(value) => setParams({ ...params, sort: value as "asc" | "desc" })}
              >
                <SelectTrigger id="sort-order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="top-n">Top N (optional)</Label>
              <Input
                id="top-n"
                type="number"
                min="1"
                value={params.top_n || ""}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : undefined
                  setParams({ ...params, top_n: value })
                }}
                placeholder="Show top N items"
              />
            </div>
          </div>
        )}

        {/* Line Chart Parameters */}
        {showLineParams && (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="time-granularity">Time Granularity</Label>
              <Select
                value={params.time_granularity || "day"}
                onValueChange={(value) => setParams({ ...params, time_granularity: value })}
              >
                <SelectTrigger id="time-granularity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="smoothing">Smoothing</Label>
              <Switch
                id="smoothing"
                checked={params.smoothing || false}
                onCheckedChange={(checked) => setParams({ ...params, smoothing: checked })}
              />
            </div>
          </div>
        )}

        {/* Distribution Chart Parameters */}
        {showDistributionParams && (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="bins">Bins: {params.bins || 30}</Label>
              <Slider
                id="bins"
                min={10}
                max={100}
                step={5}
                value={[params.bins || 30]}
                onValueChange={([value]) => setParams({ ...params, bins: value })}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleApply} className="flex-1">
            Apply Changes
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
