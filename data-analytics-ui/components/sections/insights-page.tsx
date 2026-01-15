import { Lightbulb, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const insights = [
  {
    title: "Revenue Growth Opportunity",
    description: "Product category 'Electronics' shows 34% higher margin than average. Consider increasing inventory.",
    trend: "up",
    impact: "High",
  },
  {
    title: "Customer Churn Risk",
    description: "15% of customers haven't made a purchase in 90 days. Recommend re-engagement campaign.",
    trend: "down",
    impact: "Medium",
  },
  {
    title: "Seasonal Pattern Detected",
    description: "Sales typically increase 45% in Q4. Ensure adequate stock levels by October.",
    trend: "neutral",
    impact: "High",
  },
]

export function InsightsPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Insights</span>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI-Generated Insights</CardTitle>
            <CardDescription>Actionable recommendations based on your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.map((insight, index) => {
              const TrendIcon = insight.trend === "up" ? TrendingUp : insight.trend === "down" ? TrendingDown : Minus
              const trendColor =
                insight.trend === "up"
                  ? "text-green-600"
                  : insight.trend === "down"
                    ? "text-red-600"
                    : "text-muted-foreground"
              return (
                <div key={index} className="p-4 rounded-lg bg-secondary space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendIcon className={`w-4 h-4 ${trendColor}`} />
                      <span className="font-medium text-sm">{insight.title}</span>
                    </div>
                    <Badge variant={insight.impact === "High" ? "default" : "secondary"}>{insight.impact} Impact</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
