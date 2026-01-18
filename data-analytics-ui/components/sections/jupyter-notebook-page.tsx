"use client"

import { useState, useEffect, useCallback } from "react"
import { Play, Plus, Trash2, ChevronDown, ChevronRight, Copy, Download, FileCode, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/workspace-context"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface NotebookCell {
  id: string
  cell_type: "code" | "markdown"
  source: string[]
  execution_count?: number | null
  outputs?: any[]
}

interface Notebook {
  cells: NotebookCell[]
  metadata: any
  nbformat: number
  nbformat_minor: number
}

interface DisplayCell {
  id: string
  type: "code" | "markdown"
  content: string
  executionCount?: number | null
  outputs: Array<{
    type: "stdout" | "stderr" | "display_data" | "error" | "execute_result"
    content: string
    data?: any
  }>
  isRunning: boolean
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function JupyterNotebookPage() {
  const { activeWorkspaceId, currentWorkspace } = useWorkspace()
  const { toast } = useToast()
  const [notebooks, setNotebooks] = useState<string[]>([])
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null)
  const [cells, setCells] = useState<DisplayCell[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())

  // Load available notebooks
  useEffect(() => {
    if (!activeWorkspaceId) {
      setLoading(false)
      return
    }

    const loadNotebooks = async () => {
      try {
        // Try backend first
        const backendRes = await fetch(`${BASE_URL}/workspaces/${activeWorkspaceId}/files`).catch(() => null)
        const localRes = await fetch(`/api/workspaces/${activeWorkspaceId}/files`).catch(() => null)

        const allFiles: any[] = []
        if (backendRes?.ok) {
          const data = await backendRes.json()
          allFiles.push(...(data.files || []))
        }
        if (localRes?.ok) {
          const data = await localRes.json()
          allFiles.push(...(data.files || []))
        }

        const notebookFiles = allFiles
          .filter((f) => f.name.endsWith(".ipynb"))
          .map((f) => f.name)

        setNotebooks(notebookFiles)

        // Auto-select auto_summary.ipynb if available
        if (notebookFiles.includes("files/auto_summary.ipynb")) {
          setSelectedNotebook("files/auto_summary.ipynb")
        } else if (notebookFiles.includes("auto_summary.ipynb")) {
          setSelectedNotebook("auto_summary.ipynb")
        } else if (notebookFiles.length > 0) {
          setSelectedNotebook(notebookFiles[0])
        }
      } catch (err) {
        console.error("Failed to load notebooks:", err)
      } finally {
        setLoading(false)
      }
    }

    loadNotebooks()
  }, [activeWorkspaceId])

  // Load selected notebook
  useEffect(() => {
    if (!activeWorkspaceId || !selectedNotebook) {
      setCells([])
      return
    }

    const loadNotebook = async () => {
      setLoading(true)
      try {
        // Try backend first
        let notebookContent: Notebook | null = null

        try {
          const backendRes = await fetch(
            `${BASE_URL}/workspaces/${activeWorkspaceId}/files/${selectedNotebook}/download`
          )
          if (backendRes.ok) {
            notebookContent = await backendRes.json()
          }
        } catch {
          // Try local API
          const localRes = await fetch(
            `/api/workspaces/${activeWorkspaceId}/files/${selectedNotebook}`
          )
          if (localRes.ok) {
            notebookContent = await localRes.json()
          }
        }

        if (!notebookContent) {
          // Try reading from workspace files directly
          const workspaceRes = await fetch(`/api/workspaces/${activeWorkspaceId}/files/${selectedNotebook}`)
          if (workspaceRes.ok) {
            const text = await workspaceRes.text()
            notebookContent = JSON.parse(text)
          }
        }

        if (!notebookContent) {
          toast({
            title: "Error",
            description: "Failed to load notebook",
            variant: "destructive",
          })
          return
        }

        // Convert notebook cells to display cells
        const displayCells: DisplayCell[] = notebookContent.cells.map((cell, idx) => {
          const cellId = `cell-${idx}`
          const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

          // Parse outputs
          const outputs: DisplayCell["outputs"] = []
          if (cell.outputs) {
            for (const output of cell.outputs) {
              if (output.output_type === "stream") {
                const text = Array.isArray(output.text) ? output.text.join("") : output.text || ""
                outputs.push({
                  type: output.name === "stderr" ? "stderr" : "stdout",
                  content: text,
                })
              } else if (output.output_type === "display_data" || output.output_type === "execute_result") {
                const data = output.data || {}
                if (data["image/png"]) {
                  outputs.push({
                    type: "display_data",
                    content: "",
                    data: { image: data["image/png"] },
                  })
                } else if (data["text/plain"]) {
                  const text = Array.isArray(data["text/plain"]) ? data["text/plain"].join("") : data["text/plain"] || ""
                  outputs.push({
                    type: "execute_result",
                    content: text,
                  })
                }
              } else if (output.output_type === "error") {
                const traceback = Array.isArray(output.traceback) ? output.traceback.join("\n") : ""
                outputs.push({
                  type: "error",
                  content: `${output.ename}: ${output.evalue}\n${traceback}`,
                })
              }
            }
          }

          return {
            id: cellId,
            type: cell.cell_type,
            content: source,
            executionCount: cell.execution_count,
            outputs,
            isRunning: false,
          }
        })

        setCells(displayCells)
        setExpandedCells(new Set(displayCells.map((c) => c.id)))
      } catch (err: any) {
        console.error("Failed to load notebook:", err)
        toast({
          title: "Error",
          description: err.message || "Failed to load notebook",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadNotebook()
  }, [activeWorkspaceId, selectedNotebook, toast])

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

  const downloadNotebook = async () => {
    if (!activeWorkspaceId || !selectedNotebook) return

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/files/${selectedNotebook}`)
      if (!res.ok) throw new Error("Failed to download")

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = selectedNotebook.split("/").pop() || "notebook.ipynb"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to download notebook",
        variant: "destructive",
      })
    }
  }

  if (loading && cells.length === 0) {
    return (
      <main className="flex-1 flex flex-col bg-background overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-foreground">Jupyter Notebook</h1>
          {notebooks.length > 0 ? (
            <Select value={selectedNotebook || ""} onValueChange={setSelectedNotebook}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select notebook" />
              </SelectTrigger>
              <SelectContent>
                {notebooks.map((nb) => (
                  <SelectItem key={nb} value={nb}>
                    {nb.split("/").pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">
              {selectedNotebook || "No notebooks available"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            onClick={downloadNotebook}
            disabled={!selectedNotebook}
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </header>

      {/* Notebook Cells */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {cells.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileCode className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {notebooks.length === 0
                  ? "No notebooks found. Use 'Auto Summarize Dataset' to generate one."
                  : "Select a notebook to view"}
              </p>
            </div>
          </div>
        ) : (
          cells.map((cell, index) => (
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
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCellExpanded(cell.id)
                    }}
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
                    {cell.executionCount !== null && cell.executionCount !== undefined && (
                      <span className="ml-2">In [{cell.executionCount}]</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1">
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
                </div>
              </div>

              {/* Cell Content */}
              {expandedCells.has(cell.id) && (
                <div className="p-3">
                  <pre
                    className={cn(
                      "w-full font-mono text-sm bg-transparent whitespace-pre-wrap",
                      cell.type === "code" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {cell.content}
                  </pre>

                  {/* Outputs */}
                  {cell.outputs.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      {cell.outputs.map((output, outIdx) => (
                        <div key={outIdx}>
                          {output.type === "display_data" && output.data?.image ? (
                            <div className="bg-muted/50 p-3 rounded">
                              <img
                                src={`data:image/png;base64,${output.data.image}`}
                                alt="Plot"
                                className="max-w-full"
                              />
                            </div>
                          ) : (
                            <pre
                              className={cn(
                                "text-sm font-mono whitespace-pre-wrap bg-muted/50 p-3 rounded",
                                output.type === "error"
                                  ? "text-destructive"
                                  : output.type === "stderr"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground",
                              )}
                            >
                              {output.content}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  )
}
