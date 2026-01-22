"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronDown, ChevronRight, Copy, Download, FileCode, Loader2 } from "lucide-react"
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
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)

  // SAFE EVENT CLEANUP: Define handler BEFORE useEffect
  const handleNotebookDeleted = useCallback((event: CustomEvent) => {
    const deletedPath = event.detail?.notebookPath
    if (deletedPath && selectedNotebook === deletedPath) {
      console.log("[JupyterPage] Notebook deleted, clearing selection:", deletedPath)
      setSelectedNotebook(null)
      setCells([])
    }
  }, [selectedNotebook])

  // Load available notebooks from notebooks/ subdirectory
  useEffect(() => {
    if (!activeWorkspaceId) {
      setLoading(false)
      return
    }

    const loadNotebooks = async () => {
      console.log("[JupyterPage] Loading notebooks for workspace:", activeWorkspaceId)
      setLoading(true)
      try {
        // Try backend first
        const backendRes = await fetch(`${BASE_URL}/workspaces/${activeWorkspaceId}/files`).catch(() => null)
        const localRes = await fetch(`/api/workspaces/${activeWorkspaceId}/files`).catch(() => null)

        const allFiles: any[] = []
        if (backendRes?.ok) {
          const data = await backendRes.json()
          allFiles.push(...(data.files || []))
          console.log("[JupyterPage] Backend files:", data.files?.length || 0)
        }
        if (localRes?.ok) {
          const data = await localRes.json()
          allFiles.push(...(data.files || []))
          console.log("[JupyterPage] Local files:", data.files?.length || 0)
        }

        // Filter for notebooks in notebooks/ subdirectory or root .ipynb files
        const notebookFiles = allFiles
          .filter((f) => {
            const name = f.name || f
            return name.endsWith(".ipynb") && (name.startsWith("notebooks/") || !name.includes("/"))
          })
          .map((f) => f.name || f)

        console.log("[JupyterPage] Found notebooks:", notebookFiles)
        setNotebooks(notebookFiles)

        // Auto-select first available notebook (no hardcoded paths)
        if (notebookFiles.length > 0) {
          // Prioritize notebooks in notebooks/ subdirectory, then root notebooks
          const prioritized = notebookFiles.sort((a, b) => {
            const aInSubdir = a.startsWith("notebooks/")
            const bInSubdir = b.startsWith("notebooks/")
            if (aInSubdir && !bInSubdir) return -1
            if (!aInSubdir && bInSubdir) return 1
            return a.localeCompare(b)
          })
          console.log("[JupyterPage] Auto-selecting first notebook:", prioritized[0])
          setSelectedNotebook(prioritized[0])
          // Notebook will auto-load via the useEffect hook
        } else {
          console.log("[JupyterPage] No notebooks found")
          setSelectedNotebook(null)
          setCells([])
        }
      } catch (err) {
        console.error("[JupyterPage] Failed to load notebooks:", err)
      } finally {
        setLoading(false)
      }
    }

    loadNotebooks()
    
    // Listen for file refresh events
    const handleRefresh = () => {
      console.log("[JupyterPage] Refresh event received, reloading notebooks...")
      loadNotebooks()
    }
    window.addEventListener("refreshFiles", handleRefresh)
    
    // Listen for notebook deletion events
    const notebookDeletedHandler = (event: Event) => {
      handleNotebookDeleted(event as CustomEvent)
    }
    window.addEventListener("notebookDeleted", notebookDeletedHandler)
    
    // Also listen for visibility change to refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[JupyterPage] Page became visible, refreshing notebooks...")
        loadNotebooks()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    
    return () => {
      window.removeEventListener("refreshFiles", handleRefresh)
      window.removeEventListener("notebookDeleted", notebookDeletedHandler)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [activeWorkspaceId, handleNotebookDeleted])
  
  // Force refresh when component mounts or workspace changes
  useEffect(() => {
    console.log("[JupyterPage] Component mounted/workspace changed, triggering refresh")
    // Trigger refresh by dispatching event
    window.dispatchEvent(new CustomEvent("refreshFiles"))
  }, [activeWorkspaceId])

  // Load generated code from localStorage and listen for new code events
  useEffect(() => {
    if (!activeWorkspaceId) {
      setGeneratedCode(null)
      return
    }

    // Load from localStorage
    const storageKey = `ai-generated-code-${activeWorkspaceId}`
    const storedCode = localStorage.getItem(storageKey)
    if (storedCode) {
      setGeneratedCode(storedCode)
    }

    // Listen for new code generation events
    const handleCodeGenerated = (event: CustomEvent) => {
      if (event.detail?.workspaceId === activeWorkspaceId && event.detail?.code) {
        setGeneratedCode(event.detail.code)
        // Also update localStorage
        localStorage.setItem(storageKey, event.detail.code)
      }
    }

    window.addEventListener("aiCodeGenerated", handleCodeGenerated as EventListener)
    
    return () => {
      window.removeEventListener("aiCodeGenerated", handleCodeGenerated as EventListener)
    }
  }, [activeWorkspaceId])

  // Load selected notebook (auto-load when selected)
  useEffect(() => {
    if (!activeWorkspaceId || !selectedNotebook) {
      setCells([])
      return
    }

    const loadNotebook = async () => {
      console.log("[JupyterPage] Loading notebook:", selectedNotebook)
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
              const contentType = localRes.headers.get("content-type")
              if (contentType?.includes("application/json")) {
                notebookContent = await localRes.json()
              } else {
                const text = await localRes.text()
                notebookContent = JSON.parse(text)
              }
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
          console.error("[JupyterPage] Failed to load notebook:", selectedNotebook)
          // Show inline error, don't block the page (graceful failure)
          toast({
            title: "Error",
            description: `Failed to load notebook: ${selectedNotebook}`,
            variant: "destructive",
          })
          setCells([])
          setLoading(false)
          return
        }

        // Validate notebook structure
        if (!notebookContent.cells || !Array.isArray(notebookContent.cells)) {
          console.error("[JupyterPage] Invalid notebook structure")
          toast({
            title: "Error",
            description: "Invalid notebook format",
            variant: "destructive",
          })
          setCells([])
          setLoading(false)
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
        // Notebook not available or deleted - graceful failure
        console.warn("[JupyterPage] Notebook not available:", selectedNotebook, err)
        // Clear selected notebook if it doesn't exist
        setSelectedNotebook(null)
        setCells([])
        // Don't show toast - just clear state gracefully
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
      // Use consistent path resolution (same as files page)
      // Try local API first, then backend
      let res = await fetch(`/api/workspaces/${activeWorkspaceId}/files/${selectedNotebook}`).catch(() => null)
      
      if (!res || !res.ok) {
        // Fallback to backend
        res = await fetch(`${BASE_URL}/workspaces/${activeWorkspaceId}/files/${selectedNotebook}/download`)
        if (!res.ok) {
          throw new Error(`Failed to download: ${res.statusText}`)
        }
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // Extract just the filename (remove subdirectory prefix)
      a.download = selectedNotebook.split("/").pop() || "notebook.ipynb"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      toast({
        title: "Success",
        description: "Notebook downloaded",
      })
    } catch (err) {
      console.error("[JupyterPage] Download error:", err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to download notebook",
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

  const copyCodeToClipboard = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode)
      toast({
        title: "Copied",
        description: "Python code copied to clipboard",
      })
    }
  }

  return (
    <main className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-foreground">AI-generated Python Notebook</h1>
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
            Download
          </Button>
        </div>
      </header>

      {/* AI-Generated Python Code Section */}
      {generatedCode && (
        <div className="border-b border-border bg-card">
          <div className="px-6 py-3 bg-blue-500/10 border-b border-blue-500/20">
            <div className="flex items-center justify-between">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <strong>AI-generated Python Analysis Code</strong> - Copy and run this code locally in Jupyter or VS Code.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={copyCodeToClipboard}
              >
                <Copy className="w-4 h-4" />
                Copy Code
              </Button>
            </div>
          </div>
          <div className="p-6">
            <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto border border-border">
              <code className="text-sm font-mono text-foreground whitespace-pre">{generatedCode}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Read-only Banner for Notebooks */}
      {!selectedNotebook && notebooks.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileCode className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="font-medium text-foreground mb-1">No notebooks available</h3>
          <p className="text-sm text-muted-foreground">
            Notebooks will appear here when generated. Use the AI Agent to create analysis notebooks.
          </p>
        </div>
      )}

      {selectedNotebook && !notebooks.includes(selectedNotebook) && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileCode className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="font-medium text-foreground mb-1">Notebook not available</h3>
          <p className="text-sm text-muted-foreground">
            The selected notebook may have been deleted or moved. Please select another notebook.
          </p>
        </div>
      )}

      {/* Graceful error message for deleted/missing notebooks */}
      {selectedNotebook && !notebooks.includes(selectedNotebook) && !loading && (
        <div className="px-6 py-4 bg-yellow-500/10 border-b border-yellow-500/20">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            <strong>Notebook not available or deleted.</strong> The selected notebook may have been deleted or moved. Please select another notebook from the dropdown above.
          </p>
        </div>
      )}

      {/* Read-only Banner for Notebooks */}
      {selectedNotebook && notebooks.includes(selectedNotebook) && !generatedCode && (
        <div className="px-6 py-3 bg-blue-500/10 border-b border-blue-500/20">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Note:</strong> This notebook is AI-generated. Download to run locally in your Jupyter environment.
          </p>
        </div>
      )}

      {/* Notebook Cells */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {cells.length === 0 && !loading && !generatedCode ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileCode className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {notebooks.length === 0
                  ? "No notebooks found. Click 'Auto Summarize Dataset' in Chat to generate AI-powered Python analysis code."
                  : selectedNotebook
                    ? "Loading notebook..."
                    : "Select a notebook to view"}
              </p>
            </div>
          </div>
        ) : loading && cells.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
