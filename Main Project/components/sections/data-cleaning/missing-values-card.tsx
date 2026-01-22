"use client"

/**
 * Missing Values Card
 *
 * IMPORTANT: Schema is the single source of truth for column metadata.
 * No frontend type inference - all types come from backend schema API.
 */

import { AlertCircle, Database, Filter, Info, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { SchemaResponse } from "@/lib/api/dataCleaningClient"

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

  // Get columns with missing values from schema
  const columnsWithMissing = schema?.columns.filter((col) => col.missing_count > 0) || []

  // Filter: Only show selected columns
  const filteredColumns =
    selectedColumns.length === 0
      ? columnsWithMissing
      : columnsWithMissing.filter((col) => selectedColumns.includes(col.name))


  // Loading state
  if (isLoadingSchema) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
            Missing Values
          </CardTitle>
          <CardDescription>Read-only analysis of missing data in your columns</CardDescription>
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
          <CardDescription>Read-only analysis of missing data in your columns</CardDescription>
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
          <CardDescription>Read-only analysis of missing data in your columns</CardDescription>
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
          <CardDescription>Read-only analysis of missing data in your columns</CardDescription>
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
            <CardDescription>Read-only analysis of missing data in your columns</CardDescription>
          </div>
          <Badge variant="secondary">
            {filteredColumns.reduce((sum, col) => sum + col.missing_count, 0)} total missing
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
                <TableHead className="text-right">Unique Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredColumns.map((column) => {
                const isHighMissing = column.missing_percentage > 20

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
                    <TableCell className="text-right">{column.unique_count.toLocaleString()}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {filteredColumns.some((col) => col.missing_percentage > 20) && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <Info className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                Columns with &gt;20% missing values are highlighted. This is read-only analysis for data understanding.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
