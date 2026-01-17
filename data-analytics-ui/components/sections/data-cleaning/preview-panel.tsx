"use client"

/**
 * Preview Panel
 *
 * Shows preview of cleaning operations before they are applied.
 * Displays preview data in a compact table format.
 */

import { Eye, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { MissingValuesPreviewData } from "./missing-values-card"

interface PreviewPanelProps {
  previewData: MissingValuesPreviewData | null
}

export function PreviewPanel({ previewData }: PreviewPanelProps) {
  if (!previewData) {
    return null
  }

  const { column, rows, columns, affectedRows } = previewData

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-muted-foreground" />
              Preview
            </CardTitle>
            <CardDescription>Preview of changes - not yet applied</CardDescription>
          </div>
          <Badge variant="secondary">
            {rows.length} rows × {columns.length} columns
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <Info className="w-4 h-4" />
          <AlertDescription>
            <strong>Preview – changes not applied</strong>
            <br />
            This preview shows how the data will look after cleaning column <strong>{column}</strong>.
            {affectedRows > 0 && (
              <>
                {" "}
                {affectedRows} row{affectedRows !== 1 ? "s" : ""} will be affected.
              </>
            )}
          </AlertDescription>
        </Alert>

        {rows.length > 0 ? (
          <div className="border rounded-md overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col} className="font-medium">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell key={col} className="text-sm">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No preview data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
