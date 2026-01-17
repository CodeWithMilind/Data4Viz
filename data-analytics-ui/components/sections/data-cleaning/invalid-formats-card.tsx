"use client"

/**
 * Invalid Formats Card
 *
 * IMPORTANT: No mock data. Shows empty state until backend provides data.
 * Backend is the single source of truth.
 */

import { AlertTriangle, CheckCircle2, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
}

export function InvalidFormatsCard({
  datasetId,
  issues = [],
  selectedColumns = [],
}: InvalidFormatsCardProps) {

  // Filter: Only show issues for selected columns that have invalid values
  const filteredIssues =
    selectedColumns.length === 0 ? issues : issues.filter((issue) => selectedColumns.includes(issue.columnName))


  if (issues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" />
            Invalid Formats
          </CardTitle>
          <CardDescription>Read-only analysis of columns with format issues</CardDescription>
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
          <CardDescription>Read-only analysis of columns with format issues</CardDescription>
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
            <CardDescription>Read-only analysis of columns with format issues</CardDescription>
          </div>
          <Badge variant="secondary">
            {filteredIssues.reduce((sum, issue) => sum + issue.invalidCount, 0)} invalid entries
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Expected Type</TableHead>
                <TableHead className="text-right">Invalid Count</TableHead>
                <TableHead>Sample Invalid Values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIssues.map((issue) => (
                <TableRow key={issue.columnName}>
                  <TableCell className="font-medium">{issue.columnName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {issue.expectedType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{issue.invalidCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {issue.sampleInvalidValues.length > 0 ? (
                        issue.sampleInvalidValues.slice(0, 3).map((value, idx) => (
                          <Badge key={idx} variant="secondary" className="font-mono text-xs">
                            {value}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No samples available</span>
                      )}
                      {issue.sampleInvalidValues.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{issue.sampleInvalidValues.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
