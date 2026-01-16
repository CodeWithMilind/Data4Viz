"use client"

import { useState } from "react"
import { AlertCircle, Info, Play, Eye } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface MissingValueColumn {
  name: string
  dataType: string
  missingCount: number
  missingPercentage: number
}

interface MissingValuesCardProps {
  columns?: MissingValueColumn[]
  onAction?: (columnName: string, actionType: string, value?: string) => void
}

// Mock data - in production, this would come from props
const mockColumns: MissingValueColumn[] = [
  { name: "Age", dataType: "numeric", missingCount: 234, missingPercentage: 12.0 },
  { name: "Salary", dataType: "numeric", missingCount: 156, missingPercentage: 8.0 },
  { name: "Department", dataType: "categorical", missingCount: 89, missingPercentage: 4.5 },
  { name: "Hire_Date", dataType: "datetime", missingCount: 45, missingPercentage: 2.3 },
  { name: "Location", dataType: "categorical", missingCount: 67, missingPercentage: 3.4 },
  { name: "Manager_ID", dataType: "numeric", missingCount: 34, missingPercentage: 1.7 },
  { name: "Performance_Score", dataType: "numeric", missingCount: 112, missingPercentage: 5.7 },
  { name: "Last_Review_Date", dataType: "datetime", missingCount: 78, missingPercentage: 4.0 },
  { name: "Email", dataType: "categorical", missingCount: 450, missingPercentage: 23.1 },
  { name: "Phone", dataType: "categorical", missingCount: 320, missingPercentage: 16.4 },
]

export function MissingValuesCard({ columns = mockColumns, onAction }: MissingValuesCardProps) {
  const [selectedActions, setSelectedActions] = useState<Record<string, { action: string; customValue: string }>>({})

  const handleActionChange = (columnName: string, action: string) => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: { ...prev[columnName], action, customValue: prev[columnName]?.customValue || "" },
    }))
  }

  const handleCustomValueChange = (columnName: string, value: string) => {
    setSelectedActions((prev) => ({
      ...prev,
      [columnName]: { ...prev[columnName], action: "custom", customValue: value },
    }))
  }

  const handleApply = (column: MissingValueColumn) => {
    const action = selectedActions[column.name]
    if (!action) return

    const actionType = action.action === "custom" ? `fill_custom_${action.customValue}` : action.action
    onAction?.(column.name, actionType, action.action === "custom" ? action.customValue : undefined)
  }

  const handlePreview = (column: MissingValueColumn) => {
    // Placeholder preview handler
    console.log("Preview action for", column.name)
  }

  const isNumeric = (dataType: string) => dataType === "numeric"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-muted-foreground" />
              Missing Values
            </CardTitle>
            <CardDescription>Handle missing data in your columns</CardDescription>
          </div>
          <Badge variant="secondary">
            {columns.reduce((sum, col) => sum + col.missingCount, 0)} total missing
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Data Type</TableHead>
                <TableHead className="text-right">Missing Count</TableHead>
                <TableHead className="text-right">Missing %</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columns.map((column) => {
                const isHighMissing = column.missingPercentage > 20
                const action = selectedActions[column.name] || { action: "drop", customValue: "" }

                return (
                  <TableRow
                    key={column.name}
                    className={cn(isHighMissing && "bg-destructive/5 border-l-4 border-l-destructive")}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {column.name}
                        {isHighMissing && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>High missing percentage (&gt;20%)</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {column.dataType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{column.missingCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-medium", isHighMissing && "text-destructive")}>
                        {column.missingPercentage.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RadioGroup
                          value={action.action}
                          onValueChange={(v) => handleActionChange(column.name, v)}
                          className="flex flex-wrap gap-3"
                        >
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="drop" id={`${column.name}-drop`} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Label htmlFor={`${column.name}-drop`} className="text-xs cursor-pointer">
                                  Drop rows
                                </Label>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remove rows where this column has missing values</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {isNumeric(column.dataType) && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem value="mean" id={`${column.name}-mean`} />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Label htmlFor={`${column.name}-mean`} className="text-xs cursor-pointer">
                                      Fill mean
                                    </Label>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Fill missing values with the column mean (numeric only)</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem value="median" id={`${column.name}-median`} />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Label htmlFor={`${column.name}-median`} className="text-xs cursor-pointer">
                                      Fill median
                                    </Label>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Fill missing values with the column median (numeric only)</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </>
                          )}

                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="mode" id={`${column.name}-mode`} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Label htmlFor={`${column.name}-mode`} className="text-xs cursor-pointer">
                                  Fill mode
                                </Label>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Fill missing values with the most frequent value</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="custom" id={`${column.name}-custom`} />
                            <Label htmlFor={`${column.name}-custom`} className="text-xs cursor-pointer">
                              Custom
                            </Label>
                            {action.action === "custom" && (
                              <Input
                                placeholder="Value..."
                                className="w-24 h-7 text-xs"
                                value={action.customValue}
                                onChange={(e) => handleCustomValueChange(column.name, e.target.value)}
                              />
                            )}
                          </div>
                        </RadioGroup>

                        <div className="flex items-center gap-1 ml-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1"
                            onClick={() => handlePreview(column)}
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1"
                            onClick={() => handleApply(column)}
                            disabled={action.action === "custom" && !action.customValue}
                          >
                            <Play className="w-3 h-3" />
                            Apply
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {columns.some((col) => col.missingPercentage > 20) && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <Info className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                Columns with &gt;20% missing values are highlighted. Consider investigating the root cause before
                applying fixes.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
