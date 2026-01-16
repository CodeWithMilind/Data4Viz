"use client"

import { useState } from "react"
import { Copy, AlertTriangle, Play, Eye, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface DuplicatesCardProps {
  totalRows?: number
  duplicateCount?: number
  duplicatePercentage?: number
  availableColumns?: string[]
  onAction?: (actionType: string, columns?: string[]) => void
}

// Mock duplicate rows for preview
const mockDuplicateRows = [
  { id: 1, name: "John Doe", email: "john@example.com", age: 30, department: "Sales" },
  { id: 2, name: "John Doe", email: "john@example.com", age: 30, department: "Sales" },
  { id: 45, name: "Jane Smith", email: "jane@example.com", age: 28, department: "Marketing" },
  { id: 46, name: "Jane Smith", email: "jane@example.com", age: 28, department: "Marketing" },
  { id: 123, name: "Bob Johnson", email: "bob@example.com", age: 35, department: "IT" },
  { id: 124, name: "Bob Johnson", email: "bob@example.com", age: 35, department: "IT" },
]

export function DuplicatesCard({
  totalRows = 1950,
  duplicateCount = 12,
  duplicatePercentage = 0.6,
  availableColumns = ["Name", "Email", "Age", "Department", "Salary", "Location"],
  onAction,
}: DuplicatesCardProps) {
  const [detectionMode, setDetectionMode] = useState<"all" | "selected">("all")
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [removalStrategy, setRemovalStrategy] = useState<"keep-first" | "keep-last">("keep-first")
  const [showPreview, setShowPreview] = useState(false)

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column],
    )
  }

  const handleApply = () => {
    const columns = detectionMode === "all" ? undefined : selectedColumns
    onAction?.(removalStrategy, columns)
  }

  const handlePreview = () => {
    setShowPreview(!showPreview)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-muted-foreground" />
              Duplicates
            </CardTitle>
            <CardDescription>Detect and remove duplicate rows from your dataset</CardDescription>
          </div>
          <Badge variant="secondary">
            {duplicateCount} duplicates ({duplicatePercentage.toFixed(1)}%)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Rows</p>
            <p className="text-2xl font-semibold">{totalRows.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Duplicate Rows</p>
            <p className="text-2xl font-semibold text-destructive">{duplicateCount}</p>
          </div>
        </div>

        {/* Detection Options */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Duplicate Detection</Label>
          <RadioGroup value={detectionMode} onValueChange={(v) => setDetectionMode(v as "all" | "selected")}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="dup-all-cols" />
              <Label htmlFor="dup-all-cols" className="cursor-pointer">
                All columns
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="selected" id="dup-selected-cols" />
              <Label htmlFor="dup-selected-cols" className="cursor-pointer">
                Selected columns
              </Label>
            </div>
          </RadioGroup>

          {detectionMode === "selected" && (
            <div className="ml-6 p-4 border rounded-md bg-muted/30">
              <Label className="text-xs text-muted-foreground mb-3 block">Select columns to check for duplicates:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableColumns.map((col) => (
                  <div key={col} className="flex items-center gap-2">
                    <Checkbox
                      id={`dup-col-${col}`}
                      checked={selectedColumns.includes(col)}
                      onCheckedChange={() => handleColumnToggle(col)}
                    />
                    <Label htmlFor={`dup-col-${col}`} className="text-sm cursor-pointer">
                      {col}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedColumns.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">Select at least one column</p>
              )}
            </div>
          )}
        </div>

        {/* Removal Strategy */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Removal Strategy</Label>
          <RadioGroup value={removalStrategy} onValueChange={(v) => setRemovalStrategy(v as "keep-first" | "keep-last")}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="keep-first" id="dup-keep-first" />
              <Label htmlFor="dup-keep-first" className="cursor-pointer">
                Remove duplicates (keep first occurrence)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="keep-last" id="dup-keep-last" />
              <Label htmlFor="dup-keep-last" className="cursor-pointer">
                Remove duplicates (keep last occurrence)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Preview Table */}
        {showPreview && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Preview Duplicate Rows</Label>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Department</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockDuplicateRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.id}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.age}</TableCell>
                      <TableCell>{row.department}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Warning */}
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Removing duplicates may result in data loss. Preview changes before applying.
          </AlertDescription>
        </Alert>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handlePreview} className="gap-2">
            <Eye className="w-4 h-4" />
            {showPreview ? "Hide" : "Show"} Preview
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={detectionMode === "selected" && selectedColumns.length === 0}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Remove Duplicates
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
