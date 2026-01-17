"use client"

/**
 * Column Quality Summary
 *
 * IMPORTANT: No mock data. Shows empty state until backend provides data.
 * Backend is the single source of truth.
 */

import { useEffect , useRef} from "react"
import { AlertCircle, ArrowRight, CheckCircle2, Database, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { ColumnInfo } from "./column-filter-panel"

interface ColumnQuality {
  name: string
  dataType: string
  missingPercentage: number
  duplicateContribution: number
  typeConsistency: "consistent" | "warning" | "inconsistent"
  outlierCount: number
  healthScore: number
}

interface ColumnQualitySummaryProps {
  datasetId: string
  columns?: ColumnQuality[]
  selectedColumns?: string[]
  onColumnClick?: (columnName: string, issueType: string) => void
  onColumnSelect?: (columnName: string) => void
  onColumnsLoaded?: (columns: ColumnInfo[]) => void
}

export function ColumnQualitySummary({
  datasetId,
  columns = [],
  selectedColumns = [],
  onColumnClick,
  onColumnSelect,
  onColumnsLoaded,
}: ColumnQualitySummaryProps) {
  // Extract column info for filter panel
  const didSendColumnsRef = useRef(false)

  useEffect(() => {
    if (didSendColumnsRef.current) return
    if (!columns || columns.length === 0) return
  
    const columnInfo: ColumnInfo[] = columns.map((col) => ({
      name: col.name,
      dataType: col.dataType,
    }))
  
    onColumnsLoaded?.(columnInfo)
    didSendColumnsRef.current = true
  }, [columns])

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getHealthBgColor = (score: number) => {
    if (score >= 80) return "bg-green-500"
    if (score >= 60) return "bg-yellow-500"
    return "bg-red-500"
  }

  const getTypeConsistencyIcon = (status: string) => {
    switch (status) {
      case "consistent":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case "warning":
        return <AlertCircle className="w-4 h-4 text-yellow-600" />
      case "inconsistent":
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return null
    }
  }

  const getTypeConsistencyLabel = (status: string) => {
    switch (status) {
      case "consistent":
        return "Consistent"
      case "warning":
        return "Warning"
      case "inconsistent":
        return "Inconsistent"
      default:
        return status
    }
  }

  const handleColumnClick = (column: ColumnQuality) => {
    // Auto-select column in filter
    if (onColumnSelect && !selectedColumns.includes(column.name)) {
      onColumnSelect(column.name)
    }

    // Determine which section to navigate to based on issues
    let issueType = "overview"
    if (column.missingPercentage > 20) {
      issueType = "missing"
    } else if (column.outlierCount > 0) {
      issueType = "outliers"
    } else if (column.typeConsistency === "inconsistent") {
      issueType = "invalid"
    } else if (column.duplicateContribution > 3) {
      issueType = "duplicates"
    }

    onColumnClick?.(column.name, issueType)
  }

  const averageHealthScore =
    columns.length > 0 ? columns.reduce((sum, col) => sum + col.healthScore, 0) / columns.length : 0

  // Show empty state if no columns
  if (columns.length === 0) {
    return (
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-primary" />
                Column Quality Summary
              </CardTitle>
              <CardDescription>Comprehensive overview of data quality across all columns</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No data available. Upload or connect a dataset to begin.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-primary" />
              Column Quality Summary
            </CardTitle>
            <CardDescription>Comprehensive overview of data quality across all columns</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Overall Health</p>
            <div className="flex items-center gap-2">
              <Progress value={averageHealthScore} className="w-32 h-2" />
              <span className={cn("text-lg font-bold", getHealthColor(averageHealthScore))}>
                {averageHealthScore.toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Missing %</TableHead>
              <TableHead className="text-right">Dup. Contrib.</TableHead>
              <TableHead>Type Status</TableHead>
              <TableHead className="text-right">Outliers</TableHead>
              <TableHead className="text-right">Health Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column) => (
              <TableRow
                key={column.name}
                className="hover:bg-muted/50"
              >
                <TableCell className="font-medium">{column.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {column.dataType}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={cn(
                      "font-medium",
                      column.missingPercentage > 20 && "text-destructive",
                      column.missingPercentage > 10 && column.missingPercentage <= 20 && "text-yellow-600",
                    )}
                  >
                    {column.missingPercentage.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={cn(
                      "font-medium",
                      column.duplicateContribution > 3 && "text-destructive",
                      column.duplicateContribution > 1.5 && column.duplicateContribution <= 3 && "text-yellow-600",
                    )}
                  >
                    {column.duplicateContribution.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTypeConsistencyIcon(column.typeConsistency)}
                    <span className="text-sm">{getTypeConsistencyLabel(column.typeConsistency)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {column.dataType === "numeric" ? (
                    <span className={cn("font-medium", column.outlierCount > 0 && "text-yellow-600")}>
                      {column.outlierCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-24">
                      <Progress value={column.healthScore} className="h-2" />
                    </div>
                    <span className={cn("text-sm font-semibold w-10 text-right", getHealthColor(column.healthScore))}>
                      {column.healthScore}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Good (80-100)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">Warning (60-79)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Poor (&lt;60)</span>
            </div>
          </div>
          <p className="text-muted-foreground">Read-only analysis for data understanding</p>
        </div>
      </CardContent>
    </Card>
  )
}
