"use client"

/**
 * Outliers Card
 *
 * IMPORTANT: No mock data. Shows empty state until backend provides data.
 * Backend is the single source of truth.
 */

import { useState } from "react"
import { AlertTriangle, Database, Eye, Filter, Info, Play } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CleaningRequest } from "@/types/dataCleaning"

interface OutlierColumn {
  name: string
  outlierCount: number
  min: number
  max: number
  mean: number
  median: number
  q1: number
  q3: number
}

interface OutliersCardProps {
  datasetId: string
  columns?: OutlierColumn[]
  selectedColumns?: string[]
  onPreview?: (request: CleaningRequest) => Promise<any>
  onApply?: (request: CleaningRequest) => Promise<any>
}

export function OutliersCard({
  datasetId,
  columns = [],
  selectedColumns = [],
  onPreview,
  onApply,
}: OutliersCardProps) {
  const [detectionMethods, setDetectionMethods] = useState<Record<string, "IQR" | "Z-Score">>({})
  const [actions, setActions] = useState<Record<string, "cap" | "remove" | "ignore">>({})
  const [previewedColumns, setPreviewedColumns] = useState<Set<string>>(new Set())

  // Filter: Only show selected numeric columns
  const filteredColumns =
    selectedColumns.length === 0 ? columns : columns.filter((col) => selectedColumns.includes(col.name))

  const handleApply = async (column: OutlierColumn) => {
    if (!onApply) return

    const method = detectionMethods[column.name] || "IQR"
    const action = actions[column.name] || "cap"

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "outliers",
      column: column.name,
      action: action === "ignore" ? "ignore" : action === "cap" ? "cap" : "remove",
      parameters: {
        method: method,
      },
      preview: false,
    }

    try {
      await onApply(request)
    } catch (error) {
      console.error("Failed to apply outlier action:", error)
    }
  }

  const handlePreview = async (column: OutlierColumn) => {
    if (!onPreview) return

    setPreviewedColumns((prev) => new Set(prev).add(column.name))

    const method = detectionMethods[column.name] || "IQR"
    const action = actions[column.name] || "cap"

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "outliers",
      column: column.name,
      action: action === "ignore" ? "ignore" : action === "cap" ? "cap" : "remove",
      parameters: {
        method: method,
      },
      preview: true,
    }

    try {
      await onPreview(request)
    } catch (error) {
      console.error("Failed to preview outlier action:", error)
    }
  }

  const getDefaultMethod = (column: OutlierColumn) => {
    return detectionMethods[column.name] || "IQR"
  }

  const getDefaultAction = (column: OutlierColumn) => {
    return actions[column.name] || "cap"
  }

  const canApply = (column: OutlierColumn) => {
    const action = getDefaultAction(column)
    if (action === "remove" && !previewedColumns.has(column.name)) return false
    return true
  }

  if (columns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            Outliers
          </CardTitle>
          <CardDescription>Detect and handle outlier values in numeric columns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No outliers detected in numeric columns.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (filteredColumns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            Outliers
          </CardTitle>
          <CardDescription>Detect and handle outlier values in numeric columns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No data available. Upload or connect a dataset to begin.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-muted-foreground" />
              Outliers
            </CardTitle>
            <CardDescription>Detect and handle outlier values in numeric columns</CardDescription>
          </div>
          <Badge variant="secondary">
            {filteredColumns.reduce((sum, col) => sum + col.outlierCount, 0)} outliers detected
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {filteredColumns.map((column) => {
            const method = getDefaultMethod(column)
            const action = getDefaultAction(column)
            const hasPreviewed = previewedColumns.has(column.name)
            const canApplyAction = canApply(column)

            return (
              <div key={column.name} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold">{column.name}</h3>
                    <p className="text-sm text-muted-foreground">Numeric column with detected outliers</p>
                  </div>
                  <Badge variant="outline">{column.outlierCount} outliers</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Value</Label>
                    <p className="font-mono text-destructive font-semibold">{column.min}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Value</Label>
                    <p className="font-mono text-destructive font-semibold">{column.max}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Mean</Label>
                    <p className="font-mono">{column.mean.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Median</Label>
                    <p className="font-mono">{column.median.toFixed(2)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Outlier Detection Method</Label>
                    <Select
                      value={method}
                      onValueChange={(v) =>
                        setDetectionMethods({ ...detectionMethods, [column.name]: v as "IQR" | "Z-Score" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IQR">
                          <div className="flex flex-col">
                            <span>IQR (Interquartile Range)</span>
                            <span className="text-xs text-muted-foreground">
                              Values outside Q1 - 1.5×IQR and Q3 + 1.5×IQR
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="Z-Score">
                          <div className="flex flex-col">
                            <span>Z-Score</span>
                            <span className="text-xs text-muted-foreground">
                              Values with |z-score| &gt; 3 standard deviations
                            </span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-2 block">Action</Label>
                    <RadioGroup
                      value={action}
                      onValueChange={(v) => {
                        setActions({ ...actions, [column.name]: v as "cap" | "remove" | "ignore" })
                        setPreviewedColumns((prev) => {
                          const next = new Set(prev)
                          next.delete(column.name)
                          return next
                        })
                      }}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="cap" id={`${column.name}-cap`} />
                          <Label htmlFor={`${column.name}-cap`} className="cursor-pointer">
                            Cap outliers
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground ml-6">
                          Replace outliers with min/max bounds (preserves data distribution)
                        </p>

                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="remove" id={`${column.name}-remove`} />
                          <Label htmlFor={`${column.name}-remove`} className="cursor-pointer">
                            Remove outliers
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground ml-6">
                          Delete rows containing outlier values (may reduce dataset size)
                        </p>
                        {action === "remove" && (
                          <Alert variant="destructive" className="ml-6">
                            <AlertTriangle className="w-4 h-4" />
                            <AlertDescription className="text-xs">
                              <strong>Warning:</strong> This will remove {column.outlierCount} row
                              {column.outlierCount !== 1 ? "s" : ""} from your dataset. Preview changes before
                              applying.
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="ignore" id={`${column.name}-ignore`} />
                          <Label htmlFor={`${column.name}-ignore`} className="cursor-pointer">
                            Ignore
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground ml-6">
                          Keep outliers as-is (may affect analysis results)
                        </p>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    Outlier removal may significantly impact your analysis. Preview changes before applying.
                  </AlertDescription>
                </Alert>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(column)}
                    className="gap-2"
                    disabled={!action}
                  >
                    <Eye className="w-4 h-4" />
                    {hasPreviewed ? "Previewed" : "Preview Changes"}
                  </Button>
                  <Button size="sm" onClick={() => handleApply(column)} disabled={!canApplyAction} className="gap-2">
                    <Play className="w-4 h-4" />
                    Apply Action
                  </Button>
                  {!canApplyAction && action === "remove" && (
                    <p className="text-xs text-muted-foreground ml-auto">Please preview changes before applying</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
