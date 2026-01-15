"use client"

import { useState } from "react"
import { Play, Plus, Trash2, ChevronDown, ChevronRight, Copy, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Cell {
  id: string
  type: "code" | "markdown"
  content: string
  output: string | null
  isRunning: boolean
}

const initialCells: Cell[] = [
  {
    id: "1",
    type: "code",
    content: "import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt",
    output: null,
    isRunning: false,
  },
  {
    id: "2",
    type: "code",
    content: "# Load sample data\ndf = pd.read_csv('sales_data.csv')\ndf.head()",
    output: `   Date       Product    Revenue   Quantity
0  2024-01-01  Widget A   1250.00   50
1  2024-01-02  Widget B   890.50    35
2  2024-01-03  Widget A   1100.00   44
3  2024-01-04  Widget C   2340.00   78
4  2024-01-05  Widget B   950.00    38`,
    isRunning: false,
  },
  {
    id: "3",
    type: "markdown",
    content: "## Data Analysis\nThis notebook contains exploratory data analysis for the sales dataset.",
    output: null,
    isRunning: false,
  },
]

export function JupyterNotebookPage() {
  const [cells, setCells] = useState<Cell[]>(initialCells)
  const [selectedCell, setSelectedCell] = useState<string | null>("1")
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set(cells.map((c) => c.id)))

  const addCell = (type: "code" | "markdown") => {
    const newCell: Cell = {
      id: Date.now().toString(),
      type,
      content: type === "code" ? "# Write your code here" : "## Your markdown here",
      output: null,
      isRunning: false,
    }
    setCells([...cells, newCell])
    setSelectedCell(newCell.id)
    setExpandedCells((prev) => new Set([...prev, newCell.id]))
  }

  const deleteCell = (id: string) => {
    setCells(cells.filter((c) => c.id !== id))
    if (selectedCell === id) {
      setSelectedCell(null)
    }
  }

  const runCell = (id: string) => {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return { ...c, isRunning: true }
        }
        return c
      }),
    )

    // Simulate execution
    setTimeout(() => {
      setCells((prev) =>
        prev.map((c) => {
          if (c.id === id && c.type === "code") {
            return {
              ...c,
              isRunning: false,
              output: c.output || "Execution completed successfully.",
            }
          }
          return { ...c, isRunning: false }
        }),
      )
    }, 1500)
  }

  const updateCellContent = (id: string, content: string) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, content } : c)))
  }

  const toggleCellExpanded = (id: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <main className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-foreground">Jupyter Notebook</h1>
          <span className="text-sm text-muted-foreground">analysis_notebook.ipynb</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button size="sm" className="gap-2 bg-primary text-primary-foreground">
            <Play className="w-4 h-4" />
            Run All
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="h-12 border-b border-border flex items-center gap-2 px-6 bg-muted/30">
        <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => addCell("code")}>
          <Plus className="w-4 h-4" />
          Code
        </Button>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => addCell("markdown")}>
          <Plus className="w-4 h-4" />
          Markdown
        </Button>
        <div className="h-6 w-px bg-border mx-2" />
        <span className="text-xs text-muted-foreground">Python 3.10 | Kernel: Idle</span>
      </div>

      {/* Notebook Cells */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {cells.map((cell, index) => (
          <div
            key={cell.id}
            onClick={() => setSelectedCell(cell.id)}
            className={cn(
              "border rounded-lg overflow-hidden transition-all duration-200",
              selectedCell === cell.id ? "border-primary ring-1 ring-primary/20" : "border-border",
              cell.type === "markdown" ? "bg-muted/20" : "bg-card",
            )}
          >
            {/* Cell Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleCellExpanded(cell.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedCells.has(cell.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <span className="text-xs font-medium text-muted-foreground">
                  [{index + 1}] {cell.type === "code" ? "Code" : "Markdown"}
                </span>
                {cell.isRunning && <span className="text-xs text-primary animate-pulse">Running...</span>}
              </div>
              <div className="flex items-center gap-1">
                {cell.type === "code" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      runCell(cell.id)
                    }}
                    disabled={cell.isRunning}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(cell.content)
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteCell(cell.id)
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Cell Content */}
            {expandedCells.has(cell.id) && (
              <div className="p-3">
                <textarea
                  value={cell.content}
                  onChange={(e) => updateCellContent(cell.id, e.target.value)}
                  className={cn(
                    "w-full font-mono text-sm bg-transparent resize-none focus:outline-none",
                    cell.type === "code" ? "text-foreground" : "text-muted-foreground",
                  )}
                  rows={cell.content.split("\n").length}
                  spellCheck={false}
                />

                {/* Output */}
                {cell.output && cell.type === "code" && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap bg-muted/50 p-3 rounded">
                      {cell.output}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add Cell Button */}
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => addCell("code")}>
            <Plus className="w-4 h-4" />
            Add Cell
          </Button>
        </div>
      </div>
    </main>
  )
}
