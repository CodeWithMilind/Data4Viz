import { BarChart3, Database, Sparkles, Bot, LineChart, Lightbulb } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const features = [
  {
    icon: Database,
    title: "Dataset Management",
    description: "Upload, organize, and manage your datasets with ease",
  },
  {
    icon: Sparkles,
    title: "Data Cleaning",
    description: "Automatically detect and fix data quality issues",
  },
  {
    icon: Bot,
    title: "AI Agent",
    description: "Chat with AI to analyze and explore your data",
  },
  {
    icon: LineChart,
    title: "Visualization",
    description: "Create stunning charts and graphs from your data",
  },
  {
    icon: Lightbulb,
    title: "Insights",
    description: "Discover hidden patterns and actionable insights",
  },
]

export function WelcomePage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto" suppressHydrationWarning>
      <div className="flex-1 flex flex-col items-center justify-center p-8" suppressHydrationWarning>
        <div className="max-w-3xl w-full text-center space-y-8" suppressHydrationWarning>
          <div className="space-y-4" suppressHydrationWarning>
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
              <BarChart3 className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold text-foreground">Welcome to Data4Viz</h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Your intelligent data analytics companion. Transform raw data into actionable insights with the power of
              AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-12" suppressHydrationWarning>
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="bg-card border-border hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <p className="text-sm text-muted-foreground">Select a menu item from the sidebar to get started</p>
        </div>
      </div>
    </main>
  )
}
