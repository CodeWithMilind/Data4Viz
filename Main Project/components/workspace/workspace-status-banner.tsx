"use client"

import { useWorkspace } from "@/contexts/workspace-context"
import { AlertCircle, CheckCircle2, Info, Lightbulb, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Workspace Status Banner
 * 
 * Displays current workspace status, color-coded status label,
 * and recommended next action.
 * 
 * Always visible when workspace is active.
 */
export function WorkspaceStatusBanner() {
  const { currentWorkspace, workspaceStatus } = useWorkspace()

  if (!currentWorkspace) {
    return null
  }

  const statusColors = {
    default: "bg-muted text-muted-foreground border-muted",
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
    orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
    red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  }

  const statusIcons = {
    default: Info,
    blue: Info,
    green: CheckCircle2,
    yellow: AlertCircle,
    orange: AlertCircle,
    red: AlertCircle,
  }

  const Icon = statusIcons[workspaceStatus.statusColor]

  return (
    <Card className={cn("border-2 p-4", statusColors[workspaceStatus.statusColor])}>
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{workspaceStatus.statusLabel}</span>
            <Badge variant="outline" className="text-xs">
              {currentWorkspace.name}
            </Badge>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm opacity-90">{workspaceStatus.recommendedNextAction}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
