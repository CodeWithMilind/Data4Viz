import { LayoutGrid, TrendingUp, Users, DollarSign, ShoppingCart } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const stats = [
  { label: "Total Revenue", value: "$124,592", change: "+12.5%", icon: DollarSign },
  { label: "Active Users", value: "8,420", change: "+8.2%", icon: Users },
  { label: "Orders", value: "1,284", change: "+23.1%", icon: ShoppingCart },
  { label: "Growth Rate", value: "18.2%", change: "+4.3%", icon: TrendingUp },
]

export function OverviewPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Overview</span>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-green-600">{stat.change} from last month</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Summary</CardTitle>
            <CardDescription>Your data at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg">
              <span className="text-muted-foreground">Charts and visualizations will appear here</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
