"use client"

import { PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceSelector } from "@/components/workspace/workspace-selector"

interface HeaderProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  activeNav: string
}

const navLabels: Record<string, string> = {
  dataset: "Dataset",
  overview: "Overview",
  cleaning: "Data Cleaning",
  feature: "Feature Engineering",
  outlier: "Outlier Handling",
  agent: "AI Agent",
  notebook: "Jupyter Notebook",
  files: "Files",
  visualization: "Data Visualization",
  insights: "Insights",
}

export function Header({ sidebarOpen, setSidebarOpen, activeNav }: HeaderProps) {
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
        </div>
      </div>
      <div className="flex items-center gap-2">
        <WorkspaceSelector />
      </div>
    </header>
  )
}
