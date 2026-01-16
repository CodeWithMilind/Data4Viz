"use client"

/**
 * Cleaning History Panel
 *
 * IMPORTANT: Workspace is the single source of truth.
 * Fetches cleaning logs from workspace storage via backend API.
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

interface CleaningLog {
  dataset_name: string
  operation: string
  action: string
  rows_affected: number
  parameters: Record<string, any>
  timestamp: string
}

interface WorkspaceCleaningLogsResponse {
  workspace_id: string
  logs: CleaningLog[]
}

export function CleaningHistoryPanel() {
  const { activeWorkspaceId } = useWorkspace()
  const [logs, setLogs] = useState<CleaningLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  // Fetch cleaning logs from workspace
  useEffect(() => {
    async function fetchLogs() {
      if (!activeWorkspaceId) {
        setLogs([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`${BASE_URL}/workspaces/${activeWorkspaceId}/cleaning-logs`)
        if (!response.ok) {
          throw new Error(`Failed to fetch cleaning logs: ${response.statusText}`)
        }
        const data: WorkspaceCleaningLogsResponse = await response.json()
        setLogs(data.logs)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch cleaning logs"
        setError(errorMessage)
        setLogs([])
        console.error("Error fetching cleaning logs:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [activeWorkspaceId])

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

  const getActionBadgeVariant = (actionType: string) => {
    if (actionType.includes("remove") || actionType.includes("drop")) return "destructive"
    if (actionType.includes("fill") || actionType.includes("convert")) return "default"
    return "secondary"
  }

  const getOperationDescription = (log: CleaningLog): string => {
    const operationMap: Record<string, string> = {
      missing_values: "Handle Missing Values",
      duplicates: "Remove Duplicates",
      invalid_format: "Fix Invalid Formats",
      outliers: "Handle Outliers",
    }
    return operationMap[log.operation] || log.operation
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

  if (!activeWorkspaceId) {
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
            <p>No workspace selected</p>
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
                  <TableHead>Dataset</TableHead>
                  <TableHead>Action</TableHead>
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
                      <Badge variant="outline" className="font-mono text-xs">
                        {log.dataset_name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)} className="text-xs">
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{log.rows_affected} rows</span>
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
