"use client"

/**
 * Cleaning History Panel
 *
 * IMPORTANT: Logs are stored per dataset (not per workspace).
 * Fetches operation logs from dataset-level endpoint.
 * No mock data - shows empty state until backend provides data.
 */

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Clock, Database, History, RotateCcw, Undo2, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWorkspace } from "@/contexts/workspace-context"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface OperationLog {
  operation_type: string
  column: string | null
  column_type: string | null
  strategy: string | null
  affected_rows: number
  timestamp: string
}

interface DatasetLogsResponse {
  workspace_id: string
  dataset_id: string
  logs: OperationLog[]
}

interface CleaningHistoryPanelProps {
  datasetId: string | null
}

export function CleaningHistoryPanel({ datasetId }: CleaningHistoryPanelProps) {
  const { activeWorkspaceId } = useWorkspace()
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  // Fetch operation logs from dataset-level endpoint
  useEffect(() => {
    async function fetchLogs() {
      if (!activeWorkspaceId || !datasetId) {
        setLogs([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `${BASE_URL}/dataset/${encodeURIComponent(datasetId)}/logs?workspace_id=${encodeURIComponent(activeWorkspaceId)}`
        )
        if (!response.ok) {
          throw new Error(`Failed to fetch operation logs: ${response.statusText}`)
        }
        const data: DatasetLogsResponse = await response.json()
        setLogs(data.logs)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch operation logs"
        setError(errorMessage)
        setLogs([])
        console.error("Error fetching operation logs:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [activeWorkspaceId, datasetId])

  const handleUndo = (actionId: string) => {
    // Undo functionality not yet implemented
    console.warn("Undo functionality not yet implemented")
  }

  const handleReset = () => {
    // Reset functionality not yet implemented
    console.warn("Reset functionality not yet implemented")
    setResetDialogOpen(false)
  }

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return format(date, "MMM d, yyyy 'at' h:mm a")
    } catch {
      return isoString
    }
  }

  const getActionBadgeVariant = (strategy: string) => {
    if (strategy.includes("remove") || strategy.includes("drop")) return "destructive"
    if (strategy.includes("fill") || strategy.includes("convert")) return "default"
    return "secondary"
  }

  const getOperationDescription = (log: OperationLog): string => {
    const operationMap: Record<string, string> = {
      missing_values: "Handle Missing Values",
      duplicates: "Remove Duplicates",
      invalid_format: "Fix Invalid Formats",
      outliers: "Handle Outliers",
    }
    return operationMap[log.operation_type] || log.operation_type
  }
  
  const getActionLabel = (log: OperationLog): string => {
    if (log.strategy) {
      return log.strategy.replace(/_/g, " ").replace(/fill /g, "fill with ")
    }
    return log.operation_type
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            Cleaning History
          </CardTitle>
          <CardDescription>Audit log of all data cleaning actions performed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading cleaning history...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!activeWorkspaceId || !datasetId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            Cleaning History
          </CardTitle>
          <CardDescription>Audit log of all data cleaning actions performed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No dataset selected</p>
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
              <History className="w-5 h-5 text-muted-foreground" />
              Cleaning History
            </CardTitle>
            <CardDescription>Audit log of all data cleaning actions performed</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Reset Dataset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Dataset?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will undo all cleaning actions and restore the dataset to its original state. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Reset Dataset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No cleaning operations performed yet</p>
            <p className="text-xs mt-2">Apply cleaning operations to see them in history</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Rows Affected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log, index) => (
                  <TableRow key={`${log.timestamp}-${index}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm">{formatTimestamp(log.timestamp)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{getOperationDescription(log)}</TableCell>
                    <TableCell>
                      {log.column ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.column}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.strategy ? (
                        <Badge variant={getActionBadgeVariant(log.strategy)} className="text-xs">
                          {getActionLabel(log)}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{log.affected_rows} rows</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {logs.length > 0 && (
              <div className="pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                <p>{logs.length} operation{logs.length !== 1 ? "s" : ""} recorded</p>
                <p>Most recent: {formatTimestamp(logs[0].timestamp)}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
