import { Wrench, Plus, Columns } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const features = [
  { name: "revenue_per_customer", type: "Calculated", formula: "total_revenue / customer_count" },
  { name: "month_extracted", type: "Date Part", formula: "MONTH(order_date)" },
  { name: "is_high_value", type: "Boolean", formula: "order_total > 500" },
]

export function FeatureEngineeringPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Feature Engineering</span>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          New Feature
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Engineered Features</CardTitle>
            <CardDescription>Custom features created from your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {features.map((feature) => (
              <div key={feature.name} className="flex items-center justify-between p-4 rounded-lg bg-secondary">
                <div className="flex items-center gap-3">
                  <Columns className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{feature.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{feature.formula}</div>
                  </div>
                </div>
                <Badge variant="secondary">{feature.type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
