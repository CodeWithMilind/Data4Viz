import { Sparkles, AlertCircle, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

const issues = [
  { type: "Missing Values", count: 234, severity: "warning" },
  { type: "Duplicate Rows", count: 12, severity: "error" },
  { type: "Invalid Formats", count: 56, severity: "warning" },
  { type: "Outliers Detected", count: 89, severity: "info" },
]

export function DataCleaningPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Data Cleaning</span>
        </div>
        <Button className="gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Auto-Clean All
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Data Quality Score</CardTitle>
            <CardDescription>Overall health of your dataset</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-primary">78%</span>
              <span className="text-sm text-muted-foreground">Good</span>
            </div>
            <Progress value={78} className="h-2" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {issues.map((issue) => (
            <Card key={issue.type}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{issue.type}</CardTitle>
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{issue.count}</div>
                <Button variant="link" className="p-0 h-auto text-xs">
                  View and fix
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
