"use client"

import { useState } from "react"
import { Filter, Play, Eye, AlertTriangle, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  columns?: OutlierColumn[]
  onAction?: (columnName: string, method: string, action: string) => void
}

// Mock data
const mockColumns: OutlierColumn[] = [
  {
    name: "Age",
    outlierCount: 45,
    min: -5,
    max: 150,
    mean: 35.2,
    median: 34,
    q1: 28,
    q3: 42,
  },
  {
    name: "Salary",
    outlierCount: 32,
    min: -1000,
    max: 999999,
    mean: 65000,
    median: 62000,
    q1: 45000,
    q3: 80000,
  },
  {
    name: "Experience",
    outlierCount: 12,
    min: -2,
    max: 50,
    mean: 8.5,
    median: 7,
    q1: 3,
    q3: 12,
  },
]

export function OutliersCard({ columns = mockColumns, onAction }: OutliersCardProps) {
  const [detectionMethods, setDetectionMethods] = useState<Record<string, "IQR" | "Z-Score">>({})
  const [actions, setActions] = useState<Record<string, "cap" | "remove" | "ignore">>({})

  const handleApply = (column: OutlierColumn) => {
    const method = detectionMethods[column.name] || "IQR"
    const action = actions[column.name] || "cap"
    onAction?.(column.name, method, action)
  }

  const handlePreview = (column: OutlierColumn) => {
    // Placeholder preview handler
    console.log("Preview outliers for", column.name)
  }

  const getDefaultMethod = (column: OutlierColumn) => {
    return detectionMethods[column.name] || "IQR"
  }

  const getDefaultAction = (column: OutlierColumn) => {
    return actions[column.name] || "cap"
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
            {columns.reduce((sum, col) => sum + col.outlierCount, 0)} outliers detected
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {columns.map((column) => {
            const method = getDefaultMethod(column)
            const action = getDefaultAction(column)

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
                      onValueChange={(v) => setActions({ ...actions, [column.name]: v as "cap" | "remove" | "ignore" })}
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

                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => handlePreview(column)} className="gap-2">
                    <Eye className="w-4 h-4" />
                    Preview Changes
                  </Button>
                  <Button size="sm" onClick={() => handleApply(column)} className="gap-2">
                    <Play className="w-4 h-4" />
                    Apply Action
                  </Button>
                </div>
              </div>
            )
          })}

          {columns.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Info className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No numeric columns with outliers detected</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
