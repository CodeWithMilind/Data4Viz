import { AlertTriangle, Eye, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const outliers = [
  { id: 1, column: "order_total", value: 99999, zscore: 4.2, action: "Review" },
  { id: 2, column: "quantity", value: -5, zscore: 3.8, action: "Remove" },
  { id: 3, column: "discount", value: 150, zscore: 3.5, action: "Cap" },
]

export function OutlierHandlingPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Outlier Handling</span>
        </div>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Eye className="w-4 h-4" />
          Detect Outliers
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detected Outliers</CardTitle>
            <CardDescription>Values that fall outside expected ranges</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Z-Score</TableHead>
                  <TableHead>Suggested Action</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outliers.map((outlier) => (
                  <TableRow key={outlier.id}>
                    <TableCell className="font-medium">{outlier.column}</TableCell>
                    <TableCell className="text-destructive font-mono">{outlier.value}</TableCell>
                    <TableCell>{outlier.zscore}</TableCell>
                    <TableCell>{outlier.action}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
