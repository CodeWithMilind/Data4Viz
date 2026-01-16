"use client"

/**
 * Duplicates Card
 *
 * IMPORTANT: No mock data. Shows empty state until backend provides data.
 * Backend is the single source of truth.
 */

import { useState } from "react"
import { AlertTriangle, Copy, Database, Eye, Play } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CleaningRequest } from "@/types/dataCleaning"

interface DuplicatesCardProps {
  datasetId: string
  totalRows?: number
  duplicateCount?: number
  duplicatePercentage?: number
  availableColumns?: string[]
  onPreview?: (request: CleaningRequest) => Promise<any>
  onApply?: (request: CleaningRequest) => Promise<any>
}

export function DuplicatesCard({
  datasetId,
  totalRows,
  duplicateCount,
  duplicatePercentage,
  availableColumns = [],
  onPreview,
  onApply,
}: DuplicatesCardProps) {
  const [detectionMode, setDetectionMode] = useState<"all" | "selected">("all")
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [removalStrategy, setRemovalStrategy] = useState<"keep-first" | "keep-last" | "remove-all">("keep-first")
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column],
    )
  }

  const handleApply = async () => {
    if (!onApply) return

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "duplicates",
      columns: detectionMode === "all" ? undefined : selectedColumns,
      action: removalStrategy,
      preview: false,
    }

    try {
      await onApply(request)
    } catch (error) {
      console.error("Failed to apply duplicate removal:", error)
    }
  }

  const handlePreview = async () => {
    if (!onPreview) return

    setShowPreview(true)

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "duplicates",
      columns: detectionMode === "all" ? undefined : selectedColumns,
      action: removalStrategy,
      preview: true,
    }

    try {
      const response = await onPreview(request)
      setPreviewData(response.before_sample || [])
    } catch (error) {
      console.error("Failed to preview duplicate removal:", error)
    }
  }

  const canApply = detectionMode === "all" || (detectionMode === "selected" && selectedColumns.length > 0)

  // Show empty state if no data available
  if (totalRows === undefined || duplicateCount === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-muted-foreground" />
            Duplicates
          </CardTitle>
          <CardDescription>Detect and remove duplicate rows from your dataset</CardDescription>
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
              <Copy className="w-5 h-5 text-muted-foreground" />
              Duplicates
            </CardTitle>
            <CardDescription>Detect and remove duplicate rows from your dataset</CardDescription>
          </div>
          <Badge variant="secondary">
            {duplicateCount} duplicates ({duplicatePercentage?.toFixed(1) || 0}%)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Rows</p>
            <p className="text-2xl font-semibold">{totalRows.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Duplicate Rows</p>
            <p className="text-2xl font-semibold text-destructive">{duplicateCount}</p>
          </div>
        </div>

        {/* Detection Options */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Duplicate Detection</Label>
          <RadioGroup value={detectionMode} onValueChange={(v) => setDetectionMode(v as "all" | "selected")}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="dup-all-cols" />
              <Label htmlFor="dup-all-cols" className="cursor-pointer">
                All columns
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="selected" id="dup-selected-cols" />
              <Label htmlFor="dup-selected-cols" className="cursor-pointer">
                Selected columns
              </Label>
            </div>
          </RadioGroup>

          {detectionMode === "selected" && (
            <div className="ml-6 p-4 border rounded-md bg-muted/30">
              <Label className="text-xs text-muted-foreground mb-3 block">
                Select columns to check for duplicates:
              </Label>
              {availableColumns.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableColumns.map((col) => (
                    <div key={col} className="flex items-center gap-2">
                      <Checkbox
                        id={`dup-col-${col}`}
                        checked={selectedColumns.includes(col)}
                        onCheckedChange={() => handleColumnToggle(col)}
                      />
                      <Label htmlFor={`dup-col-${col}`} className="text-sm cursor-pointer">
                        {col}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No columns available</p>
              )}
              {selectedColumns.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">Select at least one column</p>
              )}
            </div>
          )}
        </div>

        {/* Removal Strategy */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Removal Strategy</Label>
          <RadioGroup
            value={removalStrategy}
            onValueChange={(v) => setRemovalStrategy(v as "keep-first" | "keep-last" | "remove-all")}
            className="space-y-3"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="keep-first" id="dup-keep-first" />
                <Label htmlFor="dup-keep-first" className="cursor-pointer font-medium">
                  Keep first occurrence (default)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Removes duplicate rows, keeping the first occurrence of each duplicate set.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="keep-last" id="dup-keep-last" />
                <Label htmlFor="dup-keep-last" className="cursor-pointer font-medium">
                  Keep last occurrence
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Removes duplicate rows, keeping the last occurrence of each duplicate set.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="remove-all" id="dup-remove-all" />
                <Label htmlFor="dup-remove-all" className="cursor-pointer font-medium">
                  Remove all duplicate rows
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Removes all rows that are part of a duplicate set, including the first occurrence.
              </p>
              {removalStrategy === "remove-all" && (
                <Alert variant="destructive" className="ml-6 mt-2">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    <strong>Strong Warning:</strong> This will remove ALL rows that have duplicates, including the first
                    occurrence. This may result in significant data loss ({duplicateCount} rows will be removed).
                    Preview changes before applying.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </RadioGroup>
        </div>

        {/* Preview Table */}
        {showPreview && previewData.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Preview Duplicate Rows</Label>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(previewData[0] || {}).map((key) => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, idx) => (
                    <TableRow key={idx}>
                      {Object.values(row).map((value: any, colIdx) => (
                        <TableCell key={colIdx}>{String(value ?? "")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* General Warning */}
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Removing duplicates may result in data loss. Always preview changes before applying.
          </AlertDescription>
        </Alert>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={handlePreview} className="gap-2" disabled={!canApply}>
            <Eye className="w-4 h-4" />
            {showPreview ? "Hide" : "Show"} Preview
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!canApply} className="gap-2">
            <Play className="w-4 h-4" />
            Remove Duplicates
          </Button>
          {!canApply && (
            <p className="text-xs text-muted-foreground ml-auto">
              {detectionMode === "selected" && selectedColumns.length === 0
                ? "Select at least one column"
                : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
