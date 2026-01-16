"use client"

import { useState } from "react"
import { History, Undo2, RotateCcw, Clock, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { format } from "date-fns"

interface CleaningAction {
  id: string
  description: string
  columnAffected: string
  timestamp: Date
  actionType: string
}

interface CleaningHistoryPanelProps {
  actions?: CleaningAction[]
  onUndo?: (actionId: string) => void
  onReset?: () => void
}

// Mock data
const mockActions: CleaningAction[] = [
  {
    id: "1",
    description: "Filled missing values with mean",
    columnAffected: "Age",
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
    actionType: "fill_mean",
  },
  {
    id: "2",
    description: "Removed duplicate rows (keep first)",
    columnAffected: "All",
    timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
    actionType: "remove_duplicates",
  },
  {
    id: "3",
    description: "Capped outliers using IQR method",
    columnAffected: "Salary",
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    actionType: "cap_outliers",
  },
  {
    id: "4",
    description: "Normalized text to lowercase",
    columnAffected: "Department",
    timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    actionType: "normalize_text",
  },
  {
    id: "5",
    description: "Converted invalid dates",
    columnAffected: "Hire_Date",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    actionType: "convert_format",
  },
]

export function CleaningHistoryPanel({
  actions = mockActions,
  onUndo,
  onReset,
}: CleaningHistoryPanelProps) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const handleUndo = (actionId: string) => {
    onUndo?.(actionId)
  }

  const handleReset = () => {
    onReset?.()
    setResetDialogOpen(false)
  }

  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) !== 1 ? "s" : ""} ago`
    return format(date, "MMM d, yyyy 'at' h:mm a")
  }

  const getActionBadgeVariant = (actionType: string) => {
    if (actionType.includes("remove") || actionType.includes("drop")) return "destructive"
    if (actionType.includes("fill") || actionType.includes("convert")) return "default"
    return "secondary"
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
        {actions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No cleaning actions performed yet</p>
            <p className="text-xs mt-1">Actions will appear here as you clean your data</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((action) => (
                  <TableRow key={action.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm">{formatTimestamp(action.timestamp)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground ml-5">
                        {format(action.timestamp, "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{action.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {action.columnAffected}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(action.actionType)} className="text-xs">
                        {action.actionType.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => handleUndo(action.id)}
                        disabled
                        title="Undo functionality is disabled (placeholder)"
                      >
                        <Undo2 className="w-3 h-3" />
                        Undo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
              <p>{actions.length} action{actions.length !== 1 ? "s" : ""} recorded</p>
              <p>Most recent: {formatTimestamp(actions[0].timestamp)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
