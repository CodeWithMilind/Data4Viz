"use client"

import { useState, useEffect, useMemo } from "react"
import { AlertTriangle, Eye, Trash2, Loader2, Database } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useWorkspace } from "@/contexts/workspace-context"
import { getDatasetSchema, type SchemaResponse } from "@/lib/api/dataCleaningClient"

export function OutlierHandlingPage() {
  const { activeWorkspaceId, getDatasets } = useWorkspace()
  const [schema, setSchema] = useState<SchemaResponse | null>(null)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  // Get first dataset from workspace
  const selectedDataset = useMemo(() => {
    const datasets = getDatasets()
    return datasets.length > 0 ? datasets[0] : null
  }, [getDatasets])

  // Fetch schema when dataset is available
  useEffect(() => {
    if (!activeWorkspaceId || !selectedDataset?.fileName) {
      setSchema(null)
      setSchemaError(null)
      return
    }

    let cancelled = false
    setIsLoadingSchema(true)
    setSchemaError(null)

    getDatasetSchema(activeWorkspaceId, selectedDataset.fileName, true)
      .then((schemaData) => {
        if (cancelled) return
        setSchema(schemaData)
        setSchemaError(null)
        setIsLoadingSchema(false)
      })
      .catch((error) => {
        if (cancelled) return
        const errorMessage = error instanceof Error ? error.message : "Failed to load schema"
        setSchemaError(errorMessage)
        setIsLoadingSchema(false)
        console.error("Error fetching schema:", error)
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, selectedDataset?.fileName])

  // Get numeric columns from schema (outliers only apply to numeric columns)
  const numericColumns = useMemo(() => {
    if (!schema) return []
    return schema.columns.filter((col) => col.canonical_type === "numeric")
  }, [schema])

  // Placeholder outliers data (would come from backend in real implementation)
  const outliers = [
    { id: 1, column: "order_total", value: 99999, zscore: 4.2, action: "Review" },
    { id: 2, column: "quantity", value: -5, zscore: 3.8, action: "Remove" },
    { id: 3, column: "discount", value: 150, zscore: 3.5, action: "Cap" },
  ]

  if (isLoadingSchema) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading schema...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (schemaError) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-destructive" />
            <p className="text-destructive">Failed to load schema: {schemaError}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!selectedDataset) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Dataset Selected</CardTitle>
            <CardDescription>Please select a dataset to handle outliers</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Outlier Handling</span>
        </div>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Eye className="w-4 h-4" />
          Detect Outliers
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detected Outliers</CardTitle>
            <CardDescription>
              Values that fall outside expected ranges (only numeric columns shown)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {numericColumns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No numeric columns found in dataset. Outliers can only be detected in numeric columns.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Badge variant="secondary">
                    {numericColumns.length} numeric {numericColumns.length === 1 ? "column" : "columns"} available
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Column</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Z-Score</TableHead>
                      <TableHead>Suggested Action</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outliers.map((outlier) => {
                      const column = schema?.columns.find((col) => col.name === outlier.column)
                      return (
                        <TableRow key={outlier.id}>
                          <TableCell className="font-medium">{outlier.column}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {column?.canonical_type || "unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-destructive font-mono">{outlier.value}</TableCell>
                          <TableCell>{outlier.zscore}</TableCell>
                          <TableCell>{outlier.action}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
