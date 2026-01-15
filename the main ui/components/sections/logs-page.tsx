"use client"

import { useState } from "react"
import { History, Filter, Trash2, Download, Search, CheckCircle2, Eye, AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface LogEntry {
  id: number
  timestamp: string
  date: string
  action: string
  column: string
  detail: string
  status: "Applied" | "Previewed" | "Failed" | "Reverted"
  category: "cleaning" | "feature" | "outlier" | "visualization" | "ai"
}

const initialLogs: LogEntry[] = [
  {
    id: 1,
    timestamp: "10:42 AM",
    date: "Jan 16, 2026",
    action: "Missing Value Fix",
    column: "Age",
    detail: "Fill with median (28.5)",
    status: "Applied",
    category: "cleaning",
  },
  {
    id: 2,
    timestamp: "10:38 AM",
    date: "Jan 16, 2026",
    action: "Duplicate Removal",
    column: "All",
    detail: "Removed 12 duplicate rows (keep first)",
    status: "Applied",
    category: "cleaning",
  },
  {
    id: 3,
    timestamp: "10:35 AM",
    date: "Jan 16, 2026",
    action: "Outlier Detection",
    column: "Salary",
    detail: "IQR method - 32 outliers detected",
    status: "Previewed",
    category: "outlier",
  },
  {
    id: 4,
    timestamp: "10:30 AM",
    date: "Jan 16, 2026",
    action: "Invalid Format Fix",
    column: "Email",
    detail: "Converted to lowercase, fixed 56 invalid entries",
    status: "Applied",
    category: "cleaning",
  },
  {
    id: 5,
    timestamp: "10:25 AM",
    date: "Jan 16, 2026",
    action: "Feature Creation",
    column: "Age_Group",
    detail: "Created binned age categories (Young, Middle, Senior)",
    status: "Applied",
    category: "feature",
  },
  {
    id: 6,
    timestamp: "10:20 AM",
    date: "Jan 16, 2026",
    action: "AI Analysis",
    column: "Dataset",
    detail: "Generated correlation insights",
    status: "Applied",
    category: "ai",
  },
  {
    id: 7,
    timestamp: "10:15 AM",
    date: "Jan 16, 2026",
    action: "Outlier Removal",
    column: "Experience",
    detail: "Removed 12 outliers using Z-score method",
    status: "Failed",
    category: "outlier",
  },
  {
    id: 8,
    timestamp: "10:10 AM",
    date: "Jan 16, 2026",
    action: "Visualization Export",
    column: "Sales_Trend",
    detail: "Exported chart as PNG",
    status: "Applied",
    category: "visualization",
  },
  {
    id: 9,
    timestamp: "09:55 AM",
    date: "Jan 16, 2026",
    action: "Missing Value Fix",
    column: "Department",
    detail: "Fill with mode (Engineering)",
    status: "Reverted",
    category: "cleaning",
  },
  {
    id: 10,
    timestamp: "09:45 AM",
    date: "Jan 16, 2026",
    action: "Data Type Conversion",
    column: "Hire_Date",
    detail: "Converted to datetime format",
    status: "Applied",
    category: "cleaning",
  },
]

const categoryLabels: Record<string, string> = {
  cleaning: "Data Cleaning",
  feature: "Feature Engineering",
  outlier: "Outlier Handling",
  visualization: "Visualization",
  ai: "AI Agent",
}

const categoryColors: Record<string, string> = {
  cleaning: "bg-blue-500/10 text-blue-600",
  feature: "bg-purple-500/10 text-purple-600",
  outlier: "bg-orange-500/10 text-orange-600",
  visualization: "bg-green-500/10 text-green-600",
  ai: "bg-primary/10 text-primary",
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs)
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredLogs = logs.filter((log) => {
    const matchesStatus = statusFilter === "all" || log.status === statusFilter
    const matchesCategory = categoryFilter === "all" || log.category === categoryFilter
    const matchesSearch =
      searchQuery === "" ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.column.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.detail.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesCategory && matchesSearch
  })

  const handleClearLogs = () => {
    setLogs([])
  }

  const handleExportLogs = () => {
    const logText = filteredLogs
      .map((log) => `[${log.date} ${log.timestamp}] ${log.action} - ${log.column}: ${log.detail} (${log.status})`)
      .join("\n")
    const blob = new Blob([logText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "data4viz-logs.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Applied":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case "Previewed":
        return <Eye className="w-4 h-4 text-blue-600" />
      case "Failed":
        return <AlertCircle className="w-4 h-4 text-destructive" />
      case "Reverted":
        return <RefreshCw className="w-4 h-4 text-orange-600" />
      default:
        return null
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Applied":
        return "bg-green-500/10 text-green-600 border-green-500/20"
      case "Previewed":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20"
      case "Failed":
        return "bg-destructive/10 text-destructive border-destructive/20"
      case "Reverted":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20"
      default:
        return ""
    }
  }

  const stats = {
    total: logs.length,
    applied: logs.filter((l) => l.status === "Applied").length,
    previewed: logs.filter((l) => l.status === "Previewed").length,
    failed: logs.filter((l) => l.status === "Failed").length,
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-lg">Activity Logs</h1>
          <Badge variant="secondary" className="font-normal">
            {filteredLogs.length} entries
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={handleExportLogs}>
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive bg-transparent"
            onClick={handleClearLogs}
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="px-6 py-4 border-b border-border bg-card">
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-0 shadow-none bg-muted/50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Actions</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-none bg-green-500/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{stats.applied}</div>
              <div className="text-sm text-muted-foreground">Applied</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-none bg-blue-500/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.previewed}</div>
              <div className="text-sm text-muted-foreground">Previewed</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-none bg-destructive/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Applied">Applied</SelectItem>
              <SelectItem value="Previewed">Previewed</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
              <SelectItem value="Reverted">Reverted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="cleaning">Data Cleaning</SelectItem>
              <SelectItem value="feature">Feature Engineering</SelectItem>
              <SelectItem value="outlier">Outlier Handling</SelectItem>
              <SelectItem value="visualization">Visualization</SelectItem>
              <SelectItem value="ai">AI Agent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs List */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3">
          {filteredLogs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <History className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-2">No logs found</h3>
                <p className="text-sm text-muted-foreground">
                  {logs.length === 0
                    ? "Start working with your data to see activity logs here."
                    : "Try adjusting your filters to see more results."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredLogs.map((log) => (
              <Card key={log.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5">{getStatusIcon(log.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium text-foreground">{log.action}</span>
                        <Badge variant="outline" className={cn("text-xs", categoryColors[log.category])}>
                          {categoryLabels[log.category]}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", getStatusBadgeVariant(log.status))}>
                          {log.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mb-1">
                        <span className="font-medium text-foreground/80">{log.column}</span>
                        <span className="mx-2">—</span>
                        <span>{log.detail}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.date} at {log.timestamp}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
