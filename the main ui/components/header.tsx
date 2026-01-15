"use client"

import { PanelLeft, Download, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  activeWorkspace: string
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

export function Header({ sidebarOpen, setSidebarOpen, activeWorkspace, activeNav }: HeaderProps) {
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
          <h1 className="font-semibold text-foreground">{activeWorkspace}</h1>
          <p className="text-xs text-muted-foreground">{navLabels[activeNav] || "Overview"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Share2 className="w-4 h-4" />
          Share
        </Button>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>
    </header>
  )
}
