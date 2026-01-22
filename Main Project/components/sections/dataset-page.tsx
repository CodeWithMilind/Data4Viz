"use client"

import { useState, useRef, useEffect } from "react"
import { Database, Upload, FileSpreadsheet, Table, Link2, Loader2, AlertCircle, Trash2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useWorkspace } from "@/contexts/workspace-context"
import { fetchAndParseCSV, parseCSVFromFile, isValidURL } from "@/lib/csv-parser"
import { useToast } from "@/hooks/use-toast"
import { useAIConfigStore } from "@/lib/ai-config-store"
import { useDataExposureStore } from "@/lib/data-exposure-store"

export function DatasetPage() {
  const { currentWorkspace, uploadDatasetToWorkspace, removeDatasetFromWorkspace, getDatasets } = useWorkspace()
  const { toast } = useToast()
  const { provider, model, apiKey } = useAIConfigStore()
  const { dataExposurePercentage } = useDataExposureStore()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [datasetToDelete, setDatasetToDelete] = useState<string | null>(null)
  const [summarizingDatasetId, setSummarizingDatasetId] = useState<string | null>(null)
  
  // URL loading state
  const [csvUrl, setCsvUrl] = useState("")
  const [isLoadingUrl, setIsLoadingUrl] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  
  // File upload state
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const datasets = getDatasets()

  // Listen for file deletion events to sync dataset view
  useEffect(() => {
    const handleRefreshDatasets = () => {
      // Force re-render by accessing getDatasets (workspace context will update)
      // The datasets variable will automatically update when workspace state changes
      console.log("[Dataset Page] Refresh event received, datasets will update automatically")
    }
    
    window.addEventListener("refreshDatasets", handleRefreshDatasets)
    
    return () => {
      window.removeEventListener("refreshDatasets", handleRefreshDatasets)
    }
  }, [getDatasets])

  // Handle CSV URL loading
  const handleLoadFromUrl = async () => {
    setUrlError(null)
    
    if (!csvUrl || csvUrl.trim() === "") {
      setUrlError("Please enter a URL")
      return
    }

    if (!isValidURL(csvUrl)) {
      setUrlError("Invalid URL. Please provide a valid http:// or https:// URL.")
      return
    }

    setIsLoadingUrl(true)
    try {
      const parsed = await fetchAndParseCSV(csvUrl)
      
      // Extract filename from URL or use default
      const urlObj = new URL(csvUrl)
      const pathParts = urlObj.pathname.split("/")
      const filename = pathParts[pathParts.length - 1] || "dataset.csv"
      const name = filename.endsWith(".csv") ? filename : `${filename}.csv`

      // Upload directly to active workspace
      if (!currentWorkspace) {
        setUrlError("Please create or select a workspace first")
        return
      }

      await uploadDatasetToWorkspace({
        name,
        data: parsed.data,
        headers: parsed.headers,
        rowCount: parsed.rowCount,
        columnCount: parsed.columnCount,
        source: "url",
        sourceUrl: csvUrl,
      })

      setCsvUrl("") // Clear input on success
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : "Failed to load CSV from URL")
    } finally {
      setIsLoadingUrl(false)
    }
  }

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const file = event.target.files?.[0]
    
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Please upload a CSV file")
      return
    }

    setIsLoadingFile(true)
    try {
      const parsed = await parseCSVFromFile(file)
      
      // Upload directly to active workspace
      if (!currentWorkspace) {
        setFileError("Please create or select a workspace first")
        return
      }

      // IMPORTANT: Sync dataset to backend storage so cleaning operations can work on it
      // Workspace is the single source of truth - backend needs the file for cleaning
      try {
        const { uploadDatasetToWorkspace: uploadToBackend } = await import("@/lib/api/dataCleaningClient")
        await uploadToBackend(currentWorkspace.id, file)
      } catch (backendError) {
        console.warn("Failed to sync dataset to backend (cleaning may not work):", backendError)
        // Continue with frontend upload even if backend sync fails
      }

      // Upload to frontend workspace (IndexedDB)
      await uploadDatasetToWorkspace({
        name: file.name,
        data: parsed.data,
        headers: parsed.headers,
        rowCount: parsed.rowCount,
        columnCount: parsed.columnCount,
        source: "file",
      })
      
      toast({
        title: "Success",
        description: "Dataset uploaded to workspace",
      })
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Failed to parse CSV file")
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload dataset",
        variant: "destructive",
      })
    } finally {
      setIsLoadingFile(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleRemoveDataset = async () => {
    if (!datasetToDelete) return

    try {
      await removeDatasetFromWorkspace(datasetToDelete)
      toast({
        title: "Success",
        description: "Dataset removed from workspace",
      })
      setDeleteDialogOpen(false)
      setDatasetToDelete(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove dataset",
        variant: "destructive",
      })
    }
  }

  const handleAutoSummarize = async (datasetId: string, datasetName: string) => {
    if (!currentWorkspace) {
      toast({
        title: "Error",
        description: "Please create or select a workspace first",
        variant: "destructive",
      })
      return
    }

    setSummarizingDatasetId(datasetId)
    try {
      const res = await fetch("/api/ai/auto-summarize-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          datasetId: datasetName,
          provider,
          model,
          apiKey,
          dataExposurePercentage, // UI-based configuration
        }),
      })

      const data = await res.json()

      if (!data.success) {
        toast({
          title: "Error",
          description: data.error || "Failed to generate summary code",
          variant: "destructive",
        })
        return
      }

      // Store code in localStorage and dispatch event for JupyterNotebookPage
      const storageKey = `ai-generated-code-${currentWorkspace.id}`
      localStorage.setItem(storageKey, data.code)
      
      // Dispatch event for JupyterNotebookPage to listen
      window.dispatchEvent(
        new CustomEvent("aiCodeGenerated", {
          detail: {
            workspaceId: currentWorkspace.id,
            code: data.code,
          },
        })
      )

      toast({
        title: "Success",
        description: "Python EDA code generated! Check the Jupyter section to view and copy.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Network error. Please check your connection and try again.",
        variant: "destructive",
      })
    } finally {
      setSummarizingDatasetId(null)
    }
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Dataset Management</span>
        </div>
        <Button 
          className="gap-2" 
          onClick={handleUploadClick} 
          disabled={isLoadingFile || !currentWorkspace}
          title={!currentWorkspace ? "Please create or select a workspace first" : ""}
        >
          {isLoadingFile ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Dataset
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
        />
      </header>

      <div className="flex-1 p-6 space-y-6">
        {/* URL Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Load from Public URL</CardTitle>
            <CardDescription>
              Paste a public CSV link (Google Drive, GitHub raw, Dropbox).<br />
              Your data is fetched and processed locally in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/data.csv"
                value={csvUrl}
                onChange={(e) => {
                  setCsvUrl(e.target.value)
                  setUrlError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoadingUrl) {
                    handleLoadFromUrl()
                  }
                }}
                disabled={isLoadingUrl}
                className="flex-1"
              />
              <Button
                onClick={handleLoadFromUrl}
                disabled={isLoadingUrl || !csvUrl.trim() || !currentWorkspace}
                className="gap-2"
                title={!currentWorkspace ? "Please create or select a workspace first" : ""}
              >
                {isLoadingUrl ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Load
                  </>
                )}
              </Button>
            </div>
            {urlError && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{urlError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* File Upload Error Display */}
        {fileError && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{fileError}</AlertDescription>
          </Alert>
        )}

        {/* No Workspace Message */}
        {!currentWorkspace && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="w-12 h-12 text-muted-foreground mb-4" />
              <CardTitle className="mb-2">No Active Workspace</CardTitle>
              <CardDescription className="text-center">
                Please create or select a workspace from the header to upload datasets.
              </CardDescription>
            </CardContent>
          </Card>
        )}

        {/* Current Workspace Datasets */}
        {currentWorkspace && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Workspace: {currentWorkspace.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {datasets.length} dataset{datasets.length !== 1 ? "s" : ""} attached
                </p>
              </div>
            </div>

            {datasets.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {datasets.map((dataset) => (
                  <Card key={dataset.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="w-5 h-5 text-primary" />
                          </div>
                          <CardTitle className="text-sm font-medium truncate">{dataset.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleAutoSummarize(dataset.id, dataset.name)}
                            disabled={summarizingDatasetId === dataset.id || !currentWorkspace}
                            title={!currentWorkspace ? "Please create or select a workspace first" : "Generate AI-written Python EDA code for this dataset"}
                          >
                            {summarizingDatasetId === dataset.id ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Auto Summarize Dataset
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setDatasetToDelete(dataset.id)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Table className="w-3 h-3" />
                          {dataset.rowCount.toLocaleString()} rows
                        </span>
                        <span>{dataset.columnCount} columns</span>
                        {dataset.source === "url" && (
                          <span className="flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            URL
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                  <CardDescription className="text-center">
                    Upload a dataset to get started with your analysis
                  </CardDescription>
                  <p className="text-xs text-muted-foreground mt-2">Supports CSV files</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </div>

      {/* Remove Dataset Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the dataset from the workspace. The dataset data will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveDataset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
