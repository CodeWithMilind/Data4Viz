"use client"

import { useState } from "react"
import { AlertTriangle, Play, Eye, Info, CheckCircle2, AlertCircle, Filter } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface InvalidFormatIssue {
  columnName: string
  expectedType: "numeric" | "datetime" | "categorical"
  invalidCount: number
  sampleInvalidValues: string[]
}

interface InvalidFormatsCardProps {
  issues?: InvalidFormatIssue[]
  selectedColumns?: string[]
  onAction?: (columnName: string, actionType: string, config?: Record<string, any>) => void
}

// Mock data - only columns with invalid values
const mockIssues: InvalidFormatIssue[] = [
  {
    columnName: "Age",
    expectedType: "numeric",
    invalidCount: 23,
    sampleInvalidValues: ["twenty-five", "N/A", "unknown"],
  },
  {
    columnName: "Date_Joined",
    expectedType: "datetime",
    invalidCount: 18,
    sampleInvalidValues: ["2024/13/45", "not-a-date", "invalid"],
  },
  {
    columnName: "Department",
    expectedType: "categorical",
    invalidCount: 45,
    sampleInvalidValues: ["Sales", "SALES", "sales", "SaLeS"],
  },
  {
    columnName: "Email",
    expectedType: "categorical",
    invalidCount: 56,
    sampleInvalidValues: ["john@", "invalid", "test@.com"],
  },
  {
    columnName: "Phone",
    expectedType: "categorical",
    invalidCount: 34,
    sampleInvalidValues: ["123", "abc-def", "12345"],
  },
]

export function InvalidFormatsCard({
  issues = mockIssues,
  selectedColumns = [],
  onAction,
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
  const filteredIssues = issues.filter(
    (issue) => selectedColumns.length === 0 || selectedColumns.includes(issue.columnName),
  )

  const handleActionChange = (columnName: string, action: "convert" | "remove" | "replace") => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: {
        action,
        replaceConfig: action === "replace" ? prev[columnName]?.replaceConfig || { method: "mean" } : undefined,
      },
    }))
    // Clear preview when action changes
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

  const handlePreview = (issue: InvalidFormatIssue) => {
    setPreviewedColumns((prev) => new Set(prev).add(issue.columnName))
  }

  const handleApply = (issue: InvalidFormatIssue) => {
    const action = selectedActions[issue.columnName]
    if (!action) return

    onAction?.(issue.columnName, action.action, {
      expectedType: issue.expectedType,
      ...action.replaceConfig,
    })
  }

  const canApply = (issue: InvalidFormatIssue) => {
    const action = selectedActions[issue.columnName]
    if (!action) return false

    // For replace action, ensure method is selected
    if (action.action === "replace") {
      if (!action.replaceConfig?.method) return false
      // If custom value is required, ensure it's provided
      if (action.replaceConfig.method === "custom" && !action.replaceConfig.customValue) return false
    }

    // Require preview for safety (except for convert which is safe)
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
    // categorical
    return [
      { value: "normalize", label: "Normalize text" },
      { value: "unknown", label: "Replace with 'Unknown'" },
    ]
  }

  if (selectedColumns.length === 0) {
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
            <Filter className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Select columns in the filter above to view format issues</p>
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
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No format issues detected in selected columns</p>
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
                    {/* Option 1: Attempt Conversion (Default) */}
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

                    {/* Option 2: Remove Rows */}
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

                    {/* Option 3: Replace Invalid Values */}
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
