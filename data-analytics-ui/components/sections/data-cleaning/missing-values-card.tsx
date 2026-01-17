"use client"

/**
 * Missing Values Card
 *
 * IMPORTANT: Schema is the single source of truth for column metadata.
 * No frontend type inference - all types come from backend schema API.
 */

import { useState } from "react"
import { AlertCircle, Database, Eye, Filter, Info, Play, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { cleanMissingValues, type SchemaResponse, type MissingValueCleanRequest } from "@/lib/api/dataCleaningClient"

interface MissingValuesCardProps {
  datasetId: string
  workspaceId: string
  schema: SchemaResponse | null
  isLoadingSchema: boolean
  schemaError: string | null
  selectedColumns?: string[]
}

export function MissingValuesCard({
  datasetId,
  workspaceId,
  schema,
  isLoadingSchema,
  schemaError,
  selectedColumns = [],
}: MissingValuesCardProps) {
  const [selectedActions, setSelectedActions] = useState<Record<string, { action: string; customValue: string }>>({})
  const [previewedColumns, setPreviewedColumns] = useState<Set<string>>(new Set())
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const [isApplying, setIsApplying] = useState<Record<string, boolean>>({})

  // Get columns with missing values from schema
  const columnsWithMissing = schema?.columns.filter((col) => col.missing_count > 0) || []

  // Filter: Only show selected columns
  const filteredColumns =
    selectedColumns.length === 0
      ? columnsWithMissing
      : columnsWithMissing.filter((col) => selectedColumns.includes(col.name))

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

  const handleApply = async (columnName: string) => {
    const action = selectedActions[columnName]
    if (!action) return

    // Map frontend action to backend strategy
    const strategyMap: Record<string, "drop" | "fill_mean" | "fill_median" | "fill_mode" | "fill_constant"> = {
      drop: "drop",
      mean: "fill_mean",
      median: "fill_median",
      mode: "fill_mode",
      custom: "fill_constant",
    }

    const strategy = strategyMap[action.action]
    if (!strategy) return

    const request: MissingValueCleanRequest = {
      column: columnName,
      strategy,
      constant_value: action.action === "custom" ? action.customValue : undefined,
      preview: false,
    }

    setIsApplying((prev) => ({ ...prev, [columnName]: true }))
    setApplyErrors((prev) => {
      const next = { ...prev }
      delete next[columnName]
      return next
    })

    try {
      const response = await cleanMissingValues(workspaceId, datasetId, request)
      // Refresh schema after successful apply
      if (response.schema) {
        // Schema will be refreshed by parent component's useEffect
        window.location.reload() // Simple refresh - could be improved with state management
      }
      // Clear preview state after successful apply
      setPreviewedColumns((prev) => {
        const next = new Set(prev)
        next.delete(columnName)
        return next
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to apply missing values fix"
      setApplyErrors((prev) => ({ ...prev, [columnName]: errorMessage }))
      console.error("Failed to apply missing values fix:", error)
    } finally {
      setIsApplying((prev) => {
        const next = { ...prev }
        delete next[columnName]
        return next
      })
    }
  }

  const handlePreview = async (columnName: string) => {
    const action = selectedActions[columnName]
    if (!action) return

    // Map frontend action to backend strategy
    const strategyMap: Record<string, "drop" | "fill_mean" | "fill_median" | "fill_mode" | "fill_constant"> = {
      drop: "drop",
      mean: "fill_mean",
      median: "fill_median",
      mode: "fill_mode",
      custom: "fill_constant",
    }

    const strategy = strategyMap[action.action]
    if (!strategy) return

    const request: MissingValueCleanRequest = {
      column: columnName,
      strategy,
      constant_value: action.action === "custom" ? action.customValue : undefined,
      preview: true,
    }

    setPreviewedColumns((prev) => new Set(prev).add(columnName))

    try {
      await cleanMissingValues(workspaceId, datasetId, request)
    } catch (error) {
      setPreviewedColumns((prev) => {
        const next = new Set(prev)
        next.delete(columnName)
        return next
      })
      console.error("Failed to preview missing values fix:", error)
    }
  }

  // Get available strategies based on canonical_type
  const getAvailableStrategies = (canonicalType: string) => {
    const allStrategies = ["drop", "mode", "custom"]
    if (canonicalType === "numeric") {
      return ["drop", "mean", "median", "mode", "custom"]
    }
    return allStrategies
  }

  const canApply = (columnName: string) => {
    const action = selectedActions[columnName]
    if (!action) return false
    if (action.action === "custom" && !action.customValue) return false
    return !isApplying[columnName]
  }

  // Loading state
  if (isLoadingSchema) {
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
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <p>Loading schema...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (schemaError) {
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
          <div className="text-center py-8 text-destructive">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p>Failed to load schema: {schemaError}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (columnsWithMissing.length === 0) {
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
            <p>No missing values detected in this dataset.</p>
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
                const isHighMissing = column.missing_percentage > 20
                const action = selectedActions[column.name] || { action: "drop", customValue: "" }
                const hasPreviewed = previewedColumns.has(column.name)
                const canApplyAction = canApply(column.name)
                const availableStrategies = getAvailableStrategies(column.canonical_type)
                const applyError = applyErrors[column.name]
                const isApplyingColumn = isApplying[column.name]

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
                        {column.canonical_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{column.missing_count.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-medium", isHighMissing && "text-destructive")}>
                        {column.missing_percentage.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <RadioGroup
                            value={action.action}
                            onValueChange={(v) => handleActionChange(column.name, v)}
                            className="flex flex-wrap gap-3"
                          >
                            {availableStrategies.includes("drop") && (
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
                            )}

                            {availableStrategies.includes("mean") && (
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
                            )}

                            {availableStrategies.includes("median") && (
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
                            )}

                            {availableStrategies.includes("mode") && (
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
                            )}

                            {availableStrategies.includes("custom") && (
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
                            )}
                          </RadioGroup>

                          <div className="flex items-center gap-1 ml-auto">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => handlePreview(column.name)}
                              disabled={!action.action || isApplyingColumn}
                            >
                              <Eye className="w-3 h-3" />
                              {hasPreviewed ? "Previewed" : "Preview"}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => handleApply(column.name)}
                              disabled={!canApplyAction || isApplyingColumn}
                            >
                              {isApplyingColumn ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                              Apply
                            </Button>
                          </div>
                        </div>
                        {applyError && (
                          <div className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {applyError}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {filteredColumns.some((col) => col.missing_percentage > 20) && (
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
