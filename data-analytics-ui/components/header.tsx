"use client"

import { PanelLeft, Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/contexts/workspace-context"
import { useRef } from "react"
import { useToast } from "@/hooks/use-toast"

interface HeaderProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  activeNav: string
}

const navLabels: Record<string, string> = {
  dataset: "Dataset",
  overview: "Overview",
  cleaning: "Data Cleaning",
  outlier: "Outlier Handling",
  feature: "Feature Engineering",
  agent: "AI Agent",
  notebook: "Jupyter Notebook",
  files: "Files",
  visualization: "Data Visualization",
  insights: "Insights",
}

export function Header({ sidebarOpen, setSidebarOpen, activeNav }: HeaderProps) {
  const { currentWorkspace, exportCurrentWorkspace, importWorkspaceFromFile } = useWorkspace()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    try {
      await exportCurrentWorkspace()
      toast({
        title: "Success",
        description: "Workspace exported successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export workspace",
        variant: "destructive",
      })
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".d4v")) {
      toast({
        title: "Error",
        description: "Please select a .d4v file",
        variant: "destructive",
      })
      return
    }

    try {
      await importWorkspaceFromFile(file)
      toast({
        title: "Success",
        description: "Workspace imported successfully",
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to import workspace",
        variant: "destructive",
      })
    }
  }

  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 text-muted-foreground hover:text-foreground"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        )}
        <div>
          <p className="text-xs text-muted-foreground">{navLabels[activeNav] || "Overview"}</p>
          {currentWorkspace && (
            <p className="text-xs font-medium text-foreground">{currentWorkspace.name}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {currentWorkspace && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleExport}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
        )}
      </div>
    </header>
  )
}
