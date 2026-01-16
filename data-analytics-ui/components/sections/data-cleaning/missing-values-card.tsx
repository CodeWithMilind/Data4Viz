"use client"

/**
 * Missing Values Card
 *
 * IMPORTANT: No mock data. Shows empty state until backend provides data.
 * Backend is the single source of truth.
 */

import { useState } from "react"
import { AlertCircle, Database, Eye, Filter, Info, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CleaningRequest } from "@/types/dataCleaning"

interface MissingValueColumn {
  name: string
  dataType: string
  missingCount: number
  missingPercentage: number
}

interface MissingValuesCardProps {
  datasetId: string
  columns?: MissingValueColumn[]
  selectedColumns?: string[]
  onPreview?: (request: CleaningRequest) => Promise<any>
  onApply?: (request: CleaningRequest) => Promise<any>
}

export function MissingValuesCard({
  datasetId,
  columns = [],
  selectedColumns = [],
  onPreview,
  onApply,
}: MissingValuesCardProps) {
  const [selectedActions, setSelectedActions] = useState<Record<string, { action: string; customValue: string }>>({})
  const [previewedColumns, setPreviewedColumns] = useState<Set<string>>(new Set())

  // Filter: Only show selected columns
  const filteredColumns =
    selectedColumns.length === 0 ? columns : columns.filter((col) => selectedColumns.includes(col.name))

  const handleActionChange = (columnName: string, action: string) => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: { ...prev[columnName], action, customValue: prev[columnName]?.customValue || "" },
    }))
    setPreviewedColumns((prev) => {
      const next = new Set(prev)
      next.delete(columnName)
      return next
    })
  }

  const handleCustomValueChange = (columnName: string, value: string) => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: { ...prev[columnName], action: "custom", customValue: value },
    }))
  }

  const handleApply = async (column: MissingValueColumn) => {
    const action = selectedActions[column.name]
    if (!action || !onApply) return

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "missing_values",
      column: column.name,
      action: action.action === "custom" ? "fill_custom" : action.action,
      parameters:
        action.action === "custom"
          ? { custom_value: action.customValue }
          : action.action === "drop_rows"
            ? {}
            : {},
      preview: false,
    }

    try {
      await onApply(request)
    } catch (error) {
      console.error("Failed to apply missing values fix:", error)
    }
  }

  const handlePreview = async (column: MissingValueColumn) => {
    const action = selectedActions[column.name]
    if (!action || !onPreview) return

    setPreviewedColumns((prev) => new Set(prev).add(column.name))

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "missing_values",
      column: column.name,
      action: action.action === "custom" ? "fill_custom" : action.action,
      parameters:
        action.action === "custom"
          ? { custom_value: action.customValue }
          : action.action === "drop_rows"
            ? {}
            : {},
      preview: true,
    }

    try {
      await onPreview(request)
    } catch (error) {
      console.error("Failed to preview missing values fix:", error)
    }
  }

  const isNumeric = (dataType: string) => dataType === "numeric"

  const canApply = (column: MissingValueColumn) => {
    const action = selectedActions[column.name]
    if (!action) return false
    if (action.action === "custom" && !action.customValue) return false
    if (action.action === "drop" && !previewedColumns.has(column.name)) return false
    return true
  }

  if (selectedColumns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
            Missing Values
          </CardTitle>
          <CardDescription>Handle missing data in your columns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Filter className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Select columns in the filter above to view missing values</p>
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
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
            Missing Values
          </CardTitle>
          <CardDescription>Handle missing data in your columns</CardDescription>
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
              <AlertCircle className="w-5 h-5 text-muted-foreground" />
              Missing Values
            </CardTitle>
            <CardDescription>Handle missing data in your columns</CardDescription>
          </div>
          <Badge variant="secondary">
            {filteredColumns.reduce((sum, col) => sum + col.missingCount, 0)} total missing
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Data Type</TableHead>
                <TableHead className="text-right">Missing Count</TableHead>
                <TableHead className="text-right">Missing %</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredColumns.map((column) => {
                const isHighMissing = column.missingPercentage > 20
                const action = selectedActions[column.name] || { action: "drop", customValue: "" }
                const hasPreviewed = previewedColumns.has(column.name)
                const canApplyAction = canApply(column)

                return (
                  <TableRow
                    key={column.name}
                    className={cn(isHighMissing && "bg-destructive/5 border-l-4 border-l-destructive")}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {column.name}
                        {isHighMissing && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>High missing percentage (&gt;20%)</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {column.dataType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{column.missingCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-medium", isHighMissing && "text-destructive")}>
                        {column.missingPercentage.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RadioGroup
                          value={action.action}
                          onValueChange={(v) => handleActionChange(column.name, v)}
                          className="flex flex-wrap gap-3"
                        >
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="drop" id={`${column.name}-drop`} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Label htmlFor={`${column.name}-drop`} className="text-xs cursor-pointer">
                                  Drop rows
                                </Label>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remove rows where this column has missing values</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {isNumeric(column.dataType) && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem value="mean" id={`${column.name}-mean`} />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Label htmlFor={`${column.name}-mean`} className="text-xs cursor-pointer">
                                      Fill mean
                                    </Label>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Fill missing values with the column mean (numeric only)</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem value="median" id={`${column.name}-median`} />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Label htmlFor={`${column.name}-median`} className="text-xs cursor-pointer">
                                      Fill median
                                    </Label>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Fill missing values with the column median (numeric only)</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </>
                          )}

                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="mode" id={`${column.name}-mode`} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Label htmlFor={`${column.name}-mode`} className="text-xs cursor-pointer">
                                  Fill mode
                                </Label>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Fill missing values with the most frequent value</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="custom" id={`${column.name}-custom`} />
                            <Label htmlFor={`${column.name}-custom`} className="text-xs cursor-pointer">
                              Custom
                            </Label>
                            {action.action === "custom" && (
                              <Input
                                placeholder="Value..."
                                className="w-24 h-7 text-xs"
                                value={action.customValue}
                                onChange={(e) => handleCustomValueChange(column.name, e.target.value)}
                              />
                            )}
                          </div>
                        </RadioGroup>

                        <div className="flex items-center gap-1 ml-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1"
                            onClick={() => handlePreview(column)}
                            disabled={!action.action}
                          >
                            <Eye className="w-3 h-3" />
                            {hasPreviewed ? "Previewed" : "Preview"}
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1"
                            onClick={() => handleApply(column)}
                            disabled={!canApplyAction}
                          >
                            <Play className="w-3 h-3" />
                            Apply
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {filteredColumns.some((col) => col.missingPercentage > 20) && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <Info className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                Columns with &gt;20% missing values are highlighted. Consider investigating the root cause before
                applying fixes.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
