"use client"

import { useState } from "react"
import { AlertTriangle, Play, Eye, Info, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface InvalidFormatIssue {
  columnName: string
  expectedType: string
  invalidCount: number
  sampleInvalidValues: string[]
  issueType: "numeric_text" | "invalid_date" | "inconsistent_casing" | "invalid_format"
}

interface InvalidFormatsCardProps {
  issues?: InvalidFormatIssue[]
  onAction?: (columnName: string, actionType: string) => void
}

// Mock data
const mockIssues: InvalidFormatIssue[] = [
  {
    columnName: "Age",
    expectedType: "numeric",
    invalidCount: 23,
    sampleInvalidValues: ["twenty-five", "N/A", "unknown"],
    issueType: "numeric_text",
  },
  {
    columnName: "Date_Joined",
    expectedType: "datetime",
    invalidCount: 18,
    sampleInvalidValues: ["2024/13/45", "not-a-date", "invalid"],
    issueType: "invalid_date",
  },
  {
    columnName: "Department",
    expectedType: "categorical",
    invalidCount: 45,
    sampleInvalidValues: ["Sales", "SALES", "sales", "SaLeS"],
    issueType: "inconsistent_casing",
  },
  {
    columnName: "Email",
    expectedType: "categorical",
    invalidCount: 56,
    sampleInvalidValues: ["john@", "invalid", "test@.com"],
    issueType: "invalid_format",
  },
  {
    columnName: "Phone",
    expectedType: "categorical",
    invalidCount: 34,
    sampleInvalidValues: ["123", "abc-def", "12345"],
    issueType: "invalid_format",
  },
]

export function InvalidFormatsCard({ issues = mockIssues, onAction }: InvalidFormatsCardProps) {
  const [selectedActions, setSelectedActions] = useState<Record<string, string>>({})

  const getIssueDescription = (issueType: string) => {
    switch (issueType) {
      case "numeric_text":
        return "Numeric column containing text values"
      case "invalid_date":
        return "Date column with invalid date formats"
      case "inconsistent_casing":
        return "Categorical column with inconsistent casing"
      case "invalid_format":
        return "Values don't match expected format"
      default:
        return "Format inconsistency detected"
    }
  }

  const getAvailableActions = (issueType: string, expectedType: string) => {
    const actions: { value: string; label: string; description: string }[] = []

    if (issueType === "numeric_text" || issueType === "invalid_date") {
      actions.push({
        value: "convert",
        label: "Convert data type",
        description: "Attempt to convert invalid values to the expected type",
      })
      actions.push({
        value: "flag",
        label: "Flag invalid values",
        description: "Mark invalid values for manual review without removing them",
      })
    }

    if (issueType === "inconsistent_casing") {
      actions.push({
        value: "lowercase",
        label: "Normalize to lowercase",
        description: "Convert all values to lowercase for consistency",
      })
      actions.push({
        value: "trim",
        label: "Trim whitespace",
        description: "Remove leading and trailing whitespace",
      })
    }

    if (issueType === "invalid_format") {
      actions.push({
        value: "flag",
        label: "Flag invalid values",
        description: "Mark invalid values for manual review",
      })
      if (expectedType === "datetime") {
        actions.push({
          value: "convert",
          label: "Convert to date",
          description: "Attempt to parse and convert to valid date format",
        })
      }
    }

    return actions
  }

  const handleApply = (issue: InvalidFormatIssue) => {
    const action = selectedActions[issue.columnName]
    if (!action) return
    onAction?.(issue.columnName, action)
  }

  const handlePreview = (issue: InvalidFormatIssue) => {
    // Placeholder preview handler
    console.log("Preview action for", issue.columnName)
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
            {issues.reduce((sum, issue) => sum + issue.invalidCount, 0)} invalid entries
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {issues.map((issue) => {
            const availableActions = getAvailableActions(issue.issueType, issue.expectedType)
            const selectedAction = selectedActions[issue.columnName] || ""

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
                    <p className="text-sm text-muted-foreground">{getIssueDescription(issue.issueType)}</p>
                    <p className="text-xs text-muted-foreground">
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

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Recommended Actions:</Label>
                  <Select value={selectedAction} onValueChange={(v) => setSelectedActions({ ...selectedActions, [issue.columnName]: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an action..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableActions.map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          <div className="flex flex-col">
                            <span>{action.label}</span>
                            <span className="text-xs text-muted-foreground">{action.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedAction && (
                    <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
                      <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        {availableActions.find((a) => a.value === selectedAction)?.description}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => handlePreview(issue)} className="gap-2">
                    <Eye className="w-4 h-4" />
                    Preview Changes
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApply(issue)}
                    disabled={!selectedAction}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Apply Fix
                  </Button>
                </div>
              </div>
            )
          })}

          {issues.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No format issues detected</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
