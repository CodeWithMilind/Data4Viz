import { Lightbulb } from "lucide-react"
import { DecisionDrivenEDA } from "./decision-driven-eda"

export function InsightsPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Insights</span>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        <DecisionDrivenEDA />
      </div>
    </main>
  )
}
