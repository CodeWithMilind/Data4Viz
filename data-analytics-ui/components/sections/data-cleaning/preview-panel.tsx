"use client"

/**
 * Preview Panel
 *
 * Shows preview of cleaning operations before they are applied.
 * Reuses the same table style as Overview page for consistency.
 */

import { Eye, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { MissingValuesPreviewData } from "./missing-values-card"

interface PreviewPanelProps {
  previewData: MissingValuesPreviewData | null
}

export function PreviewPanel({ previewData }: PreviewPanelProps) {
  // Always render - show placeholder if no preview data
  if (!previewData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-muted-foreground" />
            Preview
          </CardTitle>
          <CardDescription>Preview of changes - not yet applied</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Click "Preview" on any cleaning operation to see changes before applying.</p>
          </div>
        </CardContent>
      </Card>
    )
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
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table container with both horizontal and vertical scrolling - same style as Overview */}
            <div className="max-h-[600px] overflow-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  {/* Sticky header row - remains visible during vertical scroll */}
                  <thead className="bg-muted/50 sticky top-0 z-20">
                    <tr>
                      {/* Row number column - sticky on left during horizontal scroll */}
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground border-r border-border bg-muted/70 sticky left-0 z-30 min-w-[60px]">
                        #
                      </th>
                      {/* Data columns - scroll horizontally */}
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border last:border-r-0 bg-muted/70 min-w-[120px]"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} className="border-t border-border hover:bg-muted/30 transition-colors">
                        {/* Row number cell - sticky on left during horizontal scroll */}
                        <td className="px-3 py-2 text-muted-foreground border-r border-border bg-background sticky left-0 z-10 min-w-[60px]">
                          {idx + 1}
                        </td>
                        {/* Data cells - scroll horizontally */}
                        {columns.map((header) => (
                          <td
                            key={header}
                            className="px-3 py-2 whitespace-nowrap border-r border-border last:border-r-0 min-w-[120px]"
                          >
                            {row[header] !== null && row[header] !== undefined
                              ? String(row[header])
                              : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
