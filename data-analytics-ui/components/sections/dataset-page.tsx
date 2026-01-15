import { Database, Upload, FileSpreadsheet, Table } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const datasets = [
  { name: "sales_q4_2024.csv", rows: 15420, columns: 12, size: "2.3 MB" },
  { name: "customers.xlsx", rows: 8750, columns: 18, size: "1.1 MB" },
  { name: "products_catalog.csv", rows: 3200, columns: 8, size: "450 KB" },
]

export function DatasetPage() {
  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Dataset Management</span>
        </div>
        <Button className="gap-2">
          <Upload className="w-4 h-4" />
          Upload Dataset
        </Button>
      </header>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((dataset) => (
            <Card key={dataset.name} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-medium truncate">{dataset.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Table className="w-3 h-3" />
                    {dataset.rows.toLocaleString()} rows
                  </span>
                  <span>{dataset.columns} columns</span>
                  <span>{dataset.size}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <CardDescription className="text-center">Drag and drop your files here, or click to browse</CardDescription>
            <p className="text-xs text-muted-foreground mt-2">Supports CSV, Excel, JSON, and Parquet files</p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
