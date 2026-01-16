"use client"

import { CheckCircle2, AlertCircle, XCircle, ArrowRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
  columns?: ColumnQuality[]
  onColumnClick?: (columnName: string, issueType: string) => void
}

// Mock data - in production, this would come from props
const mockColumns: ColumnQuality[] = [
  {
    name: "Age",
    dataType: "numeric",
    missingPercentage: 12.0,
    duplicateContribution: 2.1,
    typeConsistency: "consistent",
    outlierCount: 45,
    healthScore: 72,
  },
  {
    name: "Salary",
    dataType: "numeric",
    missingPercentage: 8.0,
    duplicateContribution: 1.5,
    typeConsistency: "consistent",
    outlierCount: 32,
    healthScore: 85,
  },
  {
    name: "Department",
    dataType: "categorical",
    missingPercentage: 4.5,
    duplicateContribution: 0.8,
    typeConsistency: "warning",
    outlierCount: 0,
    healthScore: 92,
  },
  {
    name: "Email",
    dataType: "categorical",
    missingPercentage: 23.1,
    duplicateContribution: 5.2,
    typeConsistency: "inconsistent",
    outlierCount: 0,
    healthScore: 45,
  },
  {
    name: "Hire_Date",
    dataType: "datetime",
    missingPercentage: 2.3,
    duplicateContribution: 0.3,
    typeConsistency: "consistent",
    outlierCount: 0,
    healthScore: 95,
  },
  {
    name: "Location",
    dataType: "categorical",
    missingPercentage: 3.4,
    duplicateContribution: 0.6,
    typeConsistency: "consistent",
    outlierCount: 0,
    healthScore: 96,
  },
  {
    name: "Manager_ID",
    dataType: "numeric",
    missingPercentage: 1.7,
    duplicateContribution: 0.2,
    typeConsistency: "consistent",
    outlierCount: 0,
    healthScore: 98,
  },
  {
    name: "Performance_Score",
    dataType: "numeric",
    missingPercentage: 5.7,
    duplicateContribution: 1.0,
    typeConsistency: "warning",
    outlierCount: 12,
    healthScore: 78,
  },
  {
    name: "Phone",
    dataType: "categorical",
    missingPercentage: 16.4,
    duplicateContribution: 3.8,
    typeConsistency: "inconsistent",
    outlierCount: 0,
    healthScore: 58,
  },
]

export function ColumnQualitySummary({ columns = mockColumns, onColumnClick }: ColumnQualitySummaryProps) {
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
    columns.reduce((sum, col) => sum + col.healthScore, 0) / columns.length

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
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column) => (
              <TableRow
                key={column.name}
                className="hover:bg-muted/50 cursor-pointer"
                onClick={() => handleColumnClick(column)}
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
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleColumnClick(column)
                    }}
                  >
                    View
                    <ArrowRight className="w-3 h-3" />
                  </Button>
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
          <p className="text-muted-foreground">
            Click any row to navigate to the relevant cleaning section
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
