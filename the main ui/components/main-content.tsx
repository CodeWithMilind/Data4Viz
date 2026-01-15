"use client"

import { ChatArea } from "@/components/chat-area"
import { DatasetPage } from "@/components/sections/dataset-page"
import { OverviewPage } from "@/components/sections/overview-page"
import { DataCleaningPage } from "@/components/sections/data-cleaning-page"
import { FeatureEngineeringPage } from "@/components/sections/feature-engineering-page"
import { OutlierHandlingPage } from "@/components/sections/outlier-handling-page"
import { DataVisualizationPage } from "@/components/sections/data-visualization-page"
import { InsightsPage } from "@/components/sections/insights-page"
import { JupyterNotebookPage } from "@/components/sections/jupyter-notebook-page"
import { FilesPage } from "@/components/sections/files-page"
import { WelcomePage } from "@/components/sections/welcome-page"
import { SettingsPage } from "@/components/sections/settings-page"
import { LogsPage } from "@/components/sections/logs-page" // Added LogsPage import

interface MainContentProps {
  activeNav: string
}

export function MainContent({ activeNav }: MainContentProps) {
  const renderContent = () => {
    switch (activeNav) {
      case "agent":
        return <ChatArea />
      case "dataset":
        return <DatasetPage />
      case "overview":
        return <OverviewPage />
      case "cleaning":
        return <DataCleaningPage />
      case "feature":
        return <FeatureEngineeringPage />
      case "outlier":
        return <OutlierHandlingPage />
      case "visualization":
        return <DataVisualizationPage />
      case "insights":
        return <InsightsPage />
      case "notebook":
        return <JupyterNotebookPage />
      case "files":
        return <FilesPage />
      case "settings":
        return <SettingsPage />
      case "logs": // Added logs case
        return <LogsPage />
      case "welcome":
      default:
        return <WelcomePage />
    }
  }

  return <main className="flex-1 overflow-auto bg-background">{renderContent()}</main>
}
