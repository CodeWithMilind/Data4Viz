"use client"

/**
 * Invalid Formats Card
 *
 * IMPORTANT: No mock data. Shows empty state until backend provides data.
 * Backend is the single source of truth.
 */

import { useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Database, Eye, Filter, Info, Play } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CleaningRequest } from "@/types/dataCleaning"

interface InvalidFormatIssue {
  columnName: string
  expectedType: "numeric" | "datetime" | "categorical"
  invalidCount: number
  sampleInvalidValues: string[]
}

interface InvalidFormatsCardProps {
  datasetId: string
  issues?: InvalidFormatIssue[]
  selectedColumns?: string[]
  onPreview?: (request: CleaningRequest) => Promise<any>
  onApply?: (request: CleaningRequest) => Promise<any>
}

export function InvalidFormatsCard({
  datasetId,
  issues = [],
  selectedColumns = [],
  onPreview,
  onApply,
}: InvalidFormatsCardProps) {
  const [selectedActions, setSelectedActions] = useState<
    Record<
      string,
      {
        action: "convert" | "remove" | "replace"
        replaceConfig?: {
          method: string
          customValue?: string
        }
      }
    >
  >({})
  const [previewedColumns, setPreviewedColumns] = useState<Set<string>>(new Set())

  // Filter: Only show issues for selected columns that have invalid values
  const filteredIssues =
    selectedColumns.length === 0 ? issues : issues.filter((issue) => selectedColumns.includes(issue.columnName))

  const handleActionChange = (columnName: string, action: "convert" | "remove" | "replace") => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: {
        action,
        replaceConfig: action === "replace" ? prev[columnName]?.replaceConfig || { method: "mean" } : undefined,
      },
    }))
    setPreviewedColumns((prev) => {
      const next = new Set(prev)
      next.delete(columnName)
      return next
    })
  }

  const handleReplaceMethodChange = (columnName: string, method: string, customValue?: string) => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: {
        ...prev[columnName],
        action: "replace",
        replaceConfig: { method, customValue },
      },
    }))
  }

  const handlePreview = async (issue: InvalidFormatIssue) => {
    if (!onPreview) return

    setPreviewedColumns((prev) => new Set(prev).add(issue.columnName))

    const action = selectedActions[issue.columnName]
    if (!action) return

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "invalid_format",
      column: issue.columnName,
      action: action.action === "convert" ? "safe_convert" : action.action === "remove" ? "remove_invalid" : "replace_invalid",
      parameters: {
        expected_type: issue.expectedType,
        ...(action.action === "replace" ? action.replaceConfig : {}),
      },
      preview: true,
    }

    try {
      await onPreview(request)
    } catch (error) {
      console.error("Failed to preview invalid format fix:", error)
    }
  }

  const handleApply = async (issue: InvalidFormatIssue) => {
    if (!onApply) return

    const action = selectedActions[issue.columnName]
    if (!action) return

    const request: CleaningRequest = {
      dataset_id: datasetId,
      operation: "invalid_format",
      column: issue.columnName,
      action: action.action === "convert" ? "safe_convert" : action.action === "remove" ? "remove_invalid" : "replace_invalid",
      parameters: {
        expected_type: issue.expectedType,
        ...(action.action === "replace" ? action.replaceConfig : {}),
      },
      preview: false,
    }

    try {
      await onApply(request)
    } catch (error) {
      console.error("Failed to apply invalid format fix:", error)
    }
  }

  const canApply = (issue: InvalidFormatIssue) => {
    const action = selectedActions[issue.columnName]
    if (!action) return false

    if (action.action === "replace") {
      if (!action.replaceConfig?.method) return false
      if (action.replaceConfig.method === "custom" && !action.replaceConfig.customValue) return false
    }

    if (action.action !== "convert" && !previewedColumns.has(issue.columnName)) return false

    return true
  }

  const getReplaceOptions = (expectedType: string) => {
    if (expectedType === "numeric") {
      return [
        { value: "mean", label: "Mean" },
        { value: "median", label: "Median" },
        { value: "zero", label: "Zero" },
        { value: "custom", label: "Custom value" },
      ]
    }
    if (expectedType === "datetime") {
      return [
        { value: "null", label: "Null" },
        { value: "fixed", label: "Fixed date" },
        { value: "most_frequent", label: "Most frequent date" },
      ]
    }
    return [
      { value: "normalize", label: "Normalize text" },
      { value: "unknown", label: "Replace with 'Unknown'" },
    ]
  }

  if (issues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" />
            Invalid Formats
          </CardTitle>
          <CardDescription>Identify and fix columns with format issues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No format issues detected in this dataset.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (filteredIssues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" />
            Invalid Formats
          </CardTitle>
          <CardDescription>Identify and fix columns with format issues</CardDescription>
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
              <AlertTriangle className="w-5 h-5 text-muted-foreground" />
              Invalid Formats
            </CardTitle>
            <CardDescription>Identify and fix columns with format issues</CardDescription>
          </div>
          <Badge variant="secondary">
            {filteredIssues.reduce((sum, issue) => sum + issue.invalidCount, 0)} invalid entries
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {filteredIssues.map((issue) => {
            const action = selectedActions[issue.columnName] || { action: "convert" }
            const hasPreviewed = previewedColumns.has(issue.columnName)
            const canApplyAction = canApply(issue)

            return (
              <div key={issue.columnName} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{issue.columnName}</h3>
                      <Badge variant="outline" className="font-mono text-xs">
                        {issue.expectedType}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {issue.invalidCount} invalid value{issue.invalidCount !== 1 ? "s" : ""} found
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Sample invalid values:</Label>
                  <div className="flex flex-wrap gap-2">
                    {issue.sampleInvalidValues.map((value, idx) => (
                      <Badge key={idx} variant="secondary" className="font-mono text-xs">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-medium">Action:</Label>
                  <RadioGroup
                    value={action.action}
                    onValueChange={(v) => handleActionChange(issue.columnName, v as "convert" | "remove" | "replace")}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="convert" id={`${issue.columnName}-convert`} />
                        <Label htmlFor={`${issue.columnName}-convert`} className="cursor-pointer font-medium">
                          Attempt conversion (safe only)
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Converts only values that can be parsed correctly. Leaves unconvertible values unchanged.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="remove" id={`${issue.columnName}-remove`} />
                        <Label htmlFor={`${issue.columnName}-remove`} className="cursor-pointer font-medium">
                          Remove rows with invalid values
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Removes rows where values cannot be converted. This will reduce your dataset size.
                      </p>
                      {action.action === "remove" && (
                        <Alert variant="destructive" className="ml-6">
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription className="text-xs">
                            <strong>Warning:</strong> This action will permanently remove {issue.invalidCount} row
                            {issue.invalidCount !== 1 ? "s" : ""} from your dataset. Preview changes before applying.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="replace" id={`${issue.columnName}-replace`} />
                        <Label htmlFor={`${issue.columnName}-replace`} className="cursor-pointer font-medium">
                          Replace invalid values
                        </Label>
                      </div>
                      {action.action === "replace" && (
                        <div className="ml-6 space-y-3">
                          <Select
                            value={action.replaceConfig?.method || "mean"}
                            onValueChange={(v) => handleReplaceMethodChange(issue.columnName, v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select replacement method" />
                            </SelectTrigger>
                            <SelectContent>
                              {getReplaceOptions(issue.expectedType).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {action.replaceConfig?.method === "custom" && (
                            <Input
                              placeholder="Enter custom value..."
                              value={action.replaceConfig.customValue || ""}
                              onChange={(e) =>
                                handleReplaceMethodChange(issue.columnName, "custom", e.target.value)
                              }
                              className="w-full"
                            />
                          )}

                          {action.replaceConfig?.method === "fixed" && issue.expectedType === "datetime" && (
                            <Input
                              type="date"
                              value={action.replaceConfig.customValue || ""}
                              onChange={(e) =>
                                handleReplaceMethodChange(issue.columnName, "fixed", e.target.value)
                              }
                              className="w-full"
                            />
                          )}

                          <Alert>
                            <Info className="w-4 h-4" />
                            <AlertDescription className="text-xs">
                              Invalid values will be replaced with the selected option. Preview changes before applying.
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(issue)}
                    className="gap-2"
                    disabled={!action.action}
                  >
                    <Eye className="w-4 h-4" />
                    {hasPreviewed ? "Previewed" : "Preview Changes"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApply(issue)}
                    disabled={!canApplyAction}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Apply Fix
                  </Button>
                  {!canApplyAction && action.action && (
                    <p className="text-xs text-muted-foreground ml-auto">
                      {action.action !== "convert" && !hasPreviewed
                        ? "Please preview changes before applying"
                        : action.action === "replace" && action.replaceConfig?.method === "custom" && !action.replaceConfig?.customValue
                          ? "Please enter a custom value"
                          : ""}
                    </p>
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
