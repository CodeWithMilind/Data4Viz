"use client"

import { useMemo, useState } from "react"
import { CheckSquare, Filter, Search, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface ColumnInfo {
  name: string
  dataType: string
}

interface ColumnFilterPanelProps {
  columns: ColumnInfo[]
  selectedColumns: string[]
  onSelectionChange: (selected: string[]) => void
}

export function ColumnFilterPanel({
  columns,
  selectedColumns,
  onSelectionChange,
}: ColumnFilterPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns
    const query = searchQuery.toLowerCase()
    return columns.filter((col) => col.name.toLowerCase().includes(query))
  }, [columns, searchQuery])

  const handleToggleColumn = (columnName: string) => {
    if (selectedColumns.includes(columnName)) {
      onSelectionChange(selectedColumns.filter((c) => c !== columnName))
    } else {
      onSelectionChange([...selectedColumns, columnName])
    }
  }

  const handleSelectAll = () => {
    onSelectionChange(columns.map((col) => col.name))
  }

  const handleClearAll = () => {
    onSelectionChange([])
  }

  const allSelected = selectedColumns.length === columns.length && columns.length > 0
  const someSelected = selectedColumns.length > 0 && selectedColumns.length < columns.length

  return (
    <Card className="border-2">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Column Filter</Label>
              <Badge variant="secondary" className="ml-2">
                {selectedColumns.length} of {columns.length} selected
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={allSelected}
                className="h-7 gap-1"
              >
                <CheckSquare className="w-3 h-3" />
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={selectedColumns.length === 0}
                className="h-7 gap-1"
              >
                <Square className="w-3 h-3" />
                Clear All
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          <ScrollArea className="h-[200px] border rounded-md">
            <div className="p-3 space-y-2">
              {filteredColumns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No columns found</p>
              ) : (
                filteredColumns.map((column) => {
                  const isSelected = selectedColumns.includes(column.name)
                  return (
                    <div
                      key={column.name}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors",
                        isSelected && "bg-primary/5"
                      )}
                    >
                      <Checkbox
                        id={`filter-${column.name}`}
                        checked={isSelected}
                        onCheckedChange={() => handleToggleColumn(column.name)}
                      />
                      <Label
                        htmlFor={`filter-${column.name}`}
                        className="flex-1 flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-sm font-medium">{column.name}</span>
                        <Badge variant="outline" className="font-mono text-xs ml-2">
                          {column.dataType}
                        </Badge>
                      </Label>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>

          {selectedColumns.length === 0 && (
            <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-md">
              <Filter className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                No columns selected. Select at least one column to view cleaning options.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
