import { BarChart3, PieChart, LineChart, Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const chartTypes = [
  { name: "Bar Chart", icon: BarChart3, description: "Compare categories" },
  { name: "Line Chart", icon: LineChart, description: "Show trends over time" },
  { name: "Pie Chart", icon: PieChart, description: "Display proportions" },
]

export function DataVisualizationPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Data Visualization</span>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Create Chart
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {chartTypes.map((chart) => {
            const Icon = chart.icon
            return (
              <Card key={chart.name} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-base">{chart.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center">{chart.description}</CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Chart Canvas</CardTitle>
            <CardDescription>Your visualizations will appear here</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 flex items-center justify-center border border-dashed border-border rounded-lg">
              <span className="text-muted-foreground">Select a chart type to get started</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
